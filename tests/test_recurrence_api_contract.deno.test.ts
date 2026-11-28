import { assertEquals, assertInstanceOf, assertThrows } from "@std/assert";
import {
  DateTime,
  DateTimeRegion,
  type GraphRecurringMaster,
  ICalendar,
  NaiveDate,
  NaiveDateTime,
  readVTimeZone,
  Recurrence,
  type RRuleLike,
  TimezoneRegion,
  Tzname,
} from "../chrono/mod.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

const through = NaiveDate.parse("2026-04-02");

Deno.test("dateutil captures original timezone spelling before concurrent cold imports", async () => {
  const lines = [
    "DTSTART;TZID=America/New_York:20260101T090000",
    "RRULE:FREQ=DAILY;COUNT=1",
  ];
  const read = (input: string[]) =>
    Recurrence.fromICalendar(input, { profile: "dateutil" });
  const control = read(lines.slice());
  const modified = read(lines);
  lines[0] = "DTSTART:20260101T090000";

  for (const result of await Promise.all([control, modified])) {
    assertEquals(result.exp().occurrences({ through }).map(String), [
      "2026-01-01T14:00:00Z",
    ]);
  }
});

Deno.test("rrule.js captures original DTSTART before its host timezone loads", async () => {
  const lines = ["DTSTART:20260101T090000Z", "RRULE:FREQ=DAILY;COUNT=1"];
  const pending = Recurrence.fromICalendar(lines, {
    profile: "rrule-js",
    rruleJsHostTimeZone: "UTC",
  });
  lines[0] = "DTSTART:20260104T090000Z";
  assertEquals((await pending).exp().occurrences({ through }).map(String), [
    "2026-01-01T09:00:00Z",
  ]);
});

Deno.test("a throwing recurrence start accessor reports a bind error", async () => {
  const failure = new Error("start unavailable");
  const dtstart = {
    get dateTime(): string {
      throw failure;
    },
  };
  const result = await Recurrence.fromICalendar(["RRULE:FREQ=DAILY;COUNT=1"], {
    profile: "dateutil",
    dtstart,
  });
  assertEquals(result.asErr(), failure);
});

Deno.test("option and Google end accessors report bind errors", async () => {
  const failure = new Error("option unavailable");
  const lines = ["RRULE:FREQ=DAILY;COUNT=1"];
  const fromStart = await Recurrence.fromICalendar(lines, {
    get dtstart(): never {
      throw failure;
    },
  });
  const fromDateMode = await Recurrence.fromICalendar(lines, {
    get rfcDateMode(): never {
      throw failure;
    },
  });
  const fromEnd = await Recurrence.fromICalendar(lines, {
    profile: "google",
    dtstart: { dateTime: "2026-01-01T09:00:00Z" },
    dtend: {
      get dateTime(): never {
        throw failure;
      },
    },
  });
  for (const result of [fromStart, fromDateMode, fromEnd]) {
    assertEquals(result.asErr(), failure);
  }
});

Deno.test("dateutil captures wire inputs before a cold or warm import", async () => {
  const read = () => {
    const lines = ["RRULE:FREQ=DAILY;COUNT=1"];
    const dtstart = { dateTime: "2026-01-01T09:00:00Z" };
    const pending = Recurrence.fromICalendar(lines, {
      profile: "dateutil",
      dtstart,
    });
    lines[0] = "RRULE:FREQ=DAILY;COUNT=2";
    dtstart.dateTime = "2026-01-02T09:00:00Z";
    return pending;
  };

  const cold = await Promise.all([read(), read()]);
  for (const result of [...cold, await read()]) {
    assertEquals(result.exp().occurrences({ through }).map(String), [
      "2026-01-01T09:00:00Z",
    ]);
  }
});

