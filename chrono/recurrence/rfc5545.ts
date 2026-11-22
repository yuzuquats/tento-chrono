import {
  ICalAttributes,
  icalPropertyName,
  splitICalProperty,
} from "./ical-attributes.ts";
import { IsoDate } from "./iso-date.ts";

type Form = "date" | "floating" | "utc" | "zoned";

const DATE = /^\d{8}$/;
const DATE_TIME = /^\d{8}T\d{6}Z?$/i;
// RFC 5545 DURATION is weeks or days/time. PERIOD requires a positive duration.
const DURATION_TIME = String
  .raw`T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S)`;
const PERIOD_DURATION = new RegExp(
  String.raw`^\+?P(?:\d+W|\d+D(?:${DURATION_TIME})?|${DURATION_TIME})$`,
  "i",
);
const WEEKDAY = /^(MO|TU|WE|TH|FR|SA|SU)$/;
const FREQUENCY = /^(SECONDLY|MINUTELY|HOURLY|DAILY|WEEKLY|MONTHLY|YEARLY)$/;
const NUMBER_PARTS: Record<string, [number, number, boolean?]> = {
  BYSECOND: [0, 60],
  BYMINUTE: [0, 59],
  BYHOUR: [0, 23],
  BYMONTHDAY: [-31, 31, true],
  BYYEARDAY: [-366, 366, true],
  BYWEEKNO: [-53, 53, true],
  BYMONTH: [1, 12],
  BYSETPOS: [-366, 366, true],
};

function check(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}

function dateForm(value: string, hasZone: boolean): Form {
  check(
    DATE.test(value) || DATE_TIME.test(value),
    "Expected an iCalendar DATE or DATE-TIME",
  );
  check(
    IsoDate.parse(value.toUpperCase()).isOk,
    "Invalid iCalendar date or time",
  );
  if (DATE.test(value)) {
    check(!hasZone, "TZID is invalid on DATE");
    return "date";
  }
  if (value.toUpperCase().endsWith("Z")) {
    check(!hasZone, "TZID is invalid on UTC DATE-TIME");
    return "utc";
  }
  return hasZone ? "zoned" : "floating";
}

function property(line: string) {
  const content = splitICalProperty(line);
  check(content != null, "Missing iCalendar property value");
  const attributes = ICalAttributes.fromRawAttributes(content.attributes);
  return {
    values: content.value.split(","),
    type: (attributes.get("VALUE") ?? "DATE-TIME").toUpperCase(),
    zoned: attributes.get("TZID") != null,
  };
}

export function validateRfc5545(
  lines: readonly string[],
  startLine: string,
): void {
  const start = property(startLine);
  check(start.values.length === 1, "DTSTART requires one value");
  const form = dateForm(start.values[0], start.zoned);
  check(
    start.type === (form === "date" ? "DATE" : "DATE-TIME"),
    "DTSTART type does not match VALUE",
  );
  check(
    !lines.some((line) => icalPropertyName(line) === "EXRULE"),
    "EXRULE is not an RFC 5545 property",
  );
  const rules = lines.filter((line) => icalPropertyName(line) === "RRULE");
  check(rules.length <= 1, "RFC recurrence requires at most one RRULE");
  if (rules.length) validateRule(rules[0], form);

  for (const line of lines) {
    const name = icalPropertyName(line);
    if (name !== "EXDATE" && name !== "RDATE") continue;
    const { values, type, zoned } = property(line);
    if (name === "EXDATE") {
      check(type === start.type, "EXDATE type must match DTSTART");
    }
    check(
      type === "DATE" || type === "DATE-TIME" ||
        (name === "RDATE" && type === "PERIOD"),
      "Invalid " + name + " VALUE type",
    );
    for (const value of values) {
      if (type === "PERIOD") {
        validatePeriod(value, zoned);
      } else {
        check(
          (dateForm(value, zoned) === "date") === (type === "DATE"),
          name + " type does not match VALUE",
        );
      }
    }
  }
}

