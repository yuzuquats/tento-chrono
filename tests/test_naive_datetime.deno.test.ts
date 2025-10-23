/// <reference lib="deno.ns" />

/**
 * NAIVEDATETIME IMPLEMENTATION NOTES
 *
 * NaiveDateTime combines a NaiveDate and a NaiveTime to represent a date and time without timezone.
 *
 * Key behaviors:
 * 1. All operations return a new NaiveDateTime instance (immutable design)
 * 2. Time components that overflow/underflow days are properly handled by adjusting the date
 * 3. Millisecond precision with proper handling
 *
 * Notable quirks:
 * 1. The add/sub methods can take a mixture of date and time components
 * 2. When time components overflow a day, the date is adjusted accordingly
 * 3. The mse (milliseconds since epoch) is calculated directly from date and time components
 */

import { assert, assertEquals } from "jsr:@std/assert";

import { naivedatetime } from "../chrono/mod.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { NaiveDateTime } from "../chrono/naive-datetime.ts";
import { NaiveTime } from "../chrono/naive-time.ts";
import { Time } from "../chrono/time.ts";
import { Duration } from "../chrono/units/duration.ts";
import { Ms } from "../chrono/units/ms.ts";
import { TimePoint } from "../chrono/units/time-point.ts";
import { MsSinceEpoch } from "../chrono/units/units.ts";

Deno.test({
  name: "ndt/constructor",
  fn() {
    // Basic construction
    const date = NaiveDate.fromYmd1(2023, 3, 15).exp();
    const time = new NaiveTime(14 * Time.MS_PER_HR + 30 * Time.MS_PER_MIN); // 14:30
    const datetime = new NaiveDateTime(date, time);

    assertEquals(datetime.date.yr, 2023);
    assertEquals(datetime.date.month0, 2); // 0-based month
    assertEquals(datetime.date.day0, 14); // 0-based day
    assertEquals(datetime.time.hrs, 14);
    assertEquals(datetime.time.mins, 30);
    assertEquals(datetime.time.secs, 0);
    assertEquals(datetime.time.ms, 0);

    // Using default time (midnight)
    const midnightDateTime = new NaiveDateTime(date);
    assertEquals(midnightDateTime.time.hrs, 0);
    assertEquals(midnightDateTime.time.mins, 0);
    assertEquals(midnightDateTime.time.secs, 0);
    assertEquals(midnightDateTime.time.ms, 0);

    // Using helper function
    const helper = naivedatetime(2023, 3, 15, 14, 30, 10, 500);
    assertEquals(helper.date.yr, 2023);
    assertEquals(helper.date.month0, 2); // 0-based month
    assertEquals(helper.date.day0, 14); // 0-based day
    assertEquals(helper.time.hrs, 14);
    assertEquals(helper.time.mins, 30);
    assertEquals(helper.time.secs, 10);
    assertEquals(helper.time.ms, 500);
  },
});

Deno.test({
  name: "naivedatetime/add_time",
  fn() {
    // Adding time components
    const datetime = naivedatetime(2023, 3, 15, 14, 30);

    // Add hours and minutes
    const added = datetime.add({ hrs: 3, mins: 45 });
    assertEquals(added.date.yr, 2023);
    assertEquals(added.date.month1, 3);
    assertEquals(added.date.day1, 15);

    assertEquals(added.time.hrs, 18);
    assertEquals(added.time.mins, 15);

    // Add time past midnight
    const pastMidnight = datetime.add({ hrs: 12 });
    assertEquals(pastMidnight.date.yr, 2023);
    assertEquals(pastMidnight.date.month1, 3);
    assertEquals(pastMidnight.date.day1, 16); // Day increased by 1
    assertEquals(pastMidnight.time.hrs, 2);
    assertEquals(pastMidnight.time.mins, 30);

    // Add multiple days via hours
    const multiDays = datetime.add({ hrs: 48 });
    assertEquals(multiDays.date.yr, 2023);
    assertEquals(multiDays.date.month1, 3);
    assertEquals(multiDays.date.day1, 17); // Day increased by 2
    assertEquals(multiDays.time.hrs, 14);
    assertEquals(multiDays.time.mins, 30);
  },
});

