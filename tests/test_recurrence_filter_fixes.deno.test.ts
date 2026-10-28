/**
 * Date-generator bugs a differential fuzz found (the new instance expander
 * against `Recurrence.generate`), each pinned here:
 * - BYMONTHDAY values were sorted as text (15 before 2), so COUNT could end
 *   on the wrong date, and a negative and a positive value naming the same
 *   day yielded it twice; its week case started a day before the week.
 * - BYYEARDAY under BYMONTH yielded days outside the month (366 in a
 *   365-day year named the next year's Jan 1).
 * - A series ended after 1000 periods however few had matched, so a rule
 *   that rarely matches fell short of COUNT.
 * - BYMONTH on a WEEKLY rule dropped a week that only straddled the month.
 */
import { assertEquals } from "@std/assert";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { Recurrence } from "../chrono/recurrence/recurrence.ts";

async function dates(dtstart: string, rule: string): Promise<string[]> {
  const raw = (await ICalendar.Raw.parse([`DTSTART;VALUE=DATE:${dtstart}`, `RRULE:${rule}`])).exp();
  return [...new Recurrence(raw).generate()].map(String);
}

Deno.test("BYMONTHDAY values come out in date order, so COUNT ends on the right date", async () => {
  assertEquals(await dates("20040626", "FREQ=MONTHLY;COUNT=5;BYMONTHDAY=15,2"), [
    "2004-07-02",
    "2004-07-15",
    "2004-08-02",
    "2004-08-15",
    "2004-09-02",
  ]);
});

Deno.test("BYMONTHDAY values naming the same day yield it once", async () => {
  // -2 and 30 are both Aug 30 (a 31-day month); in September -2 is the 29th.
  assertEquals(await dates("20230801", "FREQ=MONTHLY;COUNT=4;BYMONTHDAY=-2,30"), [
    "2023-08-30",
    "2023-09-29",
    "2023-09-30",
    "2023-10-30",
  ]);
});

Deno.test("BYYEARDAY under BYMONTH stays in the month", async () => {
  assertEquals(await dates("20210205", "FREQ=YEARLY;COUNT=4;BYMONTH=1;BYYEARDAY=1,-100,366"), [
    "2022-01-01",
    "2023-01-01",
    "2024-01-01",
    "2025-01-01",
  ]);
  // 366 names Dec 31 in a leap year and nothing in another.
  assertEquals(await dates("20230101", "FREQ=YEARLY;COUNT=2;BYYEARDAY=366"), ["2024-12-31", "2028-12-31"]);
});

Deno.test("a rule that rarely matches still reaches its COUNT", async () => {
  const got = await dates("20160515", "FREQ=DAILY;COUNT=20;INTERVAL=3;BYMONTH=7;BYMONTHDAY=1");
  assertEquals(got.length, 20);
  // Every 3 days from 2016-05-15 lands on July 1 once every four years (1461 = 3 × 487).
  assertEquals(got.slice(0, 3), ["2018-07-01", "2022-07-01", "2026-07-01"]);
});

Deno.test("a rule that never matches ends", async () => {
  assertEquals(await dates("20240101", "FREQ=DAILY;COUNT=3;BYMONTH=2;BYMONTHDAY=30"), []);
});

Deno.test("WEEKLY with BYMONTH keeps the days of a week that straddles the month", async () => {
  // The week from Tue Dec 30, 1997 holds Jan 5, 1998.
  assertEquals(await dates("19970902", "FREQ=WEEKLY;COUNT=3;BYMONTH=1,3;BYMONTHDAY=5,7"), [
    "1998-01-05",
    "1998-01-07",
    "1998-03-05",
  ]);
  // Without a day part the instance is the week's own day, held to the month.
  assertEquals(await dates("19970902", "FREQ=WEEKLY;COUNT=3;BYMONTH=1,3"), ["1998-01-06", "1998-01-13", "1998-01-20"]);
});

Deno.test("an infinite rule still stops at the generator's 1000 instances", async () => {
  const raw = (await ICalendar.Raw.parse(["DTSTART;VALUE=DATE:20260101", "RRULE:FREQ=DAILY"])).exp();
  assertEquals([...new Recurrence(raw).generate()].length, 1000);
});
