import { DateTime } from "../datetime.ts";
import type { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { Time } from "../time.ts";
import { RecurrenceExpansionLimitError } from "./generation-limit.ts";
import { ICalDateLine } from "./ical-date-line.ts";
import type { RecurrenceOccurrence } from "./series.ts";
import { TimezoneRegion } from "../timezone-region.ts";
import type { Tzname } from "../timezone.ts";
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
// RFC 5545 §3.1 allows lists of bare or quoted values. Quoting adds the
// delimiter characters but does not permit controls or an embedded quote.
const NON_ASCII = String.raw`\u0080-\uD7FF\uE000-\u{10FFFF}`;
const PARAM_TEXT = String.raw`[\t\x20-\x21\x23-\x2B\x2D-\x39\x3C-\x7E${NON_ASCII}]*`;
const QUOTED_PARAM = String.raw`"[\t\x20-\x21\x23-\x7E${NON_ASCII}]*"`;
const PARAM_VALUE = `(?:${PARAM_TEXT}|${QUOTED_PARAM})`;
const SINGLE_PARAM_VALUE = new RegExp(`^${PARAM_VALUE}$`, "u");
const CONTENT_VALUE = new RegExp(String.raw`^[\t\x20-\x7E${NON_ASCII}]*$`, "u");
const PARAMETER = new RegExp(
  `^[A-Za-z0-9-]+=${PARAM_VALUE}(?:,${PARAM_VALUE})*$`,
  "u",
);
// RFC 5646 §2.1. The regular grandfathered forms already match LANGTAG.
const IRREGULAR_LANGUAGE_TAGS = new Set([
  "en-gb-oed", "i-ami", "i-bnn", "i-default", "i-enochian", "i-hak",
  "i-klingon", "i-lux", "i-mingo", "i-navajo", "i-pwn", "i-tao", "i-tay",
  "i-tsu", "sgn-be-fr", "sgn-be-nl", "sgn-ch-de",
]);
const LANGUAGE_PRIVATE_USE = "x(?:-[a-z0-9]{1,8})+";
const PRIVATE_LANGUAGE_TAG = new RegExp("^" + LANGUAGE_PRIVATE_USE + "$");
const LANGTAG = new RegExp(
  "^(?:[a-z]{2,3}(?:-[a-z]{3}){0,3}|[a-z]{4,8})" +
    "(?:-[a-z]{4})?(?:-(?:[a-z]{2}|[0-9]{3}))?" +
    "((?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*)" +
    "((?:-[0-9a-wy-z](?:-[a-z0-9]{2,8})+)*)" +
    "(?:-" + LANGUAGE_PRIVATE_USE + ")?$",
);
export const RULE_NUMBER_PARTS: Record<string, [number, number, boolean?]> = {
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

function readDateValue(value: string): IsoDate {
  check(
    DATE.test(value) || DATE_TIME.test(value),
    "Expected an iCalendar DATE or DATE-TIME",
  );
  const date = IsoDate.parse(value).asOk();
  check(date != null, "Invalid iCalendar date or time");
  return date;
}

function checkedDateForm(date: IsoDate, hasZone: boolean): Form {
  if (date.nt == null) {
    check(!hasZone, "TZID is invalid on DATE");
    return "date";
  }
  if (date.z != null) {
    check(!hasZone, "TZID is invalid on UTC DATE-TIME");
    return "utc";
  }
  return hasZone ? "zoned" : "floating";
}

export function dateForm(value: string, hasZone: boolean): Form {
  return checkedDateForm(readDateValue(value), hasZone);
}

export function validateContentLine({
  attributes: [name, ...parameters],
  value,
}: NonNullable<ReturnType<typeof splitICalProperty>>): void {
  check(/^[A-Za-z0-9-]+$/.test(name), "Invalid iCalendar property name");
  check(
    parameters.every((parameter) => PARAMETER.test(parameter)),
    "Invalid " + name.toUpperCase() + " parameter",
  );
  check(CONTENT_VALUE.test(value), "Invalid " + name.toUpperCase() + " content value");
}

/** Validate an explicit VALUE on a property with one allowed value type. */
export function validateRfcValueParameter(
  attributes: readonly string[],
  type: string,
): void {
  if (attributes.length === 1) return;
  const values = attributes.slice(1).filter((part) => /^VALUE=/i.test(part));
  check(
    values.length === 0 ||
      (values.length === 1 && values[0].toUpperCase() === "VALUE=" + type),
    attributes[0].toUpperCase() + " requires VALUE=" + type,
  );
}

/** Decode one RFC 5545 §3.3.11 TEXT value after checking its content line. */
export function decodeRfcText(value: string, name: string): string {
  check(/^(?:[^\\,;]|\\[\\,;nN])*$/.test(value), "Invalid " + name);
  return value.replace(
    /\\([\\,;nN])/g,
    (_, char: string) => char.toLowerCase() === "n" ? "\n" : char,
  );
}

function isLanguageTag(value: string): boolean {
  if (!/^[A-Za-z0-9-]+$/.test(value)) return false;
  const normalized = value.toLowerCase();
  if (IRREGULAR_LANGUAGE_TAGS.has(normalized) || PRIVATE_LANGUAGE_TAG.test(normalized)) {
    return true;
  }
  const match = LANGTAG.exec(normalized);
  if (match == null) return false;
  const [, variants, extensions] = match;
  const variantTags = variants.match(/[a-z0-9]+/g) ?? [];
  const singletons = Array.from(extensions.matchAll(/-([a-z0-9])(?=-)/g), ([, tag]) => tag);
  return new Set(variantTags).size === variantTags.length &&
    new Set(singletons).size === singletons.length;
}

/** Decode the parameter syntax accepted for calendar TZIDs, including RFC 6868. */
export function decodeRfcTzid(written: string): string {
  const value = written.replace(/^"([^"]*)"$/, "$1");
  return value.replace(/\^[\^n']/g, (escape) =>
    escape === "^^" ? "^" : escape === "^n" ? "\n" : '"'
  );
}

/** Write a decoded calendar TZID as one quoted property parameter. */
export function encodeRfcTzid(name: string): string {
  return '"' + name.replace(/["^\n]/g, (char) =>
    char === "^" ? "^^" : char === '"' ? "^'" : "^n"
  ) + '"';
}

function property(line: string) {
  const content = splitICalProperty(line);
  check(content != null, "Missing iCalendar property value");
  if (content.attributes.length === 1) {
    validateContentLine(content);
    return { values: content.value.split(","), type: "DATE-TIME" };
  }
  for (const key of ["TZID", "VALUE"]) {
    const parameters = content.attributes.slice(1).filter((part) =>
      part.split("=", 1)[0].toUpperCase() === key
    );
    check(parameters.length <= 1, "Duplicate " + key + " parameter");
    check(
      parameters.length === 0 || parameters[0].length > key.length + 1,
      "Missing " + key + " parameter value",
    );
  }
  validateContentLine(content);
  const attributes = ICalAttributes.fromRawAttributes(content.attributes);
  const tzid = attributes.get("TZID");
  const zoneName = tzid == null ? undefined : decodeRfcTzid(tzid);
  if (tzid != null) {
    // §3.2.19 names one VTIMEZONE. A comma in its name must be quoted.
    check(SINGLE_PARAM_VALUE.test(tzid), "TZID requires one parameter value");
    check(zoneName !== "", "Missing TZID parameter value");
  }
  return {
    values: content.value.split(","),
    type: (attributes.get("VALUE") ?? "DATE-TIME").toUpperCase(),
    zoneName,
  };
}

function observanceOffset(lines: readonly string[], name: string): string {
  const matching = lines.filter((line) => icalPropertyName(line) === name);
  check(matching.length === 1, "Observance requires exactly one " + name);
  const content = splitICalProperty(matching[0]);
  check(content != null, "Missing " + name + " value");
  validateContentLine(content);
  validateRfcValueParameter(content.attributes, "UTC-OFFSET");
  const offset = /^([+-])([01]\d|2[0-3])([0-5]\d)([0-5]\d)?$/.exec(content.value);
  check(offset != null && !/^-0+$/.test(content.value), "Invalid " + name);
  const [, sign, hour, minute, second] = offset;
  return sign + hour + ":" + minute + (second == null || second === "00" ? "" : ":" + second);
}

/** Bind one RFC 5545 §3.6.5 observance to the offset in effect before its onset. */
export function rfcObservance(
  lines: readonly string[],
): {
  lines: string[];
  zone: TimezoneRegion;
  from: string;
  to: string;
  abbreviation: string;
  component: string;
} | null {
  const component = /^BEGIN:(STANDARD|DAYLIGHT)$/i.exec(lines[0] ?? "")?.[1];
  if (component == null) return null;
  check(
    lines.at(-1)?.toUpperCase() === "END:" + component.toUpperCase(),
    "Observance requires a matching END",
  );
  const body = lines.slice(1, -1);
  check(
    !body.some((line) => ["BEGIN", "END"].includes(icalPropertyName(line))),
    "Expected a single timezone observance",
  );
  check(
    body.filter((line) => icalPropertyName(line) === "DTSTART").length === 1,
    "Observance requires exactly one DTSTART",
  );

  const from = observanceOffset(body, "TZOFFSETFROM");
  const to = observanceOffset(body, "TZOFFSETTO");
  let abbreviation: string | undefined;
  for (const line of body.filter((line) => icalPropertyName(line) === "TZNAME")) {
    const content = splitICalProperty(line);
    check(content != null, "Missing TZNAME value");
    validateContentLine(content);
    validateRfcValueParameter(content.attributes, "TEXT");
    const languages = content.attributes.slice(1).filter((part) => /^LANGUAGE=/i.test(part));
    check(languages.length <= 1, "Duplicate TZNAME LANGUAGE parameter");
    if (languages.length === 1) {
      check(isLanguageTag(languages[0].slice("LANGUAGE=".length)), "Invalid TZNAME LANGUAGE");
    }
    const value = decodeRfcText(content.value, "VTIMEZONE TZNAME");
    abbreviation ??= value;
  }
  const exclusionZones = new Set(body
    .filter((line) => icalPropertyName(line) === "EXDATE")
    .map((line) => property(line).zoneName));
  let name = "X-RFC5545-OBSERVANCE" as Tzname;
  while (exclusionZones.has(name)) name = (name + "-") as Tzname;
  const anchor = DateTime.fromRfc3339("1970-01-01T00:00:00" + from).exp();
  const zone = new TimezoneRegion(name, [{
    before: { mse: anchor.mse, time: anchor, tzabbr: name },
    after: { time: anchor, tzabbr: name },
  }]);

  const bound = body.flatMap((line) => {
    const tag = icalPropertyName(line);
    if (tag !== "DTSTART" && tag !== "RDATE" && tag !== "EXDATE") return [line];
    const { type, values, zoneName } = property(line);
    const header = splitICalProperty(line)!.attributes.join(";");
    if (tag === "EXDATE") {
      if (type !== "DATE-TIME" || zoneName != null) return [line];
      return values.map((value) =>
        header + (dateForm(value, false) === "floating" ? ";TZID=" + name : "") + ":" + value
      );
    }
    check(
      type === "DATE-TIME" && values.every((value) => dateForm(value, zoneName != null) === "floating"),
      "Observance " + tag + " requires local DATE-TIME",
    );
    const zoned = header + ";TZID=" + name + ":" + values.join(",");
    // DTSTART declares the effective onset. The RFC's replacement daylight
    // example declares one even though it does not match its RRULE.
    return tag === "DTSTART" ? [zoned, "RDATE" + zoned.slice(tag.length)] : [zoned];
  });
  return { lines: bound, zone, from, to, abbreviation: abbreviation ?? "", component: component.toUpperCase() };
}

export async function validateRfc5545(
  lines: readonly string[],
  startLine: string,
  loadZone: (name: string) => Promise<TimezoneRegion>,
  preserveDateForms: boolean,
): Promise<{ rule?: Map<string, string>; dtstart?: ICalDateLine }> {
  const start = property(startLine);
  check(start.values.length === 1, "DTSTART requires one value");
  const date = readDateValue(start.values[0]);
  const form = checkedDateForm(date, start.zoneName != null);
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
  const rule = rules.length ? validateRule(rules[0], form) : undefined;

  for (const line of lines) {
    const name = icalPropertyName(line);
    if (name === "DTSTART" || name === "RRULE") continue;
    if (name !== "EXDATE" && name !== "RDATE") {
      // A malformed header can prevent a recurrence property from being
      // recognized. Ignored metadata still uses the content-line grammar.
      const content = splitICalProperty(line);
      check(content != null, "Missing iCalendar property value");
      validateContentLine(content);
      continue;
    }
    const { values, type, zoneName } = property(line);
    if (name === "EXDATE" && !preserveDateForms) {
      check(type === start.type, "EXDATE type must match DTSTART");
    }
    check(
      type === "DATE" || type === "DATE-TIME" ||
        (name === "RDATE" && type === "PERIOD"),
      "Invalid " + name + " VALUE type",
    );
    if (type === "PERIOD") {
      const zone = zoneName == null ? null : await loadZone(zoneName);
      for (const value of values) validatePeriod(value, zone);
    } else {
      for (const value of values) {
        check(
          (dateForm(value, zoneName != null) === "date") === (type === "DATE"),
          name + " type does not match VALUE",
        );
      }
    }
  }
  // The parser supplies no additional metadata for an unparameterized start.
  const dtstart = startLine["DTSTART".length] === ":" ? new ICalDateLine(
    "DTSTART", [date.extend()], undefined, undefined, null,
    [{ timed: date.nt != null, utc: date.z != null }],
  ) : undefined;
  return { rule, dtstart };
}

function validatePeriod(value: string, zone: TimezoneRegion | null): void {
  const [begin, end, extra] = value.split("/");
  check(end != null && extra == null, "Invalid RDATE period");
  const beginForm = dateForm(begin, zone != null);
  check(beginForm !== "date", "Invalid RDATE period start");
  if (/^[+-]?P/i.test(end)) {
    check(
      PERIOD_DURATION.test(end) && /[1-9]/.test(end),
      "Invalid RDATE period duration",
    );
    return;
  }
  const endForm = dateForm(end, zone != null);
  check(endForm !== "date", "Invalid RDATE period end");
  const a = IsoDate.parse(begin).exp().extend();
  const b = IsoDate.parse(end).exp().extend();
  const from = zone?.toRfc5545WallClock(a).mse ?? a.mse;
  const to = zone?.toRfc5545WallClock(b).mse ?? b.mse;
  const span = to - from;
  if (beginForm === endForm) {
    check(span > 0, "RDATE period end must follow its start");
    return;
  }

  // Mixed endpoints have one floating value. RFC 5545 §3.3.14
  // permits offsets through ±23:59:59, so the offset can change the
  // span in either direction. §3.3.9 requires strictly increasing ends.
  const maxOffset = Time.MS_PER_DAY - Time.MS_PER_SEC;
  check(span > -maxOffset, "RDATE period end must follow its start");
  check(
    span > maxOffset,
    "RDATE period endpoint ordering depends on the floating timezone",
  );
}

/** Parse unique RECUR parts before applying a provider's value rules. */
export function parseRuleParts(value: string): Map<string, string> {
  const parts = new Map<string, string>();
  for (const part of value.toUpperCase().split(";")) {
    const match = /^([A-Z]+)=([^=]+)$/.exec(part);
    check(match != null, "Invalid RRULE part: " + part);
    const [, key, value] = match;
    check(!parts.has(key), "Duplicate RRULE part: " + key);
    parts.set(key, value);
  }
  return parts;
}

export function ruleNumbersInRange(
  value: string,
  min: number,
  max: number,
  nonzero?: boolean,
  maxDigits = Infinity,
): boolean {
  const pattern = min < 0 ? /^[+-]?(\d+)$/ : /^(\d+)$/;
  return value.split(",").every((v) => {
    const digits = pattern.exec(v)?.[1];
    if (digits == null || digits.length > maxDigits) return false;
    const n = Number(v);
    return n >= min && n <= max && (!nonzero || n !== 0);
  });
}

function validateRule(line: string, start: Form): Map<string, string> {
  const content = splitICalProperty(line);
  check(
    content?.attributes[0].toUpperCase() === "RRULE",
    "Invalid RRULE property",
  );
  validateContentLine(content);
  validateRfcValueParameter(content.attributes, "RECUR");
  // The RECUR grammar is case-insensitive US-ASCII. Unicode case
  // conversion can map other letters to valid ASCII names or tokens.
  check(/^[\x00-\x7F]*$/.test(content.value), "RRULE must use ASCII tokens");
  const parts = parseRuleParts(content.value);
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
        /^0*[1-9]\d*$/.test(value),
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
      check(
        Object.hasOwn(RULE_NUMBER_PARTS, key),
        "Unknown RRULE part: " + key,
      );
      const [min, max, nonzero] = RULE_NUMBER_PARTS[key];
      // §3.3.10: yeardaynum (also used by BYSETPOS) takes up to three digits.
      const maxDigits = key === "BYYEARDAY" || key === "BYSETPOS" ? 3 : 2;
      check(
        ruleNumbersInRange(value, min, max, nonzero, maxDigits),
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
  return parts;
}

// RFC 5545 §3.3.4–5 and §3.8.5.1–2. DATE, floating DATE-TIME,
// and an instant each have their own identity in an unbound set.
function explicitKind(line: ICalDateLine, index: number) {
  const form = line.forms?.[index];
  if (line.value === "DATE" || form?.timed === false) return "date";
  if (form?.utc || line.region != null) return "instant";
  return "floating";
}

function* explicitStarts(
  lines: readonly ICalDateLine[],
): Generator<RecurrenceOccurrence> {
  for (const line of lines) {
    for (const [i, value] of line.dates.entries()) {
      const kind = explicitKind(line, i);
      if (kind === "date") yield value.date;
      else if (kind === "floating") yield value;
      else {yield line.region?.toRfc5545WallClock(value).toUtc() ??
          value.asUtc();}
    }
  }
}

/** Keep explicit date values of the requested types, including on mixed lines. */
export function filterDateLineValues(
  lines: readonly ICalDateLine[],
  keep: (kind: ReturnType<typeof explicitKind>) => boolean,
): ICalDateLine[] {
  const result: ICalDateLine[] = [];
  for (const line of lines) {
    const indices: number[] = [];
    for (let i = 0; i < line.dates.length; i++) {
      if (keep(explicitKind(line, i))) indices.push(i);
    }
    if (indices.length === line.dates.length) {
      result.push(line);
    } else if (indices.length > 0) {
      result.push(
        new ICalDateLine(
          line.label,
          indices.map((i) => line.dates[i]),
          line.region,
          line.value,
          line.determinism,
          line.forms == null ? undefined : indices.map((i) => line.forms![i]),
        ),
      );
    }
  }
  return result;
}

function occurrenceKey(value: RecurrenceOccurrence): string {
  if (value instanceof DateTime) return "instant:" + value.mse;
  if (value instanceof NaiveDateTime) return "floating:" + value.mse;
  return "date:" + value.dse;
}

/** Merge typed explicit dates with an RFC rule that still owns COUNT and UNTIL. */
export function rfcDateSetGenerator(
  rdates: readonly ICalDateLine[],
  exdates: readonly ICalDateLine[],
  ruleStarts: (through: NaiveDate) => RecurrenceOccurrence[],
  generationLimit?: number,
) {
  const exclusions = new Set([...explicitStarts(exdates)].map(occurrenceKey));
  const inclusions = new Map<string, RecurrenceOccurrence>();
  for (const value of explicitStarts(rdates)) {
    const key = occurrenceKey(value);
    if (!exclusions.has(key)) inclusions.set(key, value);
  }
  const explicit = [...inclusions.values()].sort((a, b) => a.mse - b.mse);
  let next = 0;
  let total = 0;
  let failure: Error | undefined;
  return {
    generateUpToDate(through: NaiveDate): RecurrenceOccurrence[] {
      if (failure != null) throw failure;
      try {
        const end = (through.dse + 1) * Time.MS_PER_DAY;
        const starts = new Map<string, RecurrenceOccurrence>();
        for (const value of ruleStarts(through)) {
          starts.set(occurrenceKey(value), value);
        }
        while (next < explicit.length && explicit[next].mse < end) {
          const value = explicit[next++];
          starts.set(occurrenceKey(value), value);
        }
        total += starts.size;
        if (generationLimit != null && total > generationLimit) {
          throw new RecurrenceExpansionLimitError(generationLimit);
        }
        return [...starts.values()].sort((a, b) => a.mse - b.mse);
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        throw failure;
      }
    },
  };
}
