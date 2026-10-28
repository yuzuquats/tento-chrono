/**
 * Walks every zone name this runtime's Intl reports through
 * `TimezoneRegion.getOpt` and answers the names that did not load, the
 * zones that loaded only after `getOpt` rebuilt them from the platform's
 * offsets (the service's transitions disagreed: `TimezoneRegion.mismatch`),
 * and the names that loaded built from the platform because the service has
 * no data for them (`TimezoneRegion.unserved`).
 * `tests/test_tz_links.deno.test.ts` walks them over a loader that answers
 * exactly the zone service's set (`servedLoader`), in its own test module (a
 * module's region cache never reaches another's). Run as a script, it walks
 * the live zone service and prints both lists, each mismatch with the
 * served and the platform offset (the zone service's acceptance check:
 * requests/sdk-to-server-7):
 *
 *   deno run --allow-net --allow-read --unstable-sloppy-imports \
 *     --config tento-chrono/tests/deno.json tento-chrono/tests/timezones/walk-runtime-zones.deno.ts
 */
import { TimezoneRegion } from "../../chrono/timezone-region.ts";
import { PlatformZone } from "../../chrono/timezone-platform.ts";
import type { Tzname } from "../../chrono/timezone.ts";

/**
 * A loader that answers exactly the names in `2024b-served.json`: `[]` for
 * the ones the service serves empty (`2024b-empty.json`), and for the others
 * a stand-in that agrees with the platform (its 2025-2027 transitions).
 */
export async function servedLoader(): Promise<TimezoneRegion.Loader> {
  const read = async (file: string) => new Set<string>(JSON.parse(await Deno.readTextFile(new URL(file, import.meta.url))));
  const served = await read("./2024b-served.json");
  const empty = await read("./2024b-empty.json");
  return {
    load: (tzname) => {
      // The service's 404 for a name it does not serve.
      if (!served.has(tzname)) return Promise.reject(new TimezoneRegion.Unserved(tzname, "not-found"));
      if (empty.has(tzname)) return Promise.resolve([]);
      const standIn = PlatformZone.transitions(tzname, Date.UTC(2025, 0, 1), Date.UTC(2028, 0, 1)) ?? [];
      return Promise.resolve(standIn.map((t) => TimezoneRegion.Transition.parse(t, tzname)));
    },
  };
}

/** One zone the walk loaded from a platform rebuild: the name, the zone, and where the served offsets disagreed. */
export interface Rebuilt {
  readonly name: string;
  readonly zone: string;
  readonly at: string;
  readonly servedMins: number;
  readonly platformMins: number;
}

/**
 * Every zone name the runtime reports, the ones `getOpt` did not load (it
 * names each on stderr; quieted here), and the ones it loaded rebuilt from
 * the platform's offsets.
 */
export async function walkRuntimeZones(): Promise<{
  readonly reported: readonly string[];
  readonly failed: readonly string[];
  readonly rebuilt: readonly Rebuilt[];
  readonly unserved: readonly string[];
}> {
  const reported = Intl.supportedValuesOf("timeZone");
  const failed: string[] = [];
  const rebuilt: Rebuilt[] = [];
  const unserved: string[] = [];
  const quiet = console.error;
  console.error = () => {};
  try {
    for (const name of reported) {
      const region = await TimezoneRegion.getOpt(name as Tzname);
      if (region == null) failed.push(name);
      else if (region.unserved != null) unserved.push(name);
      else if (region.mismatch != null) {
        const { at, servedMins, platformMins } = region.mismatch;
        rebuilt.push({ name, zone: region.fullname, at: new Date(at).toISOString(), servedMins, platformMins });
      }
    }
  } finally {
    console.error = quiet;
  }
  return { reported, failed, rebuilt, unserved };
}

if (import.meta.main) {
  const { reported, failed, rebuilt, unserved } = await walkRuntimeZones();
  console.log(JSON.stringify({ reported: reported.length, failed, unserved, rebuilt }, null, 1));
}
