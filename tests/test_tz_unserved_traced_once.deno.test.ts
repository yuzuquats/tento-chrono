import { assert, assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";

/**
 * A zone built from the platform for want of served data is reported once (`takeRebuilt`, the SDK's one
 * `zone/unserved` trace line), whichever of its names asked first (review G2 N1). Asking CET builds Europe/Brussels
 * (a same-zone link) and caches it under CET only; a later Europe/Brussels in the same process took a second build
 * and a second report. Its own file, so these names are the first this process asks.
 */
TimezoneRegion.setLoader({ load: (tz) => Promise.reject(new TimezoneRegion.Unserved(tz, "not-found")) });

Deno.test("unserved: a same-zone link, then its target, is one build and one report (CET, Europe/Brussels)", async () => {
  TimezoneRegion.takeRebuilt();
  const link = await TimezoneRegion.getOpt("CET" as Tzname);
  assert(link != null, "CET did not build");
  const target = await TimezoneRegion.getOpt("Europe/Brussels" as Tzname);
  assert(target != null, "Europe/Brussels did not build");
  assertEquals<string>(target.fullname, "Europe/Brussels");
  assertEquals(
    TimezoneRegion.takeRebuilt().map((r) => [String(r.fullname), r.unserved]),
    [["Europe/Brussels", "not-found"]],
    "reported once",
  );
});
