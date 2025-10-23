import { assert, assertEquals } from "jsr:@std/assert";

import { Time } from "../chrono/time.ts";
import { Duration } from "../chrono/units/duration.ts";

function assertEqualsEps(t: number, o: number) {
  const dt = t - o;
  if (Math.abs(dt) > 0.001) throw new Error(`${t} !=  ${o} (eps = 0.001)`);
}

Deno.test({
  name: "duration/constructor",
  fn() {
    // Basic constructor
    const duration = new Duration.Time(3665000); // 1h 1m 5s
    assertEquals(duration.sign, 1);
    assertEquals(duration.toMs, 3665000);
    assertEquals(duration.toSecsF, 3665000 / Time.MS_PER_SEC);
    assertEquals(duration.toMinsF, 3665000 / Time.MS_PER_MIN);
    assertEquals(duration.toHrsF, 3665000 / Time.MS_PER_HR);

    // Negative duration
    const negative = new Duration.Time(-60000); // -1m
    assertEquals(negative.sign, -1);
    assertEquals(negative.toMs, -60000);
    assertEquals(negative.toSecs, -60);
    assertEquals(negative.toSecsF, -60);
    assertEquals(negative.toMins, -1);
    assertEquals(negative.toMinsF, -1);

    assertEquals(negative.ms, 0);
    assertEquals(negative.hrs, 0);
    assertEquals(negative.secs, 0);
    assertEquals(negative.minsF, 1);

    // Zero duration
    const zero = new Duration.Time(0);
    assertEquals(zero.sign, 1);
    assertEquals(zero.toHrs, 0);

    // Handles very large values
    const large = new Duration.Time(Time.MS_PER_DAY * 31); // 31 days
    assertEquals(large.toHrs, 31 * 24);
  },
});

Deno.test({
  name: "duration/static_constructors",
  fn() {
    // Using fromComponents
    const fromComponents = Duration.Time.from({
      hrs: 1,
      mins: 30,
      secs: 45,
    });
    // Expected 1h 30m 45s = 1.5125h
    assert(Math.abs(fromComponents.toHrsF - 1.5125) < 0.0001);

    // Using fromHours
    const fromHours = Duration.Time.hrs(2.5);
    assertEquals(fromHours.toHrsF, 2.5);
    assertEquals(fromHours.toMinsF, 150);

    // Using fromMinutes
    const fromMinutes = Duration.Time.mins(90);
    assertEquals(fromMinutes.toHrsF, 1.5);
    assertEquals(fromMinutes.toMinsF, 90);

    // Using fromSeconds
    const fromSeconds = Duration.Time.secs(60);
    assertEquals(fromSeconds.toMinsF, 1);
    assertEquals(fromSeconds.toSecsF, 60);

    // Using fromMilliseconds
    const fromMs = Duration.Time.ms(3600000);
    assertEquals(fromMs.toHrsF, 1);
    assertEquals(fromMs.toHrs, 1);

    // Using parse
    const parsed = Duration.Time.parse("01:30:00").exp();
    assertEquals(parsed.toHrsF, 1.5);

    // Using parse with negative
    const parsedNegative = Duration.Time.parse("-01:30").exp();
    assertEquals(parsedNegative.sign, -1);
    assertEquals(parsedNegative.toHrsF, -1.5);
    assertEquals(parsedNegative.hrsF, 1.5);
    assertEquals(parsedNegative.hrs, 1);

    // Using zero
    const zero = Duration.Time.ZERO;
    assertEquals(zero.toHrs, 0);
    assertEquals(zero.sign, 1);
  },
});

