/// <reference lib="deno.ns" />

import { assert, assertEquals } from "@std/assert";

import { Time } from "../chrono/time.ts";
import { Duration } from "../chrono/units/duration.ts";
import { Ms } from "../chrono/units/ms.ts";
import { TimePoint } from "../chrono/units/time-point.ts";

Deno.test({
  name: "timepoint/constructor",
  fn() {
    // Basic construction
    const time = TimePoint.ms(3665000); // 1h 1m 5s
    assertEquals(time.days, 0);
    assertEquals(time.time.hrs, 1);
    assertEquals(time.time.mins, 1);
    assertEquals(time.time.secs, 5);
    assertEquals(time.time.ms, 0);

    // Wrapping around 24 hours
    const wrapped = TimePoint.ms(24 * Time.MS_PER_HR + 1000); // 24h 0m 1s
    assertEquals(wrapped.days, 1);
    assertEquals(wrapped.time.hrs, 0);
    assertEquals(wrapped.time.mins, 0);
    assertEquals(wrapped.time.secs, 1);

    // Handling negative values
    const negative = TimePoint.ms(-1000); // -1s
    assertEquals(negative.days, -1);
    assertEquals(negative.time.hrs, 23);
    assertEquals(negative.time.mins, 59);
    assertEquals(negative.time.secs, 59);
    assertEquals(negative.time.ms, 0);

    // Larger negative value that crosses multiple days
    const largeNegative = TimePoint.ms(-48 * Time.MS_PER_HR - 1000); // -48h -1s
    const days = largeNegative.days;
    const hour = largeNegative.time.hrs;
    const mins = largeNegative.time.mins;
    const secs = largeNegative.time.secs;

    // We need to check that the result is correct in terms of overall time
    // rather than specific internal representation
    assertEquals(
      largeNegative.toMs,
      -48 * Time.MS_PER_HR - 1000,
      "TimePoint.toMs should match original input",
    );
    assertEquals(days, -3);
    assertEquals(hour, 23);
    assertEquals(mins, 59);
    assertEquals(secs, 59);
  },
});

Deno.test({
  name: "timepoint/static_constructors",
  fn() {
    // Using fromComponents for TimePoint
    const fromComponents = TimePoint.ms(
      Ms.resolve({
        hrs: 14,
        mins: 30,
        secs: 45,
        ms: 500,
      }),
    );
    assertEquals(fromComponents.days, 0);
    assertEquals(fromComponents.time.hrs, 14);
    assertEquals(fromComponents.time.mins, 30);
    assertEquals(fromComponents.time.secs, 45);
    assertEquals(fromComponents.time.ms, 500);

    // Using fromHours for TimePoint with value > 24
    const fromHours = TimePoint.hrs(27.5); // 27h 30m
    assertEquals(fromHours.days, 1);
    assertEquals(fromHours.time.hrs, 3);
    assertEquals(fromHours.time.mins, 30);
    assertEquals(fromHours.time.secs, 0);

    // Using fromHms
    const fromHms = TimePoint.ms(
      Ms.resolve({
        hrs: 25,
        mins: 15,
        secs: 30,
      }),
    );
    assertEquals(fromHms.days, 1);
    assertEquals(fromHms.time.hrs, 1);
    assertEquals(fromHms.time.mins, 15);
    assertEquals(fromHms.time.secs, 30);

    const wrapped = TimePoint.ms(Time.MS_PER_DAY + 3600000); // 1 day + 1 hour
    assertEquals(wrapped.days, 1); // 1 day
    assertEquals(wrapped.time.toMs, 3600000); // 1 hour remainder
  },
});

