import { assertEquals } from "@std/assert";
import { DateUnit, NaiveDate } from "../chrono/mod.ts";

Deno.test("unchecked dates can start a range that advances to the first valid date", () => {
  const start = NaiveDate.fromYmd1Unchecked(2023, 2, 29);
  assertEquals(start.isValid(), false);
  const values = start.range(DateUnit.days(1), { limit: 1 });
  assertEquals([...values].map(String), ["2023-03-02"]);
});