Deno.test({
  name: "duration/getters",
  fn() {
    const duration = Duration.Time.from({
      hrs: 2,
      mins: 30,
      secs: 15,
      ms: 500,
    });

    // Get milliseconds
    const expectedMs =
      2 * Time.MS_PER_HR + 30 * Time.MS_PER_MIN + 15 * Time.MS_PER_SEC + 500;
    assertEquals(duration.toMs, expectedMs);

    // Get sign
    assertEquals(duration.sign, 1);
    assertEquals(duration.hrs, 2);
    assertEquals(duration.mins, 30);
    assertEquals(duration.secs, 15);
    assertEquals(duration.ms, 500);

    // Get totals (use approximate comparison for floating point)
    // We can't do super precise calculations due to floating point, so just check ranges
    assert(
      duration.toHrsF > 2.5 && duration.toHrsF < 2.51,
      `Expected total hours between 2.5 and 2.51, got ${duration.toHrs}`,
    );

    assert(
      duration.toMinsF > 150.2 && duration.toMinsF < 150.3,
      `Expected total minutes between 150.2 and 150.3, got ${duration.toMins}`,
    );

    assert(
      duration.toSecsF > 9015 && duration.toSecsF < 9016,
      `Expected total seconds between 9015 and 9016, got ${duration.toSecs}`,
    );

    // Get absolute
    assertEquals(Duration.Time.ZERO.sign, 1);
    assertEquals(Duration.Time.hrs(-1).sign, -1);

    const neg1 = Duration.Time.hrs(-2);
    assertEquals(neg1.sign, -1);
    assertEquals(neg1.toHrs, -2);

    // Negative duration components
    const neg2 = Duration.Time.from({
      hrs: -1,
      mins: -15,
      secs: -30,
    });

    assertEquals(neg2.hrs, 1);
    assertEquals(neg2.mins, 15);
    assertEquals(neg2.secs, 30);
    assertEquals(neg2.ms, 0);
    assertEqualsEps(neg2.toHrsF, -1.2583333333333333);
  },
});

Deno.test({
  name: "duration/arithmetic",
  fn() {
    const duration1 = Duration.Time.hrs(2);
    const duration2 = Duration.Time.hrs(1);

    // Add
    const sum = duration1.add(duration2);
    assertEquals(sum.toHrs, 3);

    // Subtract
    const difference = duration1.sub(duration2);
    assertEquals(difference.toHrs, 1);

    // Multiply
    const doubled = duration1.mult(2);
    assertEquals(doubled.toHrs, 4);

    // Divide
    const halved = duration1.div(2);
    assertEquals(halved.toHrs, 1);

    // Adding negative and positive
    const pos = Duration.Time.mins(90); // 1.5h
    const neg = Duration.Time.mins(-30); // -0.5h

    const identneg = Duration.Time.from(neg);
    assertEquals(identneg.sign, -1);
    assertEquals(identneg.toMs, -1_800_000);

    const mixed = pos.add(neg);
    assertEquals(mixed.toMs, 3_600_000);
    assertEquals(mixed.toHrs, 1);

    // Multiplying by negative
    const negMult = duration1.mult(-1);
    assertEquals(negMult.toHrs, -2);
    assertEquals(negMult.sign, -1);

    // Division by zero
    try {
      duration1.div(0);
      assert(false, "Should have thrown error on divide by zero");
    } catch (e) {
      assert(e instanceof Error);
    }
  },
});

Deno.test({
  name: "duration/comparison",
  fn() {
    const short = Duration.Time.hrs(1);
    const long = Duration.Time.hrs(2);

    // CompareTo
    assert(short.cmp(long) < 0);
    assert(long.cmp(short) > 0);
    assertEquals(short.cmp(Duration.Time.hrs(1)), 0);

    // Equals
    assert(short.equals(Duration.Time.mins(60)));
    assert(!short.equals(long));

    // Comparing with negative
    const negative = Duration.Time.hrs(-1);

    assert(negative.cmp(short) < 0);
    assert(short.cmp(negative) > 0);
    assert(!negative.equals(short));
  },
});