function validatePeriod(value: string, zoned: boolean): void {
  const [begin, end, extra] = value.split("/");
  check(end != null && extra == null, "Invalid RDATE period");
  const beginForm = dateForm(begin, zoned);
  check(beginForm !== "date", "Invalid RDATE period start");
  if (/^[+-]?P/i.test(end)) {
    check(
      PERIOD_DURATION.test(end) && /[1-9]/.test(end),
      "Invalid RDATE period duration",
    );
    return;
  }
  const endForm = dateForm(end, zoned);
  check(endForm !== "date", "Invalid RDATE period end");
  if (beginForm === endForm) {
    const a = IsoDate.parse(begin).exp().extend();
    const b = IsoDate.parse(end).exp().extend();
    check(a.mse < b.mse, "RDATE period end must follow its start");
  }
}

function validateRule(line: string, start: Form): void {
  const content = splitICalProperty(line);
  check(
    content?.attributes[0].toUpperCase() === "RRULE",
    "Invalid RRULE property",
  );
  check(
    content.attributes.slice(1).every((part) => /^[A-Z0-9-]+=/i.test(part)),
    "Invalid RRULE parameter",
  );
  const valueParams = content.attributes.slice(1).filter((part) =>
    /^VALUE=/i.test(part)
  );
  check(
    valueParams.length === 0 ||
      (valueParams.length === 1 && valueParams[0].toUpperCase() === "VALUE=RECUR"),
    "RRULE requires VALUE=RECUR",
  );
  const parts = new Map<string, string>();
  for (const part of content.value.toUpperCase().split(";")) {
    const match = /^([A-Z]+)=([^=]+)$/.exec(part);
    check(match != null, "Invalid RRULE part: " + part);
    const [, key, value] = match;
    check(!parts.has(key), "Duplicate RRULE part: " + key);
    parts.set(key, value);
  }
  const freq = parts.get("FREQ");
  check(freq != null && FREQUENCY.test(freq), "Missing or invalid FREQ");
  check(
    !(parts.has("COUNT") && parts.has("UNTIL")),
    "COUNT and UNTIL are mutually exclusive",
  );

  for (const [key, value] of parts) {
    if (key === "FREQ") continue;
    if (key === "COUNT" || key === "INTERVAL") {
      check(
        /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) &&
          Number(value) > 0,
        key + " must be a positive integer",
      );
    } else if (key === "UNTIL") {
      const form = dateForm(value, false);
      check(
        form === (start === "zoned" ? "utc" : start),
        "UNTIL must match the DTSTART form",
      );
    } else if (key === "WKST") {
      check(WEEKDAY.test(value), "Invalid WKST");
    } else if (key === "BYDAY") {
      for (const day of value.split(",")) {
        const match = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(day);
        check(match != null, "Invalid BYDAY");
        if (match[1] != null) {
          check(
            Number(match[1]) !== 0 && Math.abs(Number(match[1])) <= 53 &&
              (freq === "MONTHLY" ||
                (freq === "YEARLY" && !parts.has("BYWEEKNO"))),
            "Ordinal BYDAY is invalid for this rule",
          );
        }
      }
    } else {
      check(Object.hasOwn(NUMBER_PARTS, key), "Unknown RRULE part: " + key);
      const [min, max, nonzero] = NUMBER_PARTS[key];
      const pattern = min < 0 ? /^[+-]?\d+$/ : /^\d+$/;
      check(
        value.split(",").every((v) => {
          const n = Number(v);
          return pattern.test(v) && n >= min && n <= max &&
            (!nonzero || n !== 0);
        }),
        "Invalid " + key,
      );
    }
  }
  check(
    !parts.has("BYWEEKNO") || freq === "YEARLY",
    "BYWEEKNO requires YEARLY",
  );
  check(
    !parts.has("BYMONTHDAY") || freq !== "WEEKLY",
    "BYMONTHDAY is invalid for WEEKLY",
  );
  check(
    !parts.has("BYYEARDAY") || !["DAILY", "WEEKLY", "MONTHLY"].includes(freq),
    "BYYEARDAY is invalid for this frequency",
  );
  check(
    !parts.has("BYSETPOS") ||
      [...parts.keys()].some((part) =>
        part.startsWith("BY") && part !== "BYSETPOS"
      ),
    "BYSETPOS requires another BY selector",
  );
}
