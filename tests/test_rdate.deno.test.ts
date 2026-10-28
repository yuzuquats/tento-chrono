/**
 * RDATE adds instances to the recurrence set (RFC 5545 §3.8.5.2, §3.8.5.3:
 * the set is DTSTART, the RRULE instances and the RDATE instances, less the
 * EXDATE instances; operator ruling 2026-10-03). An RDATE is read in the form
 * it was written: UTC, a TZID's wall time, floating (the series' zone), a
 * DATE (that day at DTSTART's wall time), or a PERIOD (its start). RDATE
 * instances do not count toward COUNT and are not bounded by UNTIL; an EXDATE
 * removes one as it removes any instance; one that coincides with a rule
 * instance is that instance (no duplicate). The set comes out in time order,
 * however the end dates are stepped.
 */
import { assertEquals } from "@std/assert";
import { NaiveDate } from "../chrono/naive-date.ts";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { Recurrence, RecurrenceComposition } from "../chrono/recurrence/recurrence.ts";
import { RRule } from "../chrono/recurrence/rrule.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Utc } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

const START = "2026-03-09T16:00:00Z"; // Monday, 09:00 in Los Angeles (PDT)
const LA = "America/Los_Angeles";

async function instants(rules: string[], steps: string[] = ["2026-06-01"]): Promise<string[]> {
  const parsed = await ICalendar.Raw.parse(rules);
  if (parsed.isErr) throw new Error(`rules do not parse: ${rules.join(" ")}`);
  const recurr = new Recurrence(parsed.asOk()!);
  const tz = (await TimezoneRegion.get(LA as never))!;
  const gen = await recurr.generateGoogleEvents(tz.toTz(Utc.parse(START)!), tz);
  return steps.flatMap((end) => gen.generateUpToDate(NaiveDate.parse(end)).map((d) => d.toString()));
}

const WEEKLY3 = ["2026-03-09T16:00:00Z", "2026-03-16T16:00:00Z", "2026-03-23T16:00:00Z"];

Deno.test("RDATE (UTC) adds an instance, in time order, outside COUNT", async () => {
  assertEquals(await instants(["RRULE:FREQ=WEEKLY;COUNT=3", "RDATE:20260318T200000Z"]),
    [WEEKLY3[0], WEEKLY3[1], "2026-03-18T20:00:00Z", WEEKLY3[2]]);
});

Deno.test("RDATE in each form: TZID, floating (series zone), DATE (DTSTART's wall time), PERIOD (its start)", async () => {
  assertEquals(await instants(["RRULE:FREQ=WEEKLY;COUNT=1", "RDATE;TZID=Europe/London:20260318T120000"]),
    [WEEKLY3[0], "2026-03-18T12:00:00Z"]);
  assertEquals(await instants(["RRULE:FREQ=WEEKLY;COUNT=1", "RDATE:20260318T120000"]),
    [WEEKLY3[0], "2026-03-18T19:00:00Z"]);
  assertEquals(await instants(["RRULE:FREQ=WEEKLY;COUNT=1", "RDATE;VALUE=DATE:20260318,20260325"]),
    [WEEKLY3[0], "2026-03-18T16:00:00Z", "2026-03-25T16:00:00Z"]);
  assertEquals(await instants(["RRULE:FREQ=WEEKLY;COUNT=1", "RDATE;VALUE=PERIOD:20260318T200000Z/20260318T210000Z"]),
    [WEEKLY3[0], "2026-03-18T20:00:00Z"]);
});

Deno.test("RDATE past UNTIL is kept; one on a rule instance is not doubled; an EXDATE removes one", async () => {
  assertEquals(await instants(["RRULE:FREQ=WEEKLY;UNTIL=20260317T000000Z", "RDATE:20260401T160000Z"]),
    [WEEKLY3[0], WEEKLY3[1], "2026-04-01T16:00:00Z"]);
  assertEquals(await instants(["RRULE:FREQ=WEEKLY;COUNT=3", "RDATE:20260316T160000Z"]), WEEKLY3);
  assertEquals(await instants(["RRULE:FREQ=WEEKLY;COUNT=3", "RDATE:20260318T200000Z", "EXDATE:20260318T200000Z"]), WEEKLY3);
});

Deno.test("RDATE instances come out once and in order when generated in steps", async () => {
  const rules = ["RRULE:FREQ=WEEKLY;COUNT=3", "RDATE:20260318T200000Z,20260501T160000Z"];
  const whole = await instants(rules);
  assertEquals(await instants(rules, ["2026-03-10", "2026-03-17", "2026-03-19", "2026-04-15", "2026-06-01"]), whole);
  assertEquals(whole, [WEEKLY3[0], WEEKLY3[1], "2026-03-18T20:00:00Z", WEEKLY3[2], "2026-05-01T16:00:00Z"]);
});

