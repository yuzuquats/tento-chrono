/**
 * `RRuleInstances.expand` against python-dateutil's rrule tests for the
 * parts the date generator cannot place: HOURLY / MINUTELY / SECONDLY
 * frequencies, BYHOUR / BYMINUTE / BYSECOND, and BYSETPOS
 * (`rrule_dateutil_time_cases.json`, ported from rrule.js's copy of
 * dateutil's suite; its BYEASTER cases are left out, a dateutil extension
 * that is not RFC 5545).
 */
import { assertEquals } from "@std/assert";
import { NaiveDateTime } from "../chrono/naive-datetime.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { NaiveTime } from "../chrono/naive-time.ts";
import { RRuleInstances } from "../chrono/recurrence/instances.ts";
import { RRule } from "../chrono/recurrence/rrule.ts";

interface Case {
  name: string;
  note?: string;
  dtstart: string;
  rrule: string;
  expected: string[];
}

const cases: Case[] = JSON.parse(
  await Deno.readTextFile(new URL("./rrule_dateutil_time_cases.json", import.meta.url)),
);

/** `2024-01-02T03:04:05` or `…05.123` as a NaiveDateTime. */
function wall(s: string): NaiveDateTime {
  const [date, time] = s.split("T");
  const [hms, frac] = time.split(".");
  const ms = frac == null ? 0 : Number(frac.padEnd(3, "0").slice(0, 3));
  const base = NaiveTime.parse(hms).exp();
  return new NaiveDateTime(NaiveDate.parse(date), new NaiveTime(base.toMs + ms));
}

for (const c of cases) {
  Deno.test(`dateutil ${c.name}: ${c.rrule}`, () => {
    const rule = RRule.parse(c.rrule).exp();
    const got = [...RRuleInstances.expand(rule, wall(c.dtstart))].map((d) => d.mse);
    assertEquals(got.map((ms) => NaiveDateTime.fromMse(ms).toString()), c.expected.map((e) => wall(e).toString()));
  });
}

Deno.test("hasTimeParts: sub-daily frequencies and BYHOUR/BYMINUTE/BYSECOND only", () => {
  assertEquals(RRule.parse("FREQ=HOURLY").exp().hasTimeParts(), true);
  assertEquals(RRule.parse("FREQ=DAILY;BYHOUR=9,17").exp().hasTimeParts(), true);
  assertEquals(RRule.parse("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1").exp().hasTimeParts(), false);
});

Deno.test("BYSETPOS parses as a list and writes back", () => {
  const rule = RRule.parse("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1").exp();
  assertEquals(rule.inner.options?.bysetpos, [1, -1]);
  assertEquals(rule.toString().includes("BYSETPOS=1,-1"), true);
});

Deno.test("expand applies BYSETPOS once for a rule without time parts", () => {
  // Weeks start Monday: Tue is position 2 and Fri is -1 of MO,TU,TH,FR.
  const rule = RRule.parse("FREQ=WEEKLY;COUNT=4;BYDAY=FR,MO,TH,TU;BYSETPOS=-1,2").exp();
  const got = [...RRuleInstances.expand(rule, wall("2006-09-09T09:00:00"))].map((d) => d.date.toString());
  assertEquals(got, ["2006-09-12", "2006-09-15", "2006-09-19", "2006-09-22"]);
});
