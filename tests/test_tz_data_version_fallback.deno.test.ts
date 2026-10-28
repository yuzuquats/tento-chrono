/**
 * # A data version the service does not serve falls back to the legacy label once, not to an Intl build per zone
 *
 * Judge r15 R15-A6 / A-5: the loader asks for tzdata 2025a while production
 * still answers 404 for the whole `2025a` directory. The loader read every
 * such 404 as "this zone has no data" (`Unserved`), so every zone was built
 * from the platform's Intl offsets (one synchronous scan and one
 * `zone/unserved` trace per zone), with no sign that the deploy was missing.
 *
 * ## Invariants Tested
 * - When the `2025a` directory 404s and `2024b` serves the zone, the zone
 *   loads the served `2024b` data (not unserved), after one probe of the
 *   version; later zones ask `2024b` directly, one fetch each; the fallback
 *   is recorded once (`takeVersionFallbacks`).
 * - When the version is served (the probe answers), a zone it has no data
 *   for is `Unserved` and nothing falls back.
 * - A probe that gets no answer decides nothing: the zone is `Unserved`, and
 *   the next 404 asks again.
 */
import { assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";
import type { MsSinceEpoch } from "../chrono/units/units.ts";

const REAL_FETCH = globalThis.fetch;
const JUL = Date.UTC(2026, 6, 15, 12) as MsSinceEpoch;

/** A constant-offset zone file, as the service serializes one. */
const constant = (offset: string) => [{
  before: `1900-01-01T00:00:00${offset}`,
  before_tz_abbr: "%z",
  after: `1900-01-01T00:00:00${offset}`,
  after_tz_abbr: "%z",
}];

/** Serve `files[version][name]` (404 when absent; "reject" rejects), recording every URL asked. */
function serving(files: Record<string, Record<string, unknown>>): string[] {
  const asked: string[] = [];
  globalThis.fetch = (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url.replace(/^https:\/\/[^/]+\/timezones\//, ""));
    const [version, , file] = url.replace(/^https:\/\/[^/]+\/timezones\//, "").split("/");
    const raw = files[version]?.[file.replace(/\.json$/, "").replaceAll("~", "/")];
    if (raw === "reject") return Promise.reject(new TypeError("Failed to fetch"));
    return Promise.resolve(raw === undefined ? new Response("", { status: 404 }) : new Response(JSON.stringify(raw)));
  };
  TimezoneRegion.setLoader(TimezoneRegion.DYNAMIC_LOADER);
  TimezoneRegion.takeRebuilt();
  TimezoneRegion.takeVersionFallbacks();
  return asked;
}

function served(name: string, fn: () => Promise<void>): void {
  Deno.test(name, async () => {
    try {
      await fn();
    } finally {
      globalThis.fetch = REAL_FETCH;
      TimezoneRegion.setLoader(TimezoneRegion.DYNAMIC_LOADER);
    }
  });
}

const mins = (region: TimezoneRegion | null) => Math.round(region!.tzAtMse(JUL).info.offset.toHrsF * 60);

served("2025a not deployed: zones load 2024b's served data after one probe, and the fallback is recorded once", async () => {
  const asked = serving({ "2024b": { "Asia/Bishkek": constant("+06:00"), "Asia/Qatar": constant("+03:00") } });
  const bishkek = await TimezoneRegion.getOpt("Asia/Bishkek" as Tzname);
  assertEquals([bishkek?.unserved ?? null, mins(bishkek)], [null, 360], "served 2024b data, not an Intl build");
  const qatar = await TimezoneRegion.getOpt("Asia/Qatar" as Tzname);
  assertEquals([qatar?.unserved ?? null, mins(qatar)], [null, 180]);
  assertEquals(asked, [
    "2025a/1900_2050/Asia~Bishkek.json",
    "2025a/1900_2050/America~New_York.json",
    "2024b/1900_2050/Asia~Bishkek.json",
    "2024b/1900_2050/Asia~Qatar.json",
  ]);
  assertEquals(TimezoneRegion.takeVersionFallbacks(), [{ asked: "2025a", used: "2024b" }]);
  assertEquals(TimezoneRegion.takeVersionFallbacks(), []);
  assertEquals(TimezoneRegion.takeRebuilt().map((r) => r.fullname), []);
});

served("2025a served: a zone it has no data for is unserved and nothing falls back", async () => {
  const asked = serving({ "2025a": { "America/New_York": [] }, "2024b": { "Asia/Famagusta": constant("+03:00") } });
  const zone = await TimezoneRegion.getOpt("Asia/Famagusta" as Tzname);
  assertEquals(zone?.unserved, "not-found");
  assertEquals(asked, ["2025a/1900_2050/Asia~Famagusta.json", "2025a/1900_2050/America~New_York.json"]);
  assertEquals(TimezoneRegion.takeVersionFallbacks(), []);
});

served("a version probe that gets no answer decides nothing; the next 404 asks again", async () => {
  const asked = serving({ "2025a": { "America/New_York": "reject" } });
  assertEquals((await TimezoneRegion.getOpt("Asia/Hovd" as Tzname))?.unserved, "not-found");
  assertEquals((await TimezoneRegion.getOpt("Asia/Dili" as Tzname))?.unserved, "not-found");
  assertEquals(asked, [
    "2025a/1900_2050/Asia~Hovd.json",
    "2025a/1900_2050/America~New_York.json",
    "2025a/1900_2050/Asia~Dili.json",
    "2025a/1900_2050/America~New_York.json",
  ]);
  assertEquals(TimezoneRegion.takeVersionFallbacks(), []);
});
