/**
 * JSON-driven recurrence correctness test suite covering:
 * 1. Strictly valid RFC 5545 §3.3.10 date-only RRULE expansion, cross-entry-point parity, & round-trips
 * 2. Non-strict / engine-extension date-only rules (WEEKLY+BYMONTHDAY, BYYEARDAY, DATE ignoring time parts, date RDATEs)
 * 3. Recurrence sets (RRULE + EXDATE + RDATE + UNTIL + COUNT), compositions, time parts, IANA DST, & round-trips
 * 4. Direct NaiveDate.Filter composable pipeline behavior
 * 5. Scale (COUNT=1001) and canonical serialization (FREQ-first, duplicate-part deduplication, VALUE=PERIOD)
 */
import { assert, assertEquals } from "@std/assert";
import {
  DateTime,
  DateUnit,
  ICalendar,
  Month,
  NaiveDate,
  Recurrence,
  RecurrenceComposition,
  RRule,
  TimezoneRegion,
  type Tzname,
  Weekday,
} from "../chrono/mod.ts";
import { ICalDateLine } from "../chrono/recurrence/ical-date-line.ts";
interface RRuleFixtureCase {
  name: string;
  category: string;
  dtstart: string;
  rrule: string;
  expected: string[];
  unsynchronizedDtstart?: boolean;
  notes?: string;
}

interface EngineExtensionFixtureCase {
  name: string;
  category: string;
  dtstart: string;
  rules: string[];
  expected: string[];
  notes?: string;
}

interface RecurrenceSetFixtureCase {
  name: string;
  category: string;
  start: string;
  timezone: string | null;
  composition: "RULE_ONLY" | "GOOGLE";
  rules: string[];
  upTo: string;
  incrementalSteps?: string[];
  expected: string[];
  notes?: string;
}

type WeekdayKey = "SUN" | "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT";

type FilterSpec =
  | { op: "identity" }
  | { op: "byMonthOfYear"; months: number[] }
  | { op: "byDayOfMonth"; days: number[] }
  | { op: "byDayOfYear"; days: number[] }
  | { op: "byWeekNo"; weekno: number; useCalendarYear?: boolean; wkst?: WeekdayKey }
  | { op: "byWeekday"; weekdays: WeekdayKey[] }
  | { op: "byNthWeekday"; nths: [number, WeekdayKey][] }
  | { op: "bySetPos"; positions: number[]; inner: FilterSpec }
  | { op: "compose"; filters: FilterSpec[] }
  | { op: "excludeDates"; dates: string[] };

interface FilterFixtureCase {
  name: string;
  category: string;
  start: string;
  step: { unit: "years" | "months" | "weeks" | "days"; value: number };
  end?: string;
  limit?: number;
  weekStart?: WeekdayKey;
  filter: FilterSpec;
  expected: string[];
  notes?: string;
}

const WEEKDAYS: Record<WeekdayKey, Weekday> = {
  SUN: Weekday.SUN,
  MON: Weekday.MON,
  TUE: Weekday.TUE,
  WED: Weekday.WED,
  THU: Weekday.THU,
  FRI: Weekday.FRI,
  SAT: Weekday.SAT,
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UTC_TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const STEP_UNITS = new Set(["years", "months", "weeks", "days"]);

async function loadFixture<T>(filename: string): Promise<{ description: string; cases: T[] }> {
  const url = new URL(`./recurrence_fixtures/${filename}`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(url));
}

function assertCanonicalDate(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && DATE_RE.test(value), `${label}: invalid date "${value}"`);
  assertEquals(String(NaiveDate.parse(value)), value, `${label}: non-canonical date "${value}"`);
}

function assertUtcTimestamp(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && UTC_TS_RE.test(value), `${label}: invalid UTC timestamp "${value}"`);
}

function assertRfc3339(value: unknown, label: string): asserts value is string {
  assert(typeof value === "string" && RFC3339_RE.test(value), `${label}: invalid RFC 3339 timestamp "${value}"`);
}

function assertWeekdayKey(value: unknown, label: string): asserts value is WeekdayKey {
  assert(typeof value === "string" && value in WEEKDAYS, `${label}: invalid weekday "${value}"`);
}