Deno.test({
  name: "ndt/sub_time",
  fn() {
    // Subtracting time components
    const datetime = naivedatetime(2023, 3, 15, 14, 30);

    // Subtract hours and minutes
    const subtracted = datetime.sub({ hrs: 3, mins: 45 });
    assertEquals(subtracted.date.yr, 2023);
    assertEquals(subtracted.date.month1, 3);
    assertEquals(subtracted.date.day1, 15);
    assertEquals(subtracted.time.hrs, 10);
    assertEquals(subtracted.time.mins, 45);

    // Subtract time past midnight
    const beforeMidnight = datetime.sub({ hrs: 18 });
    assertEquals(beforeMidnight.date.yr, 2023);
    assertEquals(beforeMidnight.date.month1, 3);
    assertEquals(beforeMidnight.date.day1, 14); // Day decreased by 1
    assertEquals(beforeMidnight.time.hrs, 20);
    assertEquals(beforeMidnight.time.mins, 30);

    // Subtract multiple days via hours
    const multiDays = datetime.sub({ hrs: 48 });
    assertEquals(multiDays.date.yr, 2023);
    assertEquals(multiDays.date.month1, 3);
    assertEquals(multiDays.date.day1, 13); // Day decreased by 2
    assertEquals(multiDays.time.hrs, 14);
    assertEquals(multiDays.time.mins, 30);
  },
});

Deno.test({
  name: "ndt/add_date",
  fn() {
    // Adding date components
    const nd = naivedatetime(2023, 3, 15, 14, 30);

    assertEquals(nd.time.toMs, Time.MS_PER_HR * 14 + Time.MS_PER_MIN * 30);
    assertEquals(Ms.resolve({ days: 5 }), Time.MS_PER_DAY * 5);

    const tp = TimePoint.ms(
      Time.MS_PER_HR * 14 + Time.MS_PER_MIN * 30 + Time.MS_PER_DAY * 5,
    );
    assertEquals(tp.days, 5);
    assertEquals(tp.time.duration().toHrsF, 14.5);

    // Add days
    const addDays = nd.add({ days: 5 });
    assertEquals(addDays.date.yr, 2023);
    assertEquals(addDays.date.month1, 3);
    assertEquals(addDays.date.day1, 20); // Day increased by 5
    assertEquals(addDays.time.hrs, 14);
    assertEquals(addDays.time.mins, 30);

    // Add months
    const addMonths = nd.add({ mths: 2 });
    assertEquals(addMonths.date.yr, 2023);
    assertEquals(addMonths.date.month1, 5); // Month increased by 2
    assertEquals(addMonths.date.day1, 15);
    assertEquals(addMonths.time.hrs, 14);
    assertEquals(addMonths.time.mins, 30);

    // Add years
    const addYears = nd.add({ yrs: 1 });
    assertEquals(addYears.date.yr, 2024);
    assertEquals(addYears.date.month1, 3);
    assertEquals(addYears.date.day1, 15);
    assertEquals(addYears.time.hrs, 14);
    assertEquals(addYears.time.mins, 30);

    // Add mixed components (date and time)
    const mixed = nd.add({ days: 5, hrs: 12, mins: 30 });
    assertEquals(mixed.date.yr, 2023);
    assertEquals(mixed.date.month1, 3);
    assertEquals(mixed.date.day1, 21); // Day increased by 5 (from days:5) + 1 (from hrs:12 + mins:30 crossing midnight)
    assertEquals(mixed.time.hrs, 3); // 14:30 + 12:30 = 27:00 -> 03:00 next day
    assertEquals(mixed.time.mins, 0);
  },
});

