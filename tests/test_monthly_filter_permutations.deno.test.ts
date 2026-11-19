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

Deno.test("First and second positions from either end keep distinct dates and the final tied value", () => {
  type Candidate = Parameters<NaiveDate.Filter>[0];
  const month = naivedate(1969, 12, 1);
  const middle = naivedate(1969, 12, 15);
  const latest = naivedate(1969, 12, 31);
  const invalid = NaiveDate.fromYmd1Unchecked(1969, 12, 32);
  const invalidCandidate: Candidate = [invalid, "day"];
  const candidates: Candidate[] = [
    [month, "day"],
    [middle, "month"],
    [middle, "week"],
    [latest, "day"],
    [latest, "week"],
    invalidCandidate,
  ];
  const orders = [
    [],
    [invalidCandidate],
    [candidates[1], candidates[2], invalidCandidate],
    ...permutations(candidates),
  ];
  const period: Candidate = [month, "month"];
  for (const [index, order] of orders.entries()) {
    const source: NaiveDate.Filter = function* () {
      yield* order;
    };
    const present = [month, middle, latest].filter((date) =>
      order.some(([candidate]) => candidate === date)
    );
    for (const position of [1, 2, -1, -2]) {
      const date = present.at(position > 0 ? position - 1 : position);
      const expected = order.findLast(([candidate]) => candidate === date);
      assertEquals(
        [...Filter.bySetPos(source, [position])(period)],
        expected == null ? [] : [expected],
        `candidate order ${index}, position ${position}`,
      );
    }
  }
});
