import { assertEquals } from "@std/assert";
import {
  DateTime,
  DateTimeRegion,
  TimezoneRegion,
  Utc,
} from "../chrono/mod.ts";
import type { Tzname } from "../chrono/timezone.ts";

function region(
  name: string,
  ...transitions: [before: string, after: string][]
): TimezoneRegion {
  const tzname = name as Tzname;
  return new TimezoneRegion(
    tzname,
    transitions.map(([before, after]) =>
      TimezoneRegion.Transition.parse({
        before,
        after,
        before_tz_abbr: "before",
        after_tz_abbr: "after",
      }, tzname)
    ),
  );
}

function losAngeles(): TimezoneRegion {
  return region(
    "America/Los_Angeles",
    ["2025-03-09T02:00:00-08:00", "2025-03-09T03:00:00-07:00"],
    ["2025-11-02T02:00:00-07:00", "2025-11-02T01:00:00-08:00"],
  );
}

function withClock(iso: string, check: () => void): void {
  const RealDate = globalThis.Date;
  const now = RealDate.parse(iso);
  class ClockDate extends RealDate {
    constructor() {
      super(now);
    }
    static override now() {
      return now;
    }
  }
  try {
    globalThis.Date = ClockDate as DateConstructor;
    check();
  } finally {
    globalThis.Date = RealDate;
  }
}

Deno.test("region today uses the region's date at the current instant", () => {
  const la = losAngeles();
  const tokyo = region("Asia/Tokyo", [
    "2000-01-01T00:00:00+09:00",
    "2000-01-01T00:00:00+09:00",
  ]);
  withClock("2025-11-02T00:30:00Z", () => {
    assertEquals([la.today().nd.rfc3339(), tokyo.today().nd.rfc3339()], [
      "2025-11-01",
      "2025-11-02",
    ]);
  });
  withClock("2025-11-02T07:00:00Z", () => {
    assertEquals(la.today().nd.rfc3339(), "2025-11-02");
  });
});

Deno.test("region ranges retain both instants in the repeated hour", () => {
  const la = losAngeles();
  const start = Utc.parse("2025-11-02T08:30:00Z")!;
  const end = Utc.parse("2025-11-02T09:30:00Z")!;
  const range = DateTimeRegion.Range.fromSingleTz(
    new DateTime.Range(start, end),
    la,
  );
  assertEquals(range.start.ndt.toString(), range.end.ndt.toString());
  assertEquals(range.asWallClock().start.mse, start.mse);
  assertEquals(range.asWallClock().end.mse, end.mse);
  assertEquals(range.duration().toMs, 60 * 60 * 1000);
  assertEquals(la.datetime(range.start.ndt).asWallClock().mse, end.mse);
});

Deno.test("region now preserves the first occurrence of a repeated local time", () => {
  const la = losAngeles();
  withClock("2025-11-02T08:30:00Z", () => {
    assertEquals(la.now().asWallClock().rfc3339(), "2025-11-02T01:30:00-07:00");
  });
  withClock("2025-11-02T09:30:00Z", () => {
    assertEquals(la.now().asWallClock().rfc3339(), "2025-11-02T01:30:00-08:00");
  });
});

Deno.test("wall-clock transitions that cross midnight apply on both dates", () => {
  const stJohns = region(
    "America/St_Johns",
    ["2009-03-08T00:01:00-03:30", "2009-03-08T01:01:00-02:30"],
    ["2009-11-01T00:01:00-02:30", "2009-10-31T23:01:00-03:30"],
  );
  const resolve = (input: string) =>
    stJohns.toWallClock(Utc.parse(input)!.ndt).rfc3339();
  assertEquals(resolve("2009-10-31T12:00:00Z"), "2009-10-31T12:00:00-02:30");
  assertEquals(resolve("2009-10-31T23:01:00Z"), "2009-10-31T23:01:00-03:30");
  assertEquals(resolve("2009-11-01T00:00:00Z"), "2009-11-01T00:00:00-03:30");
  assertEquals(resolve("2009-11-01T01:00:00Z"), "2009-11-01T01:00:00-03:30");

  const kathmandu = region(
    "Asia/Kathmandu",
    ["1986-01-01T00:00:00+05:30", "1986-01-01T00:15:00+05:45"],
  );
  const before = Utc.parse("1985-12-31T23:59:59Z")!.ndt;
  const gap = Utc.parse("1986-01-01T00:01:00Z")!.ndt;
  assertEquals(
    kathmandu.toWallClock(before).rfc3339(),
    "1985-12-31T23:59:59+05:30",
  );
  assertEquals(
    kathmandu.toWallClock(gap).rfc3339(),
    "1986-01-01T00:01:00+05:45",
  );
});

Deno.test("wall-clock resolution observes both transitions on the same date", () => {
  const tz = region(
    "Test/DoubleSwitch",
    ["2025-06-01T02:00:00+00:00", "2025-06-01T03:00:00+01:00"],
    ["2025-06-01T16:00:00+01:00", "2025-06-01T15:00:00+00:00"],
  );
  const resolve = (hour: string) =>
    tz.toWallClock(Utc.parse(`2025-06-01T${hour}:00:00Z`)!.ndt).tz.info.offset
      .toMs;
  assertEquals(["01", "02", "12", "15", "20"].map(resolve), [
    0,
    3600000,
    3600000,
    0,
    0,
  ]);
});
