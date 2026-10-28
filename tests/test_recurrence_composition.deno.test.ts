/**
 * The two recurrence compositions (`RecurrenceComposition`). Operator ruling
 * 2026-10-03: keep Google's behaviour, but as an explicit composition.
 * - `GOOGLE`: an unsynchronised DTSTART (one the rule does not produce) is an
 *   instance on top of COUNT. RFC 5545 §3.8.5.3 leaves this set "undefined",
 *   and this is what Google Calendar's API returns: the nine recorded
 *   fixtures below each hold COUNT + 1 instances, reproduced through `GOOGLE`.
 * - `RULE_ONLY` (formerly `RFC5545`): the rule as written. Such a DTSTART is not an instance, and
 *   COUNT counts the rule's instances.
 * - When DTSTART matches the rule, both give exactly COUNT instances.
 */
import { assert, assertEquals } from "@std/assert";
import { DateTime } from "../chrono/datetime.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { Recurrence, RecurrenceComposition } from "../chrono/recurrence/recurrence.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Tzname, Utc } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

type Fixture = {
  event: { start: string; time_zone?: Tzname; rules: string[] };
  query_range: { start: string; end: string };
  recorded_instances: string[];
};

/** Google's recorded expansions whose DTSTART the rule does not produce: each holds COUNT + 1 instances. */
const DTSTART_ON_TOP_OF_COUNT = [
  "start_date_different_weekday",
  "byweekno_iso_week1_boundary_friday",
  "byweekno_iso_week1_boundary_thursday",
  "byweekno_mixed_positive_negative",
  "byweekno_multiple_weekdays",
  "byweekno_no_byday_filter",
  "byweekno_timezone_boundary",
  "byweekno_with_bymonth",
  "byweekno_year_transition",
] as const;

async function fixture(name: string): Promise<Fixture> {
  return JSON.parse(await Deno.readTextFile(new URL(`./google_recurrence_test_data/${name}.instances.json`, import.meta.url)));
}

/** The fixture's instances in its query range, generated with `composition` (the real-data runner's reading). */
async function generated(f: Fixture, composition: RecurrenceComposition): Promise<string[]> {
  const recurr = new Recurrence((await ICalendar.Raw.parse(f.event.rules)).asOk()!);
  const tz = (await recurr.timezone()) ?? (f.event.time_zone ? await TimezoneRegion.get(f.event.time_zone) : null);
  const start = DateTime.fromRfc3339(f.event.start).asOk()!;
  const gen = await recurr.generateEvents(start, tz, composition);
  const from = Utc.parse(f.query_range.start)!.ndt.date;
  const to = Utc.parse(f.query_range.end)!.ndt.date;
  return gen.generateUpToDate(to)
    .filter((e) => e.ndt.date.dse >= from.dse && e.ndt.date.dse < to.dse)
    .map((e) => e.toString());
}

const countOf = (f: Fixture) => Number(/COUNT=(\d+)/.exec(f.event.rules.join(" "))?.[1]);

Deno.test("GOOGLE reproduces the nine recorded Google expansions with DTSTART on top of COUNT", async () => {
  for (const name of DTSTART_ON_TOP_OF_COUNT) {
    const f = await fixture(name);
    const want = f.recorded_instances.map((s) => Utc.parse(s)!.toString());
    assertEquals(want.length, countOf(f) + 1, `${name}: Google returned COUNT + 1`);
    assertEquals(await generated(f, RecurrenceComposition.GOOGLE), want, name);
  }
});

Deno.test("RULE_ONLY: an unsynchronised DTSTART is not an instance; COUNT counts the rule's instances", async () => {
  const f = await fixture("start_date_different_weekday"); // Tue 2025-01-14, WEEKLY;COUNT=3;BYDAY=FR
  assertEquals(await generated(f, RecurrenceComposition.RULE_ONLY),
    ["2025-01-17T10:00:00Z", "2025-01-24T10:00:00Z", "2025-01-31T10:00:00Z"]);
  assertEquals(await generated(f, RecurrenceComposition.GOOGLE),
    ["2025-01-14T10:00:00Z", "2025-01-17T10:00:00Z", "2025-01-24T10:00:00Z", "2025-01-31T10:00:00Z"]);
});

