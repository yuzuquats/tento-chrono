
import { assertEquals } from "@std/assert";

import { naivedate } from "../chrono/mod.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { GenericRangeLike } from "../chrono/range.ts";
import { DateUnit } from "../chrono/units/date-unit.ts";
import { Month } from "../chrono/units/month.ts";
import { Weekday } from "../chrono/units/weekday.ts";
import type { Option } from "../chrono/option.ts";

function before(
  generator: Generator<NaiveDate>,
  last: NaiveDate,
): Option<NaiveDate> {
  let curr: Option<NaiveDate> = null;
  for (const dt of generator) {
    if (last.cmpInvalid(dt) <= 0) {
      return curr;
    }
    curr = dt;
  }
}

function beforeEq(
  generator: Generator<NaiveDate>,
  last: NaiveDate,
): Option<NaiveDate> {
  let curr: Option<NaiveDate> = null;
  for (const dt of generator) {
    if (last.cmpInvalid(dt) === 0) {
      return last;
    }
    if (last.cmpInvalid(dt) <= 0) {
      return curr;
    }
    curr = dt;
  }
}

function after(
  generator: Generator<NaiveDate>,
  last: NaiveDate,
): Option<NaiveDate> {
  for (const dt of generator) {
    if (dt.cmpInvalid(last) > 0) {
      return dt;
    }
  }
  return null;
}

function afterEq(
  generator: Generator<NaiveDate>,
  last: NaiveDate,
): Option<NaiveDate> {
  for (const dt of generator) {
    if (dt.cmpInvalid(last) >= 0) {
      return dt;
    }
  }
  return null;
}

function all(generator: Generator<NaiveDate>): NaiveDate[] {
  return [...generator];
}

function between(
  generator: Generator<NaiveDate>,
  range: GenericRangeLike<NaiveDate>,
): NaiveDate[] {
  const r: NaiveDate[] = [];
  for (const dt of generator) {
    if (dt.cmpInvalid(range.start) > 0 && dt.cmpInvalid(range.end) < 0) {
      r.push(dt);
    }
  }
  return r;
}

function betweenInc(
  generator: Generator<NaiveDate>,
  range: GenericRangeLike<NaiveDate>,
): NaiveDate[] {
  const r: NaiveDate[] = [];
  for (const dt of generator) {
    if (dt.cmpInvalid(range.start) >= 0 && dt.cmpInvalid(range.end) <= 0) {
      r.push(dt);
    }
  }
  return r;
}

function assertDtArrEqs(nd: NaiveDate[], expected: string[]) {
  const nds = nd.map((nd) => nd.toString());
  assertEquals(nds, expected);
}

/**
 * Python reference:
 *     def testBefore(self):
 *         self.assertEqual(rrule(DAILY,  # count=5
 *             dtstart=datetime(1997, 9, 2, 9, 0)).before(datetime(1997, 9, 5, 9, 0)),
 *                          datetime(1997, 9, 4, 9, 0))
 *
 */
Deno.test({
  name: "testBefore",
  fn() {
    const iter = naivedate(1997, 9, 2).range();
    assertEquals(before(iter, naivedate(1997, 9, 5)), naivedate(1997, 9, 4));
  },
});

/**
 * Python reference:
 *     def testBeforeInc(self):
 *         self.assertEqual(rrule(DAILY,
 *                                #count=5,
 *                                dtstart=datetime(1997, 9, 2, 9, 0))
 *                                .before(datetime(1997, 9, 5, 9, 0), inc=True),
 *                          datetime(1997, 9, 5, 9, 0))
 *
 */
Deno.test({
  name: "testBeforeInc",
  fn() {
    const iter = naivedate(1997, 9, 2).range();
    assertEquals(beforeEq(iter, naivedate(1997, 9, 5)), naivedate(1997, 9, 5));
  },
});

/**
 * Python reference:
 *     def testAfter(self):
 *         self.assertEqual(rrule(DAILY,
 *                                #count=5,
 *                                dtstart=datetime(1997, 9, 2, 9, 0))
 *                                .after(datetime(1997, 9, 4, 9, 0)),
 *                          datetime(1997, 9, 5, 9, 0))
 *
 */
