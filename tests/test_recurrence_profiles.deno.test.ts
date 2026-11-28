import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  type DateutilHost,
  DateTime,
  Duration,
  GraphRecurringMaster,
  ICalendarRecurrenceProfile,
  NaiveDate,
  NaiveTime,
  Recurrence,
  RecurrenceStart,
  TimezoneRegion,
  Tzname,
  Weekday,
} from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

Deno.test("rrule.js binds simple UTC rules with reference date rollover and scalar coercion", async () => {
  const read = async (source: string[], through: string) => {
    const series = (await Recurrence.fromICalendar(source, { profile: "rrule-js" })).exp();
    return series.occurrences({ through: NaiveDate.parse(through) }).map(String);
  };
  const start = "DTSTART:00991231T235960Z";
  const rule = "RRULE:FREQ=DAILY;INTERVAL=0002;COUNT=0003";
  const expected = ["2000-01-01T00:00:00Z", "2000-01-03T00:00:00Z", "2000-01-05T00:00:00Z"];
  assertEquals(await read([start, rule], "2000-01-05"), expected);
  assertEquals(await read([rule, start], "2000-01-05"), expected);

  const coerced = await read(["DTSTART:20260101T090000Z", "RRULE:FREQ=DAILY;COUNT=1e1"], "2026-01-31");
  assertEquals(coerced.length, 10);
  assertEquals(coerced.at(-1), "2026-01-10T09:00:00Z");
});

