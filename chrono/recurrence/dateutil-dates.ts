import { type DateutilHost, DateutilLocalZone } from "./dateutil-host.ts";
import { Time } from "../time.ts";
import { Month } from "../units/month.ts";
import type { TimezoneRegion } from "../timezone-region.ts";
import { splitLiteralICalProperty } from "./ical-attributes.ts";
import { Weekday } from "../units/weekday.ts";
import type { Month1 } from "../units/units.ts";
import { YearMonth } from "../units/year-month.ts";
import { YearMonthDay } from "../units/year-month-day.ts";
import { IsoDate } from "./iso-date.ts";
import { dateutilOffsetMagnitude, normalizeDateutilDigits } from "./dateutil-numbers.ts";

type DateProperty = NonNullable<ReturnType<typeof splitLiteralICalProperty>>;

export interface DateutilDateContext {
  parserYear(): number;
  localDate(): { year: number; month: number; day: number };
  host?: DateutilHost;
}

export function createDateutilDateContext(
  dateutilHost?: DateutilHost,
  dateutilParserYear?: number,
): DateutilDateContext {
  // Historical host captures need the current date only when a date
  // omits a field or uses a two-digit year.
  let today: ReturnType<DateutilDateContext["localDate"]> | undefined;
  const dateContext: DateutilDateContext = {
    host: dateutilHost,
    localDate() {
      if (today == null) {
        const now = Date.now();
        const local = new Date(now);
        if (dateutilHost == null) {
          today = {
            year: local.getFullYear(),
            month: local.getMonth() + 1,
            day: local.getDate(),
          };
        } else {
          const { offsetSeconds } = dateutilHost.localTime(
            now / Time.MS_PER_SEC,
          );
          local.setTime(now + offsetSeconds * Time.MS_PER_SEC);
          today = {
            year: local.getUTCFullYear(),
            month: local.getUTCMonth() + 1,
            day: local.getUTCDate(),
          };
        }
      }
      return today;
    },
    parserYear() {
      const year = dateutilParserYear ?? dateContext.localDate().year;
      if (!Number.isInteger(year) || year < 1 || year > 9999) {
        throw new RangeError("Invalid dateutil parser year");
      }
      return year;
    },
  };
  return dateContext;
}

export async function scanDateutilProperties(
  source: readonly string[],
  lines: string[],
  findRegion: (name: string) => Promise<TimezoneRegion | null>,
  fixedRegion: (offsetMs: number) => TimezoneRegion,
  localRegion: (zone: DateutilLocalZone) => TimezoneRegion,
  context: DateutilDateContext,
  preserveStartFraction = false,
): Promise<{
  lines: string[];
  readRdates(midnight: boolean): Promise<string[]>;
}> {
  // dateutil collects identifier spellings before unfolding or splitting.
  const zoneNames = new Map(
    [...source.join("\r\n").matchAll(/TZID=([^:]+):/g)]
      .map(([, name]) => [name.toUpperCase(), name]),
  );
  const normalized: string[] = [];
  const deferred: DateProperty[] = [];
  async function readDate(
    property: DateProperty,
    name: string,
    midnight = false,
  ) {
    const normalized: string[] = [];
    let zone: TimezoneRegion | null = null;
    const attributes = [name];
    let hasValue = false;
    for (const parameter of property.attributes.slice(1)) {
      const upper = parameter.toUpperCase();
      if (upper.startsWith("TZID=")) {
        const identifier = upper.slice(upper.lastIndexOf("TZID=") + 5);
        const key = zoneNames.get(identifier);
        if (key != null) zone = await findRegion(key);
      } else {
        if (upper !== "VALUE=DATE" && upper !== "VALUE=DATE-TIME") {
          throw new Error("unsupported parm: " + upper);
        }
        if (name !== "RDATE" && hasValue) {
          throw new Error("Duplicate value parameter found in: " + upper);
        }
        hasValue = true;
        attributes.push(parameter);
      }
    }
    const values = property.value.toUpperCase().split(",").map((value) => {
      const { text: date, local } = normalizeDate(
        value,
        name === "DTSTART" && !preserveStartFraction,
        context,
      );
      const numeric = inlineOffset(date, value);
      if (
        zone != null && (local != null || numeric != null || /Z$/i.test(date))
      ) {
        throw new Error("DTSTART/EXDATE specifies multiple timezone");
      }
      if (local != null) return { text: date, region: localRegion(local) };
      if (numeric == null) {
        return {
          text: midnight && /^\d{8}$/.test(date) ? date + "T000000" : date,
        };
      }
      const { wall, offsetMs, fraction } = numeric;
      const invalidOffset = Math.abs(offsetMs) >= Time.MS_PER_DAY;
      const utc = invalidOffset ? wall : wall.add({ ms: -offsetMs });
      if (
        invalidOffset || utc.date.yr < 1 || utc.date.yr > 9999 ||
        (name === "DTSTART" && offsetMs !== 0)
      ) {
        return { text: wall.ical() + fraction, region: fixedRegion(offsetMs) };
      }
      return { text: utc.ical() + fraction + "Z" };
    });
    if (name === "DTSTART" && values.length !== 1) {
      throw new Error(
        "Multiple DTSTART values specified:" + property.value.toUpperCase(),
      );
    }
    // Explicit dates that cannot be projected in Python retain their fixed
    // offset identity until the set compares or emits them.
    if (values.some(({ region }) => region != null)) {
      for (const { text, region } of values) {
        const tzid = region == null ? "" : ";TZID=" + region.fullname;
        normalized.push(attributes.join(";") + tzid + ":" + text);
      }
    } else {
      if (zone != null) attributes.push("TZID=" + zone.fullname);
      normalized.push(
        attributes.join(";") + ":" + values.map(({ text }) => text).join(","),
      );
    }
    return normalized;
  }
  for (const line of lines) {
    const property = splitLiteralICalProperty(line);
    if (property == null) {
      normalized.push("RRULE:" + line);
      continue;
    }
    const name = property.attributes[0].toUpperCase();
    if (name === "RRULE" || name === "EXRULE") {
      const parameter = property.attributes[1];
      if (parameter != null) {
        throw new Error(
          "unsupported " + name + " parm: " + parameter.toUpperCase(),
        );
      }
      normalized.push(line);
    } else if (name === "DTSTART" || name === "EXDATE" || name === "RDATE") {
      if (name === "RDATE") {
        const unsupported = property.attributes.slice(1).map((part) => part.toUpperCase()).find((part) =>
          part !== "VALUE=DATE-TIME"
        );
        if (unsupported != null) throw new Error("unsupported RDATE parm: " + unsupported);
        // Match the reference's property scan, then parse RDATE values
        // after all inclusion rules have been constructed.
        deferred.push(property);
        normalized.push(line);
      } else {
        normalized.push(...await readDate(property, name));
      }
    } else {
      throw new Error("unsupported property: " + name);
    }
  }
  return {
    lines: normalized,
    async readRdates(midnight) {
      const dates: string[] = [];
      for (const property of deferred) {
        dates.push(...await readDate(property, "RDATE", midnight));
      }
      return dates;
    },
  };
}

const NUMERIC_DATE = /^(\d+)([-/.])(\d+)([-/.])(\d+)(?=T|Z|$)/;
const SHORT_COMPACT_DATE = /^(\d{2})(\d{2})(\d{2})(?=T|Z|$)/;
const NAMED_MONTH_DATE =
  /^(\d+|[A-Z]+)([-/.])(\d+|[A-Z]+)([-/.])(\d+|[A-Z]+)(?=T|Z|$)/;

function dateutilYear(
  year: number,
  centuryWritten: boolean,
  parserYear: () => number,
  original: string,
): number {
  if (!centuryWritten && year < 100) {
    const pivot = parserYear();
    year += pivot - pivot % 100;
    if (year >= pivot + 50) year -= 100;
    else if (year < pivot - 50) year += 100;
  }
  if (year < 0 || year > 9999) {
    throw new RangeError("year " + year + " is out of range: " + original);
  }
  return year;
}

