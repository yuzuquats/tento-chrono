/**
 * # Every reader hears a zone outcome, not only the first to drain a queue
 *
 * tui-to-sdk-48 ask 2 (judge sdk r16, tui r14 R14-2): chrono handed each
 * zone outcome out of a process-global take-queue (`takeRebuilt`,
 * `takeFallbacks`, `takeVersionFallbacks`), once, to whichever caller drained
 * it first. A second client in the same process never heard of a zone built
 * from the platform before it opened, and a fallback carried no word of
 * where it came from. `onOutcome` tells every listener each outcome as it
 * happens; the queues stay for the SDK's traces.
 *
 * ## Invariants Tested
 * - A zone built from the platform (no served data) is heard by every
 *   listener on its first load, and again by a listener added later when
 *   that zone loads again from the cache; `takeRebuilt` still hands it out
 *   once.
 * - A served zone rebuilt for an offset mismatch is heard with the mismatch.
 * - A fallback `get` takes is heard with its source (`ical-tzid`, `rrule`),
 *   and the queue's record carries the source too.
 * - A data version the service does not serve is heard once when the loader
 *   decides it, and `dataVersionFallback()` answers it while that loader is
 *   installed; a loader that is restarted answers none.
 * - A fallback a loader above chrono reports (`reportFallback`) is heard
 *   with its source and joins no queue; a listener removed hears nothing.
 */