Deno.test({
  name: "ndt/sub_date",
  fn() {
    // Subtracting date components
    const datetime = naivedatetime(2023, 3, 15, 14, 30);

    // Subtract days
    const subDays = datetime.sub({ days: 5 });
    assertEquals(subDays.date.yr, 2023);
    assertEquals(subDays.date.month0, 2);
    assertEquals(subDays.date.day0, 9); // Day decreased by 5
    assertEquals(subDays.time.hrs, 14);
    assertEquals(subDays.time.mins, 30);

    // Subtract months
    const subMonths = datetime.sub({ mths: 2 });
    assertEquals(subMonths.date.yr, 2023);
    assertEquals(subMonths.date.month0, 0); // Month decreased by 2
    assertEquals(subMonths.date.day0, 14);
    assertEquals(subMonths.time.hrs, 14);
    assertEquals(subMonths.time.mins, 30);

    // Subtract years
    const subYears = datetime.sub({ yrs: 1 });
    assertEquals(subYears.date.yr, 2022);
    assertEquals(subYears.date.month0, 2);
    assertEquals(subYears.date.day0, 14);
    assertEquals(subYears.time.hrs, 14);
    assertEquals(subYears.time.mins, 30);

    // Subtract mixed components (date and time)
    const mixed = datetime.sub({ days: 5, hrs: 12, mins: 30 });
    assertEquals(mixed.date.yr, 2023);
    assertEquals(mixed.date.month0, 2);
    assertEquals(mixed.date.day0, 9); // Day decreased by 5 (from days:5) + 1 (from hrs:12 + mins:30 crossing midnight backwards)
    assertEquals(mixed.time.hrs, 2); // 14:30 - 12:30 = 02:00 same day
    assertEquals(mixed.time.mins, 0);
  },
});

Deno.test({
  name: "ndt/milliseconds",
  fn() {
    const datetime = naivedatetime(2023, 3, 15, 14, 30, 10, 500);

    // Add milliseconds
    const addMs = datetime.add({ ms: 300 });
    assertEquals(addMs.time.secs, 10);
    assertEquals(addMs.time.ms, 800);

    // Add milliseconds crossing second boundary
    const addMsCrossSec = datetime.add({ ms: 700 });
    assertEquals(addMsCrossSec.time.secs, 11);
    assertEquals(addMsCrossSec.time.ms, 200); // 500 + 700 = 1200

    // Add milliseconds crossing minute boundary
    const addMsCrossMin = naivedatetime(2023, 3, 15, 14, 30, 59, 800).add({
      ms: 400,
    });
    assertEquals(addMsCrossMin.time.mins, 31);
    assertEquals(addMsCrossMin.time.secs, 0);
    assertEquals(addMsCrossMin.time.ms, 200); // 800 + 400 = 1200

    // Subtract milliseconds
    const subMs = datetime.sub({ ms: 300 });
    assertEquals(subMs.time.secs, 10);
    assertEquals(subMs.time.ms, 200);

    // Subtract milliseconds crossing second boundary
    const subMsCrossSec = datetime.sub({ ms: 700 });
    assertEquals(subMsCrossSec.time.secs, 9);
    assertEquals(subMsCrossSec.time.ms, 800); // 500 - 700 = -200 -> needs 1000ms from sec -> 800ms

    // Subtract milliseconds crossing day boundary
    const subMsCrossDay = naivedatetime(2023, 3, 15, 0, 0, 0, 100).sub({
      ms: 200,
    });
    assertEquals(subMsCrossDay.date.day0, 13); // March 14
    assertEquals(subMsCrossDay.time.hrs, 23);
    assertEquals(subMsCrossDay.time.mins, 59);
    assertEquals(subMsCrossDay.time.secs, 59);
    assertEquals(subMsCrossDay.time.ms, 900); // 100 - 200 = -100 -> needs 1000ms -> 900ms
  },
});

