import { assertEquals } from "@std/assert";
import { naivedate } from "../chrono/mod.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { Recurrence } from "../chrono/recurrence/recurrence.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

Deno.test({
  name: "recurrence/generate/basic_daily",
  async fn() {
    const lines = ["DTSTART:20240101T090000Z", "RRULE:FREQ=DAILY;COUNT=3"];
    const recurrence = (await Recurrence.parse(lines)).exp();

    const dates: NaiveDate[] = Array.from(recurrence.generate()).slice(0, 5);

    // Should generate daily dates
    assertEquals(dates.length, 3); // Limited by COUNT=3
    assertEquals(dates[0].toString(), "2024-01-01"); // First day
    assertEquals(dates[1].toString(), "2024-01-02"); // Second day
    assertEquals(dates[2].toString(), "2024-01-03"); // Third day
  },
});

Deno.test({
  name: "recurrence/generate/basic_weekly",
  async fn() {
    const lines = ["DTSTART:20240101T090000Z", "RRULE:FREQ=WEEKLY;COUNT=3"];
    const recurrence = (await Recurrence.parse(lines)).exp();

    const dates: NaiveDate[] = Array.from(recurrence.generate()).slice(0, 5);

    // Should generate weekly dates
    assertEquals(dates.length, 3); // Limited by COUNT=3
    assertEquals(dates[0].toString(), "2024-01-01"); // First week
    assertEquals(dates[1].toString(), "2024-01-08"); // Second week
    assertEquals(dates[2].toString(), "2024-01-15"); // Third week
  },
});

Deno.test({
  name: "recurrence/generate/with_exclusions",
  async fn() {
    const lines = [
      "DTSTART:20240101T090000Z",
      "RRULE:FREQ=DAILY;COUNT=5",
      "EXDATE:20240102T090000Z,20240104T090000Z",
    ];
    const recurrence = (await Recurrence.parse(lines)).exp();

    const dates: NaiveDate[] = Array.from(recurrence.generate()).slice(0, 10);

    // Should generate daily but skip excluded dates
    assertEquals(dates.length, 3); // 5 total minus 2 excluded
    assertEquals(dates[0].toString(), "2024-01-01"); // Not excluded
    assertEquals(dates[1].toString(), "2024-01-03"); // Skip Jan 2 (excluded)
    assertEquals(dates[2].toString(), "2024-01-05"); // Skip Jan 4 (excluded)
  },
});

Deno.test({
  name: "recurrence/generate/override_start_date",
  async fn() {
    const lines = ["DTSTART:20240101T090000Z", "RRULE:FREQ=DAILY;COUNT=3"];
    const recurrence = (await Recurrence.parse(lines)).exp();

    // Override start date in generate method
    const customStart = naivedate(2024, 1, 5);
    const dates: NaiveDate[] = Array.from(
      recurrence.generate(customStart),
    ).slice(0, 5);

    // Should start from custom date, not dtstart
    assertEquals(dates.length, 3); // Limited by COUNT=3
    assertEquals(dates[0].toString(), "2024-01-05"); // Custom start
    assertEquals(dates[1].toString(), "2024-01-06"); // Next day
    assertEquals(dates[2].toString(), "2024-01-07"); // Next day
  },
});

Deno.test({
  name: "recurrence/generate/monthly_with_utc",
  async fn() {
    const lines = [
      "DTSTART:20240115T140000Z",
      "RRULE:FREQ=MONTHLY;COUNT=3;BYMONTHDAY=15",
    ];
    const recurrence = (await Recurrence.parse(lines)).exp();

    const dates: NaiveDate[] = Array.from(recurrence.generate()).slice(0, 5);

    // Should generate 15th of each month
    assertEquals(dates.length, 3); // Limited by COUNT=3
    assertEquals(dates[0].toString(), "2024-01-15"); // First occurrence
    assertEquals(dates[1].toString(), "2024-02-15"); // Second occurrence
    assertEquals(dates[2].toString(), "2024-03-15"); // Third occurrence
  },
});

Deno.test({
  name: "recurrence/generate/weekly_with_multiple_exclusions",
  async fn() {
    const lines = [
      "DTSTART:20240411T150000Z",
      "RRULE:FREQ=WEEKLY;BYDAY=TH",
      "EXDATE:20240411T150000Z,20240418T150000Z,20241024T150000Z",
    ];
    const recurrence = (await Recurrence.parse(lines)).exp();

    const dates: NaiveDate[] = Array.from(recurrence.generate()).slice(0, 5);

    // Should generate Thursdays but skip excluded dates
    assertEquals(dates[0].toString(), "2024-04-25"); // Skip Apr 11 and 18 (excluded)
    assertEquals(dates[1].toString(), "2024-05-02"); // Next Thursday
    assertEquals(dates[2].toString(), "2024-05-09"); // Next Thursday
    assertEquals(dates[3].toString(), "2024-05-16"); // Next Thursday
    assertEquals(dates[4].toString(), "2024-05-23"); // Next Thursday
  },
});

Deno.test({
  name: "recurrence/generate/yearly_simple",
  async fn() {
    const lines = [
      "DTSTART:20240315T120000Z", // Regular date
      "RRULE:FREQ=YEARLY;COUNT=3",
    ];
    const recurrence = (await Recurrence.parse(lines)).exp();

    const dates: NaiveDate[] = Array.from(recurrence.generate()).slice(0, 5);

    // Should generate yearly on March 15
    assertEquals(dates.length, 3); // Limited by COUNT=3
    assertEquals(dates[0].toString(), "2024-03-15"); // First year
    assertEquals(dates[1].toString(), "2025-03-15"); // Second year
    assertEquals(dates[2].toString(), "2026-03-15"); // Third year
  },
});

Deno.test({
  name: "recurrence/generate/complex_with_timezone_and_exclusions",
  async fn() {
    const lines = [
      "DTSTART;TZID=Europe/London:20240301T100000",
      "RRULE:FREQ=WEEKLY;BYDAY=FR;COUNT=8",
      "EXDATE;TZID=Europe/London:20240308T100000,20240322T100000,20240405T100000",
    ];
    const recurrence = (await Recurrence.parse(lines)).exp();

    const dates: NaiveDate[] = Array.from(recurrence.generate()).slice(0, 10);

    // Should generate Fridays but skip excluded dates
    assertEquals(dates.length, 5); // 8 total minus 3 excluded
    assertEquals(dates[0].toString(), "2024-03-01"); // First Friday (not excluded)
    assertEquals(dates[1].toString(), "2024-03-15"); // Skip Mar 8 (excluded)
    assertEquals(dates[2].toString(), "2024-03-29"); // Skip Mar 22 (excluded)
    assertEquals(dates[3].toString(), "2024-04-12"); // Skip Apr 5 (excluded)
    assertEquals(dates[4].toString(), "2024-04-19"); // Continue sequence
  },
});
