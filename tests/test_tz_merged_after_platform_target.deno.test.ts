import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";

/**
 * A merged city asked after its link target was built from the platform (review G2 R-2 finding, operator Q23).
 * Europe/Brussels asked first is built and cached under its own name; a later Europe/Amsterdam, whose TIMEZONE_LINKS
 * target is Europe/Brussels but which the platform keeps as a zone of its own, took that build whole and was named
 * Europe/Brussels. A later name that reuses a cached platform build shares its rules (no second build, no second
 * report) and keeps the name it was asked by, with the reason its own load gave (review I I-2). Its own file, so these
 * names are the first this process asks, whatever else runs (review I I-1).
 */
TimezoneRegion.setLoader({
  load: (tz) =>
    Promise.reject(new TimezoneRegion.Unserved(tz, String(tz) === "Europe/Brussels" ? "no-transitions" : "not-found")),
});

Deno.test("unserved: a merged city asked after its platform-built link target shares its rules and keeps its own name and reason", async () => {
  TimezoneRegion.takeRebuilt();
  const pairs = [
    ["Europe/Brussels", "Europe/Amsterdam"],
    ["Europe/Berlin", "Europe/Oslo"],
    ["Africa/Abidjan", "Africa/Accra"],
    ["Asia/Singapore", "Asia/Kuala_Lumpur"],
  ];
  for (const [target, city] of pairs) {
    const built = await TimezoneRegion.getOpt(target as Tzname);
    assert(built != null, `${target} did not build`);
    assertEquals<string>(built.fullname, target);
    const linked = await TimezoneRegion.getOpt(city as Tzname);
    assert(linked != null, `${city} did not load`);
    assertEquals<string>(linked.fullname, city, `${target} then ${city}: the asked name`);
    assertStrictEquals(linked.transitions, built.transitions, `${target} then ${city}: the same rules`);
    assertEquals(linked.unserved, "not-found", `${target} then ${city}: the asked name's own reason`);
    assertStrictEquals(await TimezoneRegion.getOpt(city as Tzname), linked, `${city} is cached under its own name`);
  }
  assertEquals(TimezoneRegion.getLoaded("Europe/Brussels" as Tzname)?.unserved, "no-transitions", "the target keeps its own");
  assertEquals(
    TimezoneRegion.takeRebuilt().map((r) => String(r.fullname)),
    pairs.map(([target]) => target),
    "each platform build reported once, under the name it was built",
  );
});
