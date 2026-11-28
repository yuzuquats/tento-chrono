import { assert, assertEquals, assertThrows } from "@std/assert";
import {
  DateTime,
  DateutilPosixZone,
  DateutilTzif,
  type DateutilZone,
  ICalendar,
  NaiveDate,
  NaiveDateTime,
  Recurrence,
  RecurrenceComposition,
  type RecurrenceStart,
  RRule,
  RRuleInstances,
  Weekday,
} from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";

type Input =
  | {
    start: string;
    rrule: string;
    roundTrip?: boolean;
    after?: string;
    through?: string;
    inclusive?: boolean;
  }
  | { start: string; lines: string[] }
  | {
    profileLines: string[];
    profileStart?: RecurrenceStart;
    profileSerialize?: boolean;
    profileRoundTrip?: boolean;
    profileWeekStart?: string;
    profileNow?: string;
    through: string;
    profileTzids?: {
      zones: Record<string, string>;
      mapping?: Record<string, string | null>;
      calls?: { name: string; zone?: string | null; error?: string }[];
    };
  }
  | { parseLines: string[] }
  | { serializeLines: string[] };
type Expected = boolean | string[] | { text: string; original?: string[]; reparsed?: string[] } | { python: string[]; chrono: string[] } | {
  error: string;
} | { expansionError: string };
interface Inventory {
  sourceSha256: string;
  otherCases: {
    source: string;
    line: number;
    status: string;
    reason: string;
  }[];
}

const dir = new URL("./recurrence_fixtures/", import.meta.url);
const fixtures = Fixtures.load<Input, Expected>(dir.pathname, "dateutil");
const inventory: Inventory = JSON.parse(
  await Deno.readTextFile(new URL("dateutil-inventory.json", dir)),
);
const reference = new URL("./reference_tests/test_rrule.py", import.meta.url);

async function withFixtureClock<T>(now: string | undefined, read: () => Promise<T>): Promise<T> {
  if (now == null) return await read();
  const instant = Date.parse(now);
  assert(Number.isFinite(instant), now);
  const original = Date.now;
  Date.now = () => instant;
  try {
    return await read();
  } finally {
    Date.now = original;
  }
}

