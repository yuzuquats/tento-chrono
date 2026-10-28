/**
 * `shiftRecurrenceLines`: when a recurring master moves, its EXDATE and
 * RDATE values move with it, each in the form it was written. EXDATE is
 * matched per instance, so a value left behind would bring a deleted
 * occurrence back (round-4 judge R4-3).
 */
import { assertEquals } from "@std/assert";
import { NaiveDate } from "../chrono/naive-date.ts";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { Recurrence, shiftRecurrenceLines } from "../chrono/recurrence/recurrence.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Utc } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

const HOUR = 3_600_000;
const la = async () => (await TimezoneRegion.get("America/Los_Angeles" as never))!;
const london = async () => (await TimezoneRegion.get("Europe/London" as never))!;
const regionOf = (tz: string) => TimezoneRegion.getLoaded(tz as never);

Deno.test("each value moves in its own form: floating and same-zone TZID by wall time, UTC and other-zone TZID as instances, DATE by days", async () => {
  const zone = await la();
  await london();
  const lines = [
    "RRULE:FREQ=DAILY",
    "EXDATE:20260310T090000",
    "EXDATE;TZID=America/Los_Angeles:20260311T090000",
    "EXDATE:20260312T160000Z",
    "EXDATE;TZID=Europe/London:20260313T160000",
    "EXDATE;VALUE=DATE:20260314",
    "RDATE;VALUE=PERIOD:20260320T160000Z/PT1H",
  ];
  assertEquals(shiftRecurrenceLines(lines, { days: 0, wallMs: HOUR, toAllDay: false }, zone, regionOf), [
    "RRULE:FREQ=DAILY",
    "EXDATE:20260310T100000",
    "EXDATE;TZID=America/Los_Angeles:20260311T100000",
    "EXDATE:20260312T170000Z",
    "EXDATE;TZID=Europe/London:20260313T170000",
    "EXDATE;VALUE=DATE:20260314",
    "RDATE;VALUE=PERIOD:20260320T170000Z/PT1H",
  ]);
  assertEquals(shiftRecurrenceLines(["EXDATE;VALUE=DATE:20260314"], { days: 2, wallMs: 2 * 24 * HOUR, toAllDay: false }, zone, regionOf),
    ["EXDATE;VALUE=DATE:20260316"]);
});

Deno.test("a master turning all-day: its timed EXDATEs become the DATEs of their moved instances", async () => {
  const zone = await la();
  assertEquals(
    shiftRecurrenceLines(["RRULE:FREQ=DAILY", "EXDATE:20260310T090000,20260311T090000"], { days: 0, wallMs: 0, toAllDay: true }, zone, regionOf),
    ["RRULE:FREQ=DAILY", "EXDATE;VALUE=DATE:20260310,20260311"],
  );
});

Deno.test("a master turning all-day: a timed PERIOD RDATE becomes the DATE of its moved start, either end form", async () => {
  // VALUE=DATE takes DATE values only (RFC 5545 §3.8.5.2: a period needs VALUE=PERIOD and a DATE-TIME start), so
  // the all-day occurrence is its date: `20260320/PT1H` or `20260320/20260320` on a DATE line is not one.
  const zone = await la();
  for (const period of ["20260320T100000Z/PT1H", "20260320T100000Z/20260320T110000Z"]) {
    assertEquals(
      shiftRecurrenceLines(["RRULE:FREQ=DAILY", `RDATE;VALUE=PERIOD:${period}`], { days: 0, wallMs: 0, toAllDay: true }, zone, regionOf),
      ["RRULE:FREQ=DAILY", "RDATE;VALUE=DATE:20260320"],
      period,
    );
  }
});

Deno.test("a deleted occurrence stays deleted when the whole series moves by an hour", async () => {
  const zone = await la();
  const lines = ["RRULE:FREQ=DAILY;COUNT=4", "EXDATE:20260310T090000"]; // 09:00 PDT on the 10th deleted
  const expand = async (rules: string[], start: string) => {
    const recurr = new Recurrence((await ICalendar.Raw.parse(rules)).asOk()!);
    const gen = await recurr.generateGoogleEvents(zone.toTz(Utc.parse(start)!), zone);
    return gen.generateUpToDate(NaiveDate.parse("2026-03-20")).map((d) => d.mse);
  };
  const ms = (xs: string[]) => xs.map((x) => Utc.parse(x)!.mse);
  assertEquals(await expand(lines, "2026-03-09T16:00:00Z"),
    ms(["2026-03-09T16:00:00Z", "2026-03-11T16:00:00Z", "2026-03-12T16:00:00Z"]));
  const moved = shiftRecurrenceLines(lines, { days: 0, wallMs: HOUR, toAllDay: false }, zone, regionOf);
  assertEquals(await expand(moved, "2026-03-09T17:00:00Z"),
    ms(["2026-03-09T17:00:00Z", "2026-03-11T17:00:00Z", "2026-03-12T17:00:00Z"]), "the 10th stays deleted");
  assertEquals((await expand(lines, "2026-03-09T17:00:00Z")).length, 4, "unshifted, the deleted occurrence comes back");
});