Deno.test("an edit that re-serializes the rule keeps its RDATE lines (RRule.parseWithRecurrence -> toRecurrenceArray)", () => {
  const rrule = RRule.parseWithRecurrence(["RRULE:FREQ=WEEKLY;COUNT=3", "RDATE;TZID=Europe/London:20260318T120000"]).asOk()!;
  assertEquals(rrule.toRecurrenceArray(), ["RRULE:FREQ=WEEKLY;COUNT=3", "RDATE;TZID=Europe/London:20260318T120000"]);
});

Deno.test("an explicit DTSTART RDATE survives RULE_ONLY and is deduplicated under GOOGLE", async () => {
  const start = TimezoneRegion.UTC.toTz(Utc.parse("2025-01-14T10:00:00Z")!);
  const rule = "RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=FR";
  const expected = ["2025-01-14T10:00:00Z", "2025-01-17T10:00:00Z", "2025-01-24T10:00:00Z", "2025-01-31T10:00:00Z"];
  for (const composition of [RecurrenceComposition.of(false), RecurrenceComposition.GOOGLE]) {
    for (const excluded of [false, true]) {
      const rules = [rule, "RDATE:20250114T100000Z", ...(excluded ? ["EXDATE:20250114T100000Z"] : [])];
      const recurrence = new Recurrence((await ICalendar.Raw.parse(rules)).asOk()!);
      const generator = await recurrence.generateEvents(start, TimezoneRegion.UTC, composition);
      assertEquals(generator.generateUpToDate(NaiveDate.parse("2025-02-01")).map(String),
        excluded ? expected.slice(1) : expected, composition.name + (excluded ? " excluded" : ""));
    }
  }
});

Deno.test("DTSTART matching BYDAY and RDATE is emitted once or excluded in both compositions", async () => {
  const start = TimezoneRegion.UTC.toTz(Utc.parse("2025-01-14T10:00:00Z")!);
  const expected = ["2025-01-14T10:00:00Z", "2025-01-21T10:00:00Z", "2025-01-28T10:00:00Z"];
  for (const composition of [RecurrenceComposition.of(false), RecurrenceComposition.GOOGLE]) {
    for (const excluded of [false, true]) {
      const rules = ["RRULE:FREQ=WEEKLY;COUNT=3;BYDAY=TU", "RDATE:20250114T100000Z",
        ...(excluded ? ["EXDATE:20250114T100000Z"] : [])];
      const recurrence = new Recurrence((await ICalendar.Raw.parse(rules)).asOk()!);
      const generator = await recurrence.generateEvents(start, TimezoneRegion.UTC, composition);
      assertEquals(generator.generateUpToDate(NaiveDate.parse("2025-02-01")).map(String),
        excluded ? expected.slice(1) : expected, composition.name + (excluded ? " excluded" : ""));
    }
  }
});

Deno.test("deterministic serialization emits each RDATE declaration exactly once", async () => {
  const rules = ["RRULE:FREQ=WEEKLY;COUNT=1", "RDATE:20260318T200000Z",
    "EXDATE:20260309T160000Z", "RDATE:20260325T210000Z"];
  const parsed = (await ICalendar.Raw.parse(rules, true)).asOk()!;
  assertEquals(parsed.toString().split("\n"), rules);
});

Deno.test("default RDATE serialization preserves UTC instants in a Los Angeles series", async () => {
  const rules = ["RRULE:FREQ=WEEKLY;COUNT=1", "RDATE:20260318T200000Z"];
  const parsed = (await ICalendar.Raw.parse(rules)).asOk()!;
  const serialized = parsed.toString().split("\n");
  assertEquals(serialized, rules, "the UTC RDATE keeps its Z without deterministic mode");
  assertEquals(await instants(serialized), await instants(rules));
  assertEquals(await instants(serialized), [WEEKLY3[0], "2026-03-18T20:00:00Z"]);
});

Deno.test("default RDATE serialization preserves a bare DATE's DTSTART wall time", async () => {
  const rules = ["RRULE:FREQ=WEEKLY;COUNT=1", "RDATE:20260318"];
  const parsed = (await ICalendar.Raw.parse(rules)).asOk()!;
  const serialized = parsed.toString().split("\n");
  assertEquals(serialized, rules);
  assertEquals(await instants(serialized), [WEEKLY3[0], "2026-03-18T16:00:00Z"]);
});
