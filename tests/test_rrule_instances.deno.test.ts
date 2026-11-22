// The dateutil suite is driven by test_dateutil_fixtures.deno.test.ts.
import { assertEquals } from "@std/assert";
import { NaiveDateTime } from "../chrono/naive-datetime.ts";
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
  await Deno.readTextFile(
    new URL("./rrule_dateutil_time_cases.json", import.meta.url),
  ),
);

function wall(text: string): NaiveDateTime {
  const time = NaiveDateTime.parse(text);
  if (time == null) throw new Error(`Invalid wall timestamp: ${text}`);
  return time;
}

for (const c of cases) {
  Deno.test(`rrule.js subsecond recurrence / ${c.name}`, () => {
    const rule = RRule.parse(c.rrule).exp();
    const got = [...RRuleInstances.expand(rule, wall(c.dtstart))].map(String);
    assertEquals(got, c.expected);
  });
}

Deno.test("hasTimeParts: sub-daily frequencies and BYHOUR/BYMINUTE/BYSECOND only", () => {
  assertEquals(RRule.parse("FREQ=HOURLY").exp().hasTimeParts(), true);
  assertEquals(
    RRule.parse("FREQ=DAILY;BYHOUR=9,17").exp().hasTimeParts(),
    true,
  );
  assertEquals(
    RRule.parse("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1").exp()
      .hasTimeParts(),
    false,
  );
});

Deno.test("BYSETPOS parses as a list and writes back", () => {
  const rule = RRule.parse("FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=1,-1")
    .exp();
  assertEquals(rule.inner.options?.bysetpos, [1, -1]);
  assertEquals(rule.toString().includes("BYSETPOS=1,-1"), true);
});

Deno.test("expand applies BYSETPOS once for a rule without time parts", () => {
  // Weeks start Monday: Tue is position 2 and Fri is -1 of MO,TU,TH,FR.
  const rule = RRule.parse(
    "FREQ=WEEKLY;COUNT=4;BYDAY=FR,MO,TH,TU;BYSETPOS=-1,2",
  ).exp();
  const got = [...RRuleInstances.expand(rule, wall("2006-09-09T09:00:00"))].map(
    (d) => d.date.toString(),
  );
  assertEquals(got, ["2006-09-12", "2006-09-15", "2006-09-19", "2006-09-22"]);
});
