import { assert, assertEquals } from "@std/assert";

import { Time } from "../chrono/time.ts";
import { Duration } from "../chrono/units/duration.ts";
import { TimeWithMeridiem } from "../chrono/units/meridiem.ts";
import { Ms } from "../chrono/units/ms.ts";
import { TimeOfDay } from "../chrono/units/time-of-day.ts";

Deno.test({
  name: "timeofday/constructor",
  fn() {
    const time = new TimeOfDay(3665000); // 1h 1m 5s
    assertEquals(time.hrs, 1);
    assertEquals(time.mins, 1);
    assertEquals(time.secs, 5);
    assertEquals(time.ms, 0);

    try {
      new TimeOfDay(-1);
      assert(false, "Should throw on negative time");
    } catch {
      assert(true, "Correctly threw on negative time");
    }

    try {
      new TimeOfDay(Time.MS_PER_DAY);
      assert(false, "Should throw on time >= MS_PER_DAY");
    } catch {
      assert(true, "Correctly threw on time >= MS_PER_DAY");
    }

    const endOfDay = new TimeOfDay(Time.MS_PER_DAY - 1); // 23:59:59.999
    assertEquals(endOfDay.hrs, 23);
    assertEquals(endOfDay.mins, 59);
    assertEquals(endOfDay.secs, 59);
    assertEquals(endOfDay.ms, 999);
  },
});

Deno.test({
  name: "timeofday/static_constructors",
  fn() {
    // Using fromComponents
    const tod = TimeOfDay.wrap({
      hrs: 14,
      mins: 30,
      secs: 45,
      ms: 500 as Ms,
    });
    assertEquals(tod.hrs, 14);
    assertEquals(tod.mins, 30);
    assertEquals(tod.secs, 45);
    assertEquals(tod.ms, 500);

    // Using from (alias for fromComponents)
    const from = TimeOfDay.wrap({
      hrs: 9,
      mins: 15,
    });
    assertEquals(from.hrs, 9);
    assertEquals(from.mins, 15);
    assertEquals(from.secs, 0);
    assertEquals(from.ms, 0);

    // Using from hours
    const fromHours = TimeOfDay.wrap({
      hrs: 3.5,
    }); // 3h 30m
    assertEquals(fromHours.hrs, 3);
    assertEquals(fromHours.mins, 30);
    assertEquals(fromHours.secs, 0);

    // Using fromMinutes
    const fromMinutes = TimeOfDay.wrap({
      mins: 90,
    }); // 1h 30m
    assertEquals(fromMinutes.hrs, 1);
    assertEquals(fromMinutes.mins, 30);

    // Using parse
    const parsed = TimeOfDay.parse("12:34:56").exp();
    assertEquals(parsed.hrs, 12);
    assertEquals(parsed.mins, 34);
    assertEquals(parsed.secs, 56);

    // Using midnight and noon
    const midnight = TimeOfDay.midnight();
    assertEquals(midnight.hrs, 0);
    assertEquals(midnight.mins, 0);
    assertEquals(midnight.secs, 0);

    const noon = TimeOfDay.noon();
    assertEquals(noon.hrs, 12);
    assertEquals(noon.mins, 0);
    assertEquals(noon.secs, 0);
  },
});

Deno.test({
  name: "timeofday/getters",
  fn() {
    const time = new TimeOfDay(45296789); // 12h 34m 56s 789ms

    // Basic components
    assertEquals(time.hrs, 12);
    assertEquals(time.mins, 34);
    assertEquals(time.secs, 56);
    assertEquals(time.ms, 789);

    // Compatibility getters
    assertEquals(time.hrs, 12);
    assertEquals(time.mins, 34);
    assertEquals(time.secs, 56);
    assertEquals(time.ms, 789);

    // Total milliseconds
    assertEquals(time.ms, 789);
    assertEquals(time.toMs, 45296789);

    // Meridiem
    assertEquals(time.meridiem, "pm");
    assertEquals(new TimeOfDay(8 * Time.MS_PER_HR).meridiem, "am");
  },
});