Deno.test({
  name: "ndt/add_sub_neg_zero",
  fn() {
    const datetime = naivedatetime(2023, 3, 15, 14, 30);

    // Add zero
    const addZero = datetime.add({});
    assertEquals(addZero.mse, datetime.mse);

    // Subtract zero
    const subZero = datetime.sub({});
    assertEquals(subZero.mse, datetime.mse);

    // Add negative hours (equivalent to subtract)
    const addNegHrs = datetime.add({ hrs: -3 });
    const subHrs = datetime.sub({ hrs: 3 });
    assertEquals(addNegHrs.mse, subHrs.mse);
    assertEquals(addNegHrs.time.hrs, 11);

    // Subtract negative hours (equivalent to add)
    const subNegHrs = datetime.sub({ hrs: -3 });
    const addHrs = datetime.add({ hrs: 3 });
    assertEquals(subNegHrs.mse, addHrs.mse);
    assertEquals(subNegHrs.time.hrs, 17);

    // Add negative days
    const addNegDays = datetime.add({ days: -5 });
    const subDays = datetime.sub({ days: 5 });
    assertEquals(addNegDays.mse, subDays.mse);
    assertEquals(addNegDays.date.day0, 9);

    // Subtract negative days
    const subNegDays = datetime.sub({ days: -5 });
    const addDays = datetime.add({ days: 5 });
    assertEquals(subNegDays.mse, addDays.mse);
    assertEquals(subNegDays.date.day0, 19);
  },
});

Deno.test({
  name: "naivedatetime/nearest",
  fn() {
    // Rounding to nearest time unit
    const datetime = naivedatetime(2023, 3, 15, 14, 17, 35, 600);

    // Round to nearest 15 minutes
    const nearest15 = datetime.nearest({ mins: 15 });
    assertEquals(nearest15.date.yr, 2023);
    assertEquals(nearest15.date.month0, 2);
    assertEquals(nearest15.date.day0, 14);
    assertEquals(nearest15.time.hrs, 14);
    assertEquals(nearest15.time.mins, 15); // 14:17:35.6 rounds to 14:15 since it's closer to 14:15 than 14:30
    assertEquals(nearest15.time.secs, 0);
    assertEquals(nearest15.time.ms, 0);

    // Round to nearest hour
    const nearestHour = datetime.nearest({ hrs: 1 });
    assertEquals(nearestHour.date.yr, 2023);
    assertEquals(nearestHour.date.month0, 2);
    assertEquals(nearestHour.date.day0, 14);
    assertEquals(nearestHour.time.hrs, 14); // 14:17 rounds down to 14:00
    assertEquals(nearestHour.time.mins, 0);
    assertEquals(nearestHour.time.secs, 0);
    assertEquals(nearestHour.time.ms, 0);

    // Round across midnight
    const nearMidnight = naivedatetime(2023, 3, 15, 23, 45); // 23:45 rounds up
    const roundedMidnight = nearMidnight.nearest({ hrs: 1 });
    assertEquals(roundedMidnight.date.yr, 2023);
    assertEquals(roundedMidnight.date.month0, 2);
    assertEquals(roundedMidnight.date.day0, 15); // Day increased by 1
    assertEquals(roundedMidnight.time.hrs, 0);
    assertEquals(roundedMidnight.time.mins, 0);
    assertEquals(roundedMidnight.time.secs, 0);
    assertEquals(roundedMidnight.time.ms, 0);

    // Custom rounding operation (ceil)
    const ceiling = datetime.nearest({ mins: 15 }, Math.ceil);
    assertEquals(ceiling.date.yr, 2023);
    assertEquals(ceiling.date.month0, 2);
    assertEquals(ceiling.date.day0, 14);
    assertEquals(ceiling.time.hrs, 14);
    assertEquals(ceiling.time.mins, 30); // 14:17:35 rounds up to 14:30
    assertEquals(ceiling.time.secs, 0);
    assertEquals(ceiling.time.ms, 0);

    // Round to nearest 100ms
    const nearest100ms = datetime.nearest({ ms: 100 });
    assertEquals(nearest100ms.time.hrs, 14);
    assertEquals(nearest100ms.time.mins, 17);
    assertEquals(nearest100ms.time.secs, 35);
    assertEquals(nearest100ms.time.ms, 600); // 600 rounds to 600

    const nearest100msRoundUp = naivedatetime(
      2023,
      3,
      15,
      14,
      17,
      35,
      650,
    ).nearest({ ms: 100 });
    assertEquals(nearest100msRoundUp.time.ms, 700); // 650 rounds up to 700

    // Round to nearest second
    const nearestSec = datetime.nearest({ secs: 1 });
    assertEquals(nearestSec.time.hrs, 14);
    assertEquals(nearestSec.time.mins, 17);
    assertEquals(nearestSec.time.secs, 36); // 35.6 rounds up to 36
    assertEquals(nearestSec.time.ms, 0);
  },
});