Deno.test("dateutil fixtures account for every vendored Python test", async () => {
  const bytes = await Deno.readFile(reference);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  assertEquals(
    Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
      .join(""),
    inventory.sourceSha256,
  );
  const ids = [];
  let cls = "";
  for (const line of new TextDecoder().decode(bytes).split("\n")) {
    const declaration = /^class (\w+)/.exec(line);
    if (declaration) cls = declaration[1];
    const method = /^    def (test\w+)\(/.exec(line);
    const func = /^def (test\w+)\(/.exec(line);
    if (method) ids.push(cls + "." + method[1]);
    if (func) ids.push(func[1]);
  }
  const profileDir = new URL("./fixtures/", import.meta.url).pathname;
  const profileNames = ["dateutil-queries", "dateutil-sequence", "dateutil-mutable-set", "dateutil-replacements", "dateutil-cache"].flatMap((type) =>
    Fixtures.load(profileDir, type).items.flatMap(({ cases }) =>
      cases.map(({ name }) => name).filter((name) => /^(?:RRuleTest|RRuleSetTest)\./.test(name))
    )
  );
  const names = [
    ...fixtures.items.flatMap(({ cases }) => cases.map(({ name }) => name)),
    ...profileNames,
  ];
  const unique = new Set(names);
  assertEquals(unique.size, names.length, "duplicate dateutil fixture names");
  const recorded = names.filter((name) => !name.includes("#"));
  for (const name of names) {
    assert(unique.has(name.split("#")[0]), name);
  }
  for (const { source, line, status, reason } of inventory.otherCases) {
    assert(
      ["unsupported", "python-api"].includes(status) && line > 0 &&
        reason.length > 0,
      source,
    );
    recorded.push(source);
  }
  assertEquals(recorded.sort(), ids.sort());
});

fixtures.run(
  async (input) => {
    if ("profileLines" in input) {
      const spec = input.profileTzids;
      const zones = new Map<string, DateutilZone>();
      for (const [key, source] of Object.entries(spec?.zones ?? {})) {
        const zone = source.startsWith("POSIX:")
          ? DateutilPosixZone.parse(source.slice("POSIX:".length))
          : DateutilTzif.read(await Deno.readFile(
            new URL("./timezones/dateutil-tzif/" + source, import.meta.url),
          ));
        assert(zone != null, source);
        zones.set(key, zone);
      }
      const zoneOf = (key: string | null | undefined) => {
        if (key == null) return null;
        const zone = zones.get(key);
        assert(zone != null, key);
        return zone;
      };
      const calls = spec?.calls;
      let read = 0;
      const series = await withFixtureClock(input.profileNow, () => Recurrence.fromICalendar(input.profileLines, {
        profile: "dateutil",
        dtstart: input.profileStart,
        dateutilWeekStart: Weekday.parseOpt(input.profileWeekStart) ?? undefined,
        dateutilTzids: calls != null ? async (name) => {
          await Promise.resolve();
          const call = calls[read++];
          assertEquals(name, call?.name);
          if (call.error != null) throw new Error(call.error);
          return zoneOf(call.zone);
        } : spec?.mapping == null ? undefined
          : Object.fromEntries(Object.entries(spec.mapping).map(([name, key]) => [name, zoneOf(key)])),
      }));
      if (calls != null) assertEquals(read, calls.length);
      if (series.isErr) return { error: series.asErr()!.message };
      if (input.profileSerialize) {
        const text = series.exp().dateutilToString();
        if (!input.profileRoundTrip) return { text };
        const reparsed = (await Recurrence.fromICalendar(text.split("\n"), { profile: "dateutil" })).exp();
        const expansion = { through: NaiveDate.parse(input.through), generationLimit: 500_000 };
        return {
          text,
          original: series.exp().occurrences(expansion).map(String),
          reparsed: reparsed.occurrences(expansion).map(String),
        };
      }
      try {
        return series.exp().occurrences({
          through: NaiveDate.parse(input.through),
          generationLimit: 500_000,
        }).map(String);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return { expansionError: error.message };
      }
    }
    if ("serializeLines" in input) {
      return (await ICalendar.Raw.parse(input.serializeLines)).exp().toString()
        .split("\n");
    }
    if ("parseLines" in input) {
      return (await Recurrence.parse(input.parseLines)).isOk;
    }
    if ("lines" in input) {
      const series = (await Recurrence.parse(input.lines)).exp();
      const start = DateTime.fromRfc3339(input.start).exp();
      const gen = await series.generateEvents(
        start,
        null,
        RecurrenceComposition.RFC5545,
        500_000,
      );
      return gen.generateUpToDate(NaiveDate.parse("9999-12-31")).map(String);
    }
    const rule = RRule.parse(input.rrule).exp();
    const start = NaiveDateTime.parse(input.start);
    assert(start != null, input.start);
    const through = input.through ? NaiveDateTime.parse(input.through) : null;
    assert(!input.through || through != null, input.through);
    const after = input.after ? NaiveDateTime.parse(input.after) : null;
    assert(!input.after || after != null, input.after);
    const expand = (r: RRule) =>
      [...RRuleInstances.expand(
        r,
        start,
        false,
        500_000,
        undefined,
        false,
        through?.mse,
      )].filter((d) =>
        after == null ||
        (input.inclusive
          ? after.mse <= d.mse && (through == null || d.mse <= through.mse)
          : after.mse < d.mse && (through == null || d.mse < through.mse))
      ).map(String);
    const actual = expand(rule);
    if (input.roundTrip) {
      assertEquals(
        expand(RRule.parse(rule.toString()).exp()),
        actual,
        input.rrule,
      );
    }
    return actual;
  },
  (actual, expected, name) => {
    const output = typeof expected === "object" && "chrono" in expected
      ? expected.chrono
      : expected;
    assertEquals(actual, output, name);
  },
);

Deno.test("dateutil query bounds distinguish supplied timezone objects from external names", async () => {
  const bytes = await Deno.readFile(new URL("./timezones/dateutil-tzif/America/New_York", import.meta.url));
  const lines = ["RRULE:FREQ=DAILY;COUNT=2", "EXDATE;TZID=America/New_York:20261101T013000"];
  const fixed = DateutilTzif.fixed(3_600_000);
  const external = (await Recurrence.fromICalendar(lines, {
    profile: "dateutil",
    dtstart: { dateTime: "2026-11-01T01:30:00", timeZone: "America/New_York" },
    dateutilTzif: () => bytes,
    dateutilTzids: { "America/New_York": fixed },
  })).exp();
  const value = DateTime.fromRfc3339("2026-11-01T01:30:00-04:00").exp();
  assertEquals(external.dateutilContains({ at: { value, timeZone: "America/New_York" } }), true);
  const fixedValue = DateTime.fromRfc3339("2026-11-01T06:30:00+01:00").exp();
  assertEquals(external.dateutilContains({ at: { value: fixedValue, timeZone: fixed } }), false);

  const first = DateutilTzif.read(bytes);
  const second = DateutilTzif.read(bytes);
  const zones = [first, second];
  const repeated = (await Recurrence.fromICalendar([
    "DTSTART;TZID=America/New_York:20261101T013000",
    ...lines,
  ], { profile: "dateutil", dateutilTzids: () => zones.shift() })).exp();
  assertEquals(repeated.dateutilContains({ at: { value, timeZone: first } }), true);
  assertEquals(repeated.dateutilContains({ at: { value, timeZone: second } }), false);
});

Deno.test("dateutilToString is available only for standalone dateutil rules", async () => {
  const lines = ["DTSTART:20261101T090000Z", "RRULE:FREQ=DAILY;COUNT=2"];
  for (const [source, options] of [
    [lines, { profile: "rfc5545" }],
    [lines, { profile: "dateutil", dateutilCompatible: true }],
    [[...lines, "RDATE:20261109T090000Z"], { profile: "dateutil" }],
    [[...lines, "RRULE:FREQ=WEEKLY;COUNT=2"], { profile: "dateutil" }],
    [[...lines, "EXRULE:FREQ=MONTHLY;COUNT=1"], { profile: "dateutil" }],
  ] as const) {
    const series = (await Recurrence.fromICalendar(source, options)).exp();
    assertThrows(() => series.dateutilToString(), Error, "requires a standalone dateutil rule");
  }
});
