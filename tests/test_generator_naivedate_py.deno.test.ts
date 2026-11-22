import { assertEquals } from "@std/assert";
import { DateUnit, NaiveDate } from "../chrono/mod.ts";

Deno.test("unchecked dates can start a range that advances to the first valid date", () => {
  const start = NaiveDate.fromYmd1Unchecked(2023, 2, 29);
  assertEquals(start.isValid(), false);
  const values = start.range(DateUnit.days(1), { limit: 1 });
  assertEquals([...values].map(String), ["2023-03-02"]);
});

Deno.test("date ranges default to one day steps and stop at the default cap", () => {
  const dates = [...NaiveDate.parse("1997-09-02").range()];
  assertEquals(dates.slice(0, 2).map(String), ["1997-09-02", "1997-09-03"]);
  assertEquals(dates.length, 5_000);
});
