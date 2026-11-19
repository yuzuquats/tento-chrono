/**
 * deno test --no-lock benchmarks/monthly_permutations.ts
 * deno bench --no-lock benchmarks/monthly_permutations.ts
 */
import { assertEquals } from "@std/assert";
import rrule from "npm:rrule@2.8.1";
import { DateUnit, NaiveDate, naivedate, Weekday } from "../chrono/mod.ts";

const { RRule, datetime } = rrule;
const { Filter } = NaiveDate;
const dayMs = 86_400_000;
const rruleWeekdays = [
  RRule.SU,
  RRule.MO,
  RRule.TU,
  RRule.WE,
  RRule.TH,
  RRule.FR,
  RRule.SA,
];
const weekdays = {
  friday: [5],
  "tue-thu": [2, 4],
  weekend: [0, 6],
  weekdays: [1, 2, 3, 4, 5],
  "all-days": [0, 1, 2, 3, 4, 5, 6],
};
type WeekdaySelection = keyof typeof weekdays;

export function monthly(
  start: NaiveDate,
  end: NaiveDate,
  interval: number,
  selection: WeekdaySelection,
  positions: number[] | undefined,
) {
  const selected = weekdays[selection];
  const byWeekday = Filter.byWeekday(
    selected.map((index) => Weekday.DOW1[index]),
  );
  const filter = positions == null
    ? byWeekday
    : Filter.bySetPos(byWeekday, positions);
  const options = { end, filter, recurLimit: end.dse - start.dse + 1 };
  const rule = new RRule({
    freq: RRule.MONTHLY,
    dtstart: datetime(start.yr, start.mth, start.day),
    until: datetime(end.yr, end.mth, end.day),
    interval,
    byweekday: selected.map((index) => rruleWeekdays[index]),
    bysetpos: positions,
  }, true);
  const dates = () => start.range(DateUnit.months(interval), options);
  return {
    dates,
    chrono: () => Array.from(dates(), (day) => day.dse),
    rrule: () => rule.all().map((day) => day.getTime() / dayMs),
    raw: {
      chrono: () => Array.from(dates()),
      rrule: () => rule.all(),
    },
  };
}

Deno.test("Monthly selector permutations match the distinct dates from rrule 2.8.1", () => {
  const starts = [
    naivedate(1900, 1, 31),
    naivedate(1969, 12, 31),
    naivedate(2000, 2, 29),
    naivedate(2023, 11, 30),
    naivedate(2024, 1, 1),
    naivedate(2100, 2, 15),
  ];
  for (const start of starts) {
    const end = naivedate(start.yr + 2, start.mth, 15);
    for (const interval of [1, 2, 3, 12]) {
      for (const selection of Object.keys(weekdays) as WeekdaySelection[]) {
        for (
          const positions of [undefined, [-1], [1], [-2], [2], [1, -1], [
            -1,
            2,
            -3,
          ], [31]]
        ) {
          const workload = monthly(start, end, interval, selection, positions);
          assertEquals(
            workload.chrono(),
            [...new Set(workload.rrule())],
            `${start} to ${end}, interval ${interval}, ${selection}, positions ${positions}`,
          );
        }
      }
    }
  }
});

Deno.test("Overlapping positions name one occurrence even when rrule repeats it", () => {
  const start = naivedate(1900, 2, 1);
  const end = naivedate(1900, 2, 28);
  const workload = monthly(start, end, 1, "friday", [-1, 2, -3]);
  const second = naivedate(1900, 2, 9).dse;
  const last = naivedate(1900, 2, 23).dse;
  assertEquals(workload.chrono(), [second, last]);
  assertEquals(workload.rrule(), [second, second, last]);
});

const clockCases: {
  selection: WeekdaySelection;
  interval: number;
  positions?: number[];
}[] = [
  { selection: "friday", interval: 1, positions: [-1] },
  { selection: "tue-thu", interval: 3, positions: [-1] },
  { selection: "all-days", interval: 1, positions: [-1] },
  { selection: "friday", interval: 1, positions: [1] },
  { selection: "weekend", interval: 2, positions: [1, -1] },
  { selection: "weekdays", interval: 1, positions: [-2] },
  { selection: "all-days", interval: 1 },
];

for (const { selection, interval, positions } of clockCases) {
  const label = `${selection} interval ${interval} positions ${
    positions ?? "all"
  }`;
  const workload = monthly(
    naivedate(2024, 1, 31),
    naivedate(2123, 12, 15),
    interval,
    selection,
    positions,
  );
  const chrono = workload.chrono();
  const reference = workload.rrule();
  assertEquals(chrono.length, reference.length, label);
  const mismatch = chrono.findIndex((day, index) => day !== reference[index]);
  if (mismatch >= 0) {
    throw new Error(`${label} differs at date index ${mismatch}`);
  }
  for (const name of ["chrono", "rrule"] as const) {
    const run = workload[name];
    Deno.bench({
      name,
      group: label,
      baseline: name === "rrule",
      fn: () => {
        run();
      },
    });
  }
}