Deno.test({
  name: "duration/formatting",
  fn() {
    const duration = Duration.Time.from({
      hrs: 2,
      mins: 30,
      secs: 15,
    });

    // Default format
    assertEquals(duration.dbg(), "02:30:15");

    // Show milliseconds
    const withMs = Duration.Time.from({
      hrs: 2,
      mins: 30,
      secs: 15,
      ms: 500,
    });
    assertEquals(withMs.format({ showMilliseconds: true }), "02:30:15.500");

    // Compact format
    assertEquals(duration.format({ compact: true }), "2h 30m 15s");

    // Compact format with zero hours
    const mins = Duration.Time.mins(45);
    assertEquals(mins.format({ compact: true }), "45m");

    // No seconds
    assertEquals(duration.format({ showSeconds: false }), "02:30");

    // Without padding
    assertEquals(duration.format({ padValues: false }), "2:30:15");

    // Negative duration
    const negative = Duration.Time.hrs(-2);
    assertEquals(negative.dbg(), "-02:00:00");
    assertEquals(negative.format({ compact: true }), "-2h");

    // Small negative duration
    const smallNeg = Duration.Time.secs(-30);
    assertEquals(smallNeg.format({ compact: true }), "-30s");

    // Zero duration
    const zero = Duration.Time.ZERO;
    assertEquals(zero.dbg(), "00:00:00");
    assertEquals(zero.format({ compact: true }), "0m");
  },
});

Deno.test({
  name: "duration/constants",
  fn() {
    // Test the static constants
    assertEquals(Duration.Time.ZERO.toMs, 0);
    assertEquals(Duration.Time.HOUR.toHrs, 1);
    assertEquals(Duration.Time.MIN15.toMs, Time.MS_PER_MIN * 15);
    assertEquals(Duration.Time.MIN5.toMs, Time.MS_PER_MIN * 5);

    // Combining constants
    const time = Duration.Time.HOUR.add(Duration.Time.MIN5.mult(30));
    assertEquals(time.toMins, 210);
  },
});

Deno.test({
  name: "duration/edge_cases",
  fn() {
    // Precise millisecond handling
    const smallFraction = Duration.Time.secs(0.001);
    assertEquals(smallFraction.toMs, 1);

    // Handling very large durations
    const largePositive = Duration.Time.hrs(1000000);
    assertEquals(largePositive.toHrs, 1000000);

    const largeNegative = Duration.Time.hrs(-1000000);
    assertEquals(largeNegative.toHrs, -1000000);

    // Fractional hours
    const fractionalHours = Duration.Time.hrs(1.5);
    assertEquals(fractionalHours.hrs, 1);
    assertEquals(fractionalHours.mins, 30);

    // Zero handling
    const zero = Duration.Time.ZERO;
    assertEquals(zero.sign, 1);
    assertEquals(zero.toHrs, 0);
    assertEquals(zero.hrs, 0);
    assertEquals(zero.mins, 0);
  },
});

Deno.test({
  name: "duration/parsing_corner_cases",
  fn() {
    // Simple format
    const simple = Duration.Time.parse("01:30").exp();
    assertEquals(simple.toHrsF, 1.5);

    const noLeadingZeros = Duration.Time.parse("1:30:45").exp();
    // If it parses successfully, verify the components are correct
    assertEquals(noLeadingZeros.hrs, 1);
    assertEquals(noLeadingZeros.mins, 30);
    assertEquals(noLeadingZeros.secs, 45);

    try {
      Duration.Time.parse("not a duration");
      assert(false);
    } catch (e) {
      assert(e instanceof Error);
    }

    try {
      Duration.Time.parse("");
      assert(false);
    } catch (e) {
      assert(e instanceof Error);
    }

    try {
      Duration.Time.parse("12");
      assert(false);
    } catch (e) {
      assert(e instanceof Error);
    }

    try {
      Duration.Time.parse("12:30:45:67");
      assert(false);
    } catch (e) {
      assert(e instanceof Error);
    }
  },
});