Deno.test({
  name: "testAfter",
  fn() {
    const iter = naivedate(1997, 9, 2).range();
    assertEquals(after(iter, naivedate(1997, 9, 4)), naivedate(1997, 9, 5));
  },
});

/**
 * Python reference:
 *     def testAfterInc(self):
 *         self.assertEqual(rrule(DAILY,
 *                                #count=5,
 *                                dtstart=datetime(1997, 9, 2, 9, 0))
 *                                .after(datetime(1997, 9, 4, 9, 0), inc=True),
 *                          datetime(1997, 9, 4, 9, 0))
 *
 */
Deno.test({
  name: "testAfterInc",
  fn() {
    const iter = naivedate(1997, 9, 2).range();
    assertEquals(afterEq(iter, naivedate(1997, 9, 4)), naivedate(1997, 9, 4));
  },
});

/**
 * Python reference:
 *     def testBetween(self):
 *         self.assertEqual(rrule(DAILY,
 *                                #count=5,
 *                                dtstart=datetime(1997, 9, 2, 9, 0))
 *                                .between(datetime(1997, 9, 2, 9, 0),
 *                                         datetime(1997, 9, 6, 9, 0)),
 *                          [datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0),
 *                           datetime(1997, 9, 5, 9, 0)])
 *
 */
Deno.test({
  name: "testBetween",
  fn() {
    const iter = naivedate(1997, 9, 2).range();
    assertDtArrEqs(
      between(iter, {
        start: naivedate(1997, 9, 2),
        end: naivedate(1997, 9, 6),
      }),
      ["1997-09-03", "1997-09-04", "1997-09-05"],
    );
  },
});

/**
 * Python reference:
 *     def testBetweenInc(self):
 *         self.assertEqual(rrule(DAILY,
 *                                #count=5,
 *                                dtstart=datetime(1997, 9, 2, 9, 0))
 *                                .between(datetime(1997, 9, 2, 9, 0),
 *                                         datetime(1997, 9, 6, 9, 0), inc=True),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0),
 *                           datetime(1997, 9, 5, 9, 0),
 *                           datetime(1997, 9, 6, 9, 0)])
 *
 */
Deno.test({
  name: "testBetweenInc",
  fn() {
    const iter = naivedate(1997, 9, 2).range();
    assertDtArrEqs(
      betweenInc(iter, {
        start: naivedate(1997, 9, 2),
        end: naivedate(1997, 9, 6),
      }),
      ["1997-09-02", "1997-09-03", "1997-09-04", "1997-09-05", "1997-09-06"],
    );
  },
});

Deno.test({
  name: "testBetweenWks",
  fn() {
    const iter = naivedate(2022, 6, 13).range(DateUnit.weeks(1), {
      filter: NaiveDate.Filter.byWeekday([Weekday.TUE]),
    });
    assertDtArrEqs(
      between(iter, {
        start: naivedate(2022, 6, 13),
        end: naivedate(2022, 7, 16),
      }),
      ["2022-06-14", "2022-06-21", "2022-06-28", "2022-07-05", "2022-07-12"],
    );
  },
});

Deno.test({
  name: "testYearlyBetweenInc",
  fn() {
    const iter = naivedate(2015, 1, 1).range(DateUnit.years(1));
    assertDtArrEqs(
      betweenInc(iter, {
        start: naivedate(2016, 1, 1),
        end: naivedate(2016, 1, 1),
      }),
      ["2016-01-01"],
    );
  },
});

Deno.test({
  name: "testYearlyBetweenIncLargeSpan",
  fn() {
    const iter = naivedate(1920, 1, 1).range(DateUnit.years(1));
    assertDtArrEqs(
      betweenInc(iter, {
        start: naivedate(2016, 1, 1),
        end: naivedate(2016, 1, 1),
      }),
      ["2016-01-01"],
    );
  },
});

Deno.test({
  name: "invalid dt",
  fn() {
    const dt = NaiveDate.fromYmd1Unchecked(2023, 2, 29);
    assertEquals(dt.isValid(), false);
    const iter = dt.range(DateUnit.days(1), {
      limit: 1,
    });
    assertDtArrEqs(all(iter), ["2023-03-02"]);
  },
});