function validateFilterSpec(spec: FilterSpec, label: string): void {
  assert(spec != null && typeof spec === "object" && typeof spec.op === "string", `${label}: invalid filter spec`);
  switch (spec.op) {
    case "identity":
      return;
    case "byMonthOfYear":
      assert(Array.isArray(spec.months) && spec.months.length > 0, `${label}: months must be non-empty`);
      for (const m of spec.months) {
        assert(Number.isInteger(m) && m >= 1 && m <= 12, `${label}: invalid month ${m}`);
      }
      return;
    case "byDayOfMonth":
      assert(Array.isArray(spec.days) && spec.days.length > 0, `${label}: days must be non-empty`);
      for (const d of spec.days) {
        assert(Number.isInteger(d) && d !== 0 && d >= -31 && d <= 31, `${label}: invalid dayOfMonth ${d}`);
      }
      return;
    case "byDayOfYear":
      assert(Array.isArray(spec.days) && spec.days.length > 0, `${label}: days must be non-empty`);
      for (const d of spec.days) {
        assert(Number.isInteger(d) && d !== 0 && d >= -366 && d <= 366, `${label}: invalid dayOfYear ${d}`);
      }
      return;
    case "byWeekNo":
      assert(
        Number.isInteger(spec.weekno) && spec.weekno !== 0 && spec.weekno >= -53 && spec.weekno <= 53,
        `${label}: invalid weekno ${spec.weekno}`,
      );
      if (spec.wkst !== undefined) assertWeekdayKey(spec.wkst, `${label}.wkst`);
      return;
    case "byWeekday":
      assert(Array.isArray(spec.weekdays) && spec.weekdays.length > 0, `${label}: weekdays must be non-empty`);
      for (const w of spec.weekdays) assertWeekdayKey(w, `${label}.weekdays`);
      return;
    case "byNthWeekday":
      assert(Array.isArray(spec.nths) && spec.nths.length > 0, `${label}: nths must be non-empty`);
      for (const pair of spec.nths) {
        assert(Array.isArray(pair) && pair.length === 2, `${label}: invalid nth tuple`);
        assert(Number.isInteger(pair[0]) && pair[0] !== 0, `${label}: invalid nth ordinal ${pair[0]}`);
        assertWeekdayKey(pair[1], `${label}.nths`);
      }
      return;
    case "bySetPos":
      assert(Array.isArray(spec.positions) && spec.positions.length > 0, `${label}: positions must be non-empty`);
      for (const p of spec.positions) {
        assert(Number.isInteger(p), `${label}: invalid setpos ${p}`);
      }
      validateFilterSpec(spec.inner, `${label}.inner`);
      return;
    case "compose":
      assert(Array.isArray(spec.filters) && spec.filters.length > 0, `${label}: filters must be non-empty`);
      for (let i = 0; i < spec.filters.length; i++) {
        validateFilterSpec(spec.filters[i], `${label}.filters[${i}]`);
      }
      return;
    case "excludeDates":
      assert(Array.isArray(spec.dates) && spec.dates.length > 0, `${label}: dates must be non-empty`);
      for (const d of spec.dates) assertCanonicalDate(d, `${label}.dates`);
      return;
    default:
      throw new Error(`${label}: unknown filter op "${(spec as { op: unknown }).op}"`);
  }
}

function assertStrictlyOrderedUnique(values: readonly string[], label: string) {
  for (let i = 1; i < values.length; i++) {
    assert(
      values[i] > values[i - 1],
      `${label}: expected strictly ascending unique sequence at index ${i} (${values[i - 1]} -> ${values[i]})`,
    );
  }
}

function resolveComposition(value: string, label: string): RecurrenceComposition {
  if (value === "GOOGLE") return RecurrenceComposition.GOOGLE;
  if (value === "RULE_ONLY") return RecurrenceComposition.RULE_ONLY;
  throw new Error(`${label}: unknown composition "${value}"`);
}