Deno.test({
  name: "ndt/time_epoch",
  fn() {
    // Time since epoch calculations
    const epoch = naivedatetime(1970, 1, 1, 0, 0, 0);
    assertEquals(epoch.mse, 0);
    assertEquals(epoch.dse, 0);

    // One day after epoch
    const oneDayAfter = naivedatetime(1970, 1, 2, 0, 0, 0);
    assertEquals(oneDayAfter.dse, 1);
    assertEquals(oneDayAfter.mse, Time.MS_PER_DAY);

    // One hour after epoch
    const oneHourAfter = naivedatetime(1970, 1, 1, 1, 0, 0);
    assertEquals(oneHourAfter.mse, Time.MS_PER_HR);
    assertEquals(oneHourAfter.dse, 0);

    // One millisecond after epoch
    const oneMsAfter = naivedatetime(1970, 1, 1, 0, 0, 0, 1);
    assertEquals(oneMsAfter.mse, 1);
    assertEquals(oneMsAfter.dse, 0);

    // Construct from milliseconds since epoch
    const fromMse = NaiveDateTime.fromMse(
      (Time.MS_PER_DAY + Time.MS_PER_HR + 500) as MsSinceEpoch,
    );
    assertEquals(fromMse.date.yr, 1970);
    assertEquals(fromMse.date.month0, 0);
    assertEquals(fromMse.date.day0, 1); // January 2nd (0-based = 1)
    assertEquals(fromMse.time.hrs, 1);
    assertEquals(fromMse.time.mins, 0);
    assertEquals(fromMse.time.secs, 0);
    assertEquals(fromMse.time.ms, 500);
  },
});

Deno.test({
  name: "ndt/fromMse_edge_cases",
  fn() {
    // Zero
    const fromZero = NaiveDateTime.fromMse(0 as MsSinceEpoch);
    assertEquals(fromZero.date.yr, 1970);
    assertEquals(fromZero.date.month0, 0);
    assertEquals(fromZero.date.day0, 0); // Jan 1
    assertEquals(fromZero.time.hrs, 0);
    assertEquals(fromZero.time.mins, 0);
    assertEquals(fromZero.time.secs, 0);
    assertEquals(fromZero.time.ms, 0);

    // Slightly positive
    const fromOne = NaiveDateTime.fromMse(1 as MsSinceEpoch);
    assertEquals(fromOne.date.yr, 1970);
    assertEquals(fromOne.date.month0, 0);
    assertEquals(fromOne.date.day0, 0); // Jan 1
    assertEquals(fromOne.time.hrs, 0);
    assertEquals(fromOne.time.mins, 0);
    assertEquals(fromOne.time.secs, 0);
    assertEquals(fromOne.time.ms, 1);

    // Slightly negative
    const fromNegOne = NaiveDateTime.fromMse(-1 as MsSinceEpoch);
    assertEquals(fromNegOne.date.yr, 1969);
    assertEquals(fromNegOne.date.month1, 12); // Dec
    assertEquals(fromNegOne.date.day1, 31); // Dec 31
    assertEquals(fromNegOne.time.hrs, 23);
    assertEquals(fromNegOne.time.mins, 59);
    assertEquals(fromNegOne.time.secs, 59);
    assertEquals(fromNegOne.time.ms, 999); // -1ms -> 999ms of previous second

    // One day negative
    const fromNegDay = NaiveDateTime.fromMse(-Time.MS_PER_DAY as MsSinceEpoch);
    assertEquals(fromNegDay.date.yr, 1969);
    assertEquals(fromNegDay.date.month1, 12); // Dec
    assertEquals(fromNegDay.date.day1, 31); // Dec 31
    assertEquals(fromNegDay.time.hrs, 0);
    assertEquals(fromNegDay.time.mins, 0);
    assertEquals(fromNegDay.time.secs, 0);
    assertEquals(fromNegDay.time.ms, 0);
  },
});

