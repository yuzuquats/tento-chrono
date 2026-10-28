/**
 * # A zone that does not load costs one fetch per retry window, and every reader sees the same answer
 *
 * SDK judge r21 (R21-C1, R21-P1, R21-A1, R21-C2; probes P1-P6 of
 * `J/sdk/judge-r21/probes/zone-r21.probe.ts`): after 45bd02178 a zone whose
 * fetch got no answer was built from the platform for that read only, so
 * every read fetched again (and, on a blackholed network, waited the full
 * fetch deadline), the synchronous readers (`getLoaded`: the events index,
 * `recurrenceMovedWith`) never saw it and read UTC, and it was never traced;
 * a 5xx from the zone service answered null (UTC) instead; a custom loader's
 * own `TypeError` was taken for a network failure; a malformed file was
 * fetched again on every read; and after `setLoader` an ask could still join
 * the old loader's load, whose answer was cached under the new loader.
 *
 * ## Invariants Tested
 * - No answer (a rejected fetch, or a 5xx / 429 / 408 status: `servedLoader`
 *   throws `TimezoneRegion.NoAnswer`) for a zone the platform knows: the
 *   platform build is held provisionally. Reads inside
 *   `UNLOADABLE_RETRY_MS` answer it at once with no fetch; `getLoaded`
 *   answers it too; `takeRebuilt` hands it out once (`zone/unserved`,
 *   `no-answer`). After the window a read still answers it at once and asks
 *   the service in the background; once the service answers, the served
 *   zone replaces it.
 * - A loader's own error (a `TypeError` thrown by its code, not by `fetch`)
 *   is not no-answer: the zone does not load (null), and is not retried
 *   inside the window.
 * - A served file that is malformed (bad JSON, a bad date, a null entry)
 *   does not load and is remembered for the window, then asked again.
 * - After `setLoader`, an ask does not join a load still in flight under the
 *   old loader, and the old loader's late answer is not cached: the new
 *   loader is asked.
 * - A body that stalls after its headers ends at the loader's deadline, as
 *   no answer.
 */
