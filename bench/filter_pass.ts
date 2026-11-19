import {
  DateUnit,
  Month,
  NaiveDate,
  naivedate,
  Weekday,
} from "../chrono/mod.ts";

const { Filter } = NaiveDate;
type Input = Parameters<NaiveDate.Filter>[0];

const anchors = [[1, 1], [1, 4], [2, 28], [3, 1], [6, 15], [12, 28], [12, 31]];
const units: DateUnit.Type[] = ["day", "week", "month", "year"];
const input: Input[] = [];
for (
  const year of [
    1899,
    1900,
    1969,
    1970,
    1999,
    2000,
    2004,
    2015,
    2020,
    2023,
    2024,
    2100,
    2400,
  ]
) {
  for (const [month, day] of anchors) {
    const date = naivedate(year, month, day);
    for (const unit of units) input.push([date, unit]);
  }
}

const weekdays = [Weekday.MON, Weekday.FRI];
const months = [Month.DEC, Month.FEB, Month.JAN, Month.FEB];
const fn = Filter.byWeekday(weekdays);
const nth = [
  Weekday.MON.nth(1),
  Weekday.FRI.nth(-1),
  Weekday.THU.nth(5),
  Weekday.SUN.nth(-5),
];
const weekNumbers = [1, 12, 52, 53, -1, -2, -53];

const groups: Record<string, NaiveDate.Filter[]> = {
  identity: [Filter.identity()],
  compose: [Filter.compose([Filter.byMonthOfYear(months), fn])],
  "compose/without-month-limit": [
    Filter.compose([Filter.identity(), Filter.identity()]),
  ],
  bySetPos: [[-2], [1, -1], [-3, 2, 6]].map((positions) =>
    Filter.bySetPos(fn, positions)
  ),
  byWeekday: [fn],
  byMonthOfYear: [
    Filter.byMonthOfYear(months),
    Filter.byMonthOfYear(months).straddling,
  ],
  byDayOfMonth: [
    Filter.byDayOfMonth([1, 15, 28, 29, 30, 31, -1, -2, -31, 1, 0]),
  ],
  byDayOfYear: [
    Filter.byDayOfYear([1, 31, 59, 60, 182, 365, 366, -1, -2, -365, -366]),
  ],
  byWeekNo: weekNumbers.map((number) => Filter.byWeekNo(number)),
  "byWeekNo/calendar-year": weekNumbers.map((number) =>
    Filter.byWeekNo(number, true)
  ),
  byWeekNoGoogle: weekNumbers.map((number) => Filter.byWeekNoGoogle(number)),
  "byWeekNoGoogle/calendar-year": weekNumbers.map((number) =>
    Filter.byWeekNoGoogle(number, true)
  ),
  byNthWeekday: [Filter.byNthWeekday(nth)],
  "byNthWeekday/strict": [Filter.byNthWeekday(nth, false)],
};

if (import.meta.main) {
  const fingerprints = [];
  const encoder = new TextEncoder();
  for (const [name, filters] of Object.entries(groups)) {
    for (const unit of units) {
      const rows = input.filter((tuple) => tuple[1] === unit).flatMap((tuple) =>
        filters.map((filter) =>
          Array.from(
            filter(tuple),
            ([day, unit]) => [day.yr, day.mth, day.day, unit],
          )
        )
      );
      const bytes = encoder.encode(JSON.stringify(rows));
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      fingerprints.push({
        name,
        unit,
        emitted: rows.reduce((sum, row) => sum + row.length, 0),
        sha256: Array.from(
          new Uint8Array(digest),
          (byte) => byte.toString(16).padStart(2, "0"),
        ).join(""),
      });
    }
  }
  console.log(JSON.stringify(fingerprints, null, 2));
} else {
  for (const [name, filters] of Object.entries(groups)) {
    Deno.bench(name, () => {
      let sum = 0;
      for (const tuple of input) {
        for (const filter of filters) {
          for (const [day] of filter(tuple)) sum += day.day;
        }
      }
      if (sum <= 0) throw new Error(`No dates for ${name}`);
    });
  }
}
