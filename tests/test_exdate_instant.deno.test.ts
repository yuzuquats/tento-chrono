/**
 * EXDATE matches an instance, not its day (RFC 5545 §3.8.5.1; operator
 * ruling 2026-10-03). Each value is read in the form it was written
 * (§3.3.5):
 * - UTC (`Z`): the instance at that instant;
 * - floating, or a TZID naming the series' zone: the instance at that wall
 *   time in the series' zone;
 * - a TZID naming another zone: that zone's wall time, as an instant;
 * - `VALUE=DATE` / date-only: every instance on that local day.
 * An EXDATE at another time of an instance's day removes nothing, and an
 * excluded instance still counts toward COUNT (§3.8.5.3).
 */
import { assertEquals } from "@std/assert";
import { NaiveDate } from "../chrono/naive-date.ts";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { Recurrence } from "../chrono/recurrence/recurrence.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Utc } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

async function instants(rules: string[], start: string, zone: string, until = "2026-03-20"): Promise<string[]> {
  const parsed = await ICalendar.Raw.parse(rules);
  if (parsed.isErr) throw new Error(`rules do not parse: ${rules.join(" ")}`);
  const recurr = new Recurrence(parsed.asOk()!);
  const tz = await TimezoneRegion.get(zone as never);
  if (tz == null) throw new Error(`no zone ${zone}`);
  const s = Utc.parse(start);
  if (s == null) throw new Error(`start does not parse: ${start}`);
  const gen = await recurr.generateGoogleEvents(tz.toTz(s), tz);
  return gen.generateUpToDate(NaiveDate.parse(until)).map((d) => d.toString());
}

const START = "2026-03-09T16:00:00Z"; // 09:00 in Los Angeles (PDT)
const LA = "America/Los_Angeles";

Deno.test("EXDATE (UTC) at another time of an instance's day removes nothing", async () => {
  const got = await instants(["RRULE:FREQ=DAILY;COUNT=4", "EXDATE:20260310T170000Z"], START, LA);
  assertEquals(got, ["2026-03-09T16:00:00Z", "2026-03-10T16:00:00Z", "2026-03-11T16:00:00Z", "2026-03-12T16:00:00Z"]);
});

Deno.test("EXDATE (UTC) at an instance's instant removes exactly it, and it still counts toward COUNT", async () => {
  const got = await instants(["RRULE:FREQ=DAILY;COUNT=4", "EXDATE:20260310T160000Z"], START, LA);
  assertEquals(got, ["2026-03-09T16:00:00Z", "2026-03-11T16:00:00Z", "2026-03-12T16:00:00Z"]);
});

Deno.test("EXDATE floating, and TZID of the series zone, match the wall time in that zone", async () => {
  const floating = await instants(["RRULE:FREQ=DAILY;COUNT=3", "EXDATE:20260310T090000"], START, LA);
  assertEquals(floating, ["2026-03-09T16:00:00Z", "2026-03-11T16:00:00Z"]);
  const sameZone = await instants(["RRULE:FREQ=DAILY;COUNT=3", "EXDATE;TZID=America/Los_Angeles:20260310T090000"], START, LA);
  assertEquals(sameZone, ["2026-03-09T16:00:00Z", "2026-03-11T16:00:00Z"]);
  const otherTime = await instants(["RRULE:FREQ=DAILY;COUNT=3", "EXDATE:20260310T100000"], START, LA);
  assertEquals(otherTime.length, 3, "a floating EXDATE at another wall time removes nothing");
});

Deno.test("EXDATE with a TZID of another zone matches that zone's wall time as an instant", async () => {
  // 2026-03-10 16:00Z is 16:00 in London (GMT until 29 March).
  const got = await instants(["RRULE:FREQ=DAILY;COUNT=3", "EXDATE;TZID=Europe/London:20260310T160000"], START, LA);
  assertEquals(got, ["2026-03-09T16:00:00Z", "2026-03-11T16:00:00Z"]);
});

Deno.test("EXDATE;VALUE=DATE removes every instance of that local day, DTSTART's included", async () => {
  const got = await instants(["RRULE:FREQ=DAILY;COUNT=3", "EXDATE;VALUE=DATE:20260309,20260311"], START, LA);
  assertEquals(got, ["2026-03-10T16:00:00Z"]);
});

Deno.test("an EXDATE on DTSTART's day at another time keeps DTSTART", async () => {
  const parsed = await ICalendar.Raw.parse(["RRULE:FREQ=DAILY;COUNT=3", "EXDATE:20260309T200000Z"]);
  const recurr = new Recurrence(parsed.asOk()!);
  const tz = (await TimezoneRegion.get(LA as never))!;
  const gen = await recurr.generateGoogleEvents(tz.toTz(Utc.parse(START)!), tz);
  assertEquals(gen.startDateExcluded, false);
  const exact = await new Recurrence((await ICalendar.Raw.parse(["RRULE:FREQ=DAILY;COUNT=3", "EXDATE:20260309T160000Z"])).asOk()!)
    .generateGoogleEvents(tz.toTz(Utc.parse(START)!), tz);
  assertEquals(exact.startDateExcluded, true);
});
