import { assert, assertEquals, assertRejects, assertStrictEquals, assertStringIncludes } from "@std/assert";
import {
  DateTime,
  Duration,
  googleTimedStartExcluded,
  type GoogleCalendarInstanceEdit,
  NaiveDate,
  Recurrence,
  RecurrenceOccurrence,
  type RecurrenceStart,
  TimezoneRegion,
  Tzname,
} from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

interface GoogleSeries {
  start: string;
  timezone?: string;
  end?: string;
  rules: string[];
  storedRecurrence?: string[];
  storedStart?: Pick<GoogleSeries, "start" | "timezone" | "end">;
  window: { start: string; end: string };
}

type RecordedExpansion = { google: string[] } | {
  error: string;
  googleHttpStatus: number;
};

if (!Deno.args.includes("bundled")) installTimezoneLoader();

Deno.test("Google timed master exclusion checks timezone spelling even when cached", async () => {
  const instant = "2027-01-04T14:00:00Z";
  const start = DateTime.fromRfc3339(instant).exp().toUtc();
  const timeZone = "America/New_York";
  for (const [spelling, expected] of [
    ["America/New_York", true],
    ["US/Eastern", true],
    ["america/new_york", false],
    ["us/eastern", false],
  ] as const) {
    const name = Tzname.parseOpt(spelling)!;
    assert(await TimezoneRegion.getOpt(name), spelling);
    assert(TimezoneRegion.getLoaded(name), spelling);
    const rules = ["RRULE:FREQ=DAILY;COUNT=2", `EXDATE;TZID=${spelling}:20270104T090000`];
    const series = (await Recurrence.fromICalendar(rules, {
      profile: "google",
      dtstart: { dateTime: instant, timeZone },
      googleStartMode: "stored",
      googleTimeZoneFallback: () => TimezoneRegion.UTC,
    })).exp();
    assertEquals(series.googleTimedGenerator().startDateExcluded, expected, spelling);
    assertEquals(
      googleTimedStartExcluded(rules, start, timeZone, TimezoneRegion.getLoaded),
      expected ? true : null,
      spelling,
    );
  }
});

async function replay({ start, timezone, end: eventEnd, rules, window }: GoogleSeries) {
  const allDay = !start.includes("T");
  const dtstart = allDay
    ? { date: start, timeZone: timezone }
    : { dateTime: start, timeZone: timezone };
  const parsed = await Recurrence.fromICalendar(rules, {
    profile: "google",
    dtstart,
    dtend: eventEnd == null ? undefined : { dateTime: eventEnd },
  });
  if (parsed.isErr) return { error: parsed.asErr()!.message };

  const series = parsed.exp();
  const from = DateTime.fromRfc3339(window.start).exp().toUtc();
  const to = DateTime.fromRfc3339(window.end).exp().toUtc();
  assert(from.mse < to.mse, "expected a nonempty query window");
  const fromDay = allDay
    ? NaiveDate.parse(window.start.slice(0, 10))
    : from.ndt.date;
  const end = allDay
    ? NaiveDate.parse(window.end.slice(0, 10)).addDays(-1)
    : to.ndt.date;
  const midpoint = fromDay.addDays(Math.floor((end.dse - fromDay.dse) / 2));

  const inWindow = (event: RecurrenceOccurrence) => {
    if (allDay) {
      const day = NaiveDate.parse(String(event));
      return day.dse >= fromDay.dse && day.dse <= end.dse;
    }
    assert(event instanceof DateTime, "expected a timed occurrence");
    return event.mse >= from.mse && event.mse < to.mse;
  };
  const incremental = series.generator();
  const oneShot = series.occurrences({ through: end }).filter(inWindow).map(
    String,
  );
  assertEquals(
    [
      ...incremental.generateUpToDate(midpoint),
      ...incremental.generateUpToDate(end),
    ].filter(inWindow).map(String),
    oneShot,
    "incremental reads must match one-shot generation",
  );
  return oneShot;
}

