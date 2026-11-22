import { ICalAttributes, icalPropertyName } from "./ical-attributes.ts";
import { IsoDate } from "./iso-date.ts";

type Form = "date" | "floating" | "utc" | "zoned";

const DATE = /^\d{8}$/;
const DATE_TIME = /^\d{8}T\d{6}Z?$/i;
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
  const colon = line.indexOf(":");
  check(colon >= 0, "Missing iCalendar property value");
  const attributes = ICalAttributes.fromRawAttributes(
    line.slice(0, colon).split(";"),
  );
  return {
    values: line.slice(colon + 1).split(","),
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
        const [begin, end, extra] = value.split("/");
        check(
          end && extra == null && dateForm(begin, zoned) !== "date",
          "Invalid RDATE period",
        );
        if (!/^\+?P/i.test(end)) {
          check(dateForm(end, zoned) !== "date", "Invalid RDATE period end");
        }
      } else {
        check(
          (dateForm(value, zoned) === "date") === (type === "DATE"),
          name + " type does not match VALUE",
        );
      }
    }
  }
}

function validateRule(line: string, start: Form): void {
  check(
    icalPropertyName(line) === "RRULE" &&
      line.slice(0, 6).toUpperCase() === "RRULE:",
    "Invalid RRULE property",
  );
  const parts = new Map<string, string>();
  for (const part of line.slice(6).toUpperCase().split(";")) {
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