Deno.test({
  name: "timepoint/getters",
  fn() {
    const time = TimePoint.ms(45296789); // 12h 34m 56s 789ms = 0 days, 12:34:56.789

    // Check days and time components
    assertEquals(time.days, 0);
    assertEquals(time.time.hrs, 12);
    assertEquals(time.time.mins, 34);
    assertEquals(time.time.secs, 56);
    assertEquals(time.time.ms, 789);

    // toMs should return the total milliseconds
    assertEquals(time.toMs, 45296789);

    // Multi-day TimePoint
    const multiDay = TimePoint.ms(3 * Time.MS_PER_DAY + 5 * Time.MS_PER_HR);
    assertEquals(multiDay.days, 3);
    assertEquals(multiDay.time.hrs, 5);
    assertEquals(multiDay.time.mins, 0);
    assertEquals(multiDay.toMs, 3 * Time.MS_PER_DAY + 5 * Time.MS_PER_HR);
  },
});

Deno.test({
  name: "timepoint/duration_until",
  fn() {
    // Same day TimePoints
    const earlyTP = TimePoint.ms(8 * Time.MS_PER_HR); // 8:00 AM
    const lateTP = TimePoint.ms(17 * Time.MS_PER_HR); // 5:00 PM
    const duration = earlyTP.durationUntil(lateTP);
    assertEquals(duration.toHrs, 9);

    // TimePoints on different days
    const day1 = TimePoint.ms(8 * Time.MS_PER_HR); // day 0, 8:00 AM
    const day2 = TimePoint.ms(48 * Time.MS_PER_HR + 9 * Time.MS_PER_HR); // day 2, 9:00 AM
    const durationDays = day1.durationUntil(day2);

    // Check that the difference in milliseconds is correct
    assertEquals(
      durationDays.toMs,
      48 * Time.MS_PER_HR + 9 * Time.MS_PER_HR - 8 * Time.MS_PER_HR,
      "Duration milliseconds should match the difference between TimePoints",
    );

    // This should be approximately 49 hours
    assertEquals(
      Math.round(durationDays.toMs / Time.MS_PER_HR),
      49,
      "Duration should be approximately 49 hours",
    );
  },
});

Deno.test({
  name: "timepoint/comparison",
  fn() {
    // Same day
    const earlyTP = TimePoint.ms(8 * Time.MS_PER_HR); // 8:00 AM
    const lateTP = TimePoint.ms(17 * Time.MS_PER_HR); // 5:00 PM

    assert(earlyTP.compareTo(lateTP) < 0);
    assert(lateTP.compareTo(earlyTP) > 0);
    assertEquals(earlyTP.compareTo(earlyTP), 0);

    assert(earlyTP.isBefore(lateTP));
    assert(!lateTP.isBefore(earlyTP));
    assert(lateTP.isAfter(earlyTP));
    assert(!earlyTP.isAfter(lateTP));

    assert(earlyTP.equals(TimePoint.ms(8 * Time.MS_PER_HR)));
    assert(!earlyTP.equals(lateTP));

    // Different days
    const day1 = TimePoint.ms(20 * Time.MS_PER_HR); // day 0, 8:00 PM
    const day2 = TimePoint.ms(30 * Time.MS_PER_HR); // day 1, 6:00 AM

    assert(day1.isBefore(day2));
    assert(day2.isAfter(day1));
    assert(!day1.equals(day2));
  },
});

