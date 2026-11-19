/**
 * Compare the recurrence article's three examples and an unfiltered daily range.
 * Run with deno bench --lock=bench/deno.lock --frozen --allow-env=CHRONO_YEARS bench/recurrence_bench.ts.
 * Set CHRONO_YEARS=1 to use the article's dates. Expansion starts from prepared rules.
 */
import { assertEquals } from "@std/assert";
import rrule from "npm:rrule@2.8.1";
import {
  DateUnit,
  Month,
  NaiveDate,
  naivedate,
  Weekday,
} from "../chrono/mod.ts";

const { RRule, RRuleSet, datetime } = rrule;
const { Filter } = NaiveDate;
const dayMs = 86_400_000;
const years = Number(Deno.env.get("CHRONO_YEARS") ?? 100);
const endYear = 2023 + years;
const start = naivedate(2024, 1, 1);
const end = naivedate(endYear, 12, 31);
const lunchEnd = years === 1 ? naivedate(2024, 3, 31) : end;
const dtstart = datetime(2024, 1, 1);
const until = datetime(endYear, 12, 31);
const dayNumber = (day: Date) => day.getTime() / dayMs;

const summer = Filter.compose([
  Filter.byMonthOfYear([Month.JUN, Month.JUL, Month.AUG]),
  Filter.byNthWeekday([Weekday.FRI.nth(1)]),
]);
const summerRule = new RRule({
  dtstart,
  until,
  freq: RRule.YEARLY,
  bymonth: [6, 7, 8],
  byweekday: RRule.FR.nth(1),
}, true);

const quarters = Filter.compose([
  Filter.byMonthOfYear([Month.MAR, Month.JUN, Month.SEP, Month.DEC]),
  Filter.bySetPos(Filter.byWeekday([Weekday.TUE, Weekday.THU]), [-1]),
]);
const quarterRule = new RRule({
  dtstart: datetime(2024, 3, 1),
  until,
  freq: RRule.MONTHLY,
  interval: 3,
  byweekday: [RRule.TU, RRule.TH],
  bysetpos: -1,
}, true);

const lunch = Filter.bySetPos(
  Filter.compose([
    Filter.byWeekday([Weekday.FRI]),
    function* ([day, unit]) {
      if (String(day) !== "2024-03-29") yield [day, unit];
    },
  ]),
  [-1],
);
const lunchRule = new RRuleSet(true);
lunchRule.rrule(
  new RRule({
    dtstart,
    until: years === 1 ? datetime(2024, 3, 31) : until,
    freq: RRule.MONTHLY,
    byweekday: RRule.FR,
  }, true),
);
lunchRule.exdate(datetime(2024, 3, 29));

const dailyRule = new RRule({ dtstart, until, freq: RRule.DAILY }, true);

export const workloads = {
  summer: {
    chrono: () =>
      Array.from(
        start.range(DateUnit.years(1), { end, filter: summer }),
        (day) => day.dse,
      ),
    rrule: () => summerRule.all().map(dayNumber),
  },
  quarter: {
    chrono: () =>
      Array.from(
        start.range(DateUnit.years(1), { end, filter: quarters }),
        (day) => day.dse,
      ),
    rrule: () => quarterRule.all().map(dayNumber),
  },
  lunch: {
    chrono: () =>
      Array.from(
        start.range(DateUnit.months(1), {
          end: lunchEnd,
          filter: lunch,
        }),
        (day) => day.dse,
      ),
    rrule: () => {
      // Apply the last-Friday selection to the set of eligible Fridays.
      const result: number[] = [];
      let month = -1;
      for (const day of lunchRule.all()) {
        const key = day.getUTCFullYear() * 12 + day.getUTCMonth();
        if (key !== month) {
          month = key;
          result.push(dayNumber(day));
        } else {
          result[result.length - 1] = dayNumber(day);
        }
      }
      return result;
    },
  },
  daily: {
    chrono: () =>
      Array.from(
        start.range(DateUnit.days(1), {
          end,
          recurLimit: years * 366 + 1,
        }),
        (day) => day.dse,
      ),
    rrule: () => dailyRule.all().map(dayNumber),
  },
};

for (const [group, workload] of Object.entries(workloads)) {
  const actual = workload.chrono();
  const expected = workload.rrule();
  assertEquals(actual.length, expected.length, group);
  const mismatch = actual.findIndex((day, index) => day !== expected[index]);
  if (mismatch >= 0) {
    throw new Error(
      `${group} differs at index ${mismatch}: ${actual[mismatch]} versus ${
        expected[mismatch]
      }`,
    );
  }
  Deno.bench({
    name: "rrule",
    group,
    baseline: true,
    fn: () => {
      workload.rrule();
    },
  });
  Deno.bench({
    name: "chrono",
    group,
    fn: () => {
      workload.chrono();
    },
  });
}
