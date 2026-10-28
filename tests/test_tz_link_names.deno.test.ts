import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

/**
 * A backward link name (tzdata `backward`: US/Pacific, US/Eastern) loads as its canonical zone, resolved by the
 * platform's Intl canonicalization; the loader only ever sees the canonical name (the fixture set, like the
 * served transitions, has no link files).
 */
for (const [link, canonical] of [
  ["US/Pacific", "America/Los_Angeles"],
  ["US/Eastern", "America/New_York"],
] as const) {
  Deno.test(`getOpt loads the link ${link} as ${canonical}`, async () => {
    const region = await TimezoneRegion.getOpt(link as Tzname);
    assert(region != null, `${link} did not load`);
    assertEquals<string>(region.fullname, canonical);
    assertStrictEquals(await TimezoneRegion.getOpt(canonical as Tzname), region);
    assertStrictEquals(TimezoneRegion.getLoaded(link as Tzname), region);
  });
}

Deno.test("getOpt loads a name the platform canonicalizes to a zone the loader lacks (Asia/Kolkata) as itself", async () => {
  // V8: Asia/Kolkata -> Asia/Calcutta; the fixture set (like the served set) has Asia~Kolkata.json only.
  const region = await TimezoneRegion.getOpt("Asia/Kolkata" as Tzname);
  assert(region != null, "Asia/Kolkata did not load");
  assertEquals<string>(region.fullname, "Asia/Kolkata");
});

Deno.test("get loads a link as its canonical zone too, and still falls back to the default for an unknown name", async () => {
  assertEquals<string>((await TimezoneRegion.get("US/Pacific" as Tzname)).fullname, "America/Los_Angeles");
  assertEquals<string>((await TimezoneRegion.get("Not/AZone" as Tzname)).fullname, "UTC");
});

Deno.test("getOpt still answers null for a name the platform and the loader both refuse", async () => {
  assertEquals(await TimezoneRegion.getOpt("Not/AZone" as Tzname), null);
});

/**
 * A legacy spelling the platform keeps as its own canonical name (V8: Asia/Calcutta, Asia/Katmandu) is not served
 * (the zone service, like the fixture set, has the current IANA names only): it loads as the current name from the
 * documented table (`TimezoneRegion.legacyNames`), cached under the legacy name too.
 */
for (const [legacy, current] of [
  ["Asia/Calcutta", "Asia/Kolkata"],
  ["Asia/Katmandu", "Asia/Kathmandu"],
] as const) {
  Deno.test(`getOpt loads the legacy spelling ${legacy} as ${current}`, async () => {
    const region = await TimezoneRegion.getOpt(legacy as Tzname);
    assert(region != null, `${legacy} did not load`);
    assertEquals<string>(region.fullname, current);
    assertStrictEquals(TimezoneRegion.getLoaded(legacy as Tzname), region);
  });
}

Deno.test("the legacy table maps platform-known names to platform-known current names, none to itself", async () => {
  const table = await TimezoneRegion.legacyNames();
  assert(table.size >= 13, "the table lists every legacy spelling the request names");
  const known = (name: string) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: name });
      return true;
    } catch {
      return false;
    }
  };
  for (const [legacy, current] of table) {
    assert(legacy !== current, `${legacy} maps to itself`);
    assert(known(legacy), `${legacy} is not a zone this platform knows`);
    assert(known(current), `${current} is not a zone this platform knows`);
    assert(!table.has(current), `${current} is itself listed as legacy`);
  }
});