import { assert, assertEquals, assertInstanceOf, assertStrictEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { PlatformZone } from "../chrono/timezone-platform.ts";
import type { Tzname } from "../chrono/timezone.ts";

const REAL_FETCH = globalThis.fetch;
const REAL_NOW = Date.now;
const clock = { now: Date.UTC(2026, 9, 16, 12) };

/** Each case runs on a fake clock (the zone cache's) and leaves the real fetch, clock and loader behind it. */
function scoped(name: string, fn: () => Promise<void>): void {
  Deno.test({
    name,
    sanitizeOps: false,
    sanitizeResources: false,
    fn: async () => {
      Date.now = () => clock.now;
      const error = console.error;
      console.error = () => {};
      try {
        await fn();
      } finally {
        console.error = error;
        Date.now = REAL_NOW;
        globalThis.fetch = REAL_FETCH;
        TimezoneRegion.setLoader(TimezoneRegion.DYNAMIC_LOADER);
      }
    },
  });
}

/** `servedLoader` over a fetch answering each zone from `answer`, counting fetches per zone (the service serves the loader's version). */
function serving(answer: (name: string) => Promise<Response>, timeoutMs?: number): Map<string, number> {
  const fetches = new Map<string, number>();
  globalThis.fetch = ((input: string | URL | Request) => {
    const name = decodeURIComponent(String(input).split("/").at(-1) ?? "").replace(/\.json$/, "").replaceAll("~", "/");
    fetches.set(name, (fetches.get(name) ?? 0) + 1);
    if (name === "America/New_York") return Promise.resolve(new Response("[]"));
    return answer(name);
  }) as typeof fetch;
  TimezoneRegion.setLoader(
    TimezoneRegion.servedLoader(TimezoneRegion.DATA_VERSION, TimezoneRegion.LEGACY_DATA_VERSION, timeoutMs),
  );
  return fetches;
}

const offline = () => Promise.reject(new TypeError("Failed to fetch"));
const platformFile = (name: string) =>
  Promise.resolve(new Response(JSON.stringify(PlatformZone.transitions(name, Date.UTC(2025, 0, 1), Date.UTC(2028, 0, 1)))));
/** Let a background refresh run to its end. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};
const T = (name: string) => name as Tzname;

scoped("P1: no answer is held provisionally: one fetch per window, getLoaded sees it, traced once, refreshed in the background", async () => {
  TimezoneRegion.takeRebuilt();
  const fetches = serving(offline);
  const answers: (TimezoneRegion | null)[] = [];
  for (let i = 0; i < 5; i++) answers.push(await TimezoneRegion.getOpt(T("Europe/Madrid")));
  const first = answers[0];
  assert(first != null, "built from the platform");
  assertEquals(first.unserved, "no-answer");
  for (const a of answers) assertStrictEquals(a, first, "one provisional region inside the window");
  assertEquals(fetches.get("Europe/Madrid"), 1, "inside the window no read fetches again");
  assertStrictEquals(TimezoneRegion.getLoaded(T("Europe/Madrid")), first, "the synchronous readers see the same zone");
  assertEquals(TimezoneRegion.takeRebuilt().map((r) => [String(r.fullname), r.unserved]), [["Europe/Madrid", "no-answer"]], "traced once");

  clock.now += TimezoneRegion.UNLOADABLE_RETRY_MS;
  const stale = await TimezoneRegion.getOpt(T("Europe/Madrid"));
  assertStrictEquals(stale, first, "after the window a read still answers at once");
  await settle();
  assertEquals(fetches.get("Europe/Madrid"), 2, "and asks the service in the background");
  assertEquals(TimezoneRegion.takeRebuilt(), [], "a refresh with no answer again is not traced again");

  clock.now += TimezoneRegion.UNLOADABLE_RETRY_MS;
  globalThis.fetch = ((input: string | URL | Request) => {
    const name = decodeURIComponent(String(input).split("/").at(-1) ?? "").replace(/\.json$/, "").replaceAll("~", "/");
    fetches.set(name, (fetches.get(name) ?? 0) + 1);
    return platformFile(name);
  }) as typeof fetch;
  await TimezoneRegion.getOpt(T("Europe/Madrid"));
  await settle();
  const served = TimezoneRegion.getLoaded(T("Europe/Madrid"));
  assert(served != null && served !== first, "the served zone replaced the provisional one");
  assertEquals([served.unserved, served.mismatch], [null, null]);
  assertStrictEquals(await TimezoneRegion.getOpt(T("Europe/Madrid")), served);
});

scoped("P2: a 5xx, 429 or 408 from the zone service is no answer (NoAnswer), not a zone that does not load", async () => {
  const statuses: Record<string, number> = { "Europe/Rome": 503, "Europe/Vienna": 502, "Europe/Zurich": 429, "Europe/Berlin": 408 };
  const fetches = serving((name) => Promise.resolve(new Response("busy", { status: statuses[name] ?? 404 })));
  for (const name of Object.keys(statuses)) {
    let thrown: unknown = null;
    try {
      await TimezoneRegion.getLoader().load(T(name));
    } catch (e) {
      thrown = e;
    }
    assertInstanceOf(thrown, TimezoneRegion.NoAnswer, `${name}: ${statuses[name]}`);
    const a = await TimezoneRegion.getOpt(T(name));
    const b = await TimezoneRegion.getOpt(T(name));
    assertEquals([a?.fullname, a?.unserved], [name, "no-answer"], `${name}: built from the platform, not UTC`);
    assertStrictEquals(b, a);
    assertEquals(fetches.get(name), 2, `${name}: the direct load, then one read; the second read inside the window fetches nothing`);
  }
});

scoped("P2: a rejected fetch is NoAnswer; the loader's deadline too", async () => {
  serving(offline);
  let thrown: unknown = null;
  try {
    await TimezoneRegion.getLoader().load(T("Europe/Lisbon"));
  } catch (e) {
    thrown = e;
  }
  assertInstanceOf(thrown, TimezoneRegion.NoAnswer);
  assertInstanceOf((thrown as Error).cause, TypeError, "the fetch's own rejection is its cause");
});

scoped("P3: a malformed served file does not load and is remembered for the window, then asked again", async () => {
  const bodies: Record<string, string> = {
    "Europe/Oslo": "{not json",
    "Europe/Prague": JSON.stringify([{ before: "garbage", before_tz_abbr: "A", after: "garbage", after_tz_abbr: "B" }]),
    "Europe/Warsaw": "[null]",
  };
  const fetches = serving((name) => Promise.resolve(new Response(bodies[name] ?? "", { status: bodies[name] ? 200 : 404 })));
  for (const name of Object.keys(bodies)) {
    assertEquals(await TimezoneRegion.getOpt(T(name)), null, `${name}: a malformed file does not load`);
    assertEquals(await TimezoneRegion.getOpt(T(name)), null);
    assertEquals(fetches.get(name), 1, `${name}: remembered inside the window`);
    assertEquals(TimezoneRegion.getLoaded(T(name)), null);
  }
  clock.now += TimezoneRegion.UNLOADABLE_RETRY_MS;
  for (const name of Object.keys(bodies)) {
    assertEquals(await TimezoneRegion.getOpt(T(name)), null);
    assertEquals(fetches.get(name), 2, `${name}: asked again after the window`);
  }
});

scoped("P4: after setLoader an ask does not join the old loader's load, and the old loader's late answer is not cached", async () => {
  let rejectOld: (e: unknown) => void = () => {};
  TimezoneRegion.setLoader({ load: () => new Promise((_, reject) => rejectOld = reject) });
  const first = TimezoneRegion.getOpt(T("Asia/Tbilisi"));
  await new Promise((r) => setTimeout(r, 0));
  const fresh = { calls: 0 };
  const tbilisi = PlatformZone.transitions("Asia/Tbilisi", Date.UTC(2025, 0, 1), Date.UTC(2028, 0, 1))!;
  TimezoneRegion.setLoader({
    load: (name) => (fresh.calls++, Promise.resolve(tbilisi.map((t) => TimezoneRegion.Transition.parse(t, name)))),
  });
  const joined = TimezoneRegion.getOpt(T("Asia/Tbilisi"));
  rejectOld(new TimezoneRegion.Unserved(T("Asia/Tbilisi"), "not-found"));
  const [, j] = await Promise.all([first, joined]);
  assert(fresh.calls >= 1, "the ask after setLoader goes to the new loader");
  assertEquals(j?.unserved, null, "and gets the new loader's served zone");

  let resolveOld: (t: TimezoneRegion.Transition[]) => void = () => {};
  TimezoneRegion.setLoader({ load: () => new Promise((resolve) => resolveOld = resolve) });
  const old = TimezoneRegion.getOpt(T("Asia/Yerevan"));
  await new Promise((r) => setTimeout(r, 0));
  const newer = { calls: 0 };
  const yerevan = PlatformZone.transitions("Asia/Yerevan", Date.UTC(2025, 0, 1), Date.UTC(2028, 0, 1))!;
  TimezoneRegion.setLoader({
    load: (name) => (newer.calls++, Promise.resolve(yerevan.map((t) => TimezoneRegion.Transition.parse(t, name)))),
  });
  resolveOld([]); // the old loader answers "no transitions" after it was replaced
  assertEquals((await old)?.unserved, "no-transitions", "the old caller gets the old loader's answer");
  const next = await TimezoneRegion.getOpt(T("Asia/Yerevan"));
  assertEquals(newer.calls, 1, "the old answer was not cached under the new loader");
  assertEquals(next?.unserved, null);
});

scoped("P5: a body that stalls after its headers ends at the deadline, as no answer", async () => {
  const ac = new AbortController();
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, signal: ac.signal, onListen: () => {} }, (req) => {
    if (req.url.includes("America~New_York")) return new Response("[]");
    return new Response(new ReadableStream({ start: (c) => c.enqueue(new TextEncoder().encode("[")) }), { status: 200 });
  });
  globalThis.fetch = REAL_FETCH;
  Object.defineProperty(globalThis, "getStaticOrigin", { configurable: true, value: () => `http://127.0.0.1:${server.addr.port}` });
  try {
    TimezoneRegion.setLoader(TimezoneRegion.servedLoader(TimezoneRegion.DATA_VERSION, TimezoneRegion.LEGACY_DATA_VERSION, 200));
    const started = performance.now();
    const region = await TimezoneRegion.getOpt(T("Africa/Lagos"));
    assert(performance.now() - started < 5_000, "bounded by the deadline");
    assertEquals(region?.unserved, "no-answer");
  } finally {
    Reflect.deleteProperty(globalThis, "getStaticOrigin");
    ac.abort();
    await server.finished;
  }
});

scoped("P6: a custom loader's own TypeError is its error, not no answer: the zone does not load, and is not retried inside the window", async () => {
  const calls = { n: 0 };
  TimezoneRegion.setLoader({
    load: () => {
      calls.n++;
      const o: { a?: { b: number } } = {};
      return Promise.resolve([o.a!.b] as unknown as TimezoneRegion.Transition[]);
    },
  });
  assertEquals(await TimezoneRegion.getOpt(T("America/Lima")), null, "not built from the platform as if the network failed");
  assertEquals(await TimezoneRegion.getOpt(T("America/Lima")), null);
  assertEquals(calls.n, 1, "remembered for the window");
  assertEquals(TimezoneRegion.getLoaded(T("America/Lima")), null);
});
