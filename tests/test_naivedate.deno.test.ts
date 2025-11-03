/// <reference lib="deno.ns" />

import { assert, assertEquals } from "@std/assert";
import { naivedate } from "../chrono/mod.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { Weekday } from "../chrono/units/weekday.ts";

Deno.test({
  name: "nt/add",
  fn() {
    const date = NaiveDate.fromYmd1(2024, 11, 22).exp();
    assertEquals(date.toString(), "2024-11-22");
    assertEquals(date.add({ mths: 1 }).toString(), "2024-12-22");
    assertEquals(date.add({ days: 7 }).toString(), "2024-11-29");
    {
      assertEquals(
        naivedate(2024, 11, 30).add({ days: 0 }).toString(),
        "2024-11-30",
      );
      assertEquals(
        naivedate(2024, 11, 30).add({ days: 1 }).toString(),
        "2024-12-01",
      );
    }
    {
      assertEquals(naivedate(2024, 12, 1).addWeeks(1).toString(), "2024-12-08");
    }

    {
      const d = date.addOpt({ mths: 3, days: 7 });
      assertEquals(d.toString(), "2025-03-01");
      assert(d.isValid());
    }
  },
});

Deno.test({
  name: "add-invalid",
  /**
   * Adding years or months to a day *may* result in an invalid date.
   * These calls can still succeed and callers may decide to fix it to a valid
   * date or discard it.
   */
  fn() {
    const date = NaiveDate.fromYmd1(2024, 1, 30).exp();
    assertEquals(date.addOpt({ mths: 1 }).toString(), "2024-02-30");
    assert(!date.addOpt({ mths: 1 }).isValid());
    assertEquals(date.addOpt({ mths: 2 }).toString(), "2024-03-30");
    assert(date.addOpt({ mths: 2 }).isValid());
    assertEquals(date.addOpt({ mths: 3 }).toString(), "2024-04-30");
    assert(date.addOpt({ mths: 3 }).isValid());
    assertEquals(date.addOpt({ mths: 4 }).toString(), "2024-05-30");
    assert(date.addOpt({ mths: 4 }).isValid());
  },
});

Deno.test({
  name: "add-negative",
  fn() {
    const date = NaiveDate.fromYmd1(2024, 1, 30).exp();
    assertEquals(date.addOpt({ mths: -1 }).toString(), "2023-12-30");
    assert(date.addOpt({ mths: -1 }).isValid());
    assertEquals(date.addOpt({ days: -30 }).toString(), "2023-12-31");
    assertEquals(
      // 2024-01-30 .diff( 2023-12-31 ) = 30
      date.differenceInDays(date.addOpt({ days: -30 }).assertValid()),
      30,
    );
  },
});

Deno.test({
  name: "add 300+ days",
  fn() {
    const ndd = naivedate(1997, 1, 1);
    assertEquals(ndd.addDays(358).toString(), "1997-12-25");
  },
});

Deno.test({
  name: "nd/to-start-of-week",
  fn() {
    {
      const date = naivedate(2024, 12, 3).toStartOfWeekSun();
      assertEquals(date.toString(), "2024-12-01");
      assertEquals(date.dayOfWeek, Weekday.SUN);
    }
    {
      const date = naivedate(2024, 11, 24).toStartOfWeekSun();
      assertEquals(date.toString(), "2024-11-24");
      assertEquals(date.dayOfWeek, Weekday.SUN);
    }
  },
});

Deno.test({
  name: "nd/cmp-invalid",
  fn() {
    assertEquals(
      NaiveDate.fromYmd1Unchecked(2025, 10, 4).cmpInvalid(
        NaiveDate.fromYmd1Unchecked(2024, 10, 4),
      ),
      1,
    );
  },
});