function buildFilter(spec: FilterSpec): NaiveDate.Filter {
  const { Filter } = NaiveDate;
  switch (spec.op) {
    case "identity":
      return Filter.identity();
    case "byMonthOfYear":
      return Filter.byMonthOfYear(spec.months.map((m) => new Month(m as never)));
    case "byDayOfMonth":
      return Filter.byDayOfMonth(spec.days);
    case "byDayOfYear":
      return Filter.byDayOfYear(spec.days);
    case "byWeekNo":
      return Filter.byWeekNo(
        spec.weekno,
        spec.useCalendarYear ?? false,
        spec.wkst ? WEEKDAYS[spec.wkst] : Weekday.MON,
      );
    case "byWeekday":
      return Filter.byWeekday(spec.weekdays.map((w) => WEEKDAYS[w]));
    case "byNthWeekday":
      return Filter.byNthWeekday(spec.nths.map(([n, w]) => WEEKDAYS[w].nth(n)));
    case "bySetPos":
      return Filter.bySetPos(buildFilter(spec.inner), spec.positions);
    case "compose":
      return Filter.compose(spec.filters.map(buildFilter));
    case "excludeDates": {
      const excluded = new Set(spec.dates);
      return function* ([day, unit]) {
        if (!excluded.has(String(day))) yield [day, unit];
      };
    }
  }
}

function buildStep(step: FilterFixtureCase["step"]): DateUnit {
  switch (step.unit) {
    case "years":
      return DateUnit.years(step.value);
    case "months":
      return DateUnit.months(step.value);
    case "weeks":
      return DateUnit.weeks(step.value);
    case "days":
      return DateUnit.days(step.value);
  }
}

const rfcFixtures = await loadFixture<RRuleFixtureCase>("rrule_rfc5545.json");
const extFixtures = await loadFixture<EngineExtensionFixtureCase>("rrule_engine_extensions.json");
const setFixtures = await loadFixture<RecurrenceSetFixtureCase>("recurrence_sets_and_tz.json");
const filterFixtures = await loadFixture<FilterFixtureCase>("filter_composition.json");