function explicitYearField(value: string, trailingSeparate: boolean): boolean {
  // A third field behind a different separator is appended as a number.
  return trailingSeparate ? Number(value) > 100 : value.length > 2;
}

interface CalendarDate {
  text: string;
  // The number of parsed fields before inheriting the missing fields.
  fieldCount: number;
  fields?: readonly DateField[];
  weekday?: number;
}

function normalizeNumericDate(
  ascii: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate | undefined {
  const separated = NUMERIC_DATE.exec(ascii);
  const compact = separated == null ? SHORT_COMPACT_DATE.exec(ascii) : null;
  if (separated == null && compact == null) return;
  const [written, first, second, third] = separated == null
    ? compact!
    : [separated[0], separated[1], separated[3], separated[5]];
  // A dotted numeric date is one token. Slash and hyphen are separate tokens.
  if (separated != null && (separated[2] === ".") !== (separated[4] === ".")) {
    throw new Error("Unknown string format: " + original);
  }
  const trailingSeparate = separated != null && separated[2] !== separated[4];
  const fields = [first, second, third].map((value, index) => ({
    value: Number(value),
    isYear: explicitYearField(value, index === 2 && trailingSeparate),
  }));
  return {
    text: resolveDateFields(fields, context, original) +
      ascii.slice(written.length),
    fieldCount: fields.length,
  };
}

function normalizeNamedMonthDate(
  ascii: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate | undefined {
  const match = NAMED_MONTH_DATE.exec(ascii);
  if (match == null) return;
  const [written, first, firstSeparator, second, secondSeparator, third] =
    match;
  const tokens = [first, second, third];
  const named = tokens.findIndex((field) => /^[A-Z]+$/.test(field));
  if (
    named < 0 ||
    tokens.some((token, index) => index !== named && !/^\d+$/.test(token))
  ) {
    return;
  }
  const remainder = ascii.slice(written.length);
  // A trailing T is part of the month token. A dot between numeric
  // fields after a non-dot separator is parsed as a decimal point.
  if (
    (named === 2 && remainder !== "") ||
    (named === 0 && firstSeparator !== "." && secondSeparator === ".") ||
    (named === 2 && firstSeparator === "." && secondSeparator !== ".")
  ) {
    throw new Error("Unknown string format: " + original);
  }
  const month = monthNumber(tokens[named]);
  if (month === 0) throw new Error("Unknown string format: " + original);
  // After a leading month and dot, the lexer reads the two numbers together.
  const trailingSeparate = firstSeparator !== secondSeparator &&
    !(named === 0 && firstSeparator === ".");
  const fields = tokens.map((value, index) =>
    index === named ? { value: month, isMonth: true } : {
      value: Number(value),
      isYear: explicitYearField(value, index === 2 && trailingSeparate),
    }
  );
  return {
    text: resolveDateFields(fields, context, original) + remainder,
    fieldCount: fields.length,
  };
}

function monthNumber(value: string): number {
  const spelling = value === "SEPT" ? "SEP" : value;
  return Month.MONTHS_OF_YEAR.findIndex((full, index) =>
    spelling === full.toUpperCase() ||
    spelling === Month.MONTHS_OF_YEAR_SHORT[index].toUpperCase()
  ) + 1;
}

function normalizePartialDate(
  ascii: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate | undefined {
  const match = /^(\d{1,5}|[A-Z]+)(?:([-/.])(\d{1,5}|[A-Z]+))?(?=T\d|$)/
    .exec(ascii) ?? /^([A-Z]+)([-/])(\d{6,})(?=T\d|\+|$)/.exec(ascii);
  if (match == null) return;
  const [written, first, separator, second] = match;
  const clock = ascii.slice(written.length);
  if (clock.startsWith("+")) {
    throw new Error("Unknown string format: " + original);
  }
  const tokens = second == null ? [first] : [first, second];
  const named = tokens.findIndex((token) => /^[A-Z]+$/.test(token));
  const fields: DateField[] = [];
  if (named !== -1) {
    if (named === tokens.length - 1 && clock !== "") {
      throw new Error("Unknown string format: " + original);
    }
    for (const [index, token] of tokens.entries()) {
      if (index === named) {
        const month = monthNumber(token);
        if (month === 0) throw new Error("Unknown string format: " + original);
        fields.push({ value: month, isMonth: true });
      } else {
        if (!/^\d+$/.test(token)) {
          throw new Error("Unknown string format: " + original);
        }
        fields.push({
          value: Number(token),
          isYear: explicitYearField(token, named === 0 && separator === "."),
        });
      }
    }
  } else if (second == null || separator === ".") {
    // Two numbers separated by one dot form a single decimal token. The
    // compact clock and date widths take precedence over decimal handling.
    if (second != null && [6, 8, 12, 14].includes(written.length)) {
      throw new Error("Unknown string format: " + original);
    }
    fields.push({ value: Number(first), isYear: Number(written) > 100 });
  } else {
    for (const token of tokens) {
      fields.push({
        value: Number(token),
        isYear: explicitYearField(token, false),
      });
    }
  }
  return {
    text: resolveDateFields(fields, context, original) + clock,
    fieldCount: fields.length,
    fields,
  };
}

interface DateField {
  value: number;
  isYear?: boolean;
  isMonth?: boolean;
}

function resolveDateFields(
  fields: readonly DateField[],
  context: DateutilDateContext,
  original: string,
  weekday = -1,
): string {
  const values = fields.map(({ value }) => value);
  const yearIndex = fields.findIndex(({ isYear }) => isYear);
  const monthIndex = fields.findIndex(({ isMonth }) => isMonth);
  if (
    (fields.length === 0 && weekday === -1) || fields.length > 3 ||
    fields.findLastIndex(({ isYear }) => isYear) !== yearIndex ||
    fields.findLastIndex(({ isMonth }) => isMonth) !== monthIndex
  ) {
    throw new Error("Unknown string format: " + original);
  }

  let year: number | undefined;
  let month: number | undefined;
  let day: number | undefined;
  if (monthIndex !== -1) {
    month = values[monthIndex];
    const rest = values.filter((_, index) => index !== monthIndex);
    if (rest.length === 1) {
      if (yearIndex !== -1 || rest[0] > 31) year = rest[0];
      else day = rest[0];
    } else if (rest.length === 2) {
      const index = yearIndex !== -1
        ? yearIndex - Number(yearIndex > monthIndex)
        : monthIndex === 2
        ? Number(rest[1] > 31)
        : Number(rest[0] <= 31);
      year = rest[index];
      day = rest[1 - index];
    }
  } else if (values.length !== 0) {
    const [first, second, third] = values;
    if (values.length === 1) {
      if (first > 31) year = first;
      else day = first;
    } else if (values.length === 2) {
      if (first > 31) [year, month] = values;
      else if (second > 31) [month, year] = values;
      else [month, day] = values;
    } else if (first > 31 || yearIndex === 0) {
      [year, month, day] = values;
    } else if (first > 12) {
      [day, month, year] = values;
    } else {
      [month, day, year] = [first, second, third];
    }
  }
  const date = completeDateFields(
    year,
    month,
    day,
    yearIndex !== -1,
    context,
    original,
  );
  if (weekday === -1 || day != null) return date;
  validateNormalizedDate(date, original);
  const wall = YearMonthDay.fromYmd1Exp(
    Number(date.slice(0, 4)),
    Number(date.slice(4, 6)),
    Number(date.slice(6, 8)),
  );
  const next = wall.addDays((weekday - (wall.dayOfWeek.dow - 1) + 7) % 7);
  if (next.yr > 9999) throw new RangeError("date value out of range");
  return next.ical();
}

function completeDateFields(
  year: number | undefined,
  month: number | undefined,
  day: number | undefined,
  centuryWritten: boolean,
  { localDate, parserYear }: DateutilDateContext,
  original: string,
): string {
  year = year == null
    ? localDate().year
    : dateutilYear(year, centuryWritten, parserYear, original);
  month ??= localDate().month;
  if (day == null) {
    // Only inherited days are clipped to the resolved month.
    if (month < 1 || month > 12) {
      throw new RangeError(
        "bad month number " + month + "; must be 1-12: " + original,
      );
    }
    day = Math.min(
      localDate().day,
      YearMonth.daysInMonth({ yr: year, mth: month as Month1 }),
    );
  }
  return String(year).padStart(4, "0") +
    String(Math.min(month, 99)).padStart(2, "0") +
    String(Math.min(day, 99)).padStart(2, "0");
}

const ORDINAL_TOKEN = /^(?:ST|ND|RD|TH)$/;
const DATE_WITH_WORDS =
  /^(\d{1,8}(?:ST|ND|RD|TH)?|[A-Z]+)(?:[-/.](?:\d{1,8}(?:ST|ND|RD|TH)?|[A-Z]+)){0,3}(?=T\d|$)/;

function dateBeforeExplicitClock(ascii: string): string {
  const boundary = ascii.search(/(?<=\d)T(?=\d)/);
  return boundary < 0 ? ascii : ascii.slice(0, boundary);
}

function hasAdjacentMonth(date: string): boolean {
  if (!/^[A-Z\d./-]+$/.test(date)) return false;
  for (const { 0: word, index } of date.matchAll(/[A-Z]+/g)) {
    // A clock marker or ordinal suffix can merge into the month word
    // and make the spelling invalid.
    const month = monthNumber(word) ||
      monthNumber(word.replace(/T$/, "")) ||
      monthNumber(word.replace(/^(?:ST|ND|RD|TH)/, ""));
    if (
      month !== 0 &&
      (/\d/.test(date[index - 1] ?? "") ||
        /\d/.test(date[index + word.length] ?? ""))
    ) {
      return true;
    }
  }
  return false;
}

// An ordinal suffix interrupts a numeric group. The same token reader
// handles month names next to digits, where there is no group separator.
function normalizeCalendarWords(
  ascii: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate | undefined {
  const beforeClock = dateBeforeExplicitClock(ascii);
  const adjacentMonth = hasAdjacentMonth(beforeClock);
  const date = adjacentMonth ? beforeClock : DATE_WITH_WORDS.exec(ascii)?.[0];
  if (date == null || !/[A-Z]/.test(date)) return;

  const tokens =
    (date.match(/(?:[A-Z]+|\d+)(?:\.(?:[A-Z]+|\d+))*|[-/.]/g) ?? [])
      .flatMap((token) =>
        /^\d+\.\d+$/.test(token) ? [token] : token.split(/(\.)/).filter(Boolean)
      );
  const weekdays = tokens.map((token) =>
    /^[A-Z]{3,}$/.test(token) ? weekdayNumber(token) : -1
  );
  if (
    !adjacentMonth && !tokens.some((token) => ORDINAL_TOKEN.test(token)) &&
    weekdays.every((weekday) => weekday === -1)
  ) {
    return;
  }

  const clock = ascii.slice(date.length);
  const invalid = () => new Error("Unknown string format: " + original);
  if (clock !== "" && /[A-Z]$/.test(date)) throw invalid();
  const fields: DateField[] = [];
  let weekday = -1;
  let embeddedClock = "";

  function append(
    value: string | undefined,
    preserveWidth: boolean,
    allowMonth: boolean,
  ) {
    if (value == null) throw invalid();
    const month = allowMonth ? monthNumber(value) : 0;
    if (month !== 0) {
      fields.push({ value: month, isMonth: true });
    } else {
      if (!(preserveWidth ? /^\d+$/ : /^\d+(?:\.\d+)?$/).test(value)) {
        throw invalid();
      }
      fields.push({
        value: Math.trunc(Number(value)),
        isYear: explicitYearField(value, !preserveWidth),
      });
    }
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    const separator = tokens[index + 1];
    const numeric = /^\d/.test(token);
    if (ORDINAL_TOKEN.test(token) || /^[-/.]$/.test(token)) continue;
    if (weekdays[index] !== -1) {
      weekday = weekdays[index];
      continue;
    }
    // Compact date tokens take precedence over the separator following them.
    if (/^\d{8}$/.test(token)) {
      fields.push({ value: Number(token.slice(0, 4)), isYear: true });
      append(token.slice(4, 6), true, false);
      append(token.slice(6, 8), true, false);
      continue;
    }
    if (fields.length === 0 && /^\d{6}$/.test(token)) {
      for (const field of token.match(/\d{2}/g)!) append(field, true, false);
      continue;
    }
    if (adjacentMonth && /^\d{6}(?:\.\d+)?$/.test(token)) {
      embeddedClock = "T" + token;
      continue;
    }
    if (numeric && [6, 8, 12, 14].includes(token.length)) throw invalid();
    const group = separator === "-" || separator === "/" ||
      (numeric && separator === ".");
    if (
      numeric && !group && separator != null && !ORDINAL_TOKEN.test(separator)
    ) {
      // A number stuck to a word can supply a day only if it fits the
      // month already seen. With no month yet, days 1 to 31 are possible.
      const month = fields.find((field) => field.isMonth)?.value;
      const year = fields.find((field) => field.isYear)?.value ?? 2000;
      const limit = month == null
        ? 31
        : YearMonth.daysInMonth({ yr: year, mth: month as Month1 });
      if (Number(token) < 1 || Number(token) > limit) throw invalid();
    }
    append(token, numeric && group, !numeric);
    if (!group) continue;
    index++;
    const next = tokens[index + 1];
    if (numeric && (next == null || ORDINAL_TOKEN.test(next))) continue;
    append(next, true, numeric);
    index++;
    if (tokens[index + 1] === separator) {
      append(tokens[index + 2], true, numeric);
      index += 2;
    }
  }

  if (fields.length === 0 && weekday === -1) {
    throw new Error("String does not contain a date: " + original);
  }
  const day = resolveDateFields(fields, context, original, weekday);
  const calendar = { text: day, fieldCount: fields.length, fields, weekday };
  return embeddedClock !== "" && clock !== ""
    ? applyFollowingClockFields(
      calendar,
      embeddedClock,
      clock,
      original,
      context,
    )
    : { ...calendar, text: day + (clock || embeddedClock) };
}

function fieldFollowingClock(clock: string): DateField | undefined {
  const token = /^T(\d{1,5}(?:\.\d+)?)$/.exec(clock)?.[1];
  if (token == null || [6, 8, 12, 14].includes(token.length)) return;
  return {
    value: Math.trunc(Number(token)),
    isYear: explicitYearField(token, true),
  };
}

function weekdayNumber(value: string): number {
  return Weekday.WEEKDAY_FULL.findIndex((full, index) =>
    value === full.toUpperCase() ||
    value === Weekday.WEEKDAY_SHORT[index].toUpperCase()
  );
}

function validateNormalizedDate(iso: string, original: string): void {
  const fields =
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(?:(\d{2})(?:(\d{2})(?:\.\d+)?)?)?(?:Z|[+-]([\d:]+))?)?$/
      .exec(iso);
  if (
    fields == null ||
    (fields[7] != null && dateutilOffsetMagnitude(fields[7]) == null)
  ) {
    throw new Error("Unknown string format: " + original);
  }
  const [, year, month, day, hour, minute, second] = fields;
  const monthNumber = Number(month);
  if (year === "0000") {
    throw new RangeError("year 0 is out of range: " + original);
  }
  if (monthNumber < 1 || monthNumber > 12) {
    throw new RangeError("month must be in 1..12: " + original);
  }
  if (
    YearMonthDay.fromYmd1Unchecked(Number(year), monthNumber, Number(day))
      .toResult().isErr
  ) {
    throw new RangeError("day is out of range for month: " + original);
  }
  if (Number(hour) > 23) {
    throw new RangeError("hour must be in 0..23: " + original);
  }
  if (Number(minute) > 59) {
    throw new RangeError("minute must be in 0..59: " + original);
  }
  if (Number(second) > 59) {
    throw new RangeError("second must be in 0..59: " + original);
  }
}

function normalizeClockSuffix(
  iso: string,
  original: string,
  useLabel?: (label: string) => boolean,
): string {
  // A timezone name after an offset does not reverse the offset sign.
  const clock = iso.replace(
    /^(\d{8}T\d{2}(?:\d{2}){0,2}(?:\.\d+)?)(?:([AP]M?)[. \t]*|[ \t]*)([+-][\d:]+)[ \t]\(([A-Z]{3,5})\)\.*$/,
    (_, time: string, meridiem: string | undefined, offset: string, label: string) =>
      time + (meridiem == null ? "" : meridiem + ".") + label + "." + offset,
  );
  const match =
    /^(\d{8}T)(\d{1,2})((?:\d{2}){0,2}(?:\.\d+)?)(?:([AP]M?)[. \t]+)?([A-Z]+)([. \t]*)(?:([+-])([\d:]+))?\.*$/
      .exec(clock);
  if (match == null) {
    if (/^\d{8}T\d{2}(?:\d{2}){0,2}(?:\.\d+)?[+-][\d:]+[A-Z]+\.*$/.test(iso)) {
      throw new Error("Unknown string format: " + original);
    }
    return iso;
  }
  const [, date, hour, rest, prefix, suffix, separator, sign, offset] = match;
  if (offset != null && dateutilOffsetMagnitude(offset) == null) {
    throw new Error("Unknown string format: " + original);
  }
  const meridiem = prefix ??
    (/^[AP]M?$/.test(suffix) ? suffix : undefined);
  let hours = hour;
  if (meridiem != null) {
    const h = Number(hour);
    if (h > 12) throw new Error("Unknown string format: " + original);
    const adjusted = h % 12 + (meridiem[0] === "P" ? 12 : 0);
    hours = String(adjusted).padStart(2, "0");
    if (prefix == null) {
      return date + hours + rest + (sign == null ? "" : sign + offset);
    }
  } else if (rest === "" && (suffix === "M" || suffix === "S")) {
    if (sign != null) throw new Error("Unknown string format: " + original);
    const unit = hour.padStart(2, "0");
    return date + (suffix === "M" ? "00" + unit + "00" : "0000" + unit);
  }
  if (hours.length !== 2 || suffix.length > 5) {
    throw new Error("Unknown string format: " + original);
  }
  const utc = suffix === "Z" || suffix === "UTC" || suffix === "GMT";
  const adjacentOffset = sign != null && separator === "";
  // An adjacent sign reverses the offset and clears UTC aliases. Other
  // labels remain eligible for Python's process-local timezone.
  const label = suffix === "Z" ? "UTC" : suffix;
  if (!(adjacentOffset && utc) && useLabel?.(label)) {
    return date + hours + rest;
  }
  if (adjacentOffset) {
    return date + hours + rest + (sign === "+" ? "-" : "+") + offset;
  }
  return date + hours + rest + (utc ? "Z" : sign == null ? "" : sign + offset);
}

function wholeClockField(value: string): string {
  return String(Math.min(Number(value.split(".", 1)[0]), 99)).padStart(2, "0");
}

function normalizeColonClock(
  iso: string,
  original: string,
  precedingFraction = "",
): string {
  const dateAndHour = /^(\d{8}T)(\d+(?:\.\d+)?):/.exec(iso);
  if (dateAndHour == null) return iso;
  const [prefix, date, hour] = dateAndHour;
  const afterHour = iso.slice(prefix.length);
  const match = /^(\d+(?:\.\d+)?)(?::(\d+(?:\.\d+)?))?/.exec(afterHour);
  // The hour token goes through the reference's compact date/time cases
  // before it encounters the colon. The remaining fields are read as numbers.
  if (
    match == null || [6, 8, 12, 14].includes(hour.length) ||
    /^\d{6}\.\d+/.test(hour)
  ) {
    throw new Error("Unknown string format: " + original);
  }
  const [fields, minute, second] = match;
  const suffix = afterHour.slice(fields.length);
  const [, fraction] = (second ?? minute).split(".");
  const trailingDot = suffix.startsWith(".");
  const zone = suffix.replace(/^\.+/, "").replace(
    /^([A-Z]{2,5})\.+M\.*$/,
    "$1",
  );
  // An extra dot separates a fractional field back into numeric tokens.
  // If the second token is HHMMSS, the compact clock replaces all fields.
  if (trailingDot && fraction?.length === 6) return date + fraction + zone;
  // A single final letter can instead become part of a dotted number.
  if (
    suffix.startsWith(":") || /^\.[A-Z]$/.test(suffix) ||
    (fraction != null && trailingDot)
  ) {
    throw new Error("Unknown string format: " + original);
  }
  const seconds = second == null
    ? fractionTimesSixty(fraction).padStart(2, "0") + precedingFraction
    : wholeClockField(second) + (fraction == null ? "" : "." + fraction);
  return date + wholeClockField(hour) + wholeClockField(minute) + seconds +
    zone;
}

const PACKED_FRACTION_CLOCK = /^\d{8}T\d{6}\.\d+/;

interface NormalizedClockFields {
  text: string;
  unitHasHour?: boolean;
}

function normalizeUnitClock(
  iso: string,
  original: string,
  initialFields?: readonly string[],
): NormalizedClockFields {
  // A packed fractional token already set the clock. An adjacent letter
  // can then name a zone even when it also spells an hour or minute unit.
  if (PACKED_FRACTION_CLOCK.test(iso)) return { text: iso };
  const match = /^(\d{8}T)(\d+(?:\.\d+)?)([HMS])(?![A-Z])/.exec(iso);
  if (match == null) {
    // After a combined zone label, a standalone M is skipped as punctuation.
    return {
      text: iso.replace(/^(\d{8}T\d{1,2}(?:\.\d+)?H[A-Z]+)\.+M\.*$/, "$1"),
    };
  }
  const [prefix, date, firstValue, firstUnit] = match;
  const fields = initialFields?.slice() ?? ["", "", ""];
  let rest = iso.slice(prefix.length);
  let unit = "HMS".indexOf(firstUnit);
  let value = firstValue;
  let adjacentNumber = false;
  while (true) {
    // Dateutil reads compact HHMMSS before looking for a unit label.
    if (value.length === 6 && /^\d+$/.test(value)) {
      fields[0] = value.slice(0, 2);
      fields[1] = value.slice(2, 4);
      fields[2] = value.slice(4);
    } else if ([6, 8, 12, 14].includes(value.length)) {
      throw new Error("Unknown string format: " + original);
    } else if (unit < 3) {
      fields[unit] = value;
      if (unit < 2) {
        const [, fraction] = value.split(".");
        if (unit === 1 || fraction != null) {
          const [, precedingFraction] = fields[2].split(".");
          const inheritedFraction =
            unit === 1 && initialFields != null && precedingFraction != null
              ? "." + precedingFraction
              : "";
          fields[unit + 1] = fractionTimesSixty(fraction) + inheritedFraction;
        }
      }
    }
    if (adjacentNumber && /^\.[A-Z]$/.test(rest)) {
      throw new Error("Unknown string format: " + original);
    }
    const separated = rest.startsWith(".");
    const remaining = separated ? rest.replace(/^\.+/, "") : rest;
    const next = separated
      ? /^(\d+)([HMS](?![A-Z]))?/.exec(remaining)
      : /^(\d+(?:\.\d+)?)([HMS](?![A-Z]))?/.exec(remaining);
    if (next == null) break;
    const [token, field, label] = next;
    const compactTime = /^\d{6}$/.test(field);
    if (separated && label == null && !compactTime) {
      const meridiem = /^([AP]M?)(?![A-Z])/.exec(remaining.slice(field.length));
      if (meridiem == null || Number(field) >= 24) {
        throw new Error("Unknown string format: " + original);
      }
      const hour = Number(field);
      fields[0] = String(
        meridiem[0][0] === "P"
          ? (hour < 12 ? hour + 12 : hour)
          : (hour === 12 ? 0 : hour),
      );
      rest = remaining.slice(field.length + meridiem[0].length);
      break;
    }
    // An adjacent timezone label can absorb a unit letter. The numeric
    // field then takes its unit from the preceding standalone H or M.
    unit = label == null ? unit + 1 : "HMS".indexOf(label);
    const labeled = label != null && !compactTime;
    adjacentNumber = !labeled && !separated;
    rest = remaining.slice(labeled ? token.length : field.length);
    value = field;
  }
  const [h, m, s] = fields.map(wholeClockField);
  const [, fraction] = fields[2].split(".");
  const suffix = rest.replace(/^\.+/, "").replace(
    /^([A-Z]{2,5})\.+M\.*$/,
    "$1",
  );
  // Python can apply a zone only after an hour was supplied.
  if (fields[0] === "" && suffix !== "") {
    throw new Error("Unknown string format: " + original);
  }
  return {
    text: date + h + m + s + (fraction == null ? "" : "." + fraction) + suffix,
    unitHasHour: fields[0] !== "",
  };
}

function normalizeCalendarDate(
  ascii: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate | undefined {
  return normalizeCalendarWords(ascii, original, context) ??
    normalizeNumericDate(ascii, original, context) ??
    normalizeNamedMonthDate(ascii, original, context) ??
    normalizePartialDate(ascii, original, context) ??
    (/^\d{8}(?:T|$)/.test(ascii) ? { text: ascii, fieldCount: 3 } : undefined);
}

function normalizeClockAfterMonth(
  ascii: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate | undefined {
  const match =
    /^([A-Z\d./-]*?[A-Z])((?:\d{6}(?:\.\d+)?(?=$|[A-SU-Z+-])|\d+(?:\.\d+)?(?::|[HMS](?![A-Z])|[AP]M?(?![A-Z]))).*)$/
      .exec(ascii);
  if (match == null) return;
  const [, date, clock] = match;
  const lastWord = /[A-Z]+$/.exec(date)![0];
  if (monthNumber(lastWord) === 0) return;
  const calendar = normalizeCalendarDate(date, original, context);
  if (calendar == null || !/^\d{8}$/.test(calendar.text)) return;
  return { text: calendar.text + "T" + clock, fieldCount: calendar.fieldCount };
}

// The reference can read a clock before it has resolved any date fields.
function normalizeDateForClock(
  ascii: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate | undefined {
  const combined = /^T?\d+(?:\.\d+)?([HMS][A-Z]+)$/.exec(ascii)?.[1];
  if (
    combined != null && !/^T?\d{6}\./.test(ascii) &&
    monthNumber(combined) === 0 &&
    weekdayNumber(combined) === -1
  ) {
    throw new Error("Unknown string format: " + original);
  }
  const match =
    /^(?:([\dA-Z./-]*?)([-/.]T?|T))??((?:\d{6}\.\d+(?=$|[A-Z+-])|\d+(?:\.\d+)?(?::|[HMS](?![A-Z])|[AP](?:M|\.+M\.*)?(?![A-Z]))).*)$/
      .exec(ascii);
  if (match == null) return;
  const [, prefix, separator] = match;
  let writtenClock = match[3];
  const invalid = () => new Error("Unknown string format: " + original);
  let date: CalendarDate;
  if (prefix == null || prefix === "") {
    // A minus sign after a minute or second can introduce a date field
    // because the reference has no hour with which to bind an offset.
    const field = /^(\d+(?:\.\d+)?[MS])-(\d{1,5})$/.exec(writtenClock);
    if (field == null) {
      date = {
        text: completeDateFields(
          undefined,
          undefined,
          undefined,
          false,
          context,
          original,
        ),
        fieldCount: 0,
      };
    } else {
      writtenClock = field[1];
      date = {
        text: resolveDateFields(
          [{
            value: Number(field[2]),
            isYear: explicitYearField(field[2], true),
          }],
          context,
          original,
        ),
        fieldCount: 1,
      };
    }
  } else {
    // A numeric or month token can consume a following hyphen and the
    // apparent hour as calendar fields. A complete date or a jump token
    // before the hyphen leaves it available as a separator.
    const lastWord = /[A-Z]+$/.exec(prefix)?.[0];
    if (
      separator === "T" && lastWord != null &&
      monthNumber(lastWord + "T") === 0
    ) {
      throw invalid();
    }
    const fields = NAMED_MONTH_DATE.exec(prefix);
    if (
      separator === "-" &&
      !(/(?:^|[-/.])\d{6}(?:\d{2})?$/.test(prefix) ||
        /(?:\.|\dT)$/.test(prefix) ||
        weekdayNumber(prefix.split(/[-/.]/).at(-1)!) >= 0 ||
        /\d(?:ST|ND|RD|TH)$/.test(prefix) ||
        (fields != null && fields[0] === prefix && fields[2] === fields[4]))
    ) {
      throw invalid();
    }
    const calendar = prefix.replace(/(?:\.|(?<=\d)T)$/, "");
    if (
      separator === "." && /[A-Z]$/.test(prefix) &&
      /^\d+\.\d+/.test(writtenClock)
    ) {
      throw invalid();
    }
    const resolved = normalizeCalendarDate(calendar, original, context);
    if (resolved == null || !/^\d{8}$/.test(resolved.text)) throw invalid();
    date = resolved;
  }

  // Before any calendar fields, a bare six-digit token is a short date.
  const shortDate = /^(\d{6})([HMS])(?![A-Z])/.exec(writtenClock);
  if (date.fieldCount === 0 && shortDate != null) {
    if (shortDate[2] !== "M" || shortDate[0] !== writtenClock) throw invalid();
    return normalizeNumericDate(shortDate[1], original, context);
  }
  return { text: date.text + "T" + writtenClock, fieldCount: date.fieldCount };
}

// With three calendar fields, dateutil reads an adjacent two- or four-digit
// token as HH or HHMM before applying its separate meridiem validation.
function normalizeMeridiemClock(
  iso: string,
  fieldCount: number,
  original: string,
): string {
  const match = /^(\d{8}T)(\d+(?:\.\d+)?)([AP])(?:M|\.+(M\.*))?(?=$|[+-])/.exec(
    iso,
  );
  if (match == null) return iso;
  const [written, date, token, marker, dottedLabel = ""] = match;
  const compact = /^\d{6}\.\d+$/.test(token) ||
    (/^\d+$/.test(token) &&
      ((fieldCount === 3 && (token.length === 2 || token.length === 4)) ||
        (fieldCount !== 0 && token.length === 6)));
  const hour = compact ? Number(token.slice(0, 2)) : Math.trunc(Number(token));
  if (
    (compact ? hour > 12 : hour >= 24) ||
    (!compact && [6, 8, 12, 14].includes(token.length))
  ) {
    throw new Error("Unknown string format: " + original);
  }
  const adjusted = marker === "P" && hour < 12
    ? hour + 12
    : marker === "A" && hour === 12
    ? 0
    : hour;
  const tail = compact ? token.slice(2).padEnd(4, "0") : "0000";
  return date + String(adjusted).padStart(2, "0") + tail + dottedLabel +
    iso.slice(written.length);
}

interface ClockZone {
  name: string;
  offset?: string;
}

function writeClockZone({ name, offset = "" }: ClockZone): string {
  // The zone name preceded the replacement clock, so it cannot
  // reverse the sign of an offset written after the new clock.
  return name + (name !== "" && offset !== "" ? "." : "") + offset;
}

function replaceClockFields(
  day: string,
  previous: string,
  clock: string,
  original: string,
  shortClock: boolean,
  hasHour: boolean,
): { clock: string; offset?: string; setsHour: boolean } {
  // The previous hour already supplied a timezone name. A numeric
  // offset may follow the replacement fields, while another name fails.
  const parts = /^T(.+?)([+-]\d+(?::\d+)?)?$/.exec(clock);
  if (parts == null) throw new Error("Unknown string format: " + original);
  const [, written, offset] = parts;
  const dated = day + "T" + written;
  let updated: string;
  let setsHour = true;
  if (shortClock) {
    updated = dated + previous.slice(1 + written.length);
  } else if (/^\d{6}(?:\.\d+)?$/.test(written)) {
    updated = dated;
  } else if (/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){1,2}$/.test(written)) {
    updated = normalizeColonClock(dated, original, previous.slice(7));
  } else if (/^(?:\d+(?:\.\d+)?[HMS])+(?:\d+(?:\.\d+)?)?$/.test(written)) {
    const initialFields = [
      hasHour ? previous.slice(1, 3) : "",
      previous.slice(3, 5),
      previous.slice(5),
    ];
    const unit = normalizeUnitClock(dated, original, initialFields);
    updated = unit.text;
    setsHour = unit.unitHasHour ?? true;
  } else if (/^\d+(?:\.\d+)?[AP](?:M|\.+M\.*)?$/.test(written)) {
    const newHour = normalizeMeridiemClock(dated, 0, original).slice(9, 11);
    updated = day + "T" + newHour + previous.slice(3);
  } else {
    throw new Error("Unknown string format: " + original);
  }
  if (offset != null && dateutilOffsetMagnitude(offset.slice(1)) == null) {
    throw new Error("Unknown string format: " + original);
  }
  return { clock: updated.slice(day.length), offset, setsHour };
}

function normalizeClockFields(
  iso: string,
  fieldCount: number,
  original: string,
): NormalizedClockFields {
  const unit = normalizeUnitClock(iso, original);
  const meridiem = unit.text === iso
    ? normalizeMeridiemClock(iso, fieldCount, original)
    : unit.text;
  return { ...unit, text: normalizeColonClock(meridiem, original) };
}

function normalizeSpacedUnitClock(
  iso: string,
  fieldCount: number,
  original: string,
): NormalizedClockFields {
  const update = /^(\d{8}T[\d:.]+)[ \t]+((?:\d+(?:\.\d+)?[HMS][ \t]*)+(?:[+-][\d:]+)?)$/
    .exec(iso);
  if (update == null) return normalizeClockFields(iso, fieldCount, original);

  const initial = normalizeClockFields(update[1], fieldCount, original);
  const base = /^(\d{8}T)(\d{2}(?:\d{2}){0,2})(\.\d+)?$/.exec(initial.text);
  if (base == null) throw new Error("Unknown string format: " + original);
  const [, date, compact, fraction = ""] = base;
  const clock = compact.padEnd(6, "0");
  const fields = [clock.slice(0, 2), clock.slice(2, 4), clock.slice(4) + fraction];
  return normalizeUnitClock(date + update[2].replace(/[ \t]+/g, ""), original, fields);
}

function appendFieldToCalendar(
  date: CalendarDate,
  field: DateField,
  original: string,
  context: DateutilDateContext,
): CalendarDate {
  if (date.fieldCount === 3 || date.fields == null) {
    throw new Error("Unknown string format: " + original);
  }
  const fields = [...date.fields, field];
  return {
    text: resolveDateFields(fields, context, original, date.weekday),
    fieldCount: fields.length,
    fields,
    weekday: date.weekday,
  };
}

function applyFollowingClockFields(
  date: CalendarDate,
  clock: string,
  following: string,
  original: string,
  context: DateutilDateContext,
  zone: ClockZone = { name: "T" },
  hasHour = true,
): CalendarDate {
  // A T after a digit or dot is a separate token. A T stuck to an
  // hour unit or meridiem belongs to that word instead.
  const groups = following.split(/(?<=[\d.])(?=T\d)/).flatMap((raw) => {
    // An extra dot splits a decimal into two numeric tokens. The
    // second number enters the same calendar-or-clock branches.
    const separated = /^(.*\d)\.(\d+)\.+$/.exec(raw);
    return separated == null
      ? [raw.replace(/\.+$/, "")]
      : [separated[1], "T" + separated[2]];
  });
  for (const group of groups) {
    if (hasHour && zone.name === "" && zone.offset == null) {
      zone = { name: "T" };
    }
    const shortClock = !hasHour && date.fieldCount === 3 &&
      /^T\d{2}(?:\d{2})?(?:[+-]\d+(?::\d+)?)?$/.test(group);
    const field = shortClock ? undefined : fieldFollowingClock(group);
    if (field != null) {
      date = appendFieldToCalendar(date, field, original, context);
    } else {
      const update = replaceClockFields(
        date.text,
        clock,
        group,
        original,
        shortClock,
        hasHour,
      );
      clock = update.clock;
      hasHour ||= update.setsHour;
      if (update.offset != null) {
        if (!hasHour) throw new Error("Unknown string format: " + original);
        zone = { ...zone, offset: update.offset };
      }
    }
  }
  return {
    text: date.text + clock + writeClockZone(zone),
    fieldCount: date.fieldCount,
  };
}

function normalizeRepeatedClockDate(
  ascii: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate | undefined {
  const source = ascii.replace(
    /^(\d{8})(\d{4}(?:\d{2})?)(?=(?:[+-]\d+(?::\d+)?)?T\d)/,
    "$1T$2",
  );
  const match = /^([A-Z\d./-]*?[\d.])T(\d.*?)(T\d.*)$/.exec(source);
  if (match == null) return;
  const [, writtenDate, first, following] = match;
  const date = normalizeCalendarDate(
    writtenDate.replace(/\.+$/, ""),
    original,
    context,
  );
  if (date == null || !/^\d{8}$/.test(date.text)) return;
  return normalizeRepeatedClockOnDate(
    date,
    first,
    following,
    original,
    context,
  );
}

function normalizeRepeatedClockOnDate(
  date: CalendarDate,
  first: string,
  following: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate {
  const separatedNumber = /^(.*\d)\.(\d+)\.+$/.exec(first);
  if (separatedNumber != null) {
    return normalizeRepeatedClockOnDate(
      date,
      separatedNumber[1],
      "T" + separatedNumber[2] + following,
      original,
      context,
    );
  }
  // A dot keeps a clock unit or meridiem separate from T. If a packed
  // clock was read before an HMS letter, the letter can name a zone.
  const dottedWord = /([A-Z]+)\.+$/.exec(first);
  const trailingWord = /[A-Z]+$/.exec(first)?.[0] ?? "";
  const unit = dottedWord != null && /^[HMS]$/.test(dottedWord[1]) &&
    !/^\d{6}(?:\.\d+)?$/.test(first.slice(0, dottedWord.index));
  const meridiem = dottedWord != null && /^[AP]M?$/.test(dottedWord[1]);
  const separatedZone = unit || meridiem ? null : dottedWord;
  const writtenZone = separatedZone?.[0] ?? trailingWord;
  const zoneLabel = separatedZone?.[1] ?? trailingWord + "T";
  const firstFields = first.slice(0, first.length - writtenZone.length).replace(
    /\.+$/,
    "",
  );
  const shortClock = date.fieldCount === 3 &&
    /^\d{2}(?:\d{2})?$/.test(firstFields);
  const initialField = shortClock
    ? undefined
    : fieldFollowingClock("T" + firstFields);
  if (initialField != null) {
    if (writtenZone !== "") {
      throw new Error("Unknown string format: " + original);
    }
    // With no hour yet, the next T is a separator and the first number
    // still belongs to the calendar.
    const updated = appendFieldToCalendar(
      date,
      initialField,
      original,
      context,
    );
    const next = /^T(\d.*?)(T\d.*)$/.exec(following);
    if (next != null) {
      return normalizeRepeatedClockOnDate(
        updated,
        next[1],
        next[2],
        original,
        context,
      );
    }
    const finalField = fieldFollowingClock(following);
    if (
      finalField != null &&
      !(updated.fieldCount === 3 && /^T\d{2}(?:\d{2})?$/.test(following))
    ) {
      return appendFieldToCalendar(updated, finalField, original, context);
    }
    return { text: updated.text + following, fieldCount: updated.fieldCount };
  }

  const initial = normalizeClockFields(
    date.text + "T" + firstFields,
    date.fieldCount,
    original,
  );
  const hasHour = initial.unitHasHour ?? true;
  const initialText = meridiem ? normalizeClockSuffix(initial.text, original) : initial.text;
  const previous = /^\d{8}T(\d{2}(?:\d{2}){0,2})(\.\d+)?([+-]\d+(?::\d+)?)?$/
    .exec(initialText);
  if (
    previous == null || (previous[2] != null && previous[1].length !== 6) ||
    zoneLabel.length > 5 ||
    (previous[3] != null &&
      (writtenZone !== "" ||
        dateutilOffsetMagnitude(previous[3].slice(1)) == null))
  ) {
    throw new Error("Unknown string format: " + original);
  }
  const clock = "T" + previous[1].padEnd(6, "0") + (previous[2] ?? "");
  const zone: ClockZone = previous[3] == null
    ? { name: hasHour ? zoneLabel : "" }
    : { name: "", offset: previous[3] };
  return applyFollowingClockFields(
    date,
    clock,
    following,
    original,
    context,
    zone,
    hasHour,
  );
}

/** Preserve separators within compound clock suffixes. */
function normalizeDateClockSpacing(tail: string): string {
  if (/^[ \t]*T$/.test(tail)) return "T000000";
  return tail
    .replace(/^(\d{4}(?:\d{2})?)(?=[ \t]+(?:[A-Z+-]|\d+(?:\.\d+)?[HMS]))/, "T$1")
    .replace(/^(?:T[ \t]+|[ \t]+(?:T[ \t]*)?)(?=\d)/, "T")
    .replace(/^(T\d{1,6}(?::\d{1,2}){0,2}(?:\.\d+)?)[ \t]+(?=[A-Z+-])/, "$1")
    .replace(/(\d[AP]M?)\.?[ \t]+(?=T\d)/, "$1.");
}

const SPACED_DATE_FIELD =
  /^[ \t]*([A-Z]+|\d{1,5}(?:\.\d+)?(?:[ \t]*(?:ST|ND|RD|TH)(?![A-Z]))?)(?=[ \t]|[-/.][ \t/.-]|T[ \t]*\d|$)/;

const SPACED_DATE_GROUP =
  /^[ \t]*([A-Z]+|\d{1,5})([-/.])([A-Z]+|\d{1,5})(?:\2([A-Z]+|\d{1,5}))?(?=[ \t]|[-/.]|T[ \t]*\d|$)/;

function readSpacedDateGroup(tail: string, original: string) {
  const group = SPACED_DATE_GROUP.exec(tail);
  if (group == null) return;
  const [written, first, separator, second, third] = group;
  const firstMonth = monthNumber(first);
  const monthDot = firstMonth !== 0 && separator === ".";
  if (third == null) {
    const remaining = tail.slice(written.length);
    // The lexer keeps a numeric token with one dot intact.
    if (
      (separator === "." && /^\d+$/.test(first + second)) ||
      (separator !== "." && /^\d+$/.test(second) && /^\.\d/.test(remaining))
    ) return;
    // Reusing the same separator requires an adjacent third field.
    if (remaining.startsWith(separator) && !monthDot) {
      throw new Error("Unknown string format: " + original);
    }
    if (monthDot && /^[-/]/.test(remaining)) {
      // A dot after a month name leaves the following numeric group intact.
      return {
        written: written.slice(0, -second.length),
        fields: [{ value: firstMonth, isMonth: true }],
      };
    }
  }
  const tokens = third == null ? [first, second] : [first, second, third];
  const fields = tokens.map((token, index) => {
    const month = monthNumber(token);
    if (month !== 0) return { value: month, isMonth: true };
    if (!/^\d+$/.test(token)) throw new Error("Unknown string format: " + original);
    const value = Number(token);
    const separate = monthDot && index === 1 && third == null;
    return { value, isYear: explicitYearField(token, separate) };
  });
  return { written, fields };
}

const SPACED_CALENDAR_JUMP = /^(?:AT|ON|AND|AD|OF|ST|ND|RD|TH)$/;
const MONTH_OF_YEAR = /^[ \t]OF[ \t](\d+(?:\.\d+)?|[A-Z]+)/;

function normalizeSpacedCalendarDate(
  ascii: string,
  original: string,
  context: DateutilDateContext,
): CalendarDate | undefined {
  if (!/[ \t]/.test(ascii)) return;

  const fields: DateField[] = [];
  let tail = ascii;
  let weekday = -1;
  while (true) {
    const jump = fields.length === 0 ? null : /^(?:[ \t]*[-/.])+[ \t]*/.exec(tail);
    if (jump != null) tail = " " + tail.slice(jump[0].length);
    const group = readSpacedDateGroup(tail, original);
    if (group != null) {
      const remaining = tail.slice(group.written.length);
      if (fields.length === 0 && group.fields.length === 3 && /^T[ \t]*\d/.test(remaining)) return;
      fields.push(...group.fields);
      tail = remaining;
      continue;
    }
    const match = SPACED_DATE_FIELD.exec(tail);
    if (match == null) break;
    const [written, token] = match;
    const remaining = tail.slice(written.length);
    const month = monthNumber(token);
    const dayOfWeek = weekdayNumber(token);
    const numeric = /^(\d+)(?:\.(\d+))?/.exec(token);
    if (month !== 0) {
      // A directly attached slash or hyphen expects a field, not a jump.
      if (/^[-/]/.test(remaining)) throw new Error("Unknown string format: " + original);
      fields.push({ value: month, isMonth: true });
      // Dateutil takes "January of 01" as a month and an explicit year.
      const phrase = MONTH_OF_YEAR.exec(remaining);
      if (phrase != null) {
        if (/^\d+$/.test(phrase[1])) {
          const value = dateutilYear(Number(phrase[1]), false, context.parserYear, original);
          fields.push({ value, isYear: true });
        }
        tail = remaining.slice(phrase[0].length);
        continue;
      }
    } else if (dayOfWeek !== -1) {
      weekday = dayOfWeek;
    } else if (numeric != null) {
      if (
        (fields.length === 3 && /^\d{2}(?:\d{2})?$/.test(token)) ||
        (/^\d{1,2}$/.test(token) && /^[ \t]+[AP]M?(?=[ \t]|$)/.test(remaining))
      ) break;
      const [number, digits, fraction] = numeric;
      if (fraction != null && [6, 8, 12, 14].includes(number.length)) break;
      // Whitespace-separated numbers reach the numeric token reader.
      const value = Number(digits);
      const isYear = /^[-/.]/.test(remaining) && fraction == null
        ? digits.length > 2
        : value > 100 || (value === 100 && /[1-9]/.test(fraction ?? ""));
      fields.push({ value, isYear });
    } else if (!SPACED_CALENDAR_JUMP.test(token)) {
      break;
    }
    tail = remaining;
  }
  if (fields.length === 0) return;

  // A weekday can also follow the clock. It only advances an inherited day.
  tail = tail.replace(/[ \t]+([A-Z]+)(?=[ \t]|$)/g, (word, token: string) => {
    const dayOfWeek = weekdayNumber(token);
    if (dayOfWeek === -1) return word;
    weekday = dayOfWeek;
    // Keep the token boundary for the clock suffix parser.
    return word.slice(0, -token.length);
  }).trimEnd();
  const day = resolveDateFields(fields, context, original, weekday);
  return { text: day + tail, fieldCount: fields.length };
}

function normalizeIsoDate(
  value: string,
  discardFraction: boolean,
  context: DateutilDateContext,
  useLabel?: (label: string) => boolean,
): string {
  // Compact UTC and floating clocks already have the normalized spelling.
  // With a host resolver, keep the suffix handling that selects its zone.
  if (useLabel == null && /^\d{8}T\d{6}Z?(?![\s\S])/.test(value)) {
    validateNormalizedDate(value, value);
    return value;
  }
  // U+FEFF is whitespace in JavaScript's trim but an invalid date token
  // in Python. Keep it in the reference diagnostic.
  if (value.includes("\uFEFF")) {
    throw new Error("Unknown string format: " + value);
  }
  const original = value.toUpperCase();
  // Python's date lexer reads each whitespace character as one space.
  const ascii = normalizeDateutilDigits(original)
    .replace(/[\p{White_Space}\u001C-\u001F]/gu, " ")
    .trim()
    // These date shapes can have a clock without a T. Expose its boundary
    // before choosing between the calendar and clock readers.
    .replace(
      /^(\d{8}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2})(.*)$/,
      (_, date: string, tail: string) => date + normalizeDateClockSpacing(tail),
    );
  if (ascii === "") throw new Error("String does not contain a date: " + original);
  if (/(?=[^\x00-\x7f])\p{N}/u.test(ascii)) {
    throw new Error("Unknown string format: " + original);
  }
  // A packed fractional clock takes precedence over a preceding weekday
  // reader interpreting its decimal token as a calendar field.
  const packed = /(?:^|[-/T])\d{6}\.\d+(?=$|[A-Z+-])/.exec(ascii);
  const clockFirst = /^\d{8}T[-/.]/.test(ascii) ||
    (packed != null && !hasAdjacentMonth(dateBeforeExplicitClock(ascii)));
  const calendar = normalizeSpacedCalendarDate(ascii, original, context) ??
    normalizeRepeatedClockDate(ascii, original, context) ??
    normalizeClockAfterMonth(ascii, original, context) ??
    (clockFirst
      ? normalizeDateForClock(ascii, original, context) ??
        normalizeCalendarDate(ascii, original, context)
      : normalizeCalendarDate(ascii, original, context) ??
        normalizeDateForClock(ascii, original, context));
  const withDate = (calendar?.text ?? ascii).replace(
    /^(\d{8})(.*)$/,
    (_, date: string, tail: string) => date + normalizeDateClockSpacing(tail),
  );
  const compact = withDate.replace(
    /^(\d{8})(\d{4}(?:\d{2})?)(?=$|[+-]|[A-Z])/,
    "$1T$2",
  );
  const { text: clock } = normalizeSpacedUnitClock(
    compact,
    calendar?.fieldCount ?? (compact !== withDate ? 3 : 0),
    original,
  );
  const iso = normalizeClockSuffix(clock, original, useLabel);
  validateNormalizedDate(iso, original);
  return discardFraction
    ? iso.replace(/^(\d{8}T\d{6})\.\d+(?=Z|[+-]|$)/, "$1")
    : iso;
}

function roundDateutilDecimal(value: bigint): bigint {
  // Python's default Decimal context retains 28 significant digits.
  const excess = value.toString().length - 28;
  if (excess <= 0) return value;
  const divisor = 10n ** BigInt(excess);
  const whole = value / divisor;
  const doubledRemainder = (value % divisor) * 2n;
  const roundUp = doubledRemainder > divisor ||
    (doubledRemainder === divisor && whole % 2n !== 0n);
  return (whole + (roundUp ? 1n : 0n)) * divisor;
}

function fractionTimesSixty(digits?: string): string {
  if (digits == null) return "";
  // The reference rounds both the remainder and the multiplication before
  // converting the lower clock field to an integer.
  const fraction = roundDateutilDecimal(BigInt(digits));
  const parts = roundDateutilDecimal(fraction * 60n);
  return String(parts / (10n ** BigInt(digits.length)));
}

function inlineOffset(normalized: string, original: string) {
  const match = /^(\d{8}T\d{2}(?:\d{2}){0,2})(\.\d+)?([+-])([\d:+-]*)$/
    .exec(normalized);
  if (match == null) return null;
  const [, wall, fraction = "", sign, offset] = match;
  const offsetMs = dateutilOffsetMagnitude(offset);
  if (offsetMs == null) {
    throw new Error("Unknown string format: " + original.toUpperCase());
  }
  return {
    wall: IsoDate.parse(wall).exp().extend(),
    fraction,
    offsetMs: sign === "-" ? -offsetMs : offsetMs,
  };
}

function normalizeDate(
  value: string,
  discardFraction: boolean,
  context: DateutilDateContext,
) {
  const { host } = context;
  let label: string | undefined;
  let text = normalizeIsoDate(
    value,
    discardFraction,
    context,
    host == null ? undefined : (suffix) => {
      label = suffix;
      return host.names.includes(suffix);
    },
  );
  if (host == null) return { text };
  if (
    label == null && host.names.includes("UTC") &&
    inlineOffset(text, value)?.offsetMs === 0
  ) {
    label = "UTC";
    text = text.replace(/[+-][\d:]+$/, "Z");
  }
  if (label == null || !host.names.includes(label)) return { text };
  const wall = readDateutilDate(text).exp().extend();
  const local = DateutilLocalZone.parse(host, label, wall);
  if (local == null && !text.endsWith("Z")) text += "Z";
  return { text: local == null ? text : text.replace(/Z$/, ""), local };
}

export function dateutilUntil(
  value: string,
  context: DateutilDateContext,
): { text: string; offsetMs?: number; local?: DateutilLocalZone } {
  const { text: date, local } = normalizeDate(value, true, context);
  if (local != null) {
    const wall = IsoDate.parse(date).exp().extend();
    return { text: wall.ical() + "Z", offsetMs: local.offset(wall), local };
  }
  const numeric = inlineOffset(date, value);
  if (numeric != null) {
    // Keep the written wall value in range for the iCalendar parser.
    // The dateutil cursor computes the UTC comparison key when needed.
    return { text: numeric.wall.ical() + "Z", offsetMs: numeric.offsetMs };
  }
  const parsed = IsoDate.parse(date).exp();
  return {
    text: parsed.nt == null
      ? parsed.nd.ical() + "T000000" + (parsed.z ?? "")
      : date,
    offsetMs: parsed.z ? 0 : undefined,
  };
}

/** Retain Python's microsecond comparison precision until projection. */
export function readDateutilDate(
  value: string,
): ReturnType<typeof IsoDate.parse> {
  const fractional = /^(\d{8}T\d{6})\.(\d+)(Z?)$/.exec(value);
  if (fractional == null) return IsoDate.parse(value);
  const [, whole, digits, zone] = fractional;
  const micros = Number(digits.slice(0, 6).padEnd(6, "0"));
  return IsoDate.parse(whole + zone).map((date) =>
    new IsoDate(
      date.nd,
      date.extend().add({ ms: Math.floor(micros / 1000) }).time,
      date.z,
      micros % 1000,
    )
  );
}
