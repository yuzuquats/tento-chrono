/// <reference lib="deno.ns" />

import { assertEquals } from "@std/assert";
import { Weekday } from "../chrono/units/weekday.ts";
import { YearMonthDay, Ymd1Like } from "../chrono/units/year-month-day.ts";
import { DaysSinceEpoch, MsSinceEpoch } from "../chrono/units/units.ts";

function expectedWeekday(dse: number): number {
  return Number(((BigInt(dse) + 4n) % 7n + 7n) % 7n) + 1;
}

Deno.test("weekday/one-based names before and after the epoch", () => {
  const weekdays = [
    Weekday.THU,
    Weekday.FRI,
    Weekday.SAT,
    Weekday.SUN,
    Weekday.MON,
    Weekday.TUE,
    Weekday.WED,
  ];
  for (let dse = -14; dse <= 14; dse++) {
    const expected = weekdays[((dse % 7) + 7) % 7];
    const actual = Weekday.fromDse(dse as DaysSinceEpoch);
    assertEquals(actual, expected.dow, `epoch day ${dse}`);
    assertEquals(Weekday.shortName(actual), expected.shortname);
    assertEquals(Weekday.fullName(actual), Weekday.WEEKDAY_FULL[actual - 1]);
  }
});

Deno.test("weekday/milliseconds preserve Saturday and the epoch", () => {
  for (
    const [mse, expected] of [
      [-604800000, 5],
      [0, 5],
      [172800000, 7],
      [259200000, 1],
    ]
  ) {
    assertEquals(Weekday.fromMse(mse as MsSinceEpoch), expected);
  }
});

Deno.test("weekday/agrees with UTC Date across a Gregorian cycle", () => {
  const start = Date.UTC(1600, 0, 1) / 86400000;
  for (let dse = start; dse < start + 146097; dse++) {
    assertEquals(
      Weekday.fromDse(dse as DaysSinceEpoch),
      new Date(dse * 86400000).getUTCDay() + 1,
      `epoch day ${dse}`,
    );
  }
});

Deno.test("weekday/signed32 and larger-number boundaries", () => {
  for (
    const boundary of [
      -2147483648,
      2147483647,
      -4294967296,
      4294967296,
      -100000000,
      100000000,
      -89434796,
      89522175,
    ]
  ) {
    for (let offset = -32; offset <= 32; offset++) {
      const dse = boundary + offset;
      assertEquals(
        Weekday.fromDse(dse as DaysSinceEpoch),
        expectedWeekday(dse),
      );
    }
  }
  for (const dse of [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]) {
    assertEquals(Weekday.fromDse(dse as DaysSinceEpoch), expectedWeekday(dse));
  }
});

Deno.test("weekday/sampled signed32 inputs", () => {
  let state = 123456789;
  for (let i = 0; i < 100000; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    assertEquals(
      Weekday.fromDse(state as DaysSinceEpoch),
      expectedWeekday(state),
    );
  }
});

Deno.test("weekday/plain date and instance agree on Saturday", () => {
  const ymd = { yr: 1970, mth: 1, day: 3 } as Ymd1Like;
  assertEquals(Ymd1Like.dayOfWeek(ymd), 7);
  assertEquals(YearMonthDay.fromYmd1Exp(1970, 1, 3).dayOfWeek, Weekday.SAT);
});

Deno.test("weekday/reuses cached day counts including epoch zero", () => {
  for (const [day, expected] of [[1, Weekday.THU], [3, Weekday.SAT]] as const) {
    let yearReads = 0;
    const ymd = {
      get yr() {
        yearReads++;
        return 1970;
      },
      mth: 1,
      day,
    } as Ymd1Like;
    const date = new YearMonthDay.Class(ymd);
    assertEquals(date.dse, day - 1);
    const readsAfterDse = yearReads;
    assertEquals(date.dayOfWeek, expected);
    assertEquals(yearReads, readsAfterDse);
    assertEquals(date.dayOfWeek, expected);
    assertEquals(yearReads, readsAfterDse);
  }
});

Deno.test("weekday/caches day count when weekday is read first", () => {
  const date = YearMonthDay.fromYmd1Exp(1970, 1, 1);
  assertEquals(date.dayOfWeek, Weekday.THU);
  assertEquals(date.cached.dse, 0);
});
