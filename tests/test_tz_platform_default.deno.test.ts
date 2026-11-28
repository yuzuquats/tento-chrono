/**
 * The default zone loader is `PLATFORM_LOADER`: zones build from the
 * platform's own timezone data (Intl) with no network, served as loaded
 * (not `unserved`), and a name the platform does not know does not load.
 */
import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import {
  DateTime,
  type ICalendarRecurrenceProfile,
  NaiveDate,
  naivedatetime,
  Recurrence,
  type RecurrenceStart,
} from "../chrono/mod.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";
import { Fixtures } from "./fixture-runner.deno.ts";

Deno.test("the default loader builds zones from the platform, with no fetch", async () => {
  assert(TimezoneRegion.getLoader() === TimezoneRegion.PLATFORM_LOADER);
  const real = globalThis.fetch;
  let fetches = 0;
  globalThis.fetch = () => {
    fetches++;
    return Promise.reject(new TypeError("no network in this test"));
  };
  try {
    const ny = await TimezoneRegion.getOpt("America/New_York" as Tzname);
    assert(ny != null);
    assertEquals(ny.unserved, null);
    assertEquals(ny.mismatch, null);
    assertEquals(ny.datetime(naivedatetime(2024, 1, 15, 9)).asWallClock().toString(), "2024-01-15T09:00:00-05:00");
    assertEquals(ny.datetime(naivedatetime(2024, 7, 15, 9)).asWallClock().toString(), "2024-07-15T09:00:00-04:00");
    assertEquals(await TimezoneRegion.getOpt("Mars/Olympus" as Tzname), null);
    assertEquals(fetches, 0);
  } finally {
    globalThis.fetch = real;
  }
});

Deno.test("served recurrence views keep past and future policies independent", () => {
  const name = "America/New_York" as Tzname;
  const boundary = "1899-12-31T19:00:00-05:00";
  const anchor = TimezoneRegion.Transition.parse({
    before: boundary,
    after: boundary,
    before_tz_abbr: "EST",
    after_tz_abbr: "EST",
  }, name);
  const date = DateTime.fromRfc3339("1882-01-08T16:00:00Z").exp();
  for (const pastFirst of [true, false]) {
    const source = new TimezoneRegion(name, [anchor]);
    const future = () => TimezoneRegion.forPlatformRecurrence(source, { extendServedFuture: true });
    const history = () => TimezoneRegion.forPlatformRecurrence(source, {
      extendServedPast: true,
      extendServedFuture: true,
    });
    const [a, b] = pastFirst ? [history(), future()] : [future(), history()];
    assertStrictEquals(future(), pastFirst ? b : a);
    assertStrictEquals(history(), pastFirst ? a : b);
    assertStrictEquals(
      TimezoneRegion.forPlatformRecurrence(future(), { extendServedPast: true, extendServedFuture: true }),
      history(),
    );
    assertEquals(future().toTz(date), source.toTz(date));
    assertEquals(history().toTz(date).tz.info.offset.toMs, -17_762_000);
  }
  const wrongOffset = "1899-12-31T20:00:00-04:00";
  const conflicting = new TimezoneRegion(name, [TimezoneRegion.Transition.parse({
    before: wrongOffset,
    after: wrongOffset,
    before_tz_abbr: "EDT",
    after_tz_abbr: "EDT",
  }, name)]);
  assertStrictEquals(
    TimezoneRegion.forPlatformRecurrence(conflicting, { extendServedPast: true }),
    conflicting,
  );
});

Fixtures.load<
  {
    lines: string[];
    through: string;
    checkpoints: string[];
    dtstart?: RecurrenceStart;
    profile?: ICalendarRecurrenceProfile;
    rruleJsHostTimeZone?: string;
  },
  string[]
>(new URL("./fixtures/", import.meta.url).pathname, "platform-recurrence").run(
  async ({ lines, through, checkpoints, dtstart, profile, rruleJsHostTimeZone }) => {
    const series = (await Recurrence.fromICalendar(lines, {
      dtstart,
      profile,
      rruleJsHostTimeZone,
    })).exp();
    const direct = series.occurrences({ through: NaiveDate.parse(through) })
      .map(String);
    const cursor = series.generator();
    const incremental = [...checkpoints, through].flatMap((day) =>
      cursor.generateUpToDate(NaiveDate.parse(day)).map(String)
    );
    assertEquals(incremental, direct);
    return direct;
  },
  (actual, expected) => assertEquals(actual, expected),
);
