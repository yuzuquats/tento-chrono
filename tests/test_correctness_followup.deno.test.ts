import { assertEquals, assertThrows } from "@std/assert";
import {
  DateTime,
  NaiveDate,
  Recurrence,
  RecurrenceComposition,
  RRule,
  TimezoneRegion,
  Utc,
} from "../chrono/mod.ts";
import { IsoDate } from "../chrono/recurrence/iso-date.ts";

import type { Tzname } from "../chrono/timezone.ts";

const at = (iso: string) => Utc.parse(iso)!;
const day = (iso: string) => at(iso + "T00:00:00Z").date;

Deno.test("civil-day fragments assign both sides of a midnight fall-back exactly", async () => {
  const zone = await TimezoneRegion.get("America/St_Johns" as Tzname);
  const oct31 = zone.date(day("2009-10-31"));
  const nov1 = zone.date(day("2009-11-01"));
  const endpoints = (date: typeof oct31) =>
    date.dateFragments().map((
      { start, end, length },
    ) => [start.toUtc().rfc3339(), end.toUtc().rfc3339(), length.toMins]);
  assertEquals(endpoints(oct31), [
    ["2009-10-31T02:30:00Z", "2009-11-01T02:30:00Z", 1440],
    ["2009-11-01T02:31:00Z", "2009-11-01T03:30:00Z", 59],
  ]);
  assertEquals(endpoints(nov1), [
    ["2009-11-01T02:30:00Z", "2009-11-01T02:31:00Z", 1],
    ["2009-11-01T03:30:00Z", "2009-11-02T03:30:00Z", 1440],
  ]);
  for (
    const [iso, isNov1] of [
      ["2009-11-01T02:29:59.999Z", false],
      ["2009-11-01T02:30:30Z", true],
      ["2009-11-01T02:31:00Z", false],
      ["2009-11-01T03:30:00Z", true],
    ] as const
  ) {
    assertEquals(oct31.containsInstant(at(iso)), !isNov1);
    assertEquals(nov1.containsInstant(at(iso)), isNov1);
  }
});

Deno.test("civil-day fragments omit a skipped date and start a midnight gap after the jump", async () => {
  const apia = (await TimezoneRegion.get("Pacific/Apia" as Tzname)).date(
    day("2011-12-30"),
  );
  assertEquals(apia.dateFragments(), []);
  assertEquals(apia.date.start.mse, apia.date.end.mse);
  assertEquals(apia.shift(), null);

  const havana = (await TimezoneRegion.get("America/Havana" as Tzname)).date(
    day("2025-03-09"),
  );
  assertEquals(havana.date.start.rfc3339(), "2025-03-09T01:00:00-04:00");
  assertEquals(havana.dateFragments().map((f) => f.length.toHrsF), [23]);
});

Deno.test("malformed iCalendar times cannot suppress events or change UNTIL", async () => {
  for (
    const stamp of ["20260101T250000Z", "20260101T016500Z", "20260101T010099Z"]
  ) {
    assertEquals(IsoDate.parse(stamp).isErr, true, stamp);
    assertEquals(
      RRule.parse("RRULE:FREQ=DAILY;UNTIL=" + stamp).isErr,
      true,
      stamp,
    );
    const parsed = await Recurrence.parse([
      "DTSTART:20260101T010000Z",
      "RRULE:FREQ=DAILY;COUNT=2",
      "EXDATE:" + stamp,
    ]);
    assertEquals(parsed.isErr, true, stamp);
  }
  assertEquals(RRule.parse("RRULE:FREQ=DAILY;UNTIL=").isErr, true);
  assertEquals(
    IsoDate.parse("20161231T235960Z ").exp().ical(),
    "20161231T235959Z",
  );
  assertEquals(IsoDate.parse("20260101T09Z").exp().ical(), "20260101T090000Z");
});

Deno.test("a plain yearly rule stops at UNTIL without charging the following year", async () => {
  const start = at("2026-01-01T09:00:00Z");
  for (const until of ["20261231", "20261231T090000Z"]) {
    const r = (await Recurrence.parse([
      "DTSTART:20260101T090000Z",
      "RRULE:FREQ=YEARLY;UNTIL=" + until,
    ])).exp();
    const google = await r.generateGoogleEvents(start, TimezoneRegion.UTC, 1);
    const rfc = await r.generateEvents(
      start,
      TimezoneRegion.UTC,
      RecurrenceComposition.RFC5545,
      1,
    );
    for (const gen of [google, rfc]) {
      assertEquals(gen.generateUpToDate(day("2026-12-31")).map((d) => d.mse), [
        start.mse,
      ]);
    }
  }
});

Deno.test("composed filters close open generators from downstream to upstream", () => {
  const trace: string[] = [];
  const source = (name: string, closeError?: Error): NaiveDate.Filter =>
    function* (period) {
      try {
        yield period;
        yield period;
      } finally {
        trace.push(name);
        if (closeError) throw closeError;
      }
    };
  const tuple = [day("2026-01-01"), "day"] as const;
  const iterable = NaiveDate.Filter.compose([
    source("upstream"),
    source("leaf"),
  ]);
  for (const _ of iterable([...tuple])) break;
  assertEquals(trace, ["leaf", "upstream"]);

  trace.length = 0;
  const exploding = NaiveDate.Filter.compose([
    source("upstream"),
    source("leaf", new Error("close")),
  ]);
  const it = exploding([...tuple]);
  it.next();
  assertThrows(() => it.return(undefined), Error, "close");
  assertEquals(trace, ["leaf", "upstream"]);
});

Deno.test("RFC 3339 rounds fractional ties exactly and stays inside its four-digit year range", () => {
  for (
    const [input, expected] of [
      ["2026-01-01T00:00:00.5005Z", "2026-01-01T00:00:00.501Z"],
      ["2026-01-01T00:00:00.5015Z", "2026-01-01T00:00:00.502Z"],
      [
        "2026-01-01T00:00:00.500499999999999999999Z",
        "2026-01-01T00:00:00.500Z",
      ],
      ["2026-12-31T23:59:59.9995Z", "2027-01-01T00:00:00Z"],
      ["9999-12-31T23:59:59.9999Z", "9999-12-31T23:59:59.999Z"],
    ]
  ) {
    const actual = DateTime.fromRfc3339(input).exp().rfc3339();
    assertEquals(actual, expected);
    assertEquals(DateTime.fromRfc3339(actual).isOk, true);
  }
});
