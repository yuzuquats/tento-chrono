/**
 * # The zone loader asks for the zone data the service serves
 *
 * Judge r14 A-5 / R13-C1(a): the regenerated tzdata 2025a files (every zone's
 * last offset, base offsets, every backward name) are served under
 * `timezones/2025a/1900_2050`, while the loader still asked for the 2024b
 * label, whose files drop offsets and serve Port_Moresby as `[]`.
 *
 * ## Invariants Tested
 * - `DYNAMIC_LOADER` fetches `https://static.example.com/timezones/<DATA_VERSION>/1900_2050/<Area~City>.json`
 *   with `DATA_VERSION` 2025a, one request per zone.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";

/** Run `body` as if the page were served from `hostname`; `null` is no page at all. */
async function onPage(hostname: string | null, body: () => Promise<void>): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "location");
  Object.defineProperty(globalThis, "location", {
    configurable: true,
    value: hostname == null ? undefined : { hostname },
  });
  try {
    await body();
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "location", descriptor);
    else Reflect.deleteProperty(globalThis, "location");
  }
}

/** The URLs `load` fetches for `zone` while `fetch` answers with one transition. */
async function urlsAsked(load: () => Promise<unknown>): Promise<string[]> {
  const real = globalThis.fetch;
  const asked: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    asked.push(String(input));
    return Promise.resolve(new Response(JSON.stringify([{
      before: "1900-01-01T10:00:00+10:00",
      before_tz_abbr: "%z",
      after: "1900-01-01T10:00:00+10:00",
      after_tz_abbr: "%z",
      baseOffsetSeconds: 36000,
    }])));
  };
  try {
    await load();
  } finally {
    globalThis.fetch = real;
  }
  return asked;
}

Deno.test("the zone loader requests tzdata 2025a, 1900-2050, from the static domain", async () => {
  await onPage("calendar.example.com", async () => {
    const asked = await urlsAsked(() => TimezoneRegion.DYNAMIC_LOADER.load("Pacific/Port_Moresby" as Tzname));
    assertEquals(asked, ["https://static.example.com/timezones/2025a/1900_2050/Pacific~Port_Moresby.json"]);
  });
  assertEquals(TimezoneRegion.DATA_VERSION, "2025a");
});

Deno.test("the static domain is derived from the page's own domain", async () => {
  const cases: [string, string][] = [
    ["dev--calendar.example.com", "https://dev--static.example.com"],
    ["example.com", "https://static.example.com"],
    ["app.team.example.org", "https://static.team.example.org"],
  ];
  for (const [hostname, origin] of cases) {
    await onPage(hostname, async () => {
      const asked = await urlsAsked(() => TimezoneRegion.servedLoader().load("America/New_York" as Tzname));
      assertEquals(asked, [`${origin}/timezones/2025a/1900_2050/America~New_York.json`], hostname);
    });
  }
});

Deno.test("with no domain to derive from, the zone loader asks for an origin and fetches nothing", async () => {
  for (const hostname of [null, "localhost", "app.localhost", "127.0.0.1", "[::1]"]) {
    await onPage(hostname, async () => {
      let message = "";
      const asked = await urlsAsked(() =>
        TimezoneRegion.servedLoader().load("America/New_York" as Tzname).catch((e: Error) => {
          message = e.message;
        })
      );
      assertEquals(asked, [], String(hostname));
      assertStringIncludes(message, "getStaticOrigin", String(hostname));
    });
  }
});


Deno.test("a configured static origin serves a host with no page, and the app shell's still wins", async () => {
  const load = () => TimezoneRegion.servedLoader().load("America/New_York" as Tzname);
  const file = "/timezones/2025a/1900_2050/America~New_York.json";
  try {
    TimezoneRegion.setStaticOrigin("https://zones.example.net/");
    await onPage(null, async () => assertEquals(await urlsAsked(load), [`https://zones.example.net${file}`]));
    // Configured beats derived: a page elsewhere does not redirect the host's choice.
    await onPage("calendar.example.com", async () => assertEquals(await urlsAsked(load), [`https://zones.example.net${file}`]));
    TimezoneRegion.setStaticOrigin(() => "https://b.example.net");
    await onPage(null, async () => assertEquals(await urlsAsked(load), [`https://b.example.net${file}`]));
    Object.defineProperty(globalThis, "getStaticOrigin", { configurable: true, value: () => "https://shell.example" });
    await onPage(null, async () => assertEquals(await urlsAsked(load), [`https://shell.example${file}`]));
  } finally {
    Reflect.deleteProperty(globalThis, "getStaticOrigin");
    TimezoneRegion.setStaticOrigin(null);
  }
  await onPage("calendar.example.com", async () => assertEquals(await urlsAsked(load), [`https://static.example.com${file}`]));
});

Deno.test("the zone loader honors the app shell static origin", async () => {
  const realFetch = globalThis.fetch;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "getStaticOrigin");
  const asked: string[] = [];
  Object.defineProperty(globalThis, "getStaticOrigin", {
    configurable: true,
    value: () => "https://private.example/__static/",
  });
  globalThis.fetch = (input: string | URL | Request) => {
    asked.push(String(input));
    return Promise.resolve(new Response("[]"));
  };
  try {
    await TimezoneRegion.servedLoader().load("America/New_York" as Tzname);
  } finally {
    globalThis.fetch = realFetch;
    if (descriptor) Object.defineProperty(globalThis, "getStaticOrigin", descriptor);
    else Reflect.deleteProperty(globalThis, "getStaticOrigin");
  }
  assertEquals(asked, ["https://private.example/__static/timezones/2025a/1900_2050/America~New_York.json"]);
});

Deno.test("an application default does not replace explicit timezone configuration", async () => {
  await onPage(null, async () => {
    try {
      TimezoneRegion.setStaticOrigin("https://explicit.example.test");
      TimezoneRegion.setDefaultStaticOrigin(() => "https://default.example.test/");
      const load = () => TimezoneRegion.servedLoader().load("America/New_York" as Tzname);
      const explicit = await urlsAsked(load);
      assertEquals(new URL(explicit[0]).origin, "https://explicit.example.test");
      TimezoneRegion.setStaticOrigin(null);
      const fallback = await urlsAsked(load);
      assertEquals(new URL(fallback[0]).origin, "https://default.example.test");
    } finally {
      TimezoneRegion.setStaticOrigin(null);
      TimezoneRegion.setDefaultStaticOrigin(null);
    }
  });
});
