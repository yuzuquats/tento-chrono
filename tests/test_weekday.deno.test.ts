import { assertEquals } from "@std/assert";

import { naivedate } from "../chrono/mod.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { PartialDate } from "../chrono/units/partial-date.ts";
import { WeekOfYear1, WeeksSinceEpoch1 } from "../chrono/units/units.ts";
import { Week, yw1 } from "../chrono/units/week.ts";
import { Weekday } from "../chrono/units/weekday.ts";
import { Year } from "../chrono/units/year.ts";

Deno.test("week/numWeeks", () => {
  assertEquals(Year.numWeeks(1970), 53);
  assertEquals(Year.numWeeks(1971), 52);
  assertEquals(Year.numWeeks(2019), 52);
  assertEquals(Year.numWeeks(2020), 53);
  assertEquals(Year.numWeeks(2025), 52);
});

Deno.test("week/isoWno/1998", () => {
  assertEquals(naivedate(1997, 12, 29).isoWno, 1);
  assertEquals(naivedate(1998, 1, 4).isoWno, 1);
  assertEquals(naivedate(1998, 1, 5).isoWno, 2);
  assertEquals(naivedate(1998, 1, 6).isoWno, 2);
  assertEquals(naivedate(1998, 1, 12).isoWno, 3);
  assertEquals(naivedate(1998, 1, 13).isoWno, 3);
});

Deno.test("week/isoWno", () => {
  assertEquals(naivedate(2024, 1, 4).dayOfWeek.dow, 5);

  assertEquals(naivedate(2024, 12, 23).isoWno, 52);
  assertEquals(naivedate(2024, 12, 29).isoWno, 52);
  assertEquals(
    PartialDate.fromWeek(2024, 52).start.rfc3339(),
    naivedate(2024, 12, 23).rfc3339(),
  );

  assertEquals(naivedate(2024, 12, 30).isoWno, 1);
  assertEquals(naivedate(2025, 1, 5).isoWno, 1);
  assertEquals(
    PartialDate.fromWeek(2025, 1).start.rfc3339(),
    naivedate(2024, 12, 30).rfc3339(),
  );

  assertEquals(naivedate(2025, 1, 6).isoWno, 2);
  assertEquals(naivedate(2025, 1, 12).isoWno, 2);
  assertEquals(
    PartialDate.fromWeek(2025, 2).start.rfc3339(),
    naivedate(2025, 1, 6).rfc3339(),
  );

  assertEquals(naivedate(2025, 2, 3).isoWno, 6);
  assertEquals(naivedate(2025, 2, 9).isoWno, 6);
  assertEquals(
    PartialDate.fromWeek(2025, 6).start.rfc3339(),
    naivedate(2025, 2, 3).rfc3339(),
  );

  assertEquals(naivedate(2025, 2, 10).isoWno, 7);
  assertEquals(naivedate(2025, 2, 16).isoWno, 7);
  assertEquals(
    PartialDate.fromWeek(2025, 7).start.rfc3339(),
    naivedate(2025, 2, 10).rfc3339(),
  );

  assertEquals(naivedate(2025, 12, 22).isoWno, 52);
  assertEquals(naivedate(2025, 12, 28).isoWno, 52);
  assertEquals(
    PartialDate.fromWeek(2025, 52).start.rfc3339(),
    naivedate(2025, 12, 22).rfc3339(),
  );

  assertEquals(naivedate(2025, 12, 29).isoWno, 1);
  assertEquals(naivedate(2026, 1, 4).isoWno, 1);
  assertEquals(
    PartialDate.fromWeek(2026, 1).start.rfc3339(),
    naivedate(2025, 12, 29).rfc3339(),
  );

  assertEquals(naivedate(2026, 1, 5).isoWno, 2);
  assertEquals(naivedate(2026, 1, 11).isoWno, 2);
  assertEquals(
    PartialDate.fromWeek(2026, 2).start.rfc3339(),
    naivedate(2026, 1, 5).rfc3339(),
  );
});

Deno.test("week/partial", () => {
  {
    const p = PartialDate.fromWeek(2026, 1);
    {
      const n = p.add(1);
      assertEquals(n.yr, 2026);
      assertEquals(n.wno, 2);
      assertEquals(n.start.rfc3339(), naivedate(2026, 1, 5).rfc3339());
    }
    {
      const n = p.add(10);
      assertEquals(n.yr, 2026);
      assertEquals(n.wno, 11);
      assertEquals(n.start.rfc3339(), naivedate(2026, 3, 9).rfc3339());
    }
    {
      const n = p.add(52);
      assertEquals(n.yr, 2026);
      assertEquals(n.wno, 53);
      assertEquals(n.start.rfc3339(), naivedate(2026, 12, 28).rfc3339());
    }
    {
      const n = p.add(53);
      assertEquals(n.yr, 2027);
      assertEquals(n.wno, 1);
      assertEquals(n.start.rfc3339(), naivedate(2027, 1, 4).rfc3339());
    }
  }
});

Deno.test("week/add+subtract/basic", () => {
  {
    assertEquals(
      Week.sub(
        // 2022-12-12 -> 2022-12-18
        { yr: 2022, wno: 50 as WeekOfYear1 },
        // 2022-12-12 -> 2022-12-18
        { yr: 2023, wno: 2 as WeekOfYear1 },
      ),
      4,
    );
    const p = PartialDate.fromWeek(2022, 50);
    const n = p.add(4);
    assertEquals(n.yr, 2023);
    assertEquals(n.wno, 2);
  }

  assertEquals(
    Week.sub(
      { yr: 2019, wno: 1 as WeekOfYear1 },
      { yr: 2021, wno: 1 as WeekOfYear1 },
    ),
    105,
  );
});

