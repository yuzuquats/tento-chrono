/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert";
import { Month0, Month1 } from "../chrono/units/units.ts";
import { YearMonth } from "../chrono/units/year-month.ts";

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