Deno.test({
  name: "ndt/timezone",
  fn() {
    // Timezone conversion methods
    const datetime = naivedatetime(2023, 3, 15, 14, 30);

    // Convert to UTC DateTime
    const utcDateTime = datetime.asUtc();
    assertEquals(utcDateTime.date.yr, 2023);
    assertEquals(utcDateTime.date.month0, 2);
    assertEquals(utcDateTime.date.day0, 14);
    assertEquals(utcDateTime.time.hrs, 14);
    assertEquals(utcDateTime.time.mins, 30);
    // Instead of checking exact ID which may vary, just check it's the UTC timezone
    assert(utcDateTime.tz.id.toLowerCase().includes("utc"));

    // withUtcTz (alias for asUtc)
    const utcAlias = datetime.withUtcTz();
    assert(utcAlias.tz.id.toLowerCase().includes("utc"));

    // withTz (without conversion)
    // Note: we can't fully test logical timezones here without mocking,
    // but we can verify the method exists and returns a DateTime
    const withTz = datetime.withTz({
      id: "America/Los_Angeles",
      offset: -8 * Time.MS_PER_HR, // Example offset, might not be correct for DST
    });
    assert(withTz.tz.id === "America/Los_Angeles");
    // Check that time/date components are unchanged
    assertEquals(withTz.date.yr, 2023);
    assertEquals(withTz.date.month0, 2);
    assertEquals(withTz.date.day0, 14);
    assertEquals(withTz.time.hrs, 14);
    assertEquals(withTz.time.mins, 30);
  },
});

Deno.test({
  name: "ndt/formatting",
  fn() {
    // Formatter utilities
    const datetime = naivedatetime(2023, 3, 15, 14, 30);

    // Basic rendering
    const rendered = NaiveDateTime.Formatter.render(datetime);
    assert(rendered.includes("March 15"));
    assert(rendered.includes("14:30:00")); // Assumes default toString for NaiveTime

    // Date difference rendering
    const today = naivedatetime(2023, 3, 15, 10, 0);
    const tomorrow = naivedatetime(2023, 3, 16, 10, 0);
    const yesterday = naivedatetime(2023, 3, 14, 10, 0);
    const fiveDaysAgo = naivedatetime(2023, 3, 10, 10, 0);
    const fiveDaysHence = naivedatetime(2023, 3, 20, 10, 0);

    assertEquals(
      NaiveDateTime.Formatter.renderDateDiff(datetime, today),
      "today",
    );
    assertEquals(
      NaiveDateTime.Formatter.renderDateDiff(datetime, tomorrow),
      "tomorrow",
    );
    assertEquals(
      NaiveDateTime.Formatter.renderDateDiff(datetime, yesterday),
      "yesterday",
    );
    assertEquals(
      NaiveDateTime.Formatter.renderDateDiff(datetime, fiveDaysAgo),
      "5 days ago",
    );
    assertEquals(
      NaiveDateTime.Formatter.renderDateDiff(datetime, fiveDaysHence),
      "5 days from now",
    );
  },
});

Deno.test({
  name: "ndt/range",
  fn() {
    // DateTime range operations
    const start = naivedatetime(2023, 3, 15, 9, 0);
    const end = naivedatetime(2023, 3, 15, 17, 0);

    // Create range
    // @ts-ignore deno can't find subclass
    const range: NaiveDateTime.Range = new NaiveDateTime.Range(start, end);
    // @ts-ignore deno can't find subclass
    assertEquals(range.start.mse, start.mse);
    // @ts-ignore deno can't find subclass
    assertEquals(range.end.mse, end.mse);

    // Convert range to timezone
    const tzRange = range.withTz({
      id: "America/Los_Angeles",
      offset: -8 * Time.MS_PER_HR, // Example offset
    });
    assertEquals(tzRange.start.date.yr, 2023);
    assertEquals(tzRange.start.date.month0, 2);
    assertEquals(tzRange.start.date.day0, 14);
    assertEquals(tzRange.start.time.hrs, 9); // Time unchanged by withTz
    assert(tzRange.start.tz.id.includes("Los_Angeles"));

    assertEquals(tzRange.end.date.yr, 2023);
    assertEquals(tzRange.end.date.month0, 2);
    assertEquals(tzRange.end.date.day0, 14);
    assertEquals(tzRange.end.time.hrs, 17); // Time unchanged by withTz
    assert(tzRange.end.tz.id.includes("Los_Angeles"));
  },
});

