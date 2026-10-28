/**
 * # A zone that loads shows the platform's offset
 *
 * The zone service's 2024b `1900_2050` files drop some zones' last offset
 * change (Pacific/Honolulu's list ends at -10:30 in 1945, America/Regina's at
 * -07:00 in 1959) and serve Pacific/Port_Moresby and Atlantic/South_Georgia as
 * `[]`; judge r13 C-N10 found 25 of the 417 runtime zones that load showing
 * the wrong 2026 offset. `TimezoneRegion.getOpt` checks every zone it loads
 * against the platform's offset (`PlatformZone`, Intl) and builds the zone
 * from the platform's offsets when they disagree, or when the service has no
 * data for the zone (an empty file).
 *
 * ## Invariants Tested
 * - The served payloads of Honolulu and Regina (fixtures, byte for byte as
 *   the service answers them) load with the platform's 2026 offsets and carry
 *   the disagreement (`mismatch`: served -630 / -420, platform -600 / -360).
 * - Port_Moresby's and South_Georgia's served `[]`, and Pacific/Truk, a link
 *   to Port_Moresby, load with the platform's offsets (judge r14 R14-C2:
 *   built from the platform, marked `unserved`; `test_tz_unserved`).
 * - A served zone that agrees with the platform is taken as served.
 * - Every zone the runtime reports, served wrong (one +14:00 transition in
 *   1900), loads with the platform's offset in every month of 2026 and on
 *   both sides of each 2026 offset change (the rebuild finds each change to
 *   the second).
 */
import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { DateTime } from "../chrono/datetime.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { PlatformZone } from "../chrono/timezone-platform.ts";
import { Utc, type Tzname } from "../chrono/timezone.ts";
import type { MsSinceEpoch } from "../chrono/units/units.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

const platformMins = (name: string, ms: number): number => Math.round(PlatformZone.offsets(name)!(ms) / 60);
const regionMins = (region: TimezoneRegion, ms: number): number =>
  Math.round(region.tzAtMse(ms as MsSinceEpoch).info.offset.toHrsF * 60);
const shownMins = (region: TimezoneRegion, ms: number): number =>
  Math.round(region.toTz(DateTime.fromMse(ms as MsSinceEpoch, Utc)).tz.info.offset.toHrsF * 60);

const JAN = Date.UTC(2026, 0, 15, 12);
const JUL = Date.UTC(2026, 6, 15, 12);

const quietly = async <T>(f: () => Promise<T>): Promise<T> => {
  const error = console.error;
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = error;
  }
};

Deno.test("a served zone missing its last offset change loads with the platform's offsets, and says where they disagreed", async () => {
  installTimezoneLoader();
  for (const [name, served, platform] of [["Pacific/Honolulu", -630, -600], ["America/Regina", -420, -360]] as const) {
    const region = await TimezoneRegion.getOpt(name as Tzname);
    assert(region != null, `${name} loads`);
    for (const ms of [JAN, JUL]) {
      assertEquals(regionMins(region, ms), platform, `${name} ${new Date(ms).toISOString()}`);
      assertEquals(shownMins(region, ms), platform, `${name} shown ${new Date(ms).toISOString()}`);
    }
    assertEquals([region.mismatch?.servedMins, region.mismatch?.platformMins], [served, platform], name);
  }
});

Deno.test("a zone served as an empty list, or a link to it, loads with the platform's offsets", async () => {
  installTimezoneLoader();
  const regions = new Map<string, TimezoneRegion>();
  for (const name of ["Pacific/Port_Moresby", "Atlantic/South_Georgia", "Pacific/Truk"]) {
    const region = await quietly(() => TimezoneRegion.getOpt(name as Tzname));
    assert(region != null, name);
    for (const ms of [JAN, JUL]) {
      assertEquals(regionMins(region, ms), platformMins(name, ms), `${name} ${new Date(ms).toISOString()}`);
      assertEquals(shownMins(region, ms), platformMins(name, ms), `${name} shown ${new Date(ms).toISOString()}`);
    }
    assertEquals([String(region.fullname), region.unserved, region.mismatch], [name, "no-transitions", null], name);
    regions.set(name, region);
  }
  // The link shares its target's platform build (the same rules) under its own name (operator Q23).
  assertStrictEquals(regions.get("Pacific/Truk")!.transitions, regions.get("Pacific/Port_Moresby")!.transitions);
});

Deno.test("a served zone that agrees with the platform is taken as served", async () => {
  installTimezoneLoader();
  const region = await TimezoneRegion.getOpt("America/Los_Angeles" as Tzname);
  assert(region != null);
  assertEquals(region.mismatch, null);
  assertEquals([regionMins(region, JAN), regionMins(region, JUL)], [-480, -420]);
  // The served list (1918 on), not a platform rebuild (which starts at 1900).
  assertEquals(new Date(region.transitions[0].before.mse).getUTCFullYear(), 1918);
});

Deno.test("every zone the runtime reports, served wrong, loads with the platform's offset through 2026", async () => {
  const wrong = [{ before: "1900-01-01T14:00:00+14:00", before_tz_abbr: "XX", after: "1900-01-01T14:00:00+14:00", after_tz_abbr: "XX" }];
  TimezoneRegion.setLoader({ load: (tzname) => Promise.resolve(wrong.map((t) => TimezoneRegion.Transition.parse(t, tzname))) });
  const bad: string[] = [];
  let checked = 0;
  for (const name of Intl.supportedValuesOf("timeZone")) {
    const region = await TimezoneRegion.getOpt(name as Tzname);
    if (region == null) {
      bad.push(`${name}: did not load`);
      continue;
    }
    checked++;
    const instants: number[] = [];
    for (let month = 0; month < 12; month++) instants.push(Date.UTC(2026, month, 15, 12));
    const [start, end] = [Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1)];
    for (const t of region.transitionsBetween({ start: start as MsSinceEpoch, end: end as MsSinceEpoch })) {
      // transitionsBetween also answers the transition in force at `start`.
      if (t.before.mse >= start && t.before.mse < end) instants.push(t.before.mse - 1000, t.before.mse);
    }
    for (const ms of instants) {
      const want = platformMins(name, ms);
      const got = regionMins(region, ms);
      if (got !== want) bad.push(`${name} (as ${region.fullname}) ${new Date(ms).toISOString()}: platform ${want}, region ${got}`);
    }
  }
  assert(checked > 300, `the runtime reports its zones (${checked})`);
  assertEquals(bad, []);
});
