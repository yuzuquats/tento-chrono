import { assertEquals } from "@std/assert";
import {
  DateTime,
  MsSinceEpoch,
  NaiveDate,
  NaiveDateTime,
  Utc,
} from "../../chrono/mod.ts";
import { random32 } from "./random.deno.ts";

const dayMs = 86_400_000;

function utcDate(year: number, month0: number, day: number): Date {
  // Date.UTC interprets years 0 to 99 as 1900 to 1999.
  const date = new Date(0);
  date.setUTCFullYear(year, month0, day);
  return date;
}

Deno.test("epoch conversion and calendar arithmetic agree with UTC Date", () => {
  const seed = 0x6c1b;
  const next = random32(seed);
  for (let i = 0; i < 8192; i++) {
    const year = 4 + next(9990);
    const month0 = next(12);
    const endOfMonth = utcDate(year, month0 + 1, 0).getUTCDate();
    const day = i % 2 === 0 ? endOfMonth - next(3) : 1 + next(endOfMonth);
    const dayStart = utcDate(year, month0, day);
    const time = i % 4 === 0 ? 0 : i % 4 === 1 ? dayMs - 1 : next(dayMs);
    const epoch = dayStart.getTime() + time;
    const platform = new Date(epoch);
    const context = `seed=${seed} case=${i} epoch=${epoch}`;

    const date = NaiveDate.fromYmd1(year, month0 + 1, day).exp();
    const naive = NaiveDateTime.fromMse(MsSinceEpoch.of(epoch));
    const utc = DateTime.fromMse(MsSinceEpoch.of(epoch), Utc);
    assertEquals(date.dse, dayStart.getTime() / dayMs, context);
    assertEquals(date.toString(), platform.toISOString().slice(0, 10), context);
    assertEquals(naive.date.toString(), date.toString(), context);
    assertEquals(naive.time.toMs, time, context);
    assertEquals(naive.mse, epoch, context);
    assertEquals(
      DateTime.fromRfc3339(platform.toISOString()).exp().mse,
      epoch,
      context,
    );
    assertEquals(
      new Date(utc.mse).toISOString(),
      platform.toISOString(),
      context,
    );

    const delta = {
      yrs: next(3) - 1,
      mths: next(49) - 24,
      days: next(15) - 7,
      ms: next(2 * dayMs) - dayMs,
    };
    const sign = i % 2 === 0 ? 1 : -1;
    const monthStart = utcDate(
      year + sign * delta.yrs,
      month0 + sign * delta.mths,
      1,
    );
    const lastDay = utcDate(
      monthStart.getUTCFullYear(),
      monthStart.getUTCMonth() + 1,
      0,
    ).getUTCDate();
    monthStart.setUTCDate(Math.min(day, lastDay) + sign * delta.days);
    const expected = monthStart.getTime() + time + sign * delta.ms;
    const actual = sign === 1 ? naive.add(delta) : naive.sub(delta);
    assertEquals(
      actual.mse,
      expected,
      `${context} sign=${sign} delta=${JSON.stringify(delta)}`,
    );
  }
});