Deno.test({
  name: "ndt/edge_cases",
  fn() {
    // Date rollover at month/year boundaries

    // December 31 + 1 day = January 1
    const yearEnd = naivedatetime(2023, 12, 31, 12, 0);
    const nextYear = yearEnd.add({ days: 1 });
    assertEquals(nextYear.date.yr, 2024);
    assertEquals(nextYear.date.month0, 0); // January
    assertEquals(nextYear.date.day0, 0); // January 1 (0-based)

    // January 1 - 1 day = December 31
    const yearStart = naivedatetime(2024, 1, 1, 12, 0);
    const prevYear = yearStart.sub({ days: 1 });
    assertEquals(prevYear.date.yr, 2023);
    assertEquals(prevYear.date.month0, 11); // December
    assertEquals(prevYear.date.day0, 30); // December 31 (0-based)

    // Adding time that crosses date boundary
    const almostMidnight = naivedatetime(2023, 3, 15, 23, 59, 59, 999);
    const nextDay = almostMidnight.add({ ms: 1 });
    assertEquals(nextDay.date.day0, 15); // March 16 (0-based)
    assertEquals(nextDay.time.hrs, 0);
    assertEquals(nextDay.time.mins, 0);
    assertEquals(nextDay.time.secs, 0);
    assertEquals(nextDay.time.ms, 0);

    // Subtracting time that crosses date boundary
    const justAfterMidnight = naivedatetime(2023, 3, 16, 0, 0, 0, 0);
    const prevDay = justAfterMidnight.sub({ ms: 1 });
    assertEquals(prevDay.date.day0, 14); // March 15 (0-based)
    assertEquals(prevDay.time.hrs, 23);
    assertEquals(prevDay.time.mins, 59);
    assertEquals(prevDay.time.secs, 59);
    assertEquals(prevDay.time.ms, 999);

    // February in leap year vs non-leap year (add)
    const feb28NonLeap = naivedatetime(2023, 2, 28, 12, 0);
    const nextDayNonLeap = feb28NonLeap.add({ days: 1 });
    assertEquals(nextDayNonLeap.date.month0, 2); // March
    assertEquals(nextDayNonLeap.date.day0, 0); // March 1 (0-based)

    const feb28Leap = naivedatetime(2024, 2, 28, 12, 0);
    const nextDayLeap = feb28Leap.add({ days: 1 });
    assertEquals(nextDayLeap.date.month0, 1); // Still February
    assertEquals(nextDayLeap.date.day0, 28); // February 29 (0-based)

    const feb29Leap = naivedatetime(2024, 2, 29, 12, 0);
    const mar1Leap = feb29Leap.add({ days: 1 });
    assertEquals(mar1Leap.date.month0, 2); // March
    assertEquals(mar1Leap.date.day0, 0); // March 1 (0-based)

    // February in leap year vs non-leap year (sub)
    const mar1NonLeap = naivedatetime(2023, 3, 1, 12, 0);
    const prevDayNonLeap = mar1NonLeap.sub({ days: 1 });
    assertEquals(prevDayNonLeap.date.month0, 1); // February
    assertEquals(prevDayNonLeap.date.day0, 27); // Feb 28 (0-based)

    const mar1LeapSub = naivedatetime(2024, 3, 1, 12, 0);
    const prevDayLeap = mar1LeapSub.sub({ days: 1 });
    assertEquals(prevDayLeap.date.month0, 1); // February
    assertEquals(prevDayLeap.date.day0, 28); // Feb 29 (0-based)
  },
});