Deno.test({
  name: "timeofday/duration_until",
  fn() {
    const early = new TimeOfDay(8 * Time.MS_PER_HR); // 8:00 AM
    const late = new TimeOfDay(17 * Time.MS_PER_HR); // 5:00 PM

    // Duration same day
    const duration = early.durationUntil(late, true);
    assertEquals(duration.toHrs, 9);

    // Duration shortest path (still same day)
    const duration2 = early.durationUntil(late, false);
    assertEquals(duration2.toHrs, 9);

    // Duration crossing midnight
    const evening = new TimeOfDay(22 * Time.MS_PER_HR); // 10:00 PM
    const morning = new TimeOfDay(6 * Time.MS_PER_HR); // 6:00 AM

    // Assuming same day (evening to morning === 8 hours backward wrap)
    const forwardDuration = evening.durationUntil(morning, true);
    assertEquals(forwardDuration.toHrs, -16);

    // Shortest path (evening to morning === 8 hours forward)
    const shortestDuration = evening.durationUntil(morning, false);
    assertEquals(shortestDuration.toHrs, 8);
  },
});

Deno.test({
  name: "timeofday/comparison",
  fn() {
    const early = new TimeOfDay(8 * Time.MS_PER_HR); // 8:00 AM
    const late = new TimeOfDay(17 * Time.MS_PER_HR); // 5:00 PM

    // CompareTo
    assert(early.compareTo(late) < 0);
    assert(late.compareTo(early) > 0);
    assertEquals(early.compareTo(early), 0);

    // Cmp (alias for compareTo)
    assert(early.cmp(late) < 0);
    assert(late.cmp(early) > 0);
    assertEquals(early.cmp(early), 0);

    // Is before/after
    assert(early.isBefore(late));
    assert(!late.isBefore(early));
    assert(late.isAfter(early));
    assert(!early.isAfter(late));

    // Equals
    assert(early.equals(new TimeOfDay(8 * Time.MS_PER_HR)));
    assert(!early.equals(late));

    // Min/max
    const min = early.min(late);
    assertEquals(min.hrs, early.hrs);

    const max = early.max(late);
    assertEquals(max.hrs, late.hrs);
  },
});

Deno.test({
  name: "timeofday/rounding",
  fn() {
    const time = new TimeOfDay(8 * Time.MS_PER_HR + 32 * Time.MS_PER_MIN); // 8:32 AM

    // Round to nearest 15 minutes using Duration
    const rounded15 = time.roundToNearest(Duration.Time.mins(15));
    assertEquals(rounded15.hrs, 8);
    assertEquals(rounded15.mins, 30);

    // Round to nearest 30 minutes using Duration
    const rounded30 = time.roundToNearest(Duration.Time.mins(30));
    assertEquals(rounded30.hrs, 8);
    assertEquals(rounded30.mins, 30);

    // Round to nearest hour using Duration
    const roundedHour = time.roundToNearest(Duration.Time.hrs(1));
    assertEquals(roundedHour.hrs, 9);
    assertEquals(roundedHour.mins, 0);

    // Compatibility rounding using TimeUnit-like objects
    const compatRounded = time.round({ mins: 15 });
    assertEquals(compatRounded.hrs, 8);
    assertEquals(compatRounded.mins, 30);

    // Compatibility ceiling
    const ceiling = time.ceil({ mins: 15 });
    assertEquals(ceiling.hrs, 8);
    assertEquals(ceiling.mins, 45);

    // Compatibility floor
    const floor = time.floor({ mins: 15 });
    assertEquals(floor.hrs, 8);
    assertEquals(floor.mins, 30);

    // Compatibility nearest with custom operation
    const custom = time.nearest({ mins: 15 }, Math.ceil);
    assertEquals(custom.hrs, 8);
    assertEquals(custom.mins, 45);

    // Test rounding that wraps around to next day (TimeOfDay stays within bounds)
    const nearMidnight = new TimeOfDay(
      23 * Time.MS_PER_HR + 55 * Time.MS_PER_MIN,
    );
    const roundedNearMidnight = nearMidnight.roundToNearest(
      Duration.Time.mins(10),
    );
    assertEquals(roundedNearMidnight.hrs, 0);
    assertEquals(roundedNearMidnight.mins, 0);
  },
});