Deno.test("recurrence fixtures: strict runtime schema invariants hold across all JSON files", () => {
  const checkUniqueNames = (file: string, cases: readonly { name: string; category: string; expected: string[] }[]) => {
    assert(cases.length > 0, `${file} must not be empty`);
    const names = new Set<string>();
    for (const c of cases) {
      assert(typeof c.name === "string" && c.name.length > 0, `${file}: empty case name`);
      assert(typeof c.category === "string" && c.category.length > 0, `${file}/${c.name}: empty category`);
      assert(!names.has(c.name), `${file}: duplicate fixture name ${c.name}`);
      names.add(c.name);
      assert(Array.isArray(c.expected), `${file}/${c.name}: expected must be array`);
      assertStrictlyOrderedUnique(c.expected, `${file}/${c.name}`);
    }
  };

  checkUniqueNames("rrule_rfc5545.json", rfcFixtures.cases);
  for (const c of rfcFixtures.cases) {
    const label = `rrule_rfc5545.json/${c.name}`;
    assertCanonicalDate(c.dtstart, `${label}.dtstart`);
    assert(typeof c.rrule === "string" && c.rrule.length > 0, `${label}: empty rrule`);
    for (const d of c.expected) assertCanonicalDate(d, `${label}.expected`);
    // Enforce explicit flagging of unsynchronized DTSTARTs
    if (!c.unsynchronizedDtstart) {
      assert(
        c.expected.length > 0 && c.expected[0] === c.dtstart,
        `${label}: expected[0] (${c.expected[0]}) must match dtstart (${c.dtstart}) unless unsynchronizedDtstart=true`,
      );
    }
    // Enforce RFC 5545 §3.3.10 DATE parity and rule-part legality in rrule_rfc5545.json
    const parsed = RRule.parse(`RRULE:${c.rrule}`).exp();
    if (parsed.inner.options?.until) {
      assert(parsed.inner.options.until.nt == null, `${label}: DATE DTSTART must pair with DATE UNTIL`);
    }
    if (parsed.inner.freq === "weekly") {
      assert(!parsed.inner.options?.bymonthday?.length, `${label}: WEEKLY+BYMONTHDAY belongs in engine_extensions`);
      assert(!parsed.inner.options?.byyearday?.length, `${label}: WEEKLY+BYYEARDAY belongs in engine_extensions`);
    }
    if (parsed.inner.freq === "daily" || parsed.inner.freq === "monthly") {
      assert(!parsed.inner.options?.byyearday?.length, `${label}: ${parsed.inner.freq}+BYYEARDAY belongs in engine_extensions`);
    }
    const opts = parsed.inner.options;
    assert(!(opts?.count != null && opts?.until != null), `${label}: COUNT and UNTIL are mutually exclusive in RFC 5545`);
    assert(
      !(opts?.byhour?.length || opts?.byminute?.length || opts?.bysecond?.length),
      `${label}: DATE DTSTART with BYHOUR/BYMINUTE/BYSECOND belongs in engine_extensions`,
    );
    if (opts?.byweekno?.length) {
      assert(parsed.inner.freq === "yearly", `${label}: BYWEEKNO is only legal with FREQ=YEARLY`);
    }
    if (opts?.bysetpos?.length) {
      const hasOtherByRule = Boolean(
        opts.bymonth?.length ||
        opts.byweekno?.length ||
        opts.byyearday?.length ||
        opts.bymonthday?.length ||
        opts.byday?.length ||
        opts.bynthday?.length ||
        opts.byhour?.length ||
        opts.byminute?.length ||
        opts.bysecond?.length,
      );
      assert(hasOtherByRule, `${label}: BYSETPOS requires at least one other BYxxx rule part in RFC 5545 §3.3.10`);
    }
  }

  checkUniqueNames("rrule_engine_extensions.json", extFixtures.cases);
  for (const c of extFixtures.cases) {
    const label = `rrule_engine_extensions.json/${c.name}`;
    assertCanonicalDate(c.dtstart, `${label}.dtstart`);
    assert(Array.isArray(c.rules) && c.rules.length > 0, `${label}: rules must be non-empty`);
    for (const d of c.expected) assertCanonicalDate(d, `${label}.expected`);
  }

  checkUniqueNames("recurrence_sets_and_tz.json", setFixtures.cases);
  for (const c of setFixtures.cases) {
    const label = `recurrence_sets_and_tz.json/${c.name}`;
    assertRfc3339(c.start, `${label}.start`);
    assert(c.timezone === null || (typeof c.timezone === "string" && c.timezone.length > 0), `${label}.timezone`);
    resolveComposition(c.composition, label);
    assert(Array.isArray(c.rules) && c.rules.length > 0, `${label}: rules must be non-empty`);
    assertCanonicalDate(c.upTo, `${label}.upTo`);
    if (c.incrementalSteps !== undefined) {
      assert(c.incrementalSteps.length > 0, `${label}.incrementalSteps must be non-empty`);
      for (const step of c.incrementalSteps) assertCanonicalDate(step, `${label}.incrementalSteps`);
    }
    for (const ts of c.expected) assertUtcTimestamp(ts, `${label}.expected`);
  }

  checkUniqueNames("filter_composition.json", filterFixtures.cases);
  for (const c of filterFixtures.cases) {
    const label = `filter_composition.json/${c.name}`;
    assertCanonicalDate(c.start, `${label}.start`);
    assert(STEP_UNITS.has(c.step.unit), `${label}: invalid step unit ${c.step.unit}`);
    assert(Number.isInteger(c.step.value) && c.step.value > 0, `${label}: step value must be positive integer`);
    if (c.end !== undefined) assertCanonicalDate(c.end, `${label}.end`);
    if (c.limit !== undefined) assert(Number.isInteger(c.limit) && c.limit >= 0, `${label}: invalid limit`);
    if (c.weekStart !== undefined) assertWeekdayKey(c.weekStart, `${label}.weekStart`);
    validateFilterSpec(c.filter, `${label}.filter`);
    for (const d of c.expected) assertCanonicalDate(d, `${label}.expected`);
  }
});