Deno.test("rrule.js plain UTC cadences match the cursor at exact day boundaries", async () => {
  for (const start of ["19691231T235959Z", "20240303T235959Z", "99991225T120000Z", "99991231T235959Z"]) {
    for (const frequency of ["WEEKLY", "HOURLY", "MINUTELY", "SECONDLY"]) {
      const series = (await Recurrence.fromICalendar(
        ["DTSTART:" + start, `RRULE:FREQ=${frequency};COUNT=4;INTERVAL=2`],
        { profile: "rrule-js" },
      )).exp();
      const date = NaiveDate.parse(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6, 8)}`);
      for (const delta of [-1, 0, 1, 42]) {
        const through = date.addDays(delta);
        const expected = series.occurrences({ through, generationLimit: 20 }).map(String);
        assertEquals(series.occurrences({ through }).map(String), expected);
      }
    }
  }

  const lastWeek = (await Recurrence.fromICalendar(
    ["DTSTART:99991225T120000Z", "RRULE:FREQ=WEEKLY;COUNT=3"],
    { profile: "rrule-js" },
  )).exp();
  const january = NaiveDate.parse("9999-12-31").addDays(29);
  assertEquals(lastWeek.occurrences({ through: january }).map(String), [
    "9999-12-25T12:00:00Z",
    "10000-01-01T12:00:00Z",
  ]);
});

type Input =
  & {
    through: string;
    checkpoints?: string[];
    generationLimit?: number | null;
  }
  & (
    | {
      lines: string[];
      profile?: ICalendarRecurrenceProfile;
      rfcDateMode?: "dtstart" | "written";
      dtstart?: RecurrenceStart;
      rfcTimeZones?: Record<string, {
        name?: string;
        transitions: TimezoneRegion.Transition.Serialized[];
      }>;
      dateutilTzif?: true | Record<string, string | null>;
      dateutilHost?: Omit<DateutilHost, "localTime"> & {
        localTime: [
          epochSeconds: number,
          isDaylight: boolean,
          offsetSeconds: number,
        ][];
      };
      dateutilNow?: string;
      dateutilParserYear?: number;
      dateutilWeekStart?: string;
      dateutilUnfold?: boolean;
      dateutilCompatible?: boolean;
      rruleJsHostTimeZone?: string;
      rruleJsUnfold?: boolean;
      rruleJsCompatible?: boolean;
      rruleJsForceSet?: boolean;
      rruleJsNow?: string;
    }
    | {
      graph: GraphRecurringMaster;
      allDayTimeZone?: string;
      rangeStartOccurrence?: string;
      resolveTimeZone?: Record<string, string>;
    }
  );

type Expected = string[] | { error: string } | { expansionError: string };

function fixtureDay(value: string): NaiveDate {
  const match = /^(-?\d{4,})-(\d{2})-(\d{2})$/.exec(value);
  assert(match != null, "invalid fixture day " + value);
  return NaiveDate.fromYmd1Exp(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  );
}

async function readWithClock<T>(
  at: string,
  read: () => Promise<T>,
): Promise<T> {
  const time = Date.parse(at);
  assert(Number.isFinite(time), "invalid fixture clock " + at);
  const now = Date.now;
  Date.now = () => time;
  try {
    return await read();
  } finally {
    Date.now = now;
  }
}

const dir = new URL("./fixtures/", import.meta.url).pathname;
Fixtures.load<Input, Expected>(dir, "recurrence-profile").run<Expected, "written" | undefined>(
  async (input, rfcDateMode): Promise<Expected> => {
    const host = "dateutilHost" in input ? input.dateutilHost : undefined;
    const dateutilHost: DateutilHost | undefined = host == null ? undefined : {
      ...host,
      localTime(at) {
        const state = host.localTime.findLast(([first]) => first <= at);
        assert(state != null, "missing dateutil host clock at " + at);
        const [, isDaylight, offsetSeconds] = state;
        return { isDaylight, offsetSeconds };
      },
    };
    const rfcTimeZones = "rfcTimeZones" in input ? input.rfcTimeZones : undefined;
    const read = () =>
      "graph" in input
        ? Recurrence.fromGraph(input.graph, {
          resolveTimeZone: input.resolveTimeZone == null ? undefined : (name) => input.resolveTimeZone?.[name],
          allDayTimeZone: input.allDayTimeZone,
          rangeStartOccurrence: input.rangeStartOccurrence,
        })
        : Recurrence.fromICalendar(
          input.lines,
          {
            profile: input.profile,
            dtstart: input.dtstart,
            rfcDateMode: input.rfcDateMode ?? rfcDateMode,
            rfcTimeZone: rfcTimeZones == null ? undefined : (tzid) => {
              const spec = Object.hasOwn(rfcTimeZones, tzid) ? rfcTimeZones[tzid] : undefined;
              if (spec == null) return undefined;
              const name = (spec.name ?? tzid) as Tzname;
              return new TimezoneRegion(
                name,
                spec.transitions.map((entry) => TimezoneRegion.Transition.parse(entry, name)),
              );
            },
            rruleJsHostTimeZone: input.rruleJsHostTimeZone,
            rruleJsUnfold: input.rruleJsUnfold,
            rruleJsCompatible: input.rruleJsCompatible,
            rruleJsForceSet: input.rruleJsForceSet,
            dateutilHost,
            dateutilParserYear: input.dateutilParserYear,
            dateutilWeekStart: Weekday.parseOpt(input.dateutilWeekStart) ?? undefined,
            dateutilUnfold: input.dateutilUnfold,
            dateutilCompatible: input.dateutilCompatible,
            dateutilTzif: input.dateutilTzif == null ? undefined : (name) => {
              const file = input.dateutilTzif === true
                ? name
                : input.dateutilTzif?.[name];
              return file == null ? file : Deno.readFile(
                new URL(
                  "./timezones/dateutil-tzif/" + file,
                  import.meta.url,
                ),
              );
            },
          },
        );
    const now = "lines" in input
      ? input.dateutilNow ?? input.rruleJsNow
      : undefined;
    const parsed = now == null ? await read() : await readWithClock(now, read);
    if (parsed.isErr) return { error: parsed.asErr()!.message };

    const series = parsed.exp();
    const through = fixtureDay(input.through);
    const generationLimit = input.generationLimit === null
      ? undefined
      : input.generationLimit ?? 500_000;
    let actual: string[];
    try {
      actual = series.occurrences({ through, generationLimit }).map(
        String,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return { expansionError: error.message };
    }
    const checkpoints = (input.checkpoints ?? []).map(fixtureDay);
    const days = actual.map((value) => fixtureDay(value.split("T", 1)[0]));
    if (days.length > 0) checkpoints.push(days[0]);
    if (checkpoints.length > 0) {
      const cursor = series.generator(generationLimit);
      let next = 0;
      for (
        const day of [...checkpoints.sort((a, b) => a.dse - b.dse), through]
      ) {
        const first = next;
        while (next < days.length && days[next].dse <= day.dse) next++;
        assertEquals(
          cursor.generateUpToDate(day).map(String),
          actual.slice(first, next),
          `profile cursor must return the occurrences through ${day}`,
        );
      }
    }
    return actual;
  },
  (actual, expected, name) => {
    if (Array.isArray(expected)) {
      assertEquals(actual, expected, name);
    } else {
      assert(!Array.isArray(actual), name);
      if ("expansionError" in expected) {
        assert("expansionError" in actual, name);
        assertStringIncludes(
          actual.expansionError,
          expected.expansionError,
          name,
        );
      } else {
        assert("error" in actual, name);
        assertStringIncludes(actual.error, expected.error, name);
      }
    }
  },
  { before: (file): "written" | undefined => file.rfcDateMode === "written" ? "written" : undefined },
);

interface GraphCalendarViewInput {
  graph: GraphRecurringMaster;
  allDayTimeZone?: string;
  durationMs?: number;
  exactBounds?: boolean;
  allDaySelection?: { startTime: string; endTime: string };
  windows: Record<string, { start: string; end: string }>;
  edits?: {
    originalSlot: string;
    replacement?: { start: string; end: string; selection?: { start: string; end: string } };
  }[];
}

type GraphCalendarViewResult = string[] | { error: string };

Fixtures.load<GraphCalendarViewInput, Record<string, GraphCalendarViewResult>>(dir, "graph-calendar-view").run(
  async ({ graph, allDayTimeZone, durationMs, windows, edits, exactBounds, allDaySelection }) => {
    const series = (await Recurrence.fromGraph(graph, { allDayTimeZone })).exp();
    const duration = durationMs == null ? undefined : Duration.Time.ms(durationMs);
    const dateTime = (value: string) => DateTime.fromRfc3339(value).exp();
    const parsedEdits = edits?.map(({ originalSlot, replacement }) => {
      const span = replacement?.selection;
      const selection = span && { start: dateTime(span.start), end: dateTime(span.end) };
      return graph.isAllDay
        ? { originalSlot: fixtureDay(originalSlot), replacement: replacement && {
          start: fixtureDay(replacement.start), end: fixtureDay(replacement.end), selection,
        } }
        : { originalSlot: dateTime(originalSlot), replacement: replacement && {
          start: dateTime(replacement.start), end: dateTime(replacement.end), selection,
        } };
    });
    const clocks = allDaySelection && {
      startTime: NaiveTime.parse(allDaySelection.startTime).exp(),
      endTime: NaiveTime.parse(allDaySelection.endTime).exp(),
    };
    const query = (start: DateTime | string, end: DateTime | string): GraphCalendarViewResult => {
      try {
        return series.graphCalendarView({ start, end, duration, allDaySelection: clocks, edits: parsedEdits }).map(String);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return { error: error.message };
      }
    };
    return Object.fromEntries(Object.entries(windows).map(([name, { start, end }]) => {
      if (!exactBounds) return [name, query(dateTime(start), dateTime(end))];
      const actual = query(start, end);
      // Graph interprets offsetless ISO bounds as UTC.
      assertEquals(query(start.replace(/Z$/i, ""), end.replace(/Z$/i, "")), actual, name + " without Z");
      return [name, actual];
    }));
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);

interface RruleJsBetweenInput {
  lines: string[];
  dtstart?: RecurrenceStart;
  rruleJsHostTimeZone: string;
  rruleJsForceSet?: boolean;
  after: string;
  before: string;
  inclusive: boolean;
}

Fixtures.load<RruleJsBetweenInput, string[] | { error: string }>(dir, "rrule-js-between").run(
  async ({ lines, dtstart, rruleJsHostTimeZone, rruleJsForceSet, after, before, inclusive }) => {
    const series = (await Recurrence.fromICalendar(lines, {
      profile: "rrule-js",
      dtstart,
      rruleJsHostTimeZone,
      rruleJsForceSet,
    })).exp();
    try {
      return series.rruleJsBetween({
        after: DateTime.fromRfc3339(after).exp(),
        before: DateTime.fromRfc3339(before).exp(),
        inclusive,
      }).map(String);
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return { error: String(error) };
    }
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);

type RruleJsNeighbor = string | null | { error: string };
Fixtures.load<RruleJsBetweenInput, { before: RruleJsNeighbor; after: RruleJsNeighbor }>(dir, "rrule-js-neighbors").run(
  async ({ lines, dtstart, rruleJsHostTimeZone, rruleJsForceSet, after, before, inclusive }) => {
    const series = (await Recurrence.fromICalendar(lines, {
      profile: "rrule-js",
      dtstart,
      rruleJsHostTimeZone,
      rruleJsForceSet,
    })).exp();
    const query = (method: "rruleJsBefore" | "rruleJsAfter", at: string): RruleJsNeighbor => {
      try {
        return series[method]({ at: DateTime.fromRfc3339(at).exp(), inclusive })?.toString() ?? null;
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return { error: String(error) };
      }
    };
    return { before: query("rruleJsBefore", before), after: query("rruleJsAfter", after) };
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);