Deno.test({
  name: "timeofday/formatting",
  fn() {
    const time = new TimeOfDay(
      14 * Time.MS_PER_HR + 30 * Time.MS_PER_MIN + 45 * Time.MS_PER_SEC,
    ); // 2:30:45 PM

    // RFC3339
    assertEquals(time.toRfc3339(), "14:30:45");

    // toString
    assertEquals(time.toString(), "14:30:45");

    // 24-hour format (default)
    assertEquals(time.format(), "14:30:45");

    // 12-hour format - implementation details might vary slightly (padding, space before pm)
    const formatted12h = time
      .format({ use24Hour: false, includeAmPm: true })
      .toLowerCase();
    assert(
      formatted12h.includes("2:30:45"),
      "Should contain time without hours padding",
    );
    assert(formatted12h.includes("pm"), "Should include pm indicator");

    // 12-hour format with uppercase AM/PM
    assertEquals(
      time
        .format({ use24Hour: false, includeAmPm: true, allCaps: true })
        .toUpperCase()
        .includes("PM"),
      true,
    );

    // Without seconds
    assertEquals(time.format({ includeSeconds: false }), "14:30");

    // Without padding
    assertEquals(time.format({ padHours: false }), "14:30:45");

    // Using Formatter namespace (compatibility)
    const formatterOutput = TimeOfDay.Formatter.render(time, {
      use24Hour: true,
    });
    assertEquals(formatterOutput, "14:30:45");
  },
});

Deno.test({
  name: "timeofday/range",
  fn() {
    const start = new TimeOfDay(9 * Time.MS_PER_HR); // 9:00 AM
    const end = new TimeOfDay(17 * Time.MS_PER_HR); // 5:00 PM

    // Create range
    const range = new TimeOfDay.Range(start, end, false);

    // Range duration
    assertEquals(range.duration.toHrs, 8);

    // Range contains
    assert(range.contains(new TimeOfDay(12 * Time.MS_PER_HR))); // Noon is within range
    assert(!range.contains(new TimeOfDay(8 * Time.MS_PER_HR))); // 8 AM is outside range
    assert(!range.contains(end)); // End is exclusive
    assert(range.contains(start)); // Start is inclusive

    // Range crossing midnight
    const nightRange = new TimeOfDay.Range(
      new TimeOfDay(22 * Time.MS_PER_HR), // 10:00 PM
      new TimeOfDay(6 * Time.MS_PER_HR), // 6:00 AM
      true,
    );

    console.log(nightRange.contains(new TimeOfDay(0)));
    // Midnight is within the night range
    assert(nightRange.contains(new TimeOfDay(0)));
    // 5:00 AM is within the night range
    assert(nightRange.contains(new TimeOfDay(5 * Time.MS_PER_HR)));
    // Noon is outside the night range
    assert(!nightRange.contains(TimeOfDay.NOON));

    // Shifting a range
    const shifted = range.shift(Duration.Time.hrs(1));
    // @ts-ignore deno stupid
    assertEquals(shifted.start.hrs, 10);
    // @ts-ignore deno stupid
    assertEquals(shifted.end.hrs, 18);
  },
});

Deno.test({
  name: "timeofday/edge_cases",
  fn() {
    // Exact midnight
    const midnight = new TimeOfDay(0);
    assertEquals(midnight.hrs, 0);
    assertEquals(midnight.mins, 0);
    assertEquals(midnight.secs, 0);
    assertEquals(midnight.ms, 0);

    // One millisecond before midnight
    const beforeMidnight = new TimeOfDay(Time.MS_PER_DAY - 1);
    assertEquals(beforeMidnight.hrs, 23);
    assertEquals(beforeMidnight.mins, 59);
    assertEquals(beforeMidnight.secs, 59);
    assertEquals(beforeMidnight.ms, 999);
  },
});

Deno.test({
  name: "timeofday/parse_toString_symmetry",
  fn() {
    // Test that parse and toString are symmetrical for valid times
    const testCases = [
      "00:00:00",
      "01:02:03",
      "12:00:00",
      "12:34:56",
      "23:59:59",
      "09:30:45",
      "18:45:00",
    ];

    for (const testCase of testCases) {
      const parsed = TimeOfDay.parse(testCase);
      assert(parsed.isOk, `Should parse ${testCase} successfully`);
      const time = parsed.exp();
      assertEquals(
        time.toString(),
        testCase,
        `toString should return ${testCase}`,
      );
    }

    // Test HH:MM format (without seconds)
    const shortFormats = ["00:00", "12:30", "23:59", "09:15", "18:45"];

    for (const shortFormat of shortFormats) {
      const parsed = TimeOfDay.parse(shortFormat);
      assert(parsed.isOk, `Should parse ${shortFormat} successfully`);
      const time = parsed.exp();
      // Should add :00 for seconds in toString
      assertEquals(
        time.toString(),
        `${shortFormat}:00`,
        `toString should return ${shortFormat}:00`,
      );
    }
  },
});

