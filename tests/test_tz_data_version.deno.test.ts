/**
 * # The zone loader asks for the zone data the service serves
 *
 * Judge r14 A-5 / R13-C1(a): the regenerated tzdata 2025a files (every zone's
 * last offset, base offsets, every backward name) are served under
 * `timezones/2025a/1900_2050`, while the loader still asked for the 2024b
 * label, whose files drop offsets and serve Port_Moresby as `[]`.
 *
 * ## Invariants Tested
 * - `DYNAMIC_LOADER` fetches `https://static.lona.so/timezones/<DATA_VERSION>/1900_2050/<Area~City>.json`
 *   with `DATA_VERSION` 2025a, one request per zone.
 */
import { assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";

Deno.test("the zone loader requests tzdata 2025a, 1900-2050, from the static domain", async () => {
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
    await TimezoneRegion.DYNAMIC_LOADER.load("Pacific/Port_Moresby" as Tzname);
  } finally {
    globalThis.fetch = real;
  }
  assertEquals(asked, ["https://static.lona.so/timezones/2025a/1900_2050/Pacific~Port_Moresby.json"]);
  assertEquals(TimezoneRegion.DATA_VERSION, "2025a");
});


Deno.test("the zone loader honors the app shell static origin", async () => {
  const realFetch = globalThis.fetch;
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "getStaticOrigin");
  const asked: string[] = [];
  Object.defineProperty(globalThis, "getStaticOrigin", {
    configurable: true,
    value: () => "https://private.example/__lona_static/",
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
  assertEquals(asked, ["https://private.example/__lona_static/timezones/2025a/1900_2050/America~New_York.json"]);
});
