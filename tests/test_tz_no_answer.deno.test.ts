/**
 * # A zone fetch with no answer is not remembered as a zone that does not exist
 *
 * TUI judge r17 R17-1 and SDK judges r19/r20 (R19-C1, R19-C3): a transient
 * failure (`TypeError: Failed to fetch`) for a zone the platform knows
 * answered null and was remembered for `UNLOADABLE_RETRY_MS`, so one dropped
 * request cost 30 s of UTC; a load that failed under the old loader after
 * `setLoader` was remembered under the new one, which was then never asked;
 * and the zone service's fetches had no deadline, so a stalled network
 * stalled every zone read with it.
 *
 * ## Invariants Tested
 * - A zone whose fetch got no answer, which the platform knows, loads with
 *   the platform's offsets, marked `unserved: "no-answer"`; it is held for
 *   the retry window (SDK judge r21: no fetch inside it, `getLoaded` answers
 *   it), and once a new loader's service answers the served zone loads.
 * - A name the platform does not know does not load whether its fetch got
 *   no answer or the service has no data for it; either is remembered for
 *   the window (test_tz_zone_failures covers the window and its refresh).
 * - A load that fails under the old loader after `setLoader` is not
 *   remembered under the new one: the next ask goes to the new loader.
 * - Each zone-service fetch carries a deadline: a fetch that never answers
 *   ends after `timeoutMs`, as no answer.
 */
