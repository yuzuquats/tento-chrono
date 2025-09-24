export * from "./result";
export * from "./range";

export * from "./units/mod";

export * from "./time";
export * from "./naive-time";
export * from "./naive-date";
export * from "./naive-datetime";
export * from "./datetime";
export * from "./date-region";
export * from "./timezone";
export * from "./timezone-region";

import { DateTime } from "./datetime";
import { NaiveDate } from "./naive-date";
import { NaiveDateTime } from "./naive-datetime";
import { NaiveTime } from "./naive-time";
import { Time } from "./time";

export * from "./recurrence/rrule";
export * from "./recurrence/ical";
export * from "./recurrence/recurrence";
export * from "./recurrence/iso-date";
export * from "./recurrence/exdate";

export function naivedate(year: number, mth1: number, day1: number): NaiveDate {
  return NaiveDate.fromYmd1(year, mth1, day1).exp();
}

/**
 * Creates a NaiveDateTime from year, month, day, hours, minutes, seconds, and milliseconds
 * @param year Year
 * @param mth1 Month (1-12)
 * @param day1 Day (1-31)
 * @param hrs Hours (0-23)
 * @param mins Minutes (0-59)
 * @param secs Seconds (0-59)
 * @param ms Milliseconds (0-999)
 * @returns New NaiveDateTime
 */
export function naivedatetime(
  year: number = 0,
  mth1: number = 1,
  day1: number = 1,
  hrs: number = 0,
  mins: number = 0,
  secs: number = 0,
  ms: number = 0,
): NaiveDateTime {
  return new NaiveDateTime(
    naivedate(year, mth1, day1),
    new NaiveTime(
      hrs * Time.MS_PER_HR +
        mins * Time.MS_PER_MIN +
        secs * Time.MS_PER_SEC +
        ms,
    ),
  );
}

export function naivetime(
  hrs: number = 0,
  mins: number = 0,
  secs: number = 0,
  ms: number = 0,
): NaiveTime {
  return new NaiveTime(
    hrs * Time.MS_PER_HR + mins * Time.MS_PER_MIN + secs * Time.MS_PER_SEC + ms,
  );
}

export const rfc3339 = DateTime.fromRfc3339;
export const datetime = DateTime.fromRfc3339;
