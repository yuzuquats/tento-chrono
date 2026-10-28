/**
 * # The zone file's optional fields (tz-to-sdk-1) are read when present, ignored when absent
 *
 * The tento-tz generator's next files (requests/tz-to-sdk-1) keep the transition list and add two optional fields:
 * `baseOffsetSeconds` on the first entry (a standing-offset pseudo-transition at 1900-01-01T00:00:00Z: a
 * constant-offset zone is a one-entry list, never `[]`) and `linkOf` on every entry of a backward name's file (the
 * resolved canonical zone, provenance).
 *
 * ## Invariants Tested
 * - A one-entry file (Port_Moresby at +10:00, `baseOffsetSeconds` 36000) loads, at +10:00 in 2026.
 * - A backward name's file (Pacific/Truk, `linkOf` Pacific/Port_Moresby) loads under its own name and keeps the
 *   zone it links to (`TimezoneRegion.linkOf`); a file without the field has none.
 * - A field of the wrong type, or a `baseOffsetSeconds` the entry's own offset contradicts, rejects the file (not
 *   loaded) rather than being read as something else.
 */
import { assert, assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";
import type { MsSinceEpoch } from "../chrono/units/units.ts";

const STANDING = { before: "1900-01-01T10:00:00+10:00", before_tz_abbr: "+10", after: "1900-01-01T10:00:00+10:00", after_tz_abbr: "+10" };

/** The zone service's own loader (`DYNAMIC_LOADER`, its decoder included) over a fetch that answers each name with `files`. */
function serving(files: Record<string, unknown>): TimezoneRegion.Loader {
  globalThis.fetch = (input: string | URL | Request) => {
    const name = decodeURIComponent(String(input).split("/").at(-1) ?? "").replace(/\.json$/, "").replaceAll("~", "/");
    const raw = files[name];
    return Promise.resolve(raw === undefined ? new Response("", { status: 404 }) : new Response(JSON.stringify(raw)));
  };
  return TimezoneRegion.DYNAMIC_LOADER;
}

const quietly = async <T>(f: () => Promise<T>): Promise<T> => {
  const error = console.error;
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = error;
  }
};

Deno.test("a constant-offset zone's one-entry file loads at its standing offset; a backward name keeps the zone it links to", async () => {
  TimezoneRegion.setLoader(serving({
    "Pacific/Port_Moresby": [{ ...STANDING, baseOffsetSeconds: 36000 }],
    "Pacific/Truk": [{ ...STANDING, baseOffsetSeconds: 36000, linkOf: "Pacific/Port_Moresby" }],
  }));
  const moresby = await TimezoneRegion.getOpt("Pacific/Port_Moresby" as Tzname);
  assert(moresby != null);
  assertEquals(moresby.tzAtMse(Date.UTC(2026, 6, 15) as MsSinceEpoch).info.offset.toHrsF, 10);
  assertEquals(moresby.linkOf, null);
  const truk = await TimezoneRegion.getOpt("Pacific/Truk" as Tzname);
  assert(truk != null);
  assertEquals([String(truk.fullname), String(truk.linkOf)], ["Pacific/Truk", "Pacific/Port_Moresby"]);
});

Deno.test("a field of the wrong type, or a base offset the entry contradicts, rejects the file", async () => {
  TimezoneRegion.setLoader(serving({
    "Asia/Tokyo": [{ ...STANDING, before: "1900-01-01T09:00:00+09:00", after: "1900-01-01T09:00:00+09:00", baseOffsetSeconds: "32400" }],
    "Asia/Seoul": [{ ...STANDING, before: "1900-01-01T09:00:00+09:00", after: "1900-01-01T09:00:00+09:00", linkOf: 7 }],
    "Asia/Taipei": [{ ...STANDING, before: "1900-01-01T08:00:00+08:00", after: "1900-01-01T08:00:00+08:00", baseOffsetSeconds: 32400 }],
  }));
  for (const name of ["Asia/Tokyo", "Asia/Seoul", "Asia/Taipei"]) {
    assertEquals(await quietly(() => TimezoneRegion.getOpt(name as Tzname)), null, name);
  }
});