Deno.test("recurrence fixtures: RFC 5545 date-only RRULE expansion, entry-point parity, & round-trip", async (t) => {
  for (const c of rfcFixtures.cases) {
    await t.step(`[${c.category}] ${c.name}`, async () => {
      const dtstartCompact = c.dtstart.replaceAll("-", "");
      const raw = (await ICalendar.Raw.parse([
        `DTSTART;VALUE=DATE:${dtstartCompact}`,
        `RRULE:${c.rrule}`,
      ])).exp();
      const rec = new Recurrence(raw);
      const actual = [...rec.generate()].map(String);
      assertEquals(actual, c.expected, `${c.name}: ${c.dtstart} | ${c.rrule}`);
      assertStrictlyOrderedUnique(actual, c.name);

      // Verify RRule parse -> toString() -> parse produces identical dates
      const parsed = RRule.parse(`RRULE:${c.rrule}`).exp();
      const serialized = parsed.toString();
      assert(serialized.startsWith("RRULE:FREQ="), `${c.name}: serialized RRULE must start with FREQ= (${serialized})`);
      const roundTripped = (await ICalendar.Raw.parse([
        `DTSTART;VALUE=DATE:${dtstartCompact}`,
        serialized,
      ])).exp();
      const actualRoundTrip = [...new Recurrence(roundTripped).generate()].map(String);
      assertEquals(actualRoundTrip, c.expected, `${c.name} round-trip: ${serialized}`);

      // Verify cross-entry-point parity: generate() === generateToDate(..., false) === generateEvents(..., UTC, RULE_ONLY)
      const horizon = c.expected.length > 0
        ? NaiveDate.parse(c.expected[c.expected.length - 1]!).addDays(366)
        : NaiveDate.parse(c.dtstart).addDays(2000);
      const viaToDate = [...rec.generateToDate(null, horizon, false)].map(String);
      assertEquals(viaToDate, c.expected, `${c.name}: generateToDate parity`);

      const timedRaw = (await ICalendar.Raw.parse([`RRULE:${c.rrule}`])).exp();
      const timedRec = new Recurrence(timedRaw);
      const startDt = DateTime.fromRfc3339(`${c.dtstart}T09:00:00Z`).exp();
      const gen = await timedRec.generateEvents(startDt, TimezoneRegion.UTC, RecurrenceComposition.RULE_ONLY);
      const viaEvents = gen.generateUpToDate(horizon).map((d) => String(d).slice(0, 10));
      assertEquals(viaEvents, c.expected, `${c.name}: generateEvents(RULE_ONLY) parity`);
    });
  }
});

Deno.test("recurrence fixtures: engine extensions, DATE time-part ignoring, & date-only RDATEs", async (t) => {
  for (const c of extFixtures.cases) {
    await t.step(`[${c.category}] ${c.name}`, async () => {
      const dtstartCompact = c.dtstart.replaceAll("-", "");
      const raw = (await ICalendar.Raw.parse([
        `DTSTART;VALUE=DATE:${dtstartCompact}`,
        ...c.rules,
      ])).exp();
      const rec = new Recurrence(raw);
      const actual = [...rec.generate()].map(String);
      assertEquals(actual, c.expected, `${c.name}: ${c.dtstart} | ${c.rules.join(" | ")}`);
      assertStrictlyOrderedUnique(actual, c.name);
      const horizon = c.expected.length > 0
        ? NaiveDate.parse(c.expected[c.expected.length - 1]!).addDays(366)
        : NaiveDate.parse(c.dtstart).addDays(2000);
      const viaToDate = [...rec.generateToDate(null, horizon, false)].map(String);
      assertEquals(viaToDate, c.expected, `${c.name}: generateToDate parity`);
    });
  }
});

