import { assert, assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";

/**
 * A merged city keeps its own name whatever was asked before it in the process (review G B1). With no served data,
 * asking a same-zone link first (CET -> Europe/Brussels) builds and caches Europe/Brussels; a later Europe/Amsterdam,
 * whose TIMEZONE_LINKS target is also Europe/Brussels but which the platform keeps as a zone of its own, must not be
 * handed that cached build. Its own file, so these names are the first this process asks.
 */
TimezoneRegion.setLoader({ load: (tz) => Promise.reject(new TimezoneRegion.Unserved(tz, "not-found")) });

Deno.test("unserved: a merged city asked after a same-zone link to its target keeps its own name", async () => {
  for (const [first, city] of [
    ["CET", "Europe/Amsterdam"],
    ["MET", "Europe/Luxembourg"],
    ["GB", "Europe/Jersey"],
    ["Canada/Eastern", "America/Nassau"],
  ]) {
    assert((await TimezoneRegion.getOpt(first as Tzname)) != null, `${first} did not build`);
    const region = await TimezoneRegion.getOpt(city as Tzname);
    assert(region != null, `${city} did not build`);
    assertEquals<string>(region.fullname, city, `${first} then ${city}`);
  }
});
