import { assertEquals } from "@std/assert";
import { Month, NaiveDate, naivedate, Weekday } from "../chrono/mod.ts";

const { Filter } = NaiveDate;
const dayMs = 86_400_000;
type Input = Parameters<NaiveDate.Filter>[0];

function strings(filter: NaiveDate.Filter, input: Input): [string, Input[1]][] {
  return Array.from(filter(input), ([day, unit]) => [String(day), unit]);
}

Deno.test("Yearly weekday expansion agrees with UTC Date through the whole year", () => {
  for (const year of [1900, 1969, 2000, 2024, 2100, 2400]) {
    for (
      const weekdays of [[Weekday.MON, Weekday.FRI], [Weekday.SAT, Weekday.SUN]]
    ) {
      const expected = [];
      const first = Date.UTC(year, 0, 1) / dayMs;
      const end = Date.UTC(year + 1, 0, 1) / dayMs;
      for (let day = first; day < end; day++) {
        if (
          weekdays.some((weekday) =>
            weekday.dow === new Date(day * dayMs).getUTCDay() + 1
          )
        ) {
          expected.push(day);
        }
      }
      const actual = Array.from(
        Filter.byWeekday(weekdays)([naivedate(year, 7, 15), "year"]),
        ([day]) => day.dse,
      );
      assertEquals(actual, expected, String(year));
    }
  }
});

Deno.test("Yearly month selection preserves ordering, units, and the input's day", () => {
  const months = Filter.byMonthOfYear([Month.MAR, Month.FEB, Month.FEB]);
  assertEquals(strings(months, [naivedate(2024, 1, 31), "year"]), [
    ["2024-02-31", "month"],
    ["2024-03-31", "month"],
  ]);
});

Deno.test("Month-day resolution depends on length, including consecutive leap and common months", () => {
  const days = Filter.byDayOfMonth([31, 28, -1, -2, -31, 28]);
  const cases = [
    [naivedate(2024, 2, 1), [-1, 28, 29, 31]],
    [naivedate(2024, 4, 1), [0, 28, 29, 30, 31]],
    [naivedate(2025, 2, 1), [-2, 27, 28, 31]],
    [naivedate(2025, 3, 1), [1, 28, 30, 31]],
    [naivedate(2020, 2, 1), [-1, 28, 29, 31]],
  ] as const;
  for (const [date, expected] of cases) {
    const actual = Array.from(days([date, "month"]), ([day]) => day.day);
    assertEquals<readonly number[]>(actual, expected);
  }
});

Deno.test("Year-day selection clips a week that straddles New Year", () => {
  const days = Filter.byDayOfYear([1, -1, -2]);
  assertEquals(strings(days, [naivedate(2020, 12, 28), "week"]), [
    ["2020-12-30", "day"],
    ["2020-12-31", "day"],
    ["2021-01-01", "day"],
  ]);
});

Deno.test("ISO week selection clips to the caller window and preserves the Google month window", () => {
  const date = naivedate(2021, 1, 1);
  const regular = Filter.byWeekNo(-1);
  const google = Filter.byWeekNoGoogle(-1);
  const january = [["2021-01-01", "day"], ["2021-01-02", "day"], [
    "2021-01-03",
    "day",
  ]];
  assertEquals(strings(regular, [date, "month"]), january);
  assertEquals(strings(regular, [date, "day"]), january.slice(0, 1));
  assertEquals(
    strings(google, [date, "month"]),
    strings(regular, [date, "year"]),
  );
  assertEquals(strings(Filter.byWeekNo(53), [naivedate(2020, 12, 31), "day"]), [
    ["2020-12-31", "day"],
  ]);
});
