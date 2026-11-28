/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert";
import { Month0, Month1 } from "../chrono/units/units.ts";
import { YearMonth } from "../chrono/units/year-month.ts";
import { Year } from "../chrono/units/year.ts";

Deno.test({
  name: "ym/add",
  fn() {
    {
      const d = YearMonth.add(
        { yr: 2024, mth: 1 as Month1 },
        { yr: 0, mth: 3 as Month0 },
      );
      assertEquals(d.yr, 2024);
      assertEquals(d.mth, 4);
    }
    {
      const d = YearMonth.add(
        { yr: 2024, mth: 1 as Month1 },
        { yr: 0, mth: 12 as Month0 },
      );
      assertEquals(d.yr, 2025);
      assertEquals(d.mth, 1);
    }
  },
});

Deno.test("ym/add balances signed months around year zero", () => {
  for (const [year, month, delta] of [[0, 1, -2], [0, 1, -12], [-1, 12, 2]]) {
    const expected = new Date(0);
    expected.setUTCFullYear(year, month - 1 + delta, 1);
    assertEquals(
      YearMonth.add({ yr: year, mth: month as Month1 }, {
        mth: delta as Month0,
      }),
      { yr: expected.getUTCFullYear(), mth: expected.getUTCMonth() + 1 },
    );
  }
});

Deno.test("ISO year start matches the January week boundary", () => {
  for (let year = 1800; year < 2200; year++) {
    const actual = Year.isoStartMon(year);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    jan4.setUTCDate(4 - ((jan4.getUTCDay() + 6) % 7));
    assertEquals(
      actual.cached,
      YearMonth.isoStartMon({
        yr: year,
        mth: 1 as Month1,
      }).cached,
    );
    assertEquals(actual.toString(), jan4.toISOString().slice(0, 10));
  }
});