Deno.test("Graph captures the master and its nested wire fields before binding", async () => {
  const read = () => {
    const days = ["thursday"] satisfies NonNullable<
      GraphRecurringMaster["recurrence"]["pattern"]["daysOfWeek"]
    >[number][];
    const master: GraphRecurringMaster = {
      start: { dateTime: "2026-01-01T09:00:00", timeZone: "UTC" },
      recurrence: {
        pattern: { type: "weekly", interval: 1, daysOfWeek: days },
        range: {
          type: "numbered",
          startDate: "2026-01-01",
          numberOfOccurrences: 1,
        },
      },
    };
    const pending = Recurrence.fromGraph(master);
    master.start.dateTime = "2026-01-01T10:00:00";
    master.recurrence.range.numberOfOccurrences = 2;
    days.length = 0;
    return pending;
  };

  const cold = await Promise.all([read(), read()]);
  for (const result of [...cold, await read()]) {
    assertEquals(result.exp().occurrences({ through }).map(String), [
      "2026-01-01T09:00:00Z",
    ]);
  }
});

Deno.test("recurrence import reads fields supplied by prototype getters", async () => {
  class Clock {
    get dateTime() {
      return "2026-01-01T09:00:00Z";
    }
    get timeZone() {
      return "UTC";
    }
  }

  const dateutil = await Recurrence.fromICalendar(
    ["RRULE:FREQ=DAILY;COUNT=1"],
    {
      profile: "dateutil",
      dtstart: new Clock(),
    },
  );

  const master = new class implements GraphRecurringMaster {
    get start() {
      return new Clock();
    }
    get recurrence(): GraphRecurringMaster["recurrence"] {
      return {
        pattern: new class {
          get type(): "daily" {
            return "daily";
          }
          get interval() {
            return 1;
          }
        }(),
        range: {
          type: "numbered",
          startDate: "2026-01-01",
          numberOfOccurrences: 1,
        },
      };
    }
  }();
  const graph = await Recurrence.fromGraph(
    master,
    new class {
      #zone = "UTC";
      resolveTimeZone() {
        return this.#zone;
      }
    }(),
  );

  for (const result of [dateutil, graph]) {
    assertEquals(result.exp().occurrences({ through }).map(String), [
      "2026-01-01T09:00:00Z",
    ]);
  }
});

Deno.test("default RFC date handling uses DTSTART and written-form matching is explicit", async () => {
  const lines = [
    "DTSTART;TZID=America/New_York:20260307T023000",
    "RRULE:FREQ=DAILY;COUNT=4",
    "EXDATE:20260309T023000",
    "RDATE:20260401T023000",
  ];
  const read = async (rfcDateMode?: "written") =>
    (await Recurrence.fromICalendar(lines, { rfcDateMode })).exp().occurrences({
      through,
    });
  const regular = await read();
  assertEquals(regular.map(String), [
    "2026-03-07T07:30:00Z",
    "2026-03-08T07:30:00Z",
    "2026-03-10T06:30:00Z",
    "2026-04-01T06:30:00Z",
  ]);
  assertInstanceOf(regular.at(-1), DateTime);

  const written = await read("written");
  assertEquals(written.map(String), [
    "2026-03-07T07:30:00Z",
    "2026-03-08T07:30:00Z",
    "2026-03-09T06:30:00Z",
    "2026-03-10T06:30:00Z",
    "2026-04-01T02:30:00",
  ]);
  assertInstanceOf(written.at(-1), NaiveDateTime);

  lines[2] = "EXDATE;VALUE=DATE:20260309";
  assertEquals(
    (await Recurrence.fromICalendar(lines)).expe().message,
    "EXDATE type must match DTSTART",
  );
  assertEquals((await read("written")).map(String), written.map(String));
});

Deno.test("iCalendar date serialization preserves mixed exclusions consumed by Google", async () => {
  const lines = [
    "DTSTART:20250101T090000Z",
    "RRULE:FREQ=DAILY;COUNT=3",
    "EXDATE;VALUE=DATE:20250101,20250102T090000Z",
  ];
  for (const deterministic of [false, true]) {
    const wire = (await ICalendar.Raw.parse(lines, deterministic)).exp()
      .toString().split("\n");
    assertEquals(wire, lines);
    const series = (await Recurrence.fromICalendar(wire, { profile: "google" }))
      .exp();
    assertEquals(series.occurrences({ through }).map(String), [
      "2025-01-01T09:00:00Z",
      "2025-01-03T09:00:00Z",
    ]);
  }
});