Deno.test("recurrence fixtures: Recurrence sets, compositions, time parts, IANA DST, & round-trip", async (t) => {
  for (const c of setFixtures.cases) {
    await t.step(`[${c.category}] ${c.name}`, async () => {
      const raw = (await ICalendar.Raw.parse(c.rules)).exp();
      const rec = new Recurrence(raw);
      const tz = c.timezone != null ? (await TimezoneRegion.get(c.timezone as Tzname))! : null;
      const start = DateTime.fromRfc3339(c.start).exp();
      const comp = resolveComposition(c.composition, c.name);
      const upTo = NaiveDate.parse(c.upTo);
      const gen = await rec.generateEvents(start, tz, comp);
      const actual = gen.generateUpToDate(upTo).map(String);
      assertEquals(actual, c.expected, `${c.name}: ${c.rules.join(" | ")}`);
      assertStrictlyOrderedUnique(actual, c.name);

      // Verify ICalendar.Raw parse -> toString() -> parse round-trip preserves expansion
      const serializedLines = raw.toString().split("\n").filter((l) => l.length > 0);
      const raw2 = (await ICalendar.Raw.parse(serializedLines)).exp();
      const gen2 = await new Recurrence(raw2).generateEvents(start, tz, comp);
      const actual2 = gen2.generateUpToDate(upTo).map(String);
      assertEquals(actual2, c.expected, `${c.name} round-trip: ${serializedLines.join(" | ")}`);

      if (c.incrementalSteps) {
        const incGen = await rec.generateEvents(start, tz, comp);
        const collected: string[] = [];
        for (const stepStr of c.incrementalSteps) {
          const batch = incGen.generateUpToDate(NaiveDate.parse(stepStr)).map(String);
          for (const tsStr of batch) {
            assert(
              tsStr.slice(0, 10) <= stepStr,
              `${c.name} incremental(${stepStr}): returned timestamp ${tsStr} past query date`,
            );
          }
          collected.push(...batch);
        }
        assertEquals(collected, c.expected, `${c.name} incremental steps`);
        assertStrictlyOrderedUnique(collected, `${c.name} incremental`);
      }
    });
  }
});

Deno.test("recurrence fixtures: NaiveDate.Filter composition pipelines", async (t) => {
  for (const c of filterFixtures.cases) {
    await t.step(`[${c.category}] ${c.name}`, () => {
      const start = NaiveDate.parse(c.start);
      const actual = [
        ...start.range(buildStep(c.step), {
          end: c.end ? NaiveDate.parse(c.end) : undefined,
          limit: c.limit,
          weekStart: c.weekStart ? WEEKDAYS[c.weekStart] : undefined,
          filter: buildFilter(c.filter),
        }),
      ].map(String);
      assertEquals(actual, c.expected, c.name);
      assertStrictlyOrderedUnique(actual, c.name);
    });
  }
});

Deno.test("recurrence fixtures: COUNT > 1000 and canonical serialization invariants", async () => {
  // COUNT=1001 must not truncate at default recurLimit=1000
  const raw = (await ICalendar.Raw.parse([
    "DTSTART;VALUE=DATE:20240101",
    "RRULE:FREQ=DAILY;COUNT=1001",
  ])).exp();
  const dates = [...new Recurrence(raw).generate()].map(String);
  assertEquals(dates.length, 1001);
  assertEquals(dates[0], "2024-01-01");
  assertEquals(dates[1000], "2026-09-27");

  // FREQ is always serialized first and duplicate parts are deduplicated
  assertEquals(RRule.parse("BYDAY=MO;FREQ=WEEKLY").exp().toString(), "RRULE:FREQ=WEEKLY;BYDAY=MO");
  assertEquals(RRule.parse("FREQ=DAILY;COUNT=2;COUNT=2").exp().toString(), "RRULE:FREQ=DAILY;COUNT=2");

  // RDATE;VALUE=PERIOD preserves VALUE=PERIOD and duration/end across serialization
  const periodDuration = (await ICalDateLine.parse("RDATE;VALUE=PERIOD:20240103T090000Z/PT2H")).exp();
  assertEquals(periodDuration.toString(), "RDATE;VALUE=PERIOD:20240103T090000Z/PT2H");
  const periodEnd = (await ICalDateLine.parse("RDATE;VALUE=PERIOD:20240103T090000Z/20240103T110000Z")).exp();
  assertEquals(periodEnd.toString(), "RDATE;VALUE=PERIOD:20240103T090000Z/20240103T110000Z");

  // Timed RRULE with explicit RDATE merges RDATE days in both generate() and generateToDate()
  const timedRdateRaw = (await ICalendar.Raw.parse([
    "DTSTART:20260101T090000",
    "RRULE:FREQ=DAILY;BYHOUR=9,17;COUNT=4",
    "RDATE:20260105T120000",
  ])).exp();
  const timedRdateRec = new Recurrence(timedRdateRaw);
  assertEquals([...timedRdateRec.generate()].map(String), ["2026-01-01", "2026-01-02", "2026-01-05"]);
  assertEquals(
    [...timedRdateRec.generateToDate(null, NaiveDate.parse("2026-01-10"), false)].map(String),
    ["2026-01-01", "2026-01-02", "2026-01-05"],
  );
});
