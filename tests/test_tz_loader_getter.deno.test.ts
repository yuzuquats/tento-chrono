/**
 * # A caller that swaps the zone loader can put back the one it found
 *
 * tui-to-sdk-48 ask 3 (judge tui r13 R13-6b, r14): `TimezoneRegion` had
 * `setLoader` but no way to read the installed loader, so a scoped helper
 * (the TUI's `withZoneLoader`, cli/testing/zone-loader.ts) could only
 * restore `DYNAMIC_LOADER` afterwards, clobbering a loader its caller had
 * installed (a test's fixture loader). `getLoader()` answers the installed
 * loader.
 *
 * ## Invariants Tested
 * - `getLoader()` answers the loader `setLoader` installed.
 * - A scope that reads the loader before installing its own puts back that
 *   loader, not `DYNAMIC_LOADER`, and zones load through it again.
 */
import { assertEquals, assertStrictEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";

/** A loader that answers no zone and counts what it was asked. */
function counting(): TimezoneRegion.Loader & { asked: string[] } {
  const asked: string[] = [];
  return { asked, load: (tz) => (asked.push(String(tz)), Promise.reject(new Error("counting loader: no data"))) };
}

/** Run `work` with `loader` installed, then put back the loader found (the helper the TUI wants). */
async function withLoader<T>(loader: TimezoneRegion.Loader, work: () => Promise<T>): Promise<T> {
  const found = TimezoneRegion.getLoader();
  TimezoneRegion.setLoader(loader);
  try {
    return await work();
  } finally {
    TimezoneRegion.setLoader(found);
  }
}

Deno.test("getLoader answers the loader setLoader installed", () => {
  const before = TimezoneRegion.getLoader();
  const mine = counting();
  try {
    TimezoneRegion.setLoader(mine);
    assertStrictEquals(TimezoneRegion.getLoader(), mine);
  } finally {
    TimezoneRegion.setLoader(before);
  }
  assertStrictEquals(TimezoneRegion.getLoader(), before);
});

Deno.test("a scope puts back the loader it found, not DYNAMIC_LOADER", async () => {
  const before = TimezoneRegion.getLoader();
  const outer = counting();
  const inner = counting();
  TimezoneRegion.setLoader(outer);
  try {
    await withLoader(inner, () => TimezoneRegion.getOpt("Mars/Inner_Scope" as Tzname));
    assertStrictEquals(TimezoneRegion.getLoader(), outer, "the caller's loader is back");
    await TimezoneRegion.getOpt("Mars/Outer_Scope" as Tzname);
    assertEquals([inner.asked, outer.asked], [["Mars/Inner_Scope"], ["Mars/Outer_Scope"]]);
  } finally {
    TimezoneRegion.setLoader(before);
  }
});
