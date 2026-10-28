/**
 * # The zone-link table is generated from tzdata, and every zone the runtime reports loads
 *
 * The zone service serves tzdata 2024b's current zone names only, while V8's
 * Intl reports legacy and merged spellings as canonical (Asia/Calcutta,
 * Europe/Amsterdam, America/Buenos_Aires): `TimezoneRegion.getOpt` loads
 * those through `legacyNames()`, generated from tzdata's `backward` file
 * (`timezones/generate-links.deno.ts`). Judge r12 C-N8 found 114 of 418
 * runtime names failing against the hand table it replaces.
 *
 * ## Invariants Tested
 * - The checked-in table is the generator's output over the checked-in inputs.
 * - Every table target is a zone the service serves; no entry maps to itself
 *   or to another entry (chains are resolved: Pacific/Truk ->
 *   Pacific/Port_Moresby, not the unserved Pacific/Chuuk).
 * - Every zone name this runtime reports loads through `getOpt` against the
 *   served set; the ones the service has no data for load built from the
 *   platform (`unserved`) and are exactly the names in
 *   `timezones/known-missing.json`; a named zone the service serves leaves
 *   the list (it only shrinks).
 */
import { assert, assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { generate, OUTPUT } from "./timezones/generate-links.deno.ts";
import { servedLoader, walkRuntimeZones } from "./timezones/walk-runtime-zones.deno.ts";

const SERVED: ReadonlySet<string> = new Set(JSON.parse(await Deno.readTextFile(new URL("./timezones/2024b-served.json", import.meta.url))));
const KNOWN_MISSING: ReadonlySet<string> = new Set(
  JSON.parse(await Deno.readTextFile(new URL("./timezones/known-missing.json", import.meta.url))).zones,
);

Deno.test("the checked-in zone-link table is the generator's output", async () => {
  assertEquals(await Deno.readTextFile(OUTPUT), await generate(), "re-run tests/timezones/generate-links.deno.ts");
});

Deno.test("every zone-link target is a served zone, and no entry maps to itself or to another entry", async () => {
  const table = await TimezoneRegion.legacyNames();
  assert(table.size > 200, `the table holds tzdata's backward links (${table.size})`);
  for (const [link, zone] of table) {
    assert(SERVED.has(zone), `${link} -> ${zone}: the zone service does not serve ${zone}`);
    assert(link !== zone, `${link} maps to itself`);
    assert(!table.has(zone), `${link} -> ${zone}, which is itself a link`);
  }
  const target = (link: string): string | undefined => [...table].find(([name]) => name === link)?.[1];
  assertEquals(target("Pacific/Truk"), "Pacific/Port_Moresby", "the hand table's dead Pacific/Chuuk entry is resolved");
  assertEquals(target("Pacific/Ponape"), "Pacific/Guadalcanal", "the hand table's dead Pacific/Pohnpei entry is resolved");
  assertEquals(target("Europe/Amsterdam"), "Europe/Brussels");
});

Deno.test("every zone the runtime reports loads against the served set; the unserved ones are the named known-missing zones", async () => {
  // This module's region cache fills with stand-ins; no other test of this module loads a zone.
  TimezoneRegion.setLoader(await servedLoader());
  const { reported, failed, unserved } = await walkRuntimeZones();
  assert(reported.length > 300, `the runtime reports its zones (${reported.length})`);
  assertEquals(failed, [], "zones that do not load");
  assertEquals(unserved.filter((name) => !KNOWN_MISSING.has(name)), [], "zones the service has no data for that are not named in known-missing.json");
  const servedNow = [...KNOWN_MISSING].filter((name) => reported.includes(name) && !unserved.includes(name));
  assertEquals(servedNow, [], "named missing but served now: take it off known-missing.json (and sdk-to-server-7)");
});