Deno.test("week/add", () => {
  assertEquals(Week.add({ yr: 2023, wno: 1 as WeekOfYear1 }, 5), {
    yr: 2023,
    wno: 6 as WeekOfYear1,
  });

  assertEquals(Week.add({ yr: 2023, wno: 50 as WeekOfYear1 }, 5), {
    yr: 2024,
    wno: 3 as WeekOfYear1,
  });

  assertEquals(Week.add({ yr: 2023, wno: 1 as WeekOfYear1 }, -5), {
    yr: 2022,
    wno: 48 as WeekOfYear1,
  });

  assertEquals(Week.add({ yr: 2023, wno: 1 as WeekOfYear1 }, 55), {
    yr: 2024,
    wno: 4 as WeekOfYear1,
  });
});

Deno.test("week/sub", () => {
  assertEquals(
    Week.sub(
      { yr: 2023, wno: 1 as WeekOfYear1 },
      { yr: 2023, wno: 10 as WeekOfYear1 },
    ),
    9,
  );

  assertEquals(
    Week.sub(
      { yr: 2023, wno: 10 as WeekOfYear1 },
      { yr: 2023, wno: 1 as WeekOfYear1 },
    ),
    -9,
  );
});

Deno.test("week/from-epoch/add-weeks-by-1", () => {
  let date = NaiveDate.fromYmd1Exp(1970, 1, 1);
  date = date.toStartOfWeekMon();
  assertEquals(date.dayOfWeek, Weekday.MON);
  assertEquals(date.toString(), "1969-12-29");

  let dw = PartialDate.fromYw1(date.isoYw1);
  assertEquals(dw.yr, 1970);
  assertEquals(dw.wno, 1);

  let wse = date.wse;
  assertEquals(wse, 1);

  const stop = naivedate(2026, 1, 1);
  for (let i = 0; i < 10_000; ++i) {
    if (!date.isBefore(stop)) break;
    assertEquals(date.isoWno, dw.wno);
    assertEquals(date.isoYear, dw.yr);
    assertEquals(date.wse, wse);
    assertEquals(dw.start.rfc3339(), date.rfc3339());
    assertEquals(dw.start.wse, wse);

    date = date.addWeeks(1).assertValid();
    dw = dw.add(1);
    wse = (wse + 1) as WeeksSinceEpoch1;
  }
});

Deno.test("week/from-epoch/Week.weeksSinceEpoch", () => {
  // Start from epoch
  let date = NaiveDate.fromYmd1Exp(1970, 1, 1);
  let prevWeeks = Week.weeksSinceEpoch(date.isoYw1);
  const stop = naivedate(2026, 1, 1);

  for (let i = 0; i < 10_000; ++i) {
    if (!date.isBefore(stop)) break;
    const nextDate = date.addWeeks(1).assertValid();
    const currentWeeks = Week.weeksSinceEpoch(nextDate.isoYw1);
    assertEquals(currentWeeks, prevWeeks + 1);
    date = nextDate.assertValid();
    prevWeeks = currentWeeks;
  }
});

Deno.test("week/Week.weeksSinceEpoch", () => {
  assertEquals(Week.weeksSinceEpoch(yw1(1969, 52)), 0);
  assertEquals(Week.weeksSinceEpoch(yw1(1970, 0)), 0);

  assertEquals(Week.weeksSinceEpoch(yw1(1970, 1)), 1);
  assertEquals(Week.weeksSinceEpoch(yw1(1970, 2)), 2);

  const numWeeks1970 = Year.numWeeks(1970) as WeekOfYear1;
  assertEquals(numWeeks1970, 53);

  assertEquals(Week.weeksSinceEpoch(yw1(1970, 52)), 52);
  assertEquals(Week.weeksSinceEpoch(yw1(1970, 53)), 53);
  assertEquals(Week.weeksSinceEpoch(yw1(1971, 0)), 53);
  assertEquals(Week.weeksSinceEpoch(yw1(1971, 1)), 54);

  assertEquals(Week.weeksSinceEpoch(yw1(2019, 1)), 2558);
  assertEquals(Week.weeksSinceEpoch(yw1(2020, 1)), 2610);
  assertEquals(Week.weeksSinceEpoch(yw1(2021, 1)), 2663);
});

Deno.test("week/Week.dateFromWeekno", () => {
  // Test first week of 2023 (Monday)
  assertEquals(
    Week.dateFromWeekno(yw1(2023, 1), Weekday.MON).toString(),
    NaiveDate.fromYmd1Exp(2023, 1, 2).toString(),
  );

  // Test first week of 2023 (Sunday)
  assertEquals(
    Week.dateFromWeekno(yw1(2023, 1), Weekday.SUN).toString(),
    NaiveDate.fromYmd1Exp(2023, 1, 8).toString(),
  );

  // Test week 52 of 2023
  assertEquals(
    Week.dateFromWeekno(yw1(2023, 52), Weekday.MON).toString(),
    NaiveDate.fromYmd1Exp(2023, 12, 25).toString(),
  );

  // Test default weekday (Monday)
  assertEquals(
    Week.dateFromWeekno(yw1(2023, 1), Weekday.MON).toString(),
    NaiveDate.fromYmd1Exp(2023, 1, 2).toString(),
  );

  // Test first week of 2024
  assertEquals(
    Week.dateFromWeekno(yw1(2024, 1), Weekday.MON).toString(),
    NaiveDate.fromYmd1Exp(2024, 1, 1).toString(),
  );
});
