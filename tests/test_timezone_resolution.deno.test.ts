import { assert, assertEquals } from "@std/assert";
import {
  DateTime,
  DateTimeRegion,
  type MsSinceEpoch,
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

Deno.test("transition queries stop before or at the first table entry", () => {
  const la = losAngeles();
  const [first, second] = la.transitions;
  const before = Utc.parse("2025-03-09T09:59:59Z")!.mse;
  const between = Utc.parse("2025-06-01T00:00:00Z")!.mse;

  assertEquals(la.transitionsBetween({ start: before, end: before }), []);
  assertEquals(la.transitionsBetween({ start: before, end: first.before.mse }), [first]);
  assertEquals(la.transitionsBetween({ start: between, end: between }), [first]);
  assertEquals(la.transitionsBetween({ start: second.before.mse, end: second.before.mse }), [second]);
  assertEquals(la.transitionsBetween({ start: between, end: before }), []);
});

Deno.test("platform recurrence range reads follow point offsets across UTC years", () => {
  const ny = TimezoneRegion.platformRecurrenceZone("America/New_York" as Tzname)!;
  const mse = (iso: string) => DateTime.epochFromRfc3339(iso).exp();
  const cases = [
    {
      "start": "1899-12-31T00:00:00Z",
      "end": "1900-01-02T00:00:00Z",
      "transitions": [],
    },
    {
      "start": "2075-01-01T00:00:00Z",
      "end": "2075-12-31T23:59:59Z",
      "transitions": ["2075-03-10T07:00:00Z", "2075-11-03T06:00:00Z"],
    },
    {
      "start": "2074-12-01T00:00:00Z",
      "end": "2076-11-01T06:00:00Z",
      "transitions": [
        "2075-03-10T07:00:00Z",
        "2075-11-03T06:00:00Z",
        "2076-03-08T07:00:00Z",
        "2076-11-01T06:00:00Z",
      ],
    },
    {
      "start": "2049-12-31T23:59:59Z",
      "end": "2050-03-13T07:00:00Z",
      "transitions": ["2050-03-13T07:00:00Z"],
    },
  ];
  for (const input of cases) {
    const start = mse(input.start);
    const end = mse(input.end);
    const entries = ny.transitionsBetween({ start, end });
    assertEquals(entries[0], ny.activeTransition(start), input.start);
    assertEquals(entries.slice(1).map((t) => t.before.mse), input.transitions.map(mse), input.start);
    for (const { before, after } of entries.slice(1)) {
      assertEquals(after.time.tz.info.offset.toMs, ny.tzAtMse(before.mse).info.offset.toMs);
    }
    assertEquals(
      ny.recurrenceTransitions(start, end).map((t) => t.before.mse),
      input.transitions.map(mse),
      input.start,
    );
  }
});

const fallbackRangeCases = [
  {
    "end": "2076-12-01T00:00:00.123Z",
    "includesNovember": true,
  },
  {
    "end": "2076-11-01T06:00:00Z",
    "includesNovember": true,
  },
  {
    "end": "2076-11-01T05:59:59.999Z",
    "includesNovember": false,
  },
];
for (const { end, includesNovember } of fallbackRangeCases) {
  Deno.test(`platform fallback returns exact onsets through ${end}`, async () => {
    // Run the synchronous scan in a worker so a stuck bisection can be stopped.
    const module = new URL("../chrono/mod.ts", import.meta.url);
    const script = `
      import { TimezoneRegion } from ${JSON.stringify(module.href)};
      Reflect.deleteProperty(globalThis, "Temporal");
      const ny = TimezoneRegion.platformRecurrenceZone("America/New_York");
      const start = Date.parse("2074-12-01T00:00:00.123Z");
      const end = Date.parse(${JSON.stringify(end)});
      const entries = ny.transitionsBetween({ start, end });
      self.postMessage(entries.slice(1).map((entry) => entry.before.mse));
    `;
    const worker = new Worker(`data:application/javascript,${encodeURIComponent(script)}`, { type: "module" });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const actual = await new Promise<number[]>((resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Fallback transition scan exceeded 4 seconds")), 4_000);
        worker.onmessage = (event) => resolve(event.data);
        worker.onerror = (event) => {
          event.preventDefault();
          reject(new Error(event.message));
        };
      });
      const expected = [
        "2075-03-10T07:00:00.000Z",
        "2075-11-03T06:00:00.000Z",
        "2076-03-08T07:00:00.000Z",
      ];
      if (includesNovember) expected.push("2076-11-01T06:00:00.000Z");
      assertEquals(actual.map((ms) => new Date(ms).toISOString()), expected);
    } finally {
      clearTimeout(timer);
      worker.terminate();
    }
  });
}

