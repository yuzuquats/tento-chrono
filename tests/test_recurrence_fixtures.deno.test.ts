/**
 * JSON-driven recurrence correctness test suite covering:
 * 1. RFC 5545 date-only RRULE expansion & parse/serialize round-trips
 * 2. Recurrence sets (RRULE + EXDATE + RDATE + UNTIL + COUNT), compositions, and IANA DST timezones
 * 3. Direct NaiveDate.Filter composable pipeline behavior
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
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

interface RRuleFixtureCase {
  name: string;
  category: string;
  dtstart: string;
  rrule: string;
  expected: string[];
  notes?: string;
}

interface RecurrenceSetFixtureCase {
  name: string;
  category: string;
  start: string;
  timezone: string;
  composition: "RULE_ONLY" | "GOOGLE";
  rules: string[];
  upTo: string;
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

async function loadFixture<T>(filename: string): Promise<{ description: string; cases: T[] }> {
  const url = new URL(`./recurrence_fixtures/${filename}`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(url));
}

function assertStrictlyOrderedUnique(values: readonly string[], label: string) {
  for (let i = 1; i < values.length; i++) {
    assert(
      values[i] > values[i - 1],
      `${label}: expected strictly ascending unique sequence at index ${i} (${values[i - 1]} -> ${values[i]})`,
    );
  }
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
const setFixtures = await loadFixture<RecurrenceSetFixtureCase>("recurrence_sets_and_tz.json");
const filterFixtures = await loadFixture<FilterFixtureCase>("filter_composition.json");

Deno.test("recurrence fixtures: schema invariants hold across all JSON files", () => {
  for (const [file, cases] of [
    ["rrule_rfc5545.json", rfcFixtures.cases],
    ["recurrence_sets_and_tz.json", setFixtures.cases],
    ["filter_composition.json", filterFixtures.cases],
  ] as const) {
    assert(cases.length > 0, `${file} must not be empty`);
    const names = new Set<string>();
    for (const c of cases) {
      assert(!names.has(c.name), `${file}: duplicate fixture name ${c.name}`);
      names.add(c.name);
      assertStrictlyOrderedUnique(c.expected, `${file}/${c.name}`);
    }
  }
});

Deno.test("recurrence fixtures: RFC 5545 date-only RRULE expansion & round-trip", async (t) => {
  for (const c of rfcFixtures.cases) {
    await t.step(`[${c.category}] ${c.name}`, async () => {
      const dtstartCompact = c.dtstart.replaceAll("-", "");
      const raw = (await ICalendar.Raw.parse([
        `DTSTART;VALUE=DATE:${dtstartCompact}`,
        `RRULE:${c.rrule}`,
      ])).exp();
      const actual = [...new Recurrence(raw).generate()].map(String);
      assertEquals(actual, c.expected, `${c.name}: ${c.dtstart} | ${c.rrule}`);
      assertStrictlyOrderedUnique(actual, c.name);

      // Verify RRule parse -> toString() -> parse produces identical dates
      const parsed = RRule.parse(`RRULE:${c.rrule}`).exp();
      const roundTripped = (await ICalendar.Raw.parse([
        `DTSTART;VALUE=DATE:${dtstartCompact}`,
        parsed.toString(),
      ])).exp();
      const actualRoundTrip = [...new Recurrence(roundTripped).generate()].map(String);
      assertEquals(actualRoundTrip, c.expected, `${c.name} round-trip: ${parsed.toString()}`);
    });
  }
});

Deno.test("recurrence fixtures: Recurrence sets, compositions, time parts, and IANA DST", async (t) => {
  for (const c of setFixtures.cases) {
    await t.step(`[${c.category}] ${c.name}`, async () => {
      const raw = (await ICalendar.Raw.parse(c.rules)).exp();
      const rec = new Recurrence(raw);
      const tz = (await TimezoneRegion.get(c.timezone as Tzname))!;
      const start = DateTime.fromRfc3339(c.start).exp();
      const comp = c.composition === "GOOGLE"
        ? RecurrenceComposition.GOOGLE
        : RecurrenceComposition.RULE_ONLY;
      const gen = await rec.generateEvents(start, tz, comp);
      const actual = gen.generateUpToDate(NaiveDate.parse(c.upTo)).map(String);
      assertEquals(actual, c.expected, `${c.name}: ${c.rules.join(" | ")}`);
      assertStrictlyOrderedUnique(actual, c.name);
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
