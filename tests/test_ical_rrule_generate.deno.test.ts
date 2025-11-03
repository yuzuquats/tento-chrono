import { assertEquals } from "@std/assert";
import { naivedate } from "../chrono/mod.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { RRule } from "../chrono/recurrence/rrule.ts";

Deno.test({
  name: "rrule/toFilterProps/weekly",
  fn() {
    const rrule = RRule.parse("RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=MO").exp();
    const filterProps = rrule.toFilterProps();

    // Test that we get the expected step
    assertEquals(filterProps.step.type, "week");
    assertEquals(filterProps.step.value, 1);
    assertEquals(filterProps.options?.limit, 3);
    filterProps.options.recurLimit = 10;

    // Test generating dates
    const startDate = naivedate(2024, 1, 1); // Monday, Jan 1, 2024
    const dates: NaiveDate[] = Array.from(startDate.rangeProps(filterProps));

    // Should generate Mondays
    assertEquals(dates.length, 3); // Limited by COUNT=3
    assertEquals(dates[0].toString(), "2024-01-01"); // First Monday
    assertEquals(dates[1].toString(), "2024-01-08"); // Second Monday
    assertEquals(dates[2].toString(), "2024-01-15"); // Third Monday
  },
});

Deno.test({
  name: "rrule/toFilterProps/monthly_bymonthday",
  fn() {
    const rrule = RRule.parse("RRULE:FREQ=MONTHLY;COUNT=3;BYMONTHDAY=15").exp();
    const filterProps = rrule.toFilterProps();

    assertEquals(filterProps.step.type, "month");
    assertEquals(filterProps.step.value, 1);
    assertEquals(filterProps.options?.limit, 3);

    // Test generating dates
    const startDate = naivedate(2024, 1, 15); // Jan 15, 2024
    const dates: NaiveDate[] = Array.from(startDate.rangeProps(filterProps));

    // Should generate 15th of each month
    assertEquals(dates.length, 3); // Limited by COUNT=3
    assertEquals(dates[0].toString(), "2024-01-15"); // First occurrence
    assertEquals(dates[1].toString(), "2024-02-15"); // Second occurrence
    assertEquals(dates[2].toString(), "2024-03-15"); // Third occurrence
  },
});

Deno.test({
  name: "rrule/toFilterProps/daily_with_until",
  fn() {
    const rrule = RRule.parse("RRULE:FREQ=DAILY;UNTIL=20240105T000000Z").exp();
    const filterProps = rrule.toFilterProps();

    // Test that we get the expected step
    assertEquals(filterProps.step.type, "day");
    assertEquals(filterProps.step.value, 1);
    assertEquals(filterProps.options?.end?.toString(), "2024-01-05");

    // Test generating dates
    const startDate = naivedate(2024, 1, 1);
    const dates: NaiveDate[] = Array.from(startDate.rangeProps(filterProps));

    // Should generate daily until Jan 5
    assertEquals(dates.length, 5); // Jan 1, 2, 3, 4, 5
    assertEquals(dates[0].toString(), "2024-01-01");
    assertEquals(dates[4].toString(), "2024-01-05");
  },
});

Deno.test({
  name: "rrule/toFilterProps/yearly",
  fn() {
    const rrule = RRule.parse("RRULE:FREQ=YEARLY;COUNT=2").exp();
    const filterProps = rrule.toFilterProps();

    assertEquals(filterProps.step.type, "year");
    assertEquals(filterProps.step.value, 1);
    assertEquals(filterProps.options?.limit, 2);

    // Test generating dates
    const startDate = naivedate(2024, 3, 15);
    const dates: NaiveDate[] = Array.from(startDate.rangeProps(filterProps));

    // Should generate yearly
    assertEquals(dates.length, 2);
    assertEquals(dates[0].toString(), "2024-03-15");
    assertEquals(dates[1].toString(), "2025-03-15");
  },
});