Deno.test("Google ordinal rewind clips the initial partial year in both scans", async () => {
  const rule = "RRULE:FREQ=YEARLY;INTERVAL=11759220;COUNT=4;BYMONTH=1,12;BYMONTHDAY=3";
  const input = {
    start: "2099-06-03T09:00:00Z",
    timezone: "UTC",
    rules: [rule],
    window: { start: "2095-01-01T00:00:00Z", end: "2101-01-01T00:00:00Z" },
  };
  const days = await replay(input);
  const clock = await replay({ ...input, rules: [rule + ";BYHOUR=9"] });
  assert(Array.isArray(days));
  assertEquals(clock, days);
  assert(!days.includes("2099-01-03T09:00:00Z"));
});

Deno.test("Google ordinal rewind releases a late fallback before its master day", async () => {
  const series = (await Recurrence.fromICalendar(["RRULE:FREQ=YEARLY;INTERVAL=11759220;COUNT=2"], {
    profile: "google",
    dtstart: { dateTime: "2102-01-03T09:00:00Z", timeZone: "UTC" },
  })).exp();
  const cursor = series.generator();
  assertEquals(
    cursor.generateUpToDate(NaiveDate.parse("2100-06-30")).map(String),
    ["2100-01-03T09:00:00Z"],
  );
  assertEquals(cursor.generateUpToDate(NaiveDate.parse("2103-12-31")), []);
});

const dir = new URL("./fixtures/", import.meta.url).pathname;
Fixtures.load<GoogleSeries, RecordedExpansion>(dir, "google-expansion").run(
  async (input) => {
    const occurrences = await replay(input);
    if (input.storedRecurrence != null) {
      assertEquals(
        await replay({ ...input, ...input.storedStart, rules: input.storedRecurrence }),
        occurrences,
        "the stored recurrence must match the submitted form",
      );
    }
    return occurrences;
  },
  (actual, expected, name) => {
    if ("google" in expected) {
      assertEquals(actual, expected.google, name);
    } else {
      assertEquals(expected.googleHttpStatus, 400, name);
      assert(!Array.isArray(actual), name);
      assertStringIncludes(actual.error, expected.error, name);
    }
  },
);

interface StoredMasterCollision {
  window: GoogleSeries["window"];
  master: Omit<GoogleSeries, "window">;
  submissions: Omit<GoogleSeries, "window">[];
}

Fixtures.load<StoredMasterCollision, { submitted: string[][]; stored: string[] }>(
  dir,
  "google-stored-master",
).run(
  async ({ window, master, submissions }) => ({
    stored: await replay({ ...master, window }),
    submitted: await Promise.all(submissions.map((form) => replay({ ...form, window }))),
  }),
  (actual, expected, name) => {
    assert(
      new Set(expected.submitted.map((starts) => JSON.stringify(starts))).size > 1,
      "a collision must have distinct recorded expansions",
    );
    assertEquals(actual, expected, name);
  },
);

interface GoogleQuerySeries {
  start: RecurrenceStart;
  end: RecurrenceStart;
  recurrence: string[];
}

interface GoogleInstancesQuery {
  master: GoogleQuerySeries;
  submitted?: GoogleQuerySeries;
  durationMs: number;
  calendarTimeZone?: string;
  edits?: GoogleCalendarInstanceEdit[];
  windows: Record<string, { start: string; end: string }>;
}

