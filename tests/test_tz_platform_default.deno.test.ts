/**
 * The default zone loader is `PLATFORM_LOADER`: zones build from the
 * platform's own timezone data (Intl) with no network, served as loaded
 * (not `unserved`), and a name the platform does not know does not load.
 */
import { assert, assertEquals } from "@std/assert";
import { naivedatetime } from "../chrono/mod.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";

Deno.test("the default loader builds zones from the platform, with no fetch", async () => {
  assert(TimezoneRegion.getLoader() === TimezoneRegion.PLATFORM_LOADER);
  const real = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = () => {
    fetches++;
    return Promise.reject(new TypeError("no network in this test"));
  };
  try {
    const ny = await TimezoneRegion.getOpt("America/New_York" as Tzname);
    assert(ny != null);
    assertEquals(ny.unserved, null);
    assertEquals(ny.mismatch, null);
    assertEquals(ny.datetime(naivedatetime(2024, 1, 15, 9)).asWallClock().toString(), "2024-01-15T09:00:00-05:00");
    assertEquals(ny.datetime(naivedatetime(2024, 7, 15, 9)).asWallClock().toString(), "2024-07-15T09:00:00-04:00");
    assertEquals(await TimezoneRegion.getOpt("Mars/Olympus" as Tzname), null);
    assertEquals(fetches, 0);
  } finally {
    globalThis.fetch = real;
  }
});