Deno.test("a served table keeps the real transition where platform extension meets it", () => {
  const base = region(
    "America/New_York",
    ["1883-11-18T12:03:58-04:56:02", "1883-11-18T12:00:00-05:00"],
  );
  const extended = TimezoneRegion.forPlatformRecurrence(base, { extendServedPast: true });
  const start = DateTime.epochFromRfc3339("1883-11-18T00:00:00Z").exp();
  const [seam] = base.transitions;
  assertEquals(extended.recurrenceTransitions(start, seam.before.mse), [seam]);
  assertEquals(extended.recurrenceTransitions(seam.before.mse, seam.before.mse), [seam]);
});

Deno.test({
  name: "platform recurrence ranges span the full Date range using the native transition list",
  ignore: Reflect.get(globalThis, "Temporal") == null,
  fn() {
    const ny = TimezoneRegion.platformRecurrenceZone("America/New_York" as Tzname)!;
    const limit = 8.64e15;
    const began = performance.now();
    const entries = ny.transitionsBetween({
      start: (-limit - 1) as MsSinceEpoch,
      end: (limit + 1) as MsSinceEpoch,
    });
    const elapsed = performance.now() - began;
    assert(elapsed < 10_000, `full Date range took ${Math.round(elapsed)} ms`);
    assertEquals(entries[0]?.before.mse, -limit);
    assertEquals(entries[1]?.before.mse, Date.parse("1883-11-18T17:00:00Z"));
    assertEquals(entries[1]?.after.time.tz.info.offset.toMs, -18_000_000);
    for (const { before, after } of entries.slice(1)) {
      assert(
        before.time.tz.info.offset.toMs !== after.time.tz.info.offset.toMs ||
          before.tzabbr !== after.tzabbr,
        `synthetic transition at ${before.mse}`,
      );
    }
    const last = entries.at(-1)!;
    assertEquals(last.before.mse, Date.parse("+275760-03-09T07:00:00Z"));
  },
});

Deno.test("wall-clock resolution and instant projection agree before the first transition", () => {
  const la = losAngeles();
  const wall = Utc.parse("2025-02-01T12:00:00Z")!.ndt;
  const resolved = la.toWallClock(wall);
  const projected = la.toTz(resolved.toUtc());
  assertEquals(resolved.rfc3339(), "2025-02-01T12:00:00-08:00");
  assertEquals(projected.rfc3339(), resolved.rfc3339());
  assertEquals(projected.mse, resolved.mse);
  assertEquals(projected.tz.info.tzname, la.fullname);
});

Deno.test("Local resolves each instant using the host offset for that timestamp", async () => {
  const module = new URL("../chrono/mod.ts", import.meta.url).href;
  const { code, stdout, stderr } = await new Deno.Command(Deno.execPath(), {
    args: ["eval", "--no-lock", `
      import { DateTime, Local, Utc } from ${JSON.stringify(module)};
      const winter = Utc.parse("2025-01-01T12:00:00Z");
      const summer = Utc.parse("2025-07-01T12:00:00Z");
      const lateFold = Utc.parse("2025-11-02T09:30:00Z");
      const wall = Utc.parse("2025-11-02T01:30:00Z").ndt;
      const skipped = Utc.parse("2025-03-09T02:30:00Z").ndt;
      console.log(JSON.stringify([
        Local.fromMse(winter.mse).rfc3339(),
        DateTime.fromMse(summer.mse, Local).rfc3339(),
        summer.toTz(Local).rfc3339(),
        lateFold.toTz(Local).rfc3339(),
        lateFold.toTz(Local).toUtc().rfc3339(),
        new DateTime(wall, Local).rfc3339(),
        new DateTime(skipped, Local).toUtc().rfc3339(),
      ]));
    `],
    env: { TZ: "America/Los_Angeles" },
  }).output();
  const decoder = new TextDecoder();
  assertEquals(code, 0, decoder.decode(stderr));
  assertEquals(JSON.parse(decoder.decode(stdout)), [
    "2025-01-01T04:00:00-08:00",
    "2025-07-01T05:00:00-07:00",
    "2025-07-01T05:00:00-07:00",
    "2025-11-02T01:30:00-08:00",
    "2025-11-02T09:30:00Z",
    "2025-11-02T01:30:00-07:00",
    "2025-03-09T10:30:00Z",
  ]);
});
