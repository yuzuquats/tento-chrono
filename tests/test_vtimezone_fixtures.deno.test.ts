import {
  assert,
  assertEquals,
  assertStrictEquals,
  assertThrows,
  assertStringIncludes,
} from "@std/assert";
import {
  DateTime,
  ICalendar,
  NaiveDate,
  readVTimeZone,
  Recurrence,
  RecurrenceComposition,
  TimezoneRegion,
} from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";

interface Input {
  lines: string[];
  through: string;
  outsideThrough?: string;
  legacyStart?: string;
  event?: string[];
  checkpoints?: string[];
}

type Transition = [
  instant: string,
  beforeSeconds: number,
  afterSeconds: number,
  abbreviation: string,
];

type Expected = {
  name: string;
  transitions: Transition[];
  eventStarts?: string[];
} | { error: string };

const dir = new URL("./fixtures/", import.meta.url).pathname;
const fixtures = Fixtures.load<Input, Expected>(dir, "vtimezone");
fixtures.run(
  async ({ lines, through, event, checkpoints, outsideThrough }): Promise<Expected> => {
    const day = NaiveDate.parse(through);
    const compiled = await readVTimeZone(lines, { through: day });
    if (compiled.isErr) return { error: compiled.expe().message };

    const zone = compiled.exp();
    assertStrictEquals(
      TimezoneRegion.forPlatformRecurrence(zone, { extendServedFuture: true }),
      zone,
    );
    const transitions = zone.transitions.map((
      { before, after },
    ): Transition => [
      before.time.toUtc().toString(),
      before.time.tz.info.offset.toMs / 1000,
      after.time.tz.info.offset.toMs / 1000,
      after.tzabbr,
    ]);
    for (const [instant, beforeOffset, afterOffset] of transitions) {
      const at = DateTime.fromRfc3339(instant).exp().toUtc();
      const before = at.add({ ms: -1 });
      for (
        const [query, offset] of [[before, beforeOffset], [
          at,
          afterOffset,
        ]] as const
      ) {
        const local = zone.toTz(query);
        assertEquals(local.tz.info.offset.toMs / 1000, offset);
        assertEquals(local.tz.info.tzname, zone.fullname);
        assertEquals(local, zone.toRfc5545LocalTime(query));
      }
    }

    if (event == null) return { name: zone.fullname, transitions };
    const series = (await Recurrence.fromICalendar(event, {
      rfcTimeZone: (id) => id === zone.fullname ? zone : undefined,
    })).exp();
    const actual = series.occurrences({ through: day }).map(String);
    const cursor = series.generator();
    const rejectOutsideCoverage = () => {
      if (outsideThrough == null) return;
      const outside = NaiveDate.parse(outsideThrough);
      const message = "VTIMEZONE table does not cover the full UTC date " + outside;
      assertThrows(() => series.occurrences({ through: outside }), RangeError, message);
      assertThrows(() => cursor.generateUpToDate(outside), RangeError, message);
    };
    rejectOutsideCoverage();
    const windows = (checkpoints ?? [day.addDays(-1).toString()]).map(
      NaiveDate.parse,
    );
    assertEquals(
      [...windows, day].flatMap((end) => cursor.generateUpToDate(end)).map(
        String,
      ),
      actual,
    );
    rejectOutsideCoverage();
    return { name: zone.fullname, transitions, eventStarts: actual };
  },
  (actual, expected) => {
    if ("error" in expected) {
      assert("error" in actual);
      assertStringIncludes(actual.error, expected.error);
    } else assertEquals(actual, expected);
  },
);

const longerRule = {
  "lines": [
    "BEGIN:VTIMEZONE",
    "TZID:X-Covered",
    "BEGIN:STANDARD",
    "DTSTART:20250101T000000",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0800",
    "TZNAME:CAL",
    "END:STANDARD",
    "END:VTIMEZONE",
  ],
  "through": "2026-07-01",
  "outsideThrough": "2026-07-02",
  "event": [
    "DTSTART;TZID=X-Covered:20260630T090000",
    "RRULE:FREQ=DAILY;UNTIL=20261231T235959Z",
  ],
  "expected": ["2026-06-30T17:00:00Z", "2026-07-01T17:00:00Z"],
};

for (const rfcDateMode of ["dtstart", "written"] as const) {
  Deno.test(`VTIMEZONE covered queries support later UNTIL (${rfcDateMode})`, async () => {
    const { lines, event, through, outsideThrough, expected } = longerRule;
    const lastDay = NaiveDate.parse(through);
    const outside = NaiveDate.parse(outsideThrough);
    const zone = (await readVTimeZone(lines, { through: lastDay })).exp();
    const series = (await Recurrence.fromICalendar(event, {
      rfcDateMode,
      rfcTimeZone: (id) => id === zone.fullname ? zone : undefined,
    })).exp();
    const message = "VTIMEZONE table does not cover the full UTC date " + outside;
    assertEquals(series.occurrences({ through: lastDay }).map(String), expected);
    assertThrows(() => series.occurrences({ through: outside }), RangeError, message);

    const cursor = series.generator();
    assertEquals(cursor.generateUpToDate(lastDay.addDays(-1)).map(String), expected.slice(0, 1));
    assertThrows(() => cursor.generateUpToDate(outside), RangeError, message);
    assertEquals(cursor.generateUpToDate(lastDay).map(String), expected.slice(1));
  });
}

for (const { cases } of fixtures.items) {
  for (const { name, input, expected } of cases) {
    const { lines, through, event, outsideThrough, legacyStart } = input;
    if (event == null || outsideThrough == null || legacyStart == null || "error" in expected) continue;

    for (const reader of ["generateEvents", "generateGoogleEvents"] as const) {
      Deno.test(`VTIMEZONE legacy ${reader} coverage: ${name}`, async () => {
        const day = NaiveDate.parse(through);
        const outside = NaiveDate.parse(outsideThrough);
        const zone = (await readVTimeZone(lines, { through: day })).exp();
        const raw = (await ICalendar.Raw.parse(event, true, new Map([[zone.fullname, zone]]))).exp();
        const recurrence = new Recurrence(raw);
        const start = DateTime.fromRfc3339(legacyStart).exp();
        const startZone = raw.dtstart?.region ?? null;
        const cursor = reader === "generateEvents"
          ? await recurrence.generateEvents(start, null, RecurrenceComposition.RULE_ONLY)
          : await recurrence.generateGoogleEvents(start, startZone);
        const message = "VTIMEZONE table does not cover the full UTC date " + outside;

        assertThrows(() => cursor.generateUpToDate(outside), RangeError, message);
        assertEquals(cursor.generateUpToDate(day).map(String), expected.eventStarts);
        assertThrows(() => cursor.generateUpToDate(outside), RangeError, message);
      });
    }
  }
}
