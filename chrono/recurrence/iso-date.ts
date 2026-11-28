import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { NaiveTime } from "../naive-time.ts";
import { Result, erm, ok } from "../result.ts";
import type { DayOfMonth1, Month1 } from "../units/units.ts";
import { YearMonth } from "../units/year-month.ts";
import { readAsciiDigitPair } from "../utils.ts";
import type { Option } from "../option.ts";

export class IsoDate {
  constructor(
    readonly nd: NaiveDate,
    readonly nt: Option<NaiveTime>,
    // todo: parsing wil fail if the input has a different timezone
    readonly z: Option<"Z">,
    /** @internal Remainder used when comparing dateutil values. */
    readonly submillisecondMicros = 0,
  ) {}

  static parseRaw(
    s: string,
  ): Result<[NaiveDate, Option<NaiveTime>, Option<"Z">]> {
    return readIsoDate(s, (date, time, utc) => [date, time, utc]);
  }

  static parse(s: string): Result<IsoDate> {
    return readIsoDate(s, (date, time, utc) => new IsoDate(date, time, utc));
  }

  trunc(): NaiveDate {
    return this.nd;
  }

  extend(): NaiveDateTime {
    return this.nd.withTime(this.nt ?? undefined);
  }

  ical(): string {
    if (this.nt) return this.extend().ical() + (this.z ?? "");
    return this.nd.ical() + (this.z ?? "");
  }

  toString(): string {
    return this.ical();
  }
}

/** @internal Build the requested value after validating a basic iCalendar timestamp. */
export function readIsoDate<T>(
  s: string,
  makeValue: (date: NaiveDate, time: Option<NaiveTime>, utc: Option<"Z">) => T,
): Result<T> {
  const input = s.trim();
  const suffix = input[input.length - 1];
  const utc = suffix === "Z" || suffix === "z";
  const length = input.length - (utc ? 1 : 0);
  const timed = length !== 8;
  const year = readAsciiDigitPair(input, 0) * 100 + readAsciiDigitPair(input, 2);
  const month = readAsciiDigitPair(input, 4);
  const day = readAsciiDigitPair(input, 6);
  let hours = 0, minutes = 0, seconds = 0;
  if (timed) {
    if ((length !== 11 && length !== 13 && length !== 15) ||
      (input[8] !== "T" && input[8] !== "t")) {
      return erm(`icaldate/no-match/input=${s}`);
    }
    hours = readAsciiDigitPair(input, 9);
    if (length >= 13) minutes = readAsciiDigitPair(input, 11);
    if (length === 15) seconds = readAsciiDigitPair(input, 13);
  }
  if (!Number.isFinite(year + month + day + hours + minutes + seconds)) {
    return erm(`icaldate/no-match/input=${s}`);
  }

  // The digit scan has already checked that these fields are integers.
  const fields = { yr: year, mth: month as Month1, day: day as DayOfMonth1 };
  if (month < 1 || month > 12 || !YearMonth.isDayValid(fields, fields.day)) {
    return NaiveDate.fromYmd1(year, month, day).expeCast();
  }
  if (hours > 23 || minutes > 59 || seconds > 60) {
    return erm(`icaldate/time-out-of-range/input=${s}`);
  }
  // RFC 5545 §3.3.12 treats :60 as :59 when leap seconds are unsupported.
  const time = timed ? new NaiveTime((hours * 3600 + minutes * 60 + Math.min(seconds, 59)) * 1000) : null;
  const date = new NaiveDate.Class(fields, { isValid: true }).castValid();
  return ok(makeValue(date, time, utc ? "Z" : null));
}