Fixtures.load<GoogleInstancesQuery, Record<string, string[]>>(dir, "google-instances-query").run(
  async ({ master, submitted, durationMs, calendarTimeZone, edits, windows }) => {
    const duration = Duration.Time.ms(durationMs);
    const query = async (event: GoogleQuerySeries) => {
      const series = (await Recurrence.fromICalendar(event.recurrence, {
        profile: "google",
        dtstart: event.start,
        dtend: event.end,
      })).exp();
      const expanded: Record<string, string[]> = {};
      for (const [name, window] of Object.entries(windows)) {
        expanded[name] = (await series.googleCalendarInstances({
          timeMin: window.start,
          timeMax: window.end,
          duration,
          calendarTimeZone,
          edits,
        })).map(String);
      }
      return expanded;
    };
    const stored = await query(master);
    if (submitted != null) assertEquals(await query(submitted), stored, "submitted query replay");
    return stored;
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);

Fixtures.load<
  { timeMin: string; timeMax: string },
  string[] | { error: string }
>(dir, "test_google_instance_bounds").run(
  async ({ timeMin, timeMax }) => {
    const series = (await Recurrence.fromICalendar([
      "DTSTART:20260105T090000Z",
      "RRULE:FREQ=DAILY;COUNT=2",
    ], { profile: "google" })).exp();
    try {
      return (await series.googleCalendarInstances({
        timeMin,
        timeMax,
        duration: Duration.Time.ms(0),
      })).map(String);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return { error: error.message };
    }
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);

Deno.test("Google UTC daily queries preserve master identity and read the current civil date", async () => {
  const series = (await Recurrence.fromICalendar([
    "DTSTART:20260101T093000Z",
    "RRULE:FREQ=DAILY;COUNT=3",
  ], { profile: "google" })).exp();
  const opts = {
    timeMin: "2026-01-01T00:00:00Z",
    timeMax: "2026-01-05T00:00:00Z",
    duration: Duration.Time.hrs(1),
  };

  const [master] = await series.googleCalendarInstances(opts);
  assert(master instanceof DateTime);
  const [nextMaster] = await series.googleCalendarInstances(opts);
  assertStrictEquals(nextMaster, master);

  const date = master.date;
  const dse = date.dse;
  date.cached.dse = (dse + 1) as typeof dse;
  try {
    const expected = await series.googleCalendarInstances({ ...opts, generationLimit: 100 });
    const actual = await series.googleCalendarInstances(opts);
    assertEquals(actual.map((start) => start.mse), expected.map((start) => start.mse));
  } finally {
    date.cached.dse = dse;
  }
});

Deno.test("Google UTC daily query keeps appended moves from before the overlap window", async () => {
  const series = (await Recurrence.fromICalendar([
    "DTSTART:20260101T093000Z",
    "RRULE:FREQ=DAILY;INTERVAL=2;COUNT=12",
  ], { profile: "google" })).exp();
  const starts = await series.googleCalendarInstances({
    timeMin: "2026-01-11T10:30:00Z",
    timeMax: "2026-01-19T09:30:00Z",
    duration: Duration.Time.hrs(1),
    edits: [{
      originalStartTime: { dateTime: "2026-01-01T04:30:00-05:00" },
      start: { dateTime: "2026-01-15T15:00:00+05:30" },
      end: { dateTime: "2026-01-15T16:00:00+05:30" },
    }],
  });
  assertEquals(starts.map(String), [
    "2026-01-13T09:30:00Z",
    "2026-01-15T09:30:00Z",
    "2026-01-17T09:30:00Z",
    "2026-01-15T09:30:00Z",
  ]);
});

Deno.test("Google instance edit offsets preserve validation and UTC projection", async () => {
  const series = (await Recurrence.fromICalendar([
    "DTSTART:20330110T090000Z",
    "RRULE:FREQ=DAILY;COUNT=2",
  ], { profile: "google" })).exp();
  const query = async (dateTime: string) => (await series.googleCalendarInstances({
    timeMin: "2033-01-10T00:00:00Z",
    timeMax: "2033-01-12T00:00:00Z",
    duration: Duration.Time.hrs(1),
    edits: [{ originalStartTime: { dateTime }, status: "cancelled" }],
  })).map(String);

  for (const suffix of ["Z", "z", "+00:00", "-00:00"]) {
    assertEquals(await query("2033-01-10T09:00:00" + suffix), ["2033-01-11T09:00:00Z"]);
  }
  assertEquals(await query("2033-01-10T14:30:00+05:30"), ["2033-01-11T09:00:00Z"]);
  const text = "2033-01-10T09:00:00";
  for (const suffix of ["", "Z\n", "+00:0", "+00:0x", "+00:00:00"]) {
    await assertRejects(() => query(text + suffix), RangeError, "require an RFC 3339 offset");
  }
  await assertRejects(() => query(text + "+24:00"), Error, "Invalid offset");
});