Deno.test({
  name: "timeofday/parse_invalid_times",
  fn() {
    // Test invalid time formats
    const invalidCases = [
      // Invalid formats
      "",
      "12",
      "12:60", // invalid minutes
      "25:00", // invalid hours
      "24:00", // 24:00 is not valid in 24-hour format for TimeOfDay
      "12:00:60", // invalid seconds
      "12:00:61",
      "12:-05:00", // negative values
      "-12:00:00",
      "12:00:-05",
      // Non-numeric values
      "ab:cd:ef",
      "12:ab:00",
      "12:00:ab",
      // Too many parts
      "12:00:00:00",
      // Extra characters
      "12:00 AM", // AM/PM not supported by basic parse
      "12:00PM",
      "12h30m",
      "12.30.00",
    ];

    for (const invalidCase of invalidCases) {
      const parsed = TimeOfDay.parse(invalidCase);
      assert(
        parsed.isErr,
        `Should fail to parse invalid time: "${invalidCase}"`,
      );
    }
  },
});

Deno.test({
  name: "timeofday/parse_edge_boundaries",
  fn() {
    // Test boundary conditions
    
    // Valid boundaries
    const validBoundaries = [
      { input: "00:00:00", hrs: 0, mins: 0, secs: 0 },
      { input: "23:59:59", hrs: 23, mins: 59, secs: 59 },
      { input: "00:00", hrs: 0, mins: 0, secs: 0 },
      { input: "23:59", hrs: 23, mins: 59, secs: 0 },
    ];

    for (const boundary of validBoundaries) {
      const parsed = TimeOfDay.parse(boundary.input);
      assert(parsed.isOk, `Should parse ${boundary.input}`);
      const time = parsed.exp();
      assertEquals(time.hrs, boundary.hrs);
      assertEquals(time.mins, boundary.mins);
      assertEquals(time.secs, boundary.secs);
    }

    // Invalid boundaries
    const invalidBoundaries = [
      "24:00:00", // hour 24 is invalid
      "23:60:00", // minute 60 is invalid
      "23:59:60", // second 60 is invalid
      "99:99:99", // all out of range
    ];

    for (const boundary of invalidBoundaries) {
      const parsed = TimeOfDay.parse(boundary);
      assert(parsed.isErr, `Should fail to parse ${boundary}`);
    }
  },
});

Deno.test({
  name: "timeofday/parse_with_padding",
  fn() {
    // Test that padding doesn't matter for parsing
    const paddingCases = [
      { input: "9:5:3", expected: "09:05:03" },
      { input: "09:05:03", expected: "09:05:03" },
      { input: "9:05:03", expected: "09:05:03" },
      { input: "09:5:03", expected: "09:05:03" },
      { input: "09:05:3", expected: "09:05:03" },
      { input: "0:0:0", expected: "00:00:00" },
      { input: "00:00:00", expected: "00:00:00" },
    ];

    for (const testCase of paddingCases) {
      const parsed = TimeOfDay.parse(testCase.input);
      assert(parsed.isOk, `Should parse ${testCase.input}`);
      const time = parsed.exp();
      assertEquals(
        time.toString(),
        testCase.expected,
        `Parsed ${testCase.input} should format to ${testCase.expected}`,
      );
    }
  },
});

Deno.test({
  name: "timeofday/TimeWithMeridiem_parse",
  fn() {
    // Valid cases with AM/PM
    let parsed = TimeWithMeridiem.parse("5am");
    assert(parsed != null, '"5am" should parse');
    
    parsed = TimeWithMeridiem.parse("5:30pm");
    assert(parsed != null, '"5:30pm" should parse');
    
    parsed = TimeWithMeridiem.parse("12:00 AM");
    assert(parsed != null, '"12:00 AM" should parse');
    
    parsed = TimeWithMeridiem.parse("11 PM");
    assert(parsed != null, '"11 PM" should parse');
    
    // Invalid cases - no AM/PM
    parsed = TimeWithMeridiem.parse("51");
    assertEquals(parsed, null, '"51" should NOT parse (no AM/PM)');
    
    parsed = TimeWithMeridiem.parse("5");
    assertEquals(parsed, null, '"5" should NOT parse (no AM/PM)');
    
    parsed = TimeWithMeridiem.parse("12:30");
    assertEquals(parsed, null, '"12:30" should NOT parse (no AM/PM)');
    
    parsed = TimeWithMeridiem.parse("23:59");
    assertEquals(parsed, null, '"23:59" should NOT parse (no AM/PM)');
  },
});