import { assert, assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { PlatformZone } from "../chrono/timezone-platform.ts";
import type { Tzname } from "../chrono/timezone.ts";
import type { MsSinceEpoch } from "../chrono/units/units.ts";

const JAN = Date.UTC(2026, 0, 15, 12);
const JUL = Date.UTC(2026, 6, 15, 12);
const platformMins = (name: string, ms: number): number => Math.round(PlatformZone.offsets(name)!(ms) / 60);
const regionMins = (region: TimezoneRegion, ms: number): number =>
  Math.round(region.tzAtMse(ms as MsSinceEpoch).info.offset.toHrsF * 60);

const REAL_FETCH = globalThis.fetch;

/** Each test leaves the real fetch and loader behind it. */
function scoped(name: string, fn: () => Promise<void>): void {
  Deno.test(name, async () => {
    try {
      await fn();
    } finally {
      globalThis.fetch = REAL_FETCH;
      TimezoneRegion.setLoader(TimezoneRegion.DYNAMIC_LOADER);
    }
  });
}

/** The zone service's loader over a fetch that answers each name from `answer`, counting fetches per name. */
function serving(answer: (name: string) => Promise<Response>, loader = TimezoneRegion.servedLoader()): Map<string, number> {
  const fetches = new Map<string, number>();
  globalThis.fetch = (input: string | URL | Request) => {
    const name = decodeURIComponent(String(input).split("/").at(-1) ?? "").replace(/\.json$/, "").replaceAll("~", "/");
    fetches.set(name, (fetches.get(name) ?? 0) + 1);
    // The service serves the loader's data version (its probe zone answers).
    if (name === "America/New_York") return Promise.resolve(new Response("[]"));
    return answer(name);
  };
  TimezoneRegion.setLoader(loader);
  return fetches;
}

const offline = () => Promise.reject(new TypeError("Failed to fetch"));
const platformFile = (name: string) =>
  Promise.resolve(new Response(JSON.stringify(PlatformZone.transitions(name, Date.UTC(2025, 0, 1), Date.UTC(2028, 0, 1)))));

const quietly = async <T>(f: () => Promise<T>): Promise<T> => {
  const error = console.error;
  console.error = () => {};
  try {
    return await f();
  } finally {
    console.error = error;
  }
};

scoped("R17-1: a zone the platform knows whose fetch got no answer loads from the platform, and is asked again next time", async () => {
  // A zone no other case in this process loads (the region cache outlives a loader).
  const fetches = serving(offline);
  const first = await quietly(() => TimezoneRegion.getOpt("Europe/Madrid" as Tzname));
  assert(first != null, "a transient failure of a zone the platform knows is built from the platform");
  for (const ms of [JAN, JUL]) assertEquals(regionMins(first, ms), platformMins("Europe/Madrid", ms));
  assertEquals([String(first.fullname), first.unserved, first.mismatch], ["Europe/Madrid", "no-answer", null]);
  // Held provisionally (SDK judge r21 R21-P1/R21-A1): the next ask inside the window answers it with no fetch, and the
  // synchronous readers see it; served data still replaces it (below; test_tz_zone_failures covers the window).
  const second = await quietly(() => TimezoneRegion.getOpt("Europe/Madrid" as Tzname));
  assert(second === first);
  assertEquals(fetches.get("Europe/Madrid"), 1, "held for the window: the second ask does not fetch");
  assertEquals(TimezoneRegion.getLoaded("Europe/Madrid" as Tzname), first, "the synchronous readers see the same zone");

  serving(platformFile);
  const served = await TimezoneRegion.getOpt("Europe/Madrid" as Tzname);
  assert(served != null);
  assertEquals([served.unserved, served.mismatch], [null, null], "once the service answers, the served zone loads");
});

scoped("R17-1: a name the platform does not know does not load, with no answer or no data; either is asked again only after the window", async () => {
  const fetches = serving((name) => name === "Mars/Phobos" ? offline() : Promise.resolve(new Response("", { status: 404 })));
  assertEquals(await quietly(() => TimezoneRegion.getOpt("Mars/Phobos" as Tzname)), null);
  assertEquals(await quietly(() => TimezoneRegion.getOpt("Mars/Phobos" as Tzname)), null);
  // SDK judge r21 R21-P1: an outage costs one fetch per window, not one per read.
  assertEquals(fetches.get("Mars/Phobos"), 1, "no answer for a name nobody knows: remembered for the window");
  assertEquals(await quietly(() => TimezoneRegion.getOpt("Mars/Deimos" as Tzname)), null);
  assertEquals(await quietly(() => TimezoneRegion.getOpt("Mars/Deimos" as Tzname)), null);
  assertEquals(fetches.get("Mars/Deimos"), 1, "a name the service has no data for and the platform does not know is remembered");
});

scoped("R19-C1: a load that fails under the old loader after setLoader is not remembered under the new one", async () => {
  let rejectOld: (e: Error) => void = () => {};
  TimezoneRegion.setLoader({ load: () => new Promise((_, reject) => rejectOld = reject) });
  const inFlight = quietly(() => TimezoneRegion.getOpt("Mars/Olympus_Mons" as Tzname));
  await new Promise((r) => setTimeout(r, 0));
  const asked: string[] = [];
  const transitions = PlatformZone.transitions("Asia/Tokyo", Date.UTC(2025, 0, 1), Date.UTC(2028, 0, 1))!;
  TimezoneRegion.setLoader({
    load: (name) => (asked.push(String(name)), Promise.resolve(transitions.map((t) => TimezoneRegion.Transition.parse(t, name)))),
  });
  rejectOld(new TimezoneRegion.Unserved("Mars/Olympus_Mons" as Tzname, "not-found"));
  assertEquals(await inFlight, null, "the old loader's answer");
  const next = await TimezoneRegion.getOpt("Mars/Olympus_Mons" as Tzname);
  assertEquals(asked, ["Mars/Olympus_Mons"], "the new loader is asked");
  assert(next != null, "and its answer loads");
});

scoped("R19-C3: a zone fetch that never answers ends at the loader's deadline, as no answer", async () => {
  const signals: (AbortSignal | null | undefined)[] = [];
  const timeoutMs = 50;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    signals.push(init?.signal);
    if (String(input).includes("America~New_York")) return Promise.resolve(new Response("[]"));
    return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)));
  }) as typeof fetch;
  TimezoneRegion.setLoader(TimezoneRegion.servedLoader(TimezoneRegion.DATA_VERSION, TimezoneRegion.LEGACY_DATA_VERSION, timeoutMs));
  const started = performance.now();
  const region = await quietly(() => TimezoneRegion.getOpt("Africa/Casablanca" as Tzname));
  const waited = performance.now() - started;
  assert(signals.length > 0 && signals.every((s) => s != null), "every zone-service fetch carries a signal");
  assert(waited < 5_000, `bounded by the deadline (${waited.toFixed(0)} ms)`);
  assert(region != null, "no answer, for a zone the platform knows: built from the platform");
  assertEquals(region.unserved, "no-answer");
});
