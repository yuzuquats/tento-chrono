import { assertEquals } from "@std/assert";
import { NaiveDate, naivedate, Weekday } from "../chrono/mod.ts";

const { Filter } = NaiveDate;

Deno.test("Monthly weekday filters match UTC Date for every weekday mask", () => {
  const filters = Array.from(
    { length: 128 },
    (_, mask) =>
      Filter.byWeekday(Weekday.DOW1.filter((_, i) => (mask & (1 << i)) !== 0)),
  );
  for (
    const year of [1899, 1900, 1969, 1970, 1999, 2000, 2023, 2024, 2100, 2400]
  ) {
    for (let month = 0; month < 12; month++) {
      const candidates = [];
      const cursor = new Date(Date.UTC(year, month, 1));
      while (cursor.getUTCMonth() === month) {
        candidates.push({
          day: cursor.getTime() / 86_400_000,
          bit: 1 << cursor.getUTCDay(),
        });
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      const period = naivedate(year, month + 1, 15);
      for (const [mask, filter] of filters.entries()) {
        const actual = Array.from(
          filter([period, "month"]),
          ([day]) => day.dse,
        );
        const expected = candidates.filter(({ bit }) => (mask & bit) !== 0).map(
          ({ day }) => day,
        );
        assertEquals(
          actual,
          expected,
          `${year}-${month + 1}, weekday mask ${mask}`,
        );
      }
    }
  }
});

function* permutations<T>(items: readonly T[]): Generator<T[]> {
  if (items.length === 0) {
    yield [];
    return;
  }
  for (const [index, item] of items.entries()) {
    for (const rest of permutations(items.filter((_, i) => i !== index))) {
      yield [item, ...rest];
    }
  }
}

Deno.test("Last-position selection keeps the final occurrence of the latest valid date", () => {
  type Candidate = Parameters<NaiveDate.Filter>[0];
  const month = naivedate(2024, 2, 1);
  const latest = naivedate(2024, 2, 29);
  const invalid = NaiveDate.fromYmd1Unchecked(2024, 2, 31);
  const candidates: Candidate[] = [
    [month, "day"],
    [naivedate(2024, 2, 15), "day"],
    [latest, "day"],
    [latest, "week"],
    [invalid, "day"],
  ];
  const orders = [
    [],
    [[invalid, "day"]] as Candidate[],
    ...permutations(candidates),
  ];
  for (const [index, order] of orders.entries()) {
    const source: NaiveDate.Filter = function* () {
      yield* order;
    };
    const period: Candidate = [month, "month"];
    const expected = order.findLast(([date]) => date === latest);
    assertEquals(
      [...Filter.bySetPos(source, [-1])(period)],
      expected == null ? [] : [expected],
      `candidate order ${index}`,
    );
  }
});