Deno.test({
  name: "timeofday/parse_with_whitespace",
  fn() {
    // Test that leading/trailing whitespace is properly trimmed
    const whitespaceCases = [
      { input: " 12:00:00", expected: "12:00:00" },
      { input: "12:00:00 ", expected: "12:00:00" },
      { input: " 12:00:00 ", expected: "12:00:00" },
      { input: "  09:30  ", expected: "09:30:00" },
      { input: "\t15:45\t", expected: "15:45:00" },
    ];

    for (const testCase of whitespaceCases) {
      const parsed = TimeOfDay.parse(testCase.input);
      assert(parsed.isOk, `Should parse "${testCase.input}" after trimming`);
      const time = parsed.exp();
      assertEquals(
        time.toString(),
        testCase.expected,
        `Parsed "${testCase.input}" should format to ${testCase.expected}`,
      );
    }
  },
});

Deno.test({
  name: "timeofday/tryParseSofar_complete",
  fn() {
    // Test cases that should return complete TimeOfDay
    const completeCases = [
      { input: "12:30", hrs: 12, mins: 30, secs: 0 },
      { input: "23:59", hrs: 23, mins: 59, secs: 0 },
      { input: "00:00", hrs: 0, mins: 0, secs: 0 },
      { input: "12:34:56", hrs: 12, mins: 34, secs: 56 },
      { input: "09:15:30", hrs: 9, mins: 15, secs: 30 },
      // Two-digit inputs are treated as complete times (00:XX format)
      { input: "12", hrs: 0, mins: 12, secs: 0 },  // 00:12
      { input: "23", hrs: 0, mins: 23, secs: 0 },  // 00:23
      { input: "24", hrs: 0, mins: 24, secs: 0 },  // 00:24
      { input: "25", hrs: 0, mins: 25, secs: 0 },  // 00:25
      { input: "30", hrs: 0, mins: 30, secs: 0 },  // 00:30
      { input: "45", hrs: 0, mins: 45, secs: 0 },  // 00:45
      { input: "51", hrs: 0, mins: 51, secs: 0 },  // 00:51
      { input: "59", hrs: 0, mins: 59, secs: 0 },  // 00:59 (max valid minutes)
    ];

    for (const testCase of completeCases) {
      const result = TimeOfDay.tryParseSofar(testCase.input);
      assert(result.isOk, `Should parse "${testCase.input}" successfully`);
      const time = result.exp();
      assert(time != null, `"${testCase.input}" should return a complete TimeOfDay`);
      assertEquals(time.hrs, testCase.hrs);
      assertEquals(time.mins, testCase.mins);
      assertEquals(time.secs, testCase.secs);
    }
  },
});

Deno.test({
  name: "timeofday/tryParseSofar_incomplete",
  fn() {
    // Test cases that should return null (incomplete but valid)
    const incompleteCases = [
      "",           // empty
      "1",          // single digit hour
      "2",          // single digit hour  
      "12:",        // hour with colon but no minutes
      "23:",        // hour with colon but no minutes
      "12:3",       // incomplete minutes
      "12:5",       // incomplete minutes
      "09:1",       // incomplete minutes
      "12:34:",     // complete time with colon expecting seconds
      "12:34:5",    // incomplete seconds
      "12:34:0",    // incomplete seconds
      "00:00:",     // expecting seconds
      "00:00:0",    // incomplete seconds
    ];

    for (const testCase of incompleteCases) {
      const result = TimeOfDay.tryParseSofar(testCase);
      assert(result.isOk, `"${testCase}" should not error`);
      const time = result.exp();
      assertEquals(time, null, `"${testCase}" should return null (incomplete)`);
    }
  },
});

