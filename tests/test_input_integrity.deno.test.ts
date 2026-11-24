import { assert, assertEquals } from "@std/assert";
import {
  DateFragment,
  ExDate,
  GenericRange,
  ICalendar,
  NaiveDate,
  NaiveDateTime,
  RRule,
  TimeOfDay,
  TimezoneRegion,
  Tzname,
} from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";

const dir = new URL("./fixtures/", import.meta.url).pathname;

Fixtures.load<string, string | null>(dir, "naive-date").run(
  (text) => [
    NaiveDate.fromRfc3339(text).asOk()?.toString() ?? null,
    NaiveDate.parseOpt(text)?.toString() ?? null,
  ],
  (actual, expected) => assertEquals(actual, [expected, expected]),
);

Deno.test("checked civil dates require integer components", () => {
  for (const invalid of [NaN, Infinity, -Infinity, 1.5]) {
    assert(NaiveDate.fromYmd1(invalid, 1, 1).isErr, "year: " + invalid);
    assert(NaiveDate.fromYmd1(2024, invalid, 1).isErr, "month: " + invalid);
    assert(NaiveDate.fromYmd1(2024, 2, invalid).isErr, "day: " + invalid);
  }
  assert(NaiveDate.fromYmd1(0, 2, 29).isOk);
  assert(NaiveDate.fromYmd1(-1, 1, 1).isOk);
});

Fixtures.load<string, string | null>(dir, "flexible-date").run(
  (text) => NaiveDate.parseFlexibleOpt(text)?.toString() ?? null,
  (actual, expected) => assertEquals(actual, expected),
);

Fixtures.load<string, { text: string; ms: number } | null>(
  dir,
  "naive-datetime",
).run(
  (text) => {
    const parsed = NaiveDateTime.parse(text);
    return parsed == null
      ? null
      : { text: parsed.toString(), ms: parsed.time.toMs };
  },
  (actual, expected) => assertEquals(actual, expected),
);

Fixtures.load<string[], { frequency: string; exdateLines: number }>(
  dir,
  "ical-properties",
).run(
  (lines) => ({
    frequency: RRule.parseWithRecurrence(lines).exp().inner.freq,
    exdateLines: ExDate.parseMultiple(lines).length,
  }),
  (actual, expected) => assertEquals(actual, expected),
);

Fixtures.load<
  string[],
  { deterministic: string[]; canonicalExdates: string[] }
>(dir, "ical-round-trip").run(
  async (lines) => {
    const deterministic: string[][] = [];
    let roundTrip = lines;
    for (let i = 0; i < 3; i++) {
      roundTrip = (await ICalendar.Raw.parse(roundTrip, true)).exp().toString()
        .split("\n");
      deterministic.push(roundTrip);
    }
    const canonical = (await ICalendar.Raw.parse(lines)).exp().toString().split(
      "\n",
    );
    return {
      deterministic,
      canonicalExdates: canonical.filter((line) => line.startsWith("EXDATE")),
    };
  },
  (actual, expected) => {
    assertEquals(actual.deterministic, Array(3).fill(expected.deterministic));
    assertEquals(actual.canonicalExdates, expected.canonicalExdates);
  },
);

interface DayInput {
  zone: string;
  day: string;
}

async function fixtureDay(input: DayInput) {
  const tzname = Tzname.parseOpt(input.zone);
  assert(tzname != null, input.zone);
  const region = await TimezoneRegion.getOpt(tzname);
  assert(region != null, input.zone);
  return region.date(NaiveDate.parse(input.day));
}

interface ClipInput extends DayInput {
  fragment: number;
  operation: "clamp" | "display" | "partial";
  hours?: [start: number, end: number, overnight: boolean];
  partialEnd?: string;
}

Fixtures.load<ClipInput, { minutes: number; utcEdges?: [string, string] }>(
  dir,
  "fragment-clip",
).run(
  async (input) => {
    const fragment = (await fixtureDay(input)).dateFragments()[input.fragment];
    assert(
      fragment != null,
      `Missing fragment ${input.fragment} on ${input.day}`,
    );
    const hours = input.hours == null ? undefined : new TimeOfDay.Range(
      TimeOfDay.fromHms({ hrs: input.hours[0] }),
      TimeOfDay.fromHms({ hrs: input.hours[1] }),
      input.hours[2],
    );
    const partial = input.partialEnd == null
      ? undefined
      : new GenericRange<NaiveDateTime | null>(
        null,
        NaiveDateTime.parse(input.partialEnd)!,
      );
    const windowed = new DateFragment.Windowed(fragment, partial, hours);
    const range = input.operation === "clamp"
      ? fragment.clamp(hours!)
      : input.operation === "partial"
      ? windowed.applyPartialWindow()
      : windowed.applyAll();
    return {
      minutes: range.duration.toMins,
      utcEdges: [range.start.toUtc().rfc3339(), range.end.toUtc().rfc3339()],
    };
  },
  (actual, expected) => {
    assertEquals(actual.minutes, expected.minutes);
    if (expected.utcEdges) assertEquals(actual.utcEdges, expected.utcEdges);
  },
);

Fixtures.load<DayInput, number>(dir, "fragment-shift").run(
  async (input) => (await fixtureDay(input)).shift()?.shift.toMins,
  (actual, expected) => assertEquals(actual, expected),
);
