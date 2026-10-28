/**
 * BYSETPOS and the time parts through the public generators: the date
 * generator (`Recurrence.generate`) and the instant generator
 * (`generateGoogleEvents`), across a DST change. Plus BYDAY over a month,
 * which used to miss the 31st.
 */
import { assertEquals } from "@std/assert";
import { naivedate } from "../chrono/mod.ts";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { Recurrence } from "../chrono/recurrence/recurrence.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Utc } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

async function recurrence(lines: string[]): Promise<Recurrence> {
  return new Recurrence((await ICalendar.Raw.parse(lines)).exp());
}

Deno.test("MONTHLY;BYDAY includes the 31st", async () => {
  const r = await recurrence(["DTSTART;VALUE=DATE:20260301", "RRULE:FREQ=MONTHLY;BYDAY=TU;COUNT=6"]);
  assertEquals([...r.generate()].map(String), [
    "2026-03-03",
    "2026-03-10",
    "2026-03-17",
    "2026-03-24",
    "2026-03-31",
    "2026-04-07",
  ]);
});

Deno.test("BYSETPOS=-1 over weekdays: the last weekday of each month", async () => {
  const r = await recurrence([
    "DTSTART;VALUE=DATE:20260101",
    "RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=6",
  ]);
  assertEquals([...r.generate()].map(String), [
    "2026-01-30",
    "2026-02-27",
    "2026-03-31",
    "2026-04-30",
    "2026-05-29",
    "2026-06-30",
  ]);
});

Deno.test("BYSETPOS=1,-1: the first and last weekday of each month", async () => {
  const r = await recurrence([
    "DTSTART;VALUE=DATE:20260101",
    "RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1;COUNT=4",
  ]);
  assertEquals([...r.generate()].map(String), ["2026-01-01", "2026-01-30", "2026-02-02", "2026-02-27"]);
});

Deno.test("BYSETPOS counts from the period's start, not DTSTART", async () => {
  // The second Monday of March 2026 is Mar 9; DTSTART after it skips March.
  const r = await recurrence(["DTSTART;VALUE=DATE:20260310", "RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2;COUNT=2"]);
  assertEquals([...r.generate()].map(String), ["2026-04-13", "2026-05-11"]);
});

Deno.test("BYHOUR: two instants a day, at the same wall time across the DST change", async () => {
  const r = await recurrence(["RRULE:FREQ=DAILY;BYHOUR=9,17;COUNT=6"]);
  const la = (await TimezoneRegion.get("America/Los_Angeles" as never))!;
  const start = la.toTz(Utc.parse("2026-03-07T17:00:00Z")!); // Sat 09:00 PST
  const gen = await r.generateGoogleEvents(start, la);
  const got = gen.generateUpToDate(naivedate(2026, 3, 31)).map((d) => String(la.toTz(d)));
  assertEquals(got, [
    "2026-03-07T09:00:00-08:00",
    "2026-03-07T17:00:00-08:00",
    "2026-03-08T09:00:00-07:00",
    "2026-03-08T17:00:00-07:00",
    "2026-03-09T09:00:00-07:00",
    "2026-03-09T17:00:00-07:00",
  ]);
  // The date generator reads the same rule as the days that hold an instance.
  assertEquals([...r.generate(naivedate(2026, 3, 7))].map(String), ["2026-03-07", "2026-03-08", "2026-03-09"]);
});

Deno.test("HOURLY with EXDATE: an excluded instant is removed, the rest stay", async () => {
  const r = await recurrence([
    "RRULE:FREQ=HOURLY;INTERVAL=4;COUNT=4",
    "EXDATE:20260105T130000Z",
  ]);
  const gen = await r.generateGoogleEvents(TimezoneRegion.UTC.toTz(Utc.parse("2026-01-05T09:00:00Z")!), TimezoneRegion.UTC);
  assertEquals(gen.generateUpToDate(naivedate(2026, 1, 6)).map(String), [
    "2026-01-05T09:00:00Z",
    "2026-01-05T17:00:00Z",
    "2026-01-05T21:00:00Z",
  ]);
});