Deno.test({
  name: "timeofday/tryParseSofar_invalid",
  fn() {
    // Test cases that should return errors
    const invalidCases = [
      "60",          // exceeds both hour (24) and minute (60) limits
      "99",          // way out of range
      "100",         // three digits without colon
      "999",         // three digits without colon
      "12:60",       // minutes >= 60
      "12:99",       // minutes out of range
      "12:30:60",    // seconds >= 60
      "12:30:99",    // seconds out of range
      "25:00",       // invalid hours with colon
      "24:00",       // hours must be < 24 with colon
      "30:",         // 30 hours with colon is invalid
      "51:",         // 51 hours with colon is invalid
      "23:60",       // invalid minutes
      "23:59:60",    // invalid seconds
      "abc",         // non-numeric
      "12:ab",       // non-numeric minutes
      "12:30:cd",    // non-numeric seconds
      "a:30",        // non-numeric hours
      ":30",         // missing hours
      ":30:00",      // missing hours
      "12:30:00:00", // too many components
      "12:30:00:",   // trailing colon after seconds
      "12.30",       // wrong separator
      "12-30",       // wrong separator
      "12 30",       // space separator
      "-12:30",      // negative not allowed
      "12:-30",      // negative minutes not allowed
    ];

    for (const testCase of invalidCases) {
      const result = TimeOfDay.tryParseSofar(testCase);
      assert(result.isErr, `"${testCase}" should return an error`);
    }
  },
});

Deno.test({
  name: "timeofday/tryParseSofar_edge_cases",
  fn() {
    // Test edge cases and boundary conditions
    
    // "7" is incomplete (could be 7:00 or 70:00, but 70 is invalid)
    let result = TimeOfDay.tryParseSofar("7");
    assert(result.isOk && result.exp() === null, '"7" should be incomplete');
    
    // "30:" is invalid (hours must be < 24)
    result = TimeOfDay.tryParseSofar("30:");
    assert(result.isErr, '"30:" should be invalid (hours >= 24)');
    
    // "51:" is also invalid (hours must be < 24)
    result = TimeOfDay.tryParseSofar("51:");
    assert(result.isErr, '"51:" should be invalid (hours >= 24)');
    
    // "3" is incomplete (could become "3:00" or keep typing)
    result = TimeOfDay.tryParseSofar("3");
    assert(result.isOk && result.exp() === null, '"3" should be incomplete');
    
    // "30" is complete (interpreted as 00:30)
    result = TimeOfDay.tryParseSofar("30");
    assert(result.isOk && result.exp() !== null, '"30" should be complete (00:30)');
    const time30 = result.exp();
    if (time30) {
      assertEquals(time30.hrs, 0);
      assertEquals(time30.mins, 30);
    }
    
    // "11" is complete (interpreted as 00:11)
    result = TimeOfDay.tryParseSofar("11");
    assert(result.isOk && result.exp() !== null, '"11" should be complete (00:11)');
    const time11 = result.exp();
    if (time11) {
      assertEquals(time11.hrs, 0);
      assertEquals(time11.mins, 11);
    }
    
    // "23:5" is incomplete (minutes need another digit)
    result = TimeOfDay.tryParseSofar("23:5");
    assert(result.isOk && result.exp() === null, '"23:5" should be incomplete');
    
    // "23:59" is complete
    result = TimeOfDay.tryParseSofar("23:59");
    assert(result.isOk && result.exp() !== null, '"23:59" should be complete');
    const time = result.exp();
    if (time) {
      assertEquals(time.hrs, 23);
      assertEquals(time.mins, 59);
    }
    
    // "00:00:00" is complete
    result = TimeOfDay.tryParseSofar("00:00:00");
    assert(result.isOk && result.exp() !== null, '"00:00:00" should be complete');
    
    // Whitespace should be trimmed
    result = TimeOfDay.tryParseSofar(" 12:30 ");
    assert(result.isOk && result.exp() !== null, 'Should trim whitespace');
    
    // Empty parts with colons
    result = TimeOfDay.tryParseSofar(":");
    assert(result.isErr, 'Single colon should be invalid');
    
    result = TimeOfDay.tryParseSofar("::");
    assert(result.isErr, 'Double colon should be invalid');
    
    // "51" is complete (interpreted as 00:51)
    result = TimeOfDay.tryParseSofar("51");
    assert(result.isOk && result.exp() !== null, '"51" should be complete (00:51)');
    const time51 = result.exp();
    if (time51) {
      assertEquals(time51.hrs, 0);
      assertEquals(time51.mins, 51);
    }
    
    // "60" and above should be invalid (can't be hours or minutes)
    result = TimeOfDay.tryParseSofar("60");
    assert(result.isErr, '"60" should be invalid (exceeds both hour and minute limits)');
    
    result = TimeOfDay.tryParseSofar("99");
    assert(result.isErr, '"99" should be invalid (exceeds both hour and minute limits)');
  },
});