Deno.test("a DTSTART that matches the rule: both compositions give exactly COUNT instances", async () => {
  for (const name of ["start_date_matches_first_occurrence", "dst_byday_nth_weekday_transition", "daily_count_29"]) {
    const f = await fixture(name);
    const want = f.recorded_instances.map((s) => Utc.parse(s)!.toString());
    assertEquals(want.length, countOf(f), `${name}: Google returned COUNT`);
    assertEquals(await generated(f, RecurrenceComposition.GOOGLE), want, `${name} (GOOGLE)`);
    assertEquals(await generated(f, RecurrenceComposition.RULE_ONLY), want, `${name} (RULE_ONLY)`);
  }
  void NaiveDate;
});

Deno.test("generateGoogleEvents is the GOOGLE composition; the old flag maps onto the two", async () => {
  const recurr = new Recurrence((await ICalendar.Raw.parse(["RRULE:FREQ=DAILY;COUNT=2"])).asOk()!);
  const gen = await recurr.generateGoogleEvents(TimezoneRegion.UTC.toTz(Utc.parse("2026-01-05T09:00:00Z")!), TimezoneRegion.UTC);
  assertEquals(gen.composition, RecurrenceComposition.GOOGLE);
  assertEquals(RecurrenceComposition.of(true), RecurrenceComposition.GOOGLE);
  assertEquals(RecurrenceComposition.of(false), RecurrenceComposition.RULE_ONLY);
  assertEquals(RecurrenceComposition.RFC5545, RecurrenceComposition.RULE_ONLY, "the deprecated name is the same composition");
});

/**
 * `byweekno_with_exdate`: a synthetic case, not a Google recording (Google
 * has none with BYWEEKNO and EXDATE together). It pins the accepted property
 * `exdateCountsTowardCount` on the BYWEEKNO path (operator ruling
 * 2026-10-03). The EXDATE removes the second instance and the series ends at
 * the third. Before 8cba6513fa it pulled in 2028-01-03 to refill COUNT=4.
 */
Deno.test("byweekno_with_exdate: an EXDATE uses up a COUNT slot on the BYWEEKNO path (exdateCountsTowardCount)", async () => {
  const f: Fixture = {
    event: { start: "2025-01-06T10:00:00Z", time_zone: "UTC" as Tzname,
      rules: ["RRULE:FREQ=YEARLY;BYWEEKNO=1,2;BYDAY=MO;COUNT=4", "EXDATE:20260105T100000Z"] },
    query_range: { start: "2025-01-01T00:00:00Z", end: "2030-01-31T00:00:00Z" },
    recorded_instances: [],
  };
  const unmasked: Fixture = { ...f, event: { ...f.event, rules: [f.event.rules[0]!] } };
  assertEquals(await generated(unmasked, RecurrenceComposition.GOOGLE),
    ["2025-01-06T10:00:00Z", "2026-01-05T10:00:00Z", "2027-01-04T10:00:00Z", "2027-01-11T10:00:00Z"]);
  assertEquals(await generated(f, RecurrenceComposition.GOOGLE),
    ["2025-01-06T10:00:00Z", "2027-01-04T10:00:00Z", "2027-01-11T10:00:00Z"], "the EXDATE is not refilled");
  assert(RecurrenceComposition.GOOGLE.exdateCountsTowardCount && RecurrenceComposition.RULE_ONLY.exdateCountsTowardCount);
});

Deno.test("Recurrence.generate(date, limit): COUNT still bounds the series; the limit only shortens it", async () => {
  const recurr = new Recurrence((await ICalendar.Raw.parse(["RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=FR"])).asOk()!);
  const from = NaiveDate.parse("2025-01-14");
  assertEquals([...recurr.generate(from, 10)].map(String), ["2025-01-17", "2025-01-24", "2025-01-31"], "COUNT=3 under a limit of 10");
  assertEquals([...recurr.generate(from, 2)].map(String), ["2025-01-17", "2025-01-24"], "a limit under COUNT");
  assertEquals([...recurr.generate(from)].map(String), ["2025-01-17", "2025-01-24", "2025-01-31"], "no limit");
});
