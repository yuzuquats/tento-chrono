import { assert, assertEquals } from "@std/assert";
import { naivedatetime } from "../chrono/mod.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";

/**
 * A merged city that shares its platform-built link target's rules keeps the asked name on a transition day too
 * (review I I-4, operator Q23). Europe/Amsterdam asked after Europe/Brussels reuses Brussels' transitions; toWallClock
 * on a DST day returned the shared Transition's own timezone, named Europe/Brussels, while every other day and
 * tzAtMse/toTz said Europe/Amsterdam. Its own file, so these names are the first this process asks.
 * The cases reach all six transition-day returns: spring before, gap and after; autumn before, overlap and after.
 */
TimezoneRegion.setLoader({
  load: (tz) =>
    Promise.reject(new TimezoneRegion.Unserved(tz, String(tz) === "Europe/Brussels" ? "no-transitions" : "not-found")),
});

Deno.test("toWallClock: a merged city sharing its target's rules keeps the asked name on transition days and after", async () => {
  const built = await TimezoneRegion.getOpt("Europe/Brussels" as Tzname);
  assert(built != null, "Europe/Brussels did not build");
  const region = await TimezoneRegion.getOpt("Europe/Amsterdam" as Tzname);
  assert(region != null, "Europe/Amsterdam did not load");
  assertEquals<string>(region.fullname, "Europe/Amsterdam");

  const cases: [string, ReturnType<typeof naivedatetime>, string][] = [
    ["2026-03-29 01:00, before the switch", naivedatetime(2026, 3, 29, 1), "+01:00"],
    ["2026-03-29 12:00, after the switch", naivedatetime(2026, 3, 29, 12), "+02:00"],
    ["2026-03-29 02:30, in the spring gap", naivedatetime(2026, 3, 29, 2, 30), "+02:00"],
    ["2026-03-30 12:00, the day after", naivedatetime(2026, 3, 30, 12), "+02:00"],
    ["2026-10-25 01:00, before the autumn switch", naivedatetime(2026, 10, 25, 1), "+02:00"],
    ["2026-10-25 02:30, in the autumn overlap (the later offset)", naivedatetime(2026, 10, 25, 2, 30), "+01:00"],
    ["2026-10-25 12:00, the autumn transition day", naivedatetime(2026, 10, 25, 12), "+01:00"],
  ];
  for (const [label, ndt, offset] of cases) {
    const dt = region.toWallClock(ndt);
    assertEquals(dt.tz.info.tzname, "Europe/Amsterdam", `${label}: tzname`);
    assertEquals(dt.tz.info.offset.asSignedHm(), offset, `${label}: offset`);
    assertEquals(dt.tz.info.tzname, region.tzAtMse(dt.mse).info.tzname, `${label}: same name as tzAtMse`);
  }
  // The target keeps its own name on its own transition day.
  assertEquals(built.toWallClock(naivedatetime(2026, 3, 29, 12)).tz.info.tzname, "Europe/Brussels");
});