import { assert, assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { ICalDateLine } from "../chrono/recurrence/ical-date-line.ts";
import { Recurrence } from "../chrono/recurrence/recurrence.ts";
import type { Tzname } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

const REAL_FETCH = globalThis.fetch;

/** A constant-offset zone file, as the service serializes one. */
const constant = (offset: string) => [{
  before: `1900-01-01T00:00:00${offset}`,
  before_tz_abbr: "%z",
  after: `1900-01-01T00:00:00${offset}`,
  after_tz_abbr: "%z",
}];

/** The zone service's own loader over a fetch answering `files[version][name]` (404 when absent). */
function serving(files: Record<string, Record<string, unknown>>): void {
  globalThis.fetch = (input: string | URL | Request) => {
    const [version, , file] = String(input).replace(/^https:\/\/[^/]+\/timezones\//, "").split("/");
    const raw = files[version]?.[file.replace(/\.json$/, "").replaceAll("~", "/")];
    return Promise.resolve(raw === undefined ? new Response("", { status: 404 }) : new Response(JSON.stringify(raw)));
  };
  TimezoneRegion.setLoader(TimezoneRegion.DYNAMIC_LOADER);
  TimezoneRegion.takeRebuilt();
  TimezoneRegion.takeFallbacks();
  TimezoneRegion.takeVersionFallbacks();
}

/** Each test leaves the real fetch and the fixture loader behind it. */
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

/** Listen while `work` runs; each outcome heard, in a comparable form. */
async function hearing(work: () => Promise<unknown>): Promise<string[]> {
  const heard: string[] = [];
  const stop = TimezoneRegion.onOutcome((outcome) => heard.push(describe(outcome)));
  try {
    await work();
  } finally {
    stop();
  }
  return heard;
}

function describe(outcome: TimezoneRegion.Outcome): string {
  switch (outcome.kind) {
    case "fallback":
      return `fallback ${outcome.requested}->${String(outcome.used)} ${outcome.source}`;
    case "from-platform":
      return `from-platform ${String(outcome.region.fullname)} ${outcome.region.unserved ?? "mismatch"}`;
    case "data-version-fallback":
      return `data-version ${outcome.asked}->${outcome.used}`;
  }
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

served("a zone built from the platform is heard by every listener, on its first load and by a later reader", async () => {
  serving({ "2025a": { "America/New_York": [] } });
  const zone = "Pacific/Guadalcanal" as Tzname;
  const first: string[] = [];
  const stopFirst = TimezoneRegion.onOutcome((o) => first.push(describe(o)));
  try {
    await TimezoneRegion.getOpt(zone);
  } finally {
    stopFirst();
  }
  assertEquals(first, ["from-platform Pacific/Guadalcanal not-found"]);
  const later = await hearing(() => TimezoneRegion.getOpt(zone));
  assertEquals(later, ["from-platform Pacific/Guadalcanal not-found"], "a reader that opened afterwards hears it from the cache");
  assertEquals(TimezoneRegion.takeRebuilt().map((r) => String(r.fullname)), ["Pacific/Guadalcanal"], "the queue hands it out once");
  assertEquals(TimezoneRegion.takeRebuilt(), []);
});

served("a served zone rebuilt for an offset mismatch is heard", async () => {
  // Asia/Riyadh is +03:00; a file saying +05:00 disagrees with the platform.
  serving({ "2025a": { "America/New_York": [], "Asia/Riyadh": constant("+05:00") } });
  const heard = await hearing(() => TimezoneRegion.getOpt("Asia/Riyadh" as Tzname));
  assertEquals(heard, ["from-platform Asia/Riyadh mismatch"]);
});

served("a data version the service does not serve is heard once, and answered while its loader is installed", async () => {
  serving({ "2024b": { "Asia/Urumqi": constant("+06:00"), "Asia/Thimphu": constant("+06:00") } });
  assertEquals(TimezoneRegion.dataVersionFallback(), null, "nothing decided yet");
  const heard = await hearing(async () => {
    await TimezoneRegion.getOpt("Asia/Urumqi" as Tzname);
    await TimezoneRegion.getOpt("Asia/Thimphu" as Tzname);
  });
  assertEquals(heard, ["data-version 2025a->2024b"]);
  assertEquals(TimezoneRegion.dataVersionFallback(), { asked: "2025a", used: "2024b" });
  TimezoneRegion.setLoader(TimezoneRegion.DYNAMIC_LOADER);
  assertEquals(TimezoneRegion.dataVersionFallback(), null, "a restarted loader has decided nothing");
});

Deno.test("a fallback get takes is heard with its source: an iCal TZID, a recurrence rule's zone", async () => {
  installTimezoneLoader();
  TimezoneRegion.takeFallbacks();
  const raw = ICalDateLine.Raw.parse("EXDATE;TZID=Mars/Olympus:20260613T090000").asOk();
  assert(raw != null);
  const parsed = await quietly(() => Recurrence.parse(["RRULE:FREQ=DAILY;COUNT=3;TZID=Mars/Phobos"]));
  const recurrence = parsed.asOk();
  assert(recurrence != null, String(parsed.asErr()));
  TimezoneRegion.takeFallbacks();
  const heard = await hearing(() => quietly(async () => {
    await raw.resolve();
    await recurrence.timezone();
  }));
  assertEquals(heard, ["fallback Mars/Olympus->UTC ical-tzid", "fallback Mars/Phobos->UTC rrule"]);
  assertEquals(
    TimezoneRegion.takeFallbacks().map((f) => `${f.requested}->${f.used} ${f.source}`),
    ["Mars/Olympus->UTC ical-tzid", "Mars/Phobos->UTC rrule"],
    "the queue's record carries the source",
  );
});

Deno.test("a fallback a loader above chrono reports is heard with its source and joins no queue", async () => {
  TimezoneRegion.takeFallbacks();
  const heard = await hearing(async () => {
    TimezoneRegion.reportFallback({ requested: "Mars/Olympus_Mons", used: "UTC" as Tzname, source: "event" });
  });
  assertEquals(heard, ["fallback Mars/Olympus_Mons->UTC event"]);
  assertEquals(TimezoneRegion.takeFallbacks(), [], "the reporter traces its own");
  const after: string[] = [];
  TimezoneRegion.onOutcome((o) => after.push(describe(o)))();
  TimezoneRegion.reportFallback({ requested: "Mars/Olympus_Mons", used: "UTC" as Tzname, source: "event" });
  assertEquals(after, [], "a removed listener hears nothing");
});
