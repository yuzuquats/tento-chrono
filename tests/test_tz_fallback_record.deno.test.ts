/**
 * # A zone chrono's own reads cannot load is recorded, not silent
 *
 * Judge r14 C-N12 (rest): an iCal line's `TZID` parameter
 * (`ICalDateLine.Raw.resolve`) and a recurrence rule's zone
 * (`Recurrence.timezone`) read their zone through `TimezoneRegion.get`,
 * which answered UTC for a zone that does not load with a `console.error`
 * only. `get` records each fallback (`takeFallbacks`, as `takeRebuilt` hands
 * out each rebuild), for a host to report (the SDK's `ZoneLoad` traces each
 * as `tz/zone-fallback`).
 *
 * ## Invariants Tested
 * - An EXDATE whose TZID does not load is read in UTC, and the fallback
 *   `{requested, used: "UTC"}` is recorded once while it is pending.
 * - A recurrence rule whose TZID does not load answers UTC from
 *   `Recurrence.timezone`, and the fallback is recorded.
 * - A zone that loads records nothing.
 */
import { assert, assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { ICalDateLine } from "../chrono/recurrence/ical-date-line.ts";
import { Recurrence } from "../chrono/recurrence/recurrence.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

// The checked-in 2024b fixtures: a name outside them does not load (and the platform does not know these).
installTimezoneLoader();

const quietly = async <T>(f: () => Promise<T>): Promise<T> => {
  const error = console.error;
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = error;
  }
};
const recorded = () => TimezoneRegion.takeFallbacks().map((f) => [String(f.requested), String(f.used)]);

Deno.test("an EXDATE whose TZID does not load is read in UTC, and the fallback is recorded once while pending", async () => {
  TimezoneRegion.takeFallbacks();
  const raw = ICalDateLine.Raw.parse("EXDATE;TZID=Mars/Olympus:20260613T090000").asOk();
  assert(raw != null);
  const line = await quietly(() => raw.resolve());
  assertEquals(String(line.region?.fullname), "UTC");
  await quietly(() => raw.resolve());
  assertEquals(recorded(), [["Mars/Olympus", "UTC"]]);
  assertEquals(recorded(), [], "handed out once");
});

Deno.test("a recurrence rule whose TZID does not load answers UTC, and the fallback is recorded", async () => {
  const parsed = await quietly(() => Recurrence.parse(["RRULE:FREQ=DAILY;COUNT=3;TZID=Mars/Phobos"]));
  const recurrence = parsed.asOk();
  assert(recurrence != null, String(parsed.asErr()));
  TimezoneRegion.takeFallbacks();
  const zone = await quietly(() => recurrence.timezone());
  assertEquals(String(zone?.fullname), "UTC");
  assertEquals(recorded(), [["Mars/Phobos", "UTC"]]);
});

Deno.test("a TZID that loads records nothing", async () => {
  TimezoneRegion.takeFallbacks();
  const raw = ICalDateLine.Raw.parse("EXDATE;TZID=America/Los_Angeles:20260613T090000").asOk();
  assert(raw != null);
  assertEquals(String((await raw.resolve()).region?.fullname), "America/Los_Angeles");
  assertEquals(recorded(), []);
});