Deno.test("a compiled VTIMEZONE rejects recurrence reads outside its horizon without consuming the cursor", async () => {
  const lines = [
    "BEGIN:VTIMEZONE",
    "TZID:X-Seasonal",
    "BEGIN:STANDARD",
    "DTSTART:20001105T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0800",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:20000312T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    "TZOFFSETFROM:-0800",
    "TZOFFSETTO:-0700",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
  ];
  const read = async (day: string) => {
    const zone = (await readVTimeZone(lines, { through: NaiveDate.parse(day) }))
      .exp();
    const bind = (start: string) =>
      Recurrence.fromICalendar([
        "DTSTART;TZID=X-Seasonal:" + start,
        "RRULE:FREQ=MONTHLY;COUNT=7",
      ], { rfcTimeZone: (tzid) => tzid === zone.fullname ? zone : undefined });
    return { zone, bind };
  };

  const july = NaiveDate.parse("2026-07-01");
  const january = NaiveDate.parse("2027-01-01");
  const shortTable = await read("2026-07-01");
  const instant = DateTime.fromRfc3339("2027-01-01T12:00:00Z").exp();
  assertThrows(
    () => shortTable.zone.toTz(instant),
    RangeError,
    "VTIMEZONE table does not cover",
  );
  assertEquals(
    (await shortTable.bind("20270101T090000")).expe().message,
    "VTIMEZONE table does not cover DTSTART",
  );
  const short = (await shortTable.bind("20260701T090000")).exp();
  const cursor = short.generator();
  assertThrows(
    () => short.occurrences({ through: january }),
    RangeError,
    "VTIMEZONE table does not cover",
  );
  assertThrows(
    () => cursor.generateUpToDate(january),
    RangeError,
    "VTIMEZONE table does not cover",
  );
  assertEquals(cursor.generateUpToDate(july).map(String), [
    "2026-07-01T16:00:00Z",
  ]);
  const coveredTable = await read("2027-01-01");
  assertEquals(
    coveredTable.zone.toTz(instant).rfc3339(),
    "2027-01-01T04:00:00-08:00",
  );
  const covered = (await coveredTable.bind("20260701T090000")).exp();
  assertEquals(
    covered.occurrences({ through: january }).at(-1)?.toString(),
    "2027-01-01T17:00:00Z",
  );
});

Deno.test("clearing regional datetime cache does not change the selected fold", async () => {
  const zone = await TimezoneRegion.get(
    Tzname.parseOpt("America/Los_Angeles")!,
  );
  const instant = DateTime.fromRfc3339("2026-11-01T08:30:00Z").exp();
  const region = DateTimeRegion.fromInstant(instant, zone);
  const proxied = new Proxy(region, {});
  assertEquals(proxied.asWallClock().mse, instant.mse);
  delete region.cache.wallclock;
  assertEquals(region.asWallClock().mse, instant.mse);
  assertEquals(proxied.asWallClock().tz.info.tzabbr, "PDT");
});

Deno.test("plain daily results do not expose the bound anchor's mutable date cache", async () => {
  for (const profile of ["rrule-js", "dateutil"] as const) {
    const series = (await Recurrence.fromICalendar([
      "DTSTART:20260101T090000Z",
      "RRULE:FREQ=DAILY;COUNT=2",
    ], { profile })).exp();
    const first = series.occurrences({ through })[0];
    assertInstanceOf(first, DateTime);
    first.date.cached.dse = NaiveDate.parse("2026-05-01").dse;
    assertEquals(series.occurrences({ through }).map(String), [
      "2026-01-01T09:00:00Z",
      "2026-01-02T09:00:00Z",
    ]);
  }
});

Deno.test("BYEASTER offsets remain numeric for rule consumers", () => {
  function doubled(rule: RRuleLike): number[] | undefined {
    return rule.options?.byeaster?.offsets.map((offset) => offset * 2);
  }
  assertEquals(
    doubled({ freq: "yearly", options: { byeaster: { offsets: [1, 3] } } }),
    [2, 6],
  );
});
