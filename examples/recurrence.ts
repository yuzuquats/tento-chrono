/**
 * Recurring events: RFC 5545 and Google Calendar input.
 *
 *   deno run --allow-net examples/recurrence.ts
 */
import { assertEquals } from "@std/assert";
import { NaiveDate, Recurrence, RRule } from "../chrono/mod.ts";

const rule = RRule.parse("FREQ=MONTHLY;BYMONTHDAY=31;COUNT=4").exp();
assertEquals(rule.toReadableDisplay(), "Monthly on day 31, 4 times");

// RFC expansion skips months without a 31st. EXDATE excludes March.
const monthly = (await Recurrence.fromICalendar([
  "DTSTART;VALUE=DATE:20240131",
  "RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=4",
  "EXDATE;VALUE=DATE:20240331",
])).exp();
assertEquals(
  monthly.occurrences({ through: NaiveDate.parse("2024-12-31") }).map(String),
  ["2024-01-31", "2024-05-31", "2024-07-31"],
);

// The Google profile reads the start separately from the recurrence lines.
// 09:00 in Los Angeles moves one hour earlier in UTC after the DST change.
const weekly = (await Recurrence.fromICalendar(
  ["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3"],
  {
    profile: "google",
    dtstart: {
      dateTime: "2024-03-04T17:00:00Z",
      timeZone: "America/Los_Angeles",
    },
  },
)).exp();
const events = weekly.generator();
assertEquals(
  [
    ...events.generateUpToDate(NaiveDate.parse("2024-03-10")),
    ...events.generateUpToDate(NaiveDate.parse("2024-03-31")),
  ].map(String),
  ["2024-03-04T17:00:00Z", "2024-03-11T16:00:00Z", "2024-03-18T16:00:00Z"],
);

console.log("recurrence: ok");