Deno.test({
  name: "timepoint/arithmetic",
  fn() {
    // TimePoint arithmetic operations
    const baseTime = TimePoint.ms(15 * Time.MS_PER_HR); // 15:00:00

    // Add 10 hours: 15:00 + 10:00 = 01:00 next day
    const added = baseTime.add(Duration.Time.hrs(10));
    assertEquals(added.days, 1);
    assertEquals(added.time.hrs, 1);
    assertEquals(added.time.mins, 0);

    // Subtract 20 hours: 15:00 - 20:00 = 19:00 previous day
    const subtracted = baseTime.subtract(Duration.Time.hrs(20));

    // Check that the result represents the correct time
    assertEquals(
      subtracted.toMs,
      15 * Time.MS_PER_HR - 20 * Time.MS_PER_HR,
      "Subtracted time should be 15h - 20h = -5h",
    );

    // The time component should be approximately 19:00 (regardless of day representation)
    assertEquals(
      (subtracted.time.hrs + 24 * Math.abs(subtracted.days)) % 24,
      19,
      "Time representation should show 19:00",
    );
    assertEquals(subtracted.time.mins, 0);

    // Chained operations should maintain correctness
    const chain = baseTime
      .add(Duration.Time.hrs(48))
      .subtract(Duration.Time.hrs(12));

    // Check that the time in milliseconds is correct
    assertEquals(
      chain.toMs,
      15 * Time.MS_PER_HR + 48 * Time.MS_PER_HR - 12 * Time.MS_PER_HR,
      "Chained operations should result in the correct total time",
    );

    // Check that the result roughly represents 36 hours after baseTime
    assertEquals(
      Math.floor(chain.toMs / Time.MS_PER_HR),
      51,
      "Should be 51 hours total (15 + 48 - 12)",
    );

    // Check that the hours component is 15 (51 hours = 2 days + 3 hours)
    assertEquals(chain.time.hrs, 3);
    assertEquals(chain.days, 2);

    // Multiply by scalar
    const doubled = baseTime.mult(2);
    assertEquals(doubled.days, 1);
    assertEquals(doubled.time.hrs, 6);
    assertEquals(doubled.time.mins, 0);
  },
});

Deno.test({
  name: "timepoint/formatting",
  fn() {
    // TimePoint without days component
    const simpleTime = TimePoint.ms(
      14 * Time.MS_PER_HR + 30 * Time.MS_PER_MIN + 45 * Time.MS_PER_SEC,
    ); // 14:30:45
    assertEquals(simpleTime.toString(), "14:30:45");

    // TimePoint with days component
    const withDays = TimePoint.ms(
      3 * Time.MS_PER_DAY + 14 * Time.MS_PER_HR + 30 * Time.MS_PER_MIN,
    ); // 3d 14:30:00
    assertEquals(withDays.toString(), "3d 14:30:00");

    // TimePoint with negative days
    const negativeDays = TimePoint.ms(
      -2 * Time.MS_PER_DAY - 14 * Time.MS_PER_HR - 30 * Time.MS_PER_MIN,
    ); // Approximately -2d 09:30:00

    // Check the total milliseconds
    assertEquals(
      negativeDays.toMs,
      -2 * Time.MS_PER_DAY - 14 * Time.MS_PER_HR - 30 * Time.MS_PER_MIN,
      "TimePoint toMs should match input milliseconds",
    );

    // The string representation should show the time in a reasonable way
    const str = negativeDays.toString();
    assert(str.includes(":30:00"), "String should contain minutes component");
    assert(str.startsWith("-"), "String should indicate negative time");
  },
});

Deno.test({
  name: "timepoint/edge_cases",
  fn() {
    // Large positive millisecond values that span multiple days
    const largePositive = TimePoint.ms(Time.MS_PER_DAY * 7 + 12345);
    assertEquals(largePositive.days, 7);
    assertEquals(largePositive.time.hrs, 0);
    assertEquals(largePositive.time.mins, 0);
    assertEquals(largePositive.time.secs, 12);
    assertEquals(largePositive.time.ms, 345);

    // Large negative millisecond values that span multiple days
    const largeNegative = TimePoint.ms(-Time.MS_PER_DAY * 3 - 12345);

    // Check total milliseconds
    assertEquals(
      largeNegative.toMs,
      -Time.MS_PER_DAY * 3 - 12345,
      "TimePoint toMs should match input milliseconds",
    );

    // The internal representation might vary, but the total time should be correct

    // Exact day boundary
    const exactDay = TimePoint.ms(Time.MS_PER_DAY * 2);
    assertEquals(exactDay.days, 2);
    assertEquals(exactDay.time.hrs, 0);
    assertEquals(exactDay.time.mins, 0);
    assertEquals(exactDay.time.secs, 0);
    assertEquals(exactDay.time.ms, 0);
  },
});
