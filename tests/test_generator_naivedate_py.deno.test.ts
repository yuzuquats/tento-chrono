import "../../lona-js/lona-js/types/option.d.ts";

import { assertEquals } from "@std/assert";

import { naivedate } from "../chrono/mod.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { GenericRangeLike } from "../chrono/range.ts";
import { DateUnit } from "../chrono/units/date-unit.ts";
import { Month } from "../chrono/units/month.ts";
import { Weekday } from "../chrono/units/weekday.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

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

Deno.test({
  name: "rrule/feb28",
  fn() {
    const iter = naivedate(2013, 1, 1).range(DateUnit.months(1), {
      limit: 3,
      filter: NaiveDate.Filter.byDayOfMonth([28]),
    });
    assertDtArrEqs(all(iter), ["2013-01-28", "2013-02-28", "2013-03-28"]);
  },
});

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

/**
 * Python reference:
 *     def testYearly(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1998, 9, 2, 9, 0),
 *                           datetime(1999, 9, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testYearly",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1998-09-02", "1999-09-02"]);
  },
});

/**
 * Python reference:
 *     def testYearlyInterval(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               interval=2,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1999, 9, 2, 9, 0),
 *                           datetime(2001, 9, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyInterval",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(2), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1999-09-02", "2001-09-02"]);
  },
});

/**
 * Python reference:
 *     def testYearlyIntervalLarge(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               interval=100,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(2097, 9, 2, 9, 0),
 *                           datetime(2197, 9, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyIntervalLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(100), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "2097-09-02", "2197-09-02"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonth(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 2, 9, 0),
 *                           datetime(1998, 3, 2, 9, 0),
 *                           datetime(1999, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonth",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
    });
    assertDtArrEqs(all(iter), ["1998-01-02", "1998-03-02", "1999-01-02"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonthDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               bymonthday=(1, 3),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 10, 1, 9, 0),
 *                           datetime(1997, 10, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonthDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: NaiveDate.Filter.byDayOfMonth([1, 3]),
    });
    assertDtArrEqs(all(iter), ["1997-09-03", "1997-10-01", "1997-10-03"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonthAndMonthDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               bymonthday=(5, 7),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 5, 9, 0),
 *                           datetime(1998, 1, 7, 9, 0),
 *                           datetime(1998, 3, 5, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonthAndMonthDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byDayOfMonth([5, 7]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-05", "1998-01-07", "1998-03-05"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByWeekDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0),
 *                           datetime(1997, 9, 9, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-04", "1997-09-09"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByNWeekDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               byweekday=(TU(1), TH(-1)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 25, 9, 0),
 *                           datetime(1998, 1, 6, 9, 0),
 *                           datetime(1998, 12, 31, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByNWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: NaiveDate.Filter.byNthWeekday([
        Weekday.TUE.nth(1),
        Weekday.THU.nth(-1),
      ]),
    });
    assertDtArrEqs(all(iter), ["1997-12-25", "1998-01-06", "1998-12-31"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByNWeekDayLarge(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               byweekday=(TU(3), TH(-3)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 11, 9, 0),
 *                           datetime(1998, 1, 20, 9, 0),
 *                           datetime(1998, 12, 17, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByNWeekDayLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: NaiveDate.Filter.byNthWeekday([
        Weekday.TUE.nth(3),
        Weekday.THU.nth(-3),
      ]),
    });
    assertDtArrEqs(all(iter), ["1997-12-11", "1998-01-20", "1998-12-17"]);
  },
});

Deno.test({
  name: "testYearlyByNWeekDayLargeLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: NaiveDate.Filter.byNthWeekday([
        Weekday.TUE.nth(13),
        Weekday.THU.nth(-13),
      ]),
    });
    assertDtArrEqs(all(iter), ["1997-10-02", "1998-03-31", "1998-10-08"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonthAndWeekDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 1, 6, 9, 0),
 *                           datetime(1998, 1, 8, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonthAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-01-06", "1998-01-08"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonthAndNWeekDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               byweekday=(TU(1), TH(-1)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 6, 9, 0),
 *                           datetime(1998, 1, 29, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonthAndNWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byNthWeekday([
          Weekday.TUE.nth(1),
          Weekday.THU.nth(-1),
        ]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-06", "1998-01-29", "1998-03-03"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonthAndNWeekDayLarge(self):
 *         # This is interesting because the TH(-3) ends up before
 *         # the TU(3).
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               byweekday=(TU(3), TH(-3)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 15, 9, 0),
 *                           datetime(1998, 1, 20, 9, 0),
 *                           datetime(1998, 3, 12, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonthAndNWeekDayLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byNthWeekday([
          Weekday.TUE.nth(3),
          Weekday.THU.nth(-3),
        ]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-15", "1998-01-20", "1998-03-12"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonthDayAndWeekDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               bymonthday=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 2, 3, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonthDayAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byDayOfMonth([1, 3]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-02-03", "1998-03-03"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonthAndMonthDayAndWeekDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               bymonthday=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0),
 *                           datetime(2001, 3, 1, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonthAndMonthDayAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byDayOfMonth([1, 3]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-03-03", "2001-03-01"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByYearDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=4,
 *                               byyearday=(1, 100, 200, 365),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 31, 9, 0),
 *                           datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByYearDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfYear([1, 100, 200, 365]),
    });
    assertDtArrEqs(all(iter), [
      "1997-12-31",
      "1998-01-01",
      "1998-04-10",
      "1998-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testYearlyByYearDayNeg(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=4,
 *                               byyearday=(-365, -266, -166, -1),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 31, 9, 0),
 *                           datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByYearDayNeg",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfYear([-365, -266, -166, -1]),
    });
    assertDtArrEqs(all(iter), [
      "1997-12-31",
      "1998-01-01",
      "1998-04-10",
      "1998-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonthAndYearDay(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=4,
 *                               bymonth=(4, 7),
 *                               byyearday=(1, 100, 200, 365),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0),
 *                           datetime(1999, 4, 10, 9, 0),
 *                           datetime(1999, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonthAndYearDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 4,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.APR, Month.JUL]),
        NaiveDate.Filter.byDayOfYear([1, 100, 200, 365]),
      ],
    });
    assertDtArrEqs(all(iter), [
      "1998-04-10",
      "1998-07-19",
      "1999-04-10",
      "1999-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testYearlyByMonthAndYearDayNeg(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=4,
 *                               bymonth=(4, 7),
 *                               byyearday=(-365, -266, -166, -1),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0),
 *                           datetime(1999, 4, 10, 9, 0),
 *                           datetime(1999, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByMonthAndYearDayNeg",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 4,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.APR, Month.JUL]),
        NaiveDate.Filter.byDayOfYear([-365, -266, -166, -1]),
      ],
    });
    assertDtArrEqs(all(iter), [
      "1998-04-10",
      "1998-07-19",
      "1999-04-10",
      "1999-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testYearlyByWeekNo(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               byweekno=20,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 5, 11, 9, 0),
 *                           datetime(1998, 5, 12, 9, 0),
 *                           datetime(1998, 5, 13, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByWeekNo",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: NaiveDate.Filter.byWeekNo(20, true),
    });
    assertDtArrEqs(all(iter), ["1998-05-11", "1998-05-12", "1998-05-13"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByWeekNoAndWeekDay(self):
 *         # That's a nice one. The first days of week number one
 *         # may be in the last year.
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               byweekno=1,
 *                               byweekday=MO,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 29, 9, 0),
 *                           datetime(1999, 1, 4, 9, 0),
 *                           datetime(2000, 1, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByWeekNoAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(1),
        NaiveDate.Filter.byWeekday([Weekday.MON]),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-29", "1999-01-04", "2000-01-03"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByWeekNoAndWeekDayLarge(self):
 *         # Another nice test. The last days of week number 52/53
 *         # may be in the next year.
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               byweekno=52,
 *                               byweekday=SU,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 28, 9, 0),
 *                           datetime(1998, 12, 27, 9, 0),
 *                           datetime(2000, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByWeekNoAndWeekDayLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(52),
        NaiveDate.Filter.byWeekday([Weekday.SUN]),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-28", "1998-12-27", "2000-01-02"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByWeekNoAndWeekDayLast(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               byweekno=-1,
 *                               byweekday=SU,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 28, 9, 0),
 *                           datetime(1999, 1, 3, 9, 0),
 *                           datetime(2000, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByWeekNoAndWeekDayLast",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(-1),
        NaiveDate.Filter.byWeekday([Weekday.SUN]),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-28", "1999-01-03", "2000-01-02"]);
  },
});

/**
 * Python reference:
 *     def testYearlyByWeekNoAndWeekDay53(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               byweekno=53,
 *                               byweekday=MO,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 12, 28, 9, 0),
 *                           datetime(2004, 12, 27, 9, 0),
 *                           datetime(2009, 12, 28, 9, 0)])
 *
 */
Deno.test({
  name: "testYearlyByWeekNoAndWeekDay53",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(53),
        NaiveDate.Filter.byWeekday([Weekday.MON]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-12-28", "2004-12-27", "2009-12-28"]);
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

/**
 * Python reference:
 *     def testMonthly(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 10, 2, 9, 0),
 *                           datetime(1997, 11, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthly",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-10-02", "1997-11-02"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyInterval(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               interval=2,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 11, 2, 9, 0),
 *                           datetime(1998, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyInterval",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(2), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-11-02", "1998-01-02"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyIntervalLarge(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               interval=18,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1999, 3, 2, 9, 0),
 *                           datetime(2000, 9, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyIntervalLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(18), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1999-03-02", "2000-09-02"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonth(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 2, 9, 0),
 *                           datetime(1998, 3, 2, 9, 0),
 *                           datetime(1999, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonth",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
    });
    assertDtArrEqs(all(iter), ["1998-01-02", "1998-03-02", "1999-01-02"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonthDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               bymonthday=(1, 3),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 10, 1, 9, 0),
 *                           datetime(1997, 10, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonthDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: NaiveDate.Filter.byDayOfMonth([1, 3]),
    });
    assertDtArrEqs(all(iter), ["1997-09-03", "1997-10-01", "1997-10-03"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonthAndMonthDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               bymonthday=(5, 7),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 5, 9, 0),
 *                           datetime(1998, 1, 7, 9, 0),
 *                           datetime(1998, 3, 5, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonthAndMonthDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byDayOfMonth([5, 7]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-05", "1998-01-07", "1998-03-05"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByWeekDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0),
 *                           datetime(1997, 9, 9, 9, 0)])
 *
 *         # Third Monday of the month
 *         self.assertEqual(rrule(MONTHLY,
 *                          byweekday=(MO(+3)),
 *                          dtstart=datetime(1997, 9, 1)).between(datetime(1997, 9, 1),
 *                                                                datetime(1997, 12, 1)),
 *                          [datetime(1997, 9, 15, 0, 0),
 *                           datetime(1997, 10, 20, 0, 0),
 *                           datetime(1997, 11, 17, 0, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-04", "1997-09-09"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByNWeekDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               byweekday=(TU(1), TH(-1)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 25, 9, 0),
 *                           datetime(1997, 10, 7, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByNWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: NaiveDate.Filter.byNthWeekday([
        Weekday.TUE.nth(1),
        Weekday.THU.nth(-1),
      ]),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-25", "1997-10-07"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByNWeekDayLarge(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               byweekday=(TU(3), TH(-3)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 11, 9, 0),
 *                           datetime(1997, 9, 16, 9, 0),
 *                           datetime(1997, 10, 16, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByNWeekDayLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: NaiveDate.Filter.byNthWeekday([
        Weekday.TUE.nth(3),
        Weekday.THU.nth(-3),
      ]),
    });
    assertDtArrEqs(all(iter), ["1997-09-11", "1997-09-16", "1997-10-16"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonthAndWeekDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 1, testYearlyByMonthAndYearDay6, 9, 0),
 *                           datetime(1998, 1, 8, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonthAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    const values = all(iter);
    assertDtArrEqs(values, ["1998-01-01", "1998-01-06", "1998-01-08"]);
  },
});

Deno.test({
  name: "testMonthlyByMonthAndWeekDay98",
  fn() {
    const iter = naivedate(1998, 1, 25).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    const values = all(iter);
    assertDtArrEqs(values, ["1998-01-27", "1998-01-29", "1998-03-03"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonthAndNWeekDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               byweekday=(TU(1), TH(-1)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 6, 9, 0),
 *                           datetime(1998, 1, 29, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonthAndNWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byNthWeekday([
          Weekday.TUE.nth(1),
          Weekday.THU.nth(-1),
        ]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-06", "1998-01-29", "1998-03-03"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonthAndNWeekDayLarge(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               byweekday=(TU(3), TH(-3)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 15, 9, 0),
 *                           datetime(1998, 1, 20, 9, 0),
 *                           datetime(1998, 3, 12, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonthAndNWeekDayLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byNthWeekday([
          Weekday.TUE.nth(3),
          Weekday.THU.nth(-3),
        ]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-15", "1998-01-20", "1998-03-12"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonthDayAndWeekDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               bymonthday=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 2, 3, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonthDayAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byDayOfMonth([1, 3]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-02-03", "1998-03-03"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonthAndMonthDayAndWeekDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               bymonthday=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0),
 *                           datetime(2001, 3, 1, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonthAndMonthDayAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byDayOfMonth([1, 3]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-03-03", "2001-03-01"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByYearDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=4,
 *                               byyearday=(1, 100, 200, 365),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 31, 9, 0),
 *                           datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByYearDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfYear([1, 100, 200, 365]),
    });
    assertDtArrEqs(all(iter), [
      "1997-12-31",
      "1998-01-01",
      "1998-04-10",
      "1998-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByYearDayNeg(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=4,
 *                               byyearday=(-365, -266, -166, -1),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 31, 9, 0),
 *                           datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByYearDayNeg",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfYear([-365, -266, -166, -1]),
    });
    assertDtArrEqs(all(iter), [
      "1997-12-31",
      "1998-01-01",
      "1998-04-10",
      "1998-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonthAndYearDay(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=4,
 *                               bymonth=(4, 7),
 *                               byyearday=(1, 100, 200, 365),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0),
 *                           datetime(1999, 4, 10, 9, 0),
 *                           datetime(1999, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonthAndYearDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 4,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.APR, Month.JUL]),
        NaiveDate.Filter.byDayOfYear([1, 100, 200, 365]),
      ],
    });
    assertDtArrEqs(all(iter), [
      "1998-04-10",
      "1998-07-19",
      "1999-04-10",
      "1999-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByMonthAndYearDayNeg(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=4,
 *                               bymonth=(4, 7),
 *                               byyearday=(-365, -266, -166, -1),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0),
 *                           datetime(1999, 4, 10, 9, 0),
 *                           datetime(1999, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByMonthAndYearDayNeg",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 4,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.APR, Month.JUL]),
        NaiveDate.Filter.byDayOfYear([-365, -266, -166, -1]),
      ],
    });
    assertDtArrEqs(all(iter), [
      "1998-04-10",
      "1998-07-19",
      "1999-04-10",
      "1999-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByWeekNo(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               byweekno=20,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 5, 11, 9, 0),
 *                           datetime(1998, 5, 12, 9, 0),
 *                           datetime(1998, 5, 13, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByWeekNo",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: NaiveDate.Filter.byWeekNo(20),
    });
    assertDtArrEqs(all(iter), ["1998-05-11", "1998-05-12", "1998-05-13"]);
  },
});

Deno.test({
  name: "testMonthlyByWeekNo1",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: NaiveDate.Filter.byWeekNo(1, true),
    });
    assertDtArrEqs(all(iter), ["1997-12-29", "1997-12-30", "1997-12-31"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByWeekNoAndWeekDay(self):
 *         # That's a nice one. The first days of week number one
 *         # may be in the last year.
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               byweekno=1,
 *                               byweekday=MO,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 29, 9, 0),
 *                           datetime(1999, 1, 4, 9, 0),
 *                           datetime(2000, 1, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByWeekNoAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(1, true),
        NaiveDate.Filter.byWeekday([Weekday.MON]),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-29", "1999-01-04", "2000-01-03"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByWeekNoAndWeekDayLarge(self):
 *         # Another nice test. The last days of week number 52/53
 *         # may be in the next year.
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               byweekno=52,
 *                               byweekday=SU,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 28, 9, 0),
 *                           datetime(1998, 12, 27, 9, 0),
 *                           datetime(2000, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByWeekNoAndWeekDayLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(52, true),
        NaiveDate.Filter.byWeekday([Weekday.SUN]),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-28", "1998-12-27", "2000-01-02"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByWeekNoAndWeekDayLast(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               byweekno=-1,
 *                               byweekday=SU,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 28, 9, 0),
 *                           datetime(1999, 1, 3, 9, 0),
 *                           datetime(2000, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByWeekNoAndWeekDayLast",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(-1),
        NaiveDate.Filter.byWeekday([Weekday.SUN]),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-28", "1999-01-03", "2000-01-02"]);
  },
});

/**
 * Python reference:
 *     def testMonthlyByWeekNoAndWeekDay53(self):
 *         self.assertEqual(list(rrule(MONTHLY,
 *                               count=3,
 *                               byweekno=53,
 *                               byweekday=MO,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 12, 28, 9, 0),
 *                           datetime(2004, 12, 27, 9, 0),
 *                           datetime(2009, 12, 28, 9, 0)])
 *
 */
Deno.test({
  name: "testMonthlyByWeekNoAndWeekDay53",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.months(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(53),
        NaiveDate.Filter.byWeekday([Weekday.MON]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-12-28", "2004-12-27", "2009-12-28"]);
  },
});

Deno.test({
  name: "testMonthlyNegByMonthDayJanFebForNonLeapYear",
  fn() {
    const iter = naivedate(2013, 12, 1).range(DateUnit.months(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfMonth([-1]),
    });
    assertDtArrEqs(all(iter), [
      "2013-12-31",
      "2014-01-31",
      "2014-02-28",
      "2014-03-31",
    ]);
  },
});

Deno.test({
  name: "testMonthlyNegByMonthDayJanFebForLeapYear",
  fn() {
    const iter = naivedate(2015, 12, 1).range(DateUnit.months(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfMonth([-1]),
    });
    assertDtArrEqs(all(iter), [
      "2015-12-31",
      "2016-01-31",
      "2016-02-29",
      "2016-03-31",
    ]);
  },
});

/**
 * Python reference:
 *     def testWeekly(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 9, 9, 0),
 *                           datetime(1997, 9, 16, 9, 0)])
 *
 */
Deno.test({
  name: "testWeekly",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-09", "1997-09-16"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyInterval(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               interval=2,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 16, 9, 0),
 *                           datetime(1997, 9, 30, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyInterval",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(2), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-16", "1997-09-30"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyIntervalLarge(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               interval=20,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1998, 1, 20, 9, 0),
 *                           datetime(1998, 6, 9, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyIntervalLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(20), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1998-01-20", "1998-06-09"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByMonth(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 6, 9, 0),
 *                           datetime(1998, 1, 13, 9, 0),
 *                           datetime(1998, 1, 20, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByMonth",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
    });
    assertDtArrEqs(all(iter), ["1998-01-06", "1998-01-13", "1998-01-20"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByMonthDay(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               bymonthday=(1, 3),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 10, 1, 9, 0),
 *                           datetime(1997, 10, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByMonthDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: NaiveDate.Filter.byDayOfMonth([1, 3]),
    });
    assertDtArrEqs(all(iter), ["1997-09-03", "1997-10-01", "1997-10-03"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByMonthAndMonthDay(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               bymonthday=(5, 7),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 5, 9, 0),
 *                           datetime(1998, 1, 7, 9, 0),
 *                           datetime(1998, 3, 5, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByMonthAndMonthDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byDayOfMonth([5, 7]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-05", "1998-01-07", "1998-03-05"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByWeekDay(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0),
 *                           datetime(1997, 9, 9, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-04", "1997-09-09"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByNWeekDay(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               byweekday=(TU(1), TH(-1)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0),
 *                           datetime(1997, 9, 9, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByNWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: NaiveDate.Filter.byNthWeekday([
        Weekday.TUE.nth(1),
        Weekday.THU.nth(-1),
      ]),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-04", "1997-09-09"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByMonthAndWeekDay(self):
 *         # This test is interesting, because it crosses the year
 *         # boundary in a weekly period to find day '1' as a
 *         # valid recurrence.
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 1, 6, 9, 0),
 *                           datetime(1998, 1, 8, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByMonthAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-01-06", "1998-01-08"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByMonthDayAndWeekDay(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               bymonthday=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 2, 3, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByMonthDayAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
        NaiveDate.Filter.byDayOfMonth([1, 3]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-02-03", "1998-03-03"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByMonthAndMonthDayAndWeekDay(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               bymonthday=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0),
 *                           datetime(2001, 3, 1, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByMonthAndMonthDayAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
        NaiveDate.Filter.byDayOfMonth([1, 3]),
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-03-03", "2001-03-01"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByYearDay(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=4,
 *                               byyearday=(1, 100, 200, 365),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 31, 9, 0),
 *                           datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByYearDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfYear([1, 100, 200, 365]),
    });
    assertDtArrEqs(all(iter), [
      "1997-12-31",
      "1998-01-01",
      "1998-04-10",
      "1998-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByYearDayNeg(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=4,
 *                               byyearday=(-365, -266, -166, -1),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 31, 9, 0),
 *                           datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByYearDayNeg",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfYear([-365, -266, -166, -1]),
    });
    assertDtArrEqs(all(iter), [
      "1997-12-31",
      "1998-01-01",
      "1998-04-10",
      "1998-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByMonthAndYearDay(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=4,
 *                               bymonth=(1, 7),
 *                               byyearday=(1, 100, 200, 365),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0),
 *                           datetime(1999, 1, 1, 9, 0),
 *                           datetime(1999, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByMonthAndYearDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 4,
      filter: [
        NaiveDate.Filter.byDayOfYear([1, 100, 200, 365]),
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.JUL]),
      ],
    });
    assertDtArrEqs(all(iter), [
      "1998-01-01",
      "1998-07-19",
      "1999-01-01",
      "1999-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByMonthAndYearDayNeg(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=4,
 *                               bymonth=(1, 7),
 *                               byyearday=(-365, -266, -166, -1),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0),
 *                           datetime(1999, 1, 1, 9, 0),
 *                           datetime(1999, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByMonthAndYearDayNeg",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 4,
      filter: [
        NaiveDate.Filter.byDayOfYear([-365, -266, -166, -1]),
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.JUL]),
      ],
    });
    assertDtArrEqs(all(iter), [
      "1998-01-01",
      "1998-07-19",
      "1999-01-01",
      "1999-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByWeekNo(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               byweekno=20,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 5, 11, 9, 0),
 *                           datetime(1998, 5, 12, 9, 0),
 *                           datetime(1998, 5, 13, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByWeekNo",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: NaiveDate.Filter.byWeekNo(20),
    });
    assertDtArrEqs(all(iter), ["1998-05-11", "1998-05-12", "1998-05-13"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByWeekNoAndWeekDay(self):
 *         # That's a nice one. The first days of week number one
 *         # may be in the last year.
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               byweekno=1,
 *                               byweekday=MO,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 29, 9, 0),
 *                           datetime(1999, 1, 4, 9, 0),
 *                           datetime(2000, 1, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByWeekNoAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekday([Weekday.MON]),
        NaiveDate.Filter.byWeekNo(1),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-29", "1999-01-04", "2000-01-03"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByWeekNoAndWeekDayLarge(self):
 *         # Another nice test. The last days of week number 52/53
 *         # may be in the next year.
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               byweekno=52,
 *                               byweekday=SU,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 28, 9, 0),
 *                           datetime(1998, 12, 27, 9, 0),
 *                           datetime(2000, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByWeekNoAndWeekDayLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekday([Weekday.SUN]),
        NaiveDate.Filter.byWeekNo(52),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-28", "1998-12-27", "2000-01-02"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByWeekNoAndWeekDayLast(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               byweekno=-1,
 *                               byweekday=SU,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 28, 9, 0),
 *                           datetime(1999, 1, 3, 9, 0),
 *                           datetime(2000, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByWeekNoAndWeekDayLast",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekday([Weekday.SUN]),
        NaiveDate.Filter.byWeekNo(-1),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-28", "1999-01-03", "2000-01-02"]);
  },
});

/**
 * Python reference:
 *     def testWeeklyByWeekNoAndWeekDay53(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               byweekno=53,
 *                               byweekday=MO,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 12, 28, 9, 0),
 *                           datetime(2004, 12, 27, 9, 0),
 *                           datetime(2009, 12, 28, 9, 0)])
 *
 */
Deno.test({
  name: "testWeeklyByWeekNoAndWeekDay53",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekday([Weekday.MON]),
        NaiveDate.Filter.byWeekNo(53),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-12-28", "2004-12-27", "2009-12-28"]);
  },
});

/**
 * Python reference:
 *     def testDaily(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0)])
 *
 */
Deno.test({
  name: "testDaily",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-03", "1997-09-04"]);
  },
});

/**
 * Python reference:
 *     def testDailyInterval(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               interval=2,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0),
 *                           datetime(1997, 9, 6, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyInterval",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(2), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-04", "1997-09-06"]);
  },
});

/**
 * Python reference:
 *     def testDailyIntervalLarge(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               interval=92,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 12, 3, 9, 0),
 *                           datetime(1998, 3, 5, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyIntervalLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(92), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-12-03", "1998-03-05"]);
  },
});

/**
 * Python reference:
 *     def testDailyByMonth(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 1, 2, 9, 0),
 *                           datetime(1998, 1, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByMonth",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-01-02", "1998-01-03"]);
  },
});

/**
 * Python reference:
 *     def testDailyByMonthDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               bymonthday=(1, 3),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 10, 1, 9, 0),
 *                           datetime(1997, 10, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByMonthDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: NaiveDate.Filter.byDayOfMonth([1, 3]),
    });
    assertDtArrEqs(all(iter), ["1997-09-03", "1997-10-01", "1997-10-03"]);
  },
});

/**
 * Python reference:
 *     def testDailyByMonthAndMonthDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               bymonthday=(5, 7),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 5, 9, 0),
 *                           datetime(1998, 1, 7, 9, 0),
 *                           datetime(1998, 3, 5, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByMonthAndMonthDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byDayOfMonth([5, 7]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-05", "1998-01-07", "1998-03-05"]);
  },
});

/**
 * Python reference:
 *     def testDailyByWeekDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0),
 *                           datetime(1997, 9, 9, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-04", "1997-09-09"]);
  },
});

/**
 * Python reference:
 *     def testDailyByNWeekDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               byweekday=(TU(1), TH(-1)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0),
 *                           datetime(1997, 9, 9, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByNWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: NaiveDate.Filter.byNthWeekday([
        Weekday.TUE.nth(1),
        Weekday.THU.nth(-1),
      ]),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-04", "1997-09-09"]);
  },
});

/**
 * Python reference:
 *     def testDailyByMonthAndWeekDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 1, 6, 9, 0),
 *                           datetime(1998, 1, 8, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByMonthAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-01-06", "1998-01-08"]);
  },
});

/**
 * Python reference:
 *     def testDailyByMonthAndNWeekDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               byweekday=(TU(1), TH(-1)),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 1, 6, 9, 0),
 *                           datetime(1998, 1, 8, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByMonthAndNWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byNthWeekday([
          Weekday.TUE.nth(1),
          Weekday.THU.nth(-1),
        ]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-01-06", "1998-01-08"]);
  },
});

/**
 * Python reference:
 *     def testDailyByMonthDayAndWeekDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               bymonthday=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 2, 3, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByMonthDayAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byDayOfMonth([1, 3]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-02-03", "1998-03-03"]);
  },
});

/**
 * Python reference:
 *     def testDailyByMonthAndMonthDayAndWeekDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               bymonth=(1, 3),
 *                               bymonthday=(1, 3),
 *                               byweekday=(TU, TH),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 3, 3, 9, 0),
 *                           datetime(2001, 3, 1, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByMonthAndMonthDayAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.MAR]),
        NaiveDate.Filter.byDayOfMonth([1, 3]),
        NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.THU]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-01-01", "1998-03-03", "2001-03-01"]);
  },
});

/**
 * Python reference:
 *     def testDailyByYearDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=4,
 *                               byyearday=(1, 100, 200, 365),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 31, 9, 0),
 *                           datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByYearDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfYear([1, 100, 200, 365]),
    });
    assertDtArrEqs(all(iter), [
      "1997-12-31",
      "1998-01-01",
      "1998-04-10",
      "1998-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testDailyByYearDayNeg(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=4,
 *                               byyearday=(-365, -266, -166, -1),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 31, 9, 0),
 *                           datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 4, 10, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByYearDayNeg",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 4,
      filter: NaiveDate.Filter.byDayOfYear([-365, -266, -166, -1]),
    });
    assertDtArrEqs(all(iter), [
      "1997-12-31",
      "1998-01-01",
      "1998-04-10",
      "1998-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testDailyByMonthAndYearDay(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=4,
 *                               bymonth=(1, 7),
 *                               byyearday=(1, 100, 200, 365),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0),
 *                           datetime(1999, 1, 1, 9, 0),
 *                           datetime(1999, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByMonthAndYearDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 4,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.JUL]),
        NaiveDate.Filter.byDayOfYear([1, 100, 200, 365]),
      ],
    });
    assertDtArrEqs(all(iter), [
      "1998-01-01",
      "1998-07-19",
      "1999-01-01",
      "1999-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testDailyByMonthAndYearDayNeg(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=4,
 *                               bymonth=(1, 7),
 *                               byyearday=(-365, -266, -166, -1),
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 1, 1, 9, 0),
 *                           datetime(1998, 7, 19, 9, 0),
 *                           datetime(1999, 1, 1, 9, 0),
 *                           datetime(1999, 7, 19, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByMonthAndYearDayNeg",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 4,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.JAN, Month.JUL]),
        NaiveDate.Filter.byDayOfYear([-365, -266, -166, -1]),
      ],
    });
    assertDtArrEqs(all(iter), [
      "1998-01-01",
      "1998-07-19",
      "1999-01-01",
      "1999-07-19",
    ]);
  },
});

/**
 * Python reference:
 *     def testDailyByWeekNo(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               byweekno=20,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 5, 11, 9, 0),
 *                           datetime(1998, 5, 12, 9, 0),
 *                           datetime(1998, 5, 13, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByWeekNo",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: NaiveDate.Filter.byWeekNo(20),
    });
    assertDtArrEqs(all(iter), ["1998-05-11", "1998-05-12", "1998-05-13"]);
  },
});

/**
 * Python reference:
 *     def testDailyByWeekNoAndWeekDay(self):
 *         # That's a nice one. The first days of week number one
 *         # may be in the last year.
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               byweekno=1,
 *                               byweekday=MO,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 29, 9, 0),
 *                           datetime(1999, 1, 4, 9, 0),
 *                           datetime(2000, 1, 3, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByWeekNoAndWeekDay",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(1),
        NaiveDate.Filter.byWeekday([Weekday.MON]),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-29", "1999-01-04", "2000-01-03"]);
  },
});

/**
 * Python reference:
 *     def testDailyByWeekNoAndWeekDayLarge(self):
 *         # Another nice test. The last days of week number 52/53
 *         # may be in the next year.
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               byweekno=52,
 *                               byweekday=SU,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 28, 9, 0),
 *                           datetime(1998, 12, 27, 9, 0),
 *                           datetime(2000, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByWeekNoAndWeekDayLarge",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(52),
        NaiveDate.Filter.byWeekday([Weekday.SUN]),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-28", "1998-12-27", "2000-01-02"]);
  },
});

/**
 * Python reference:
 *     def testDailyByWeekNoAndWeekDayLast(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               byweekno=-1,
 *                               byweekday=SU,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 12, 28, 9, 0),
 *                           datetime(1999, 1, 3, 9, 0),
 *                           datetime(2000, 1, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByWeekNoAndWeekDayLast",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(-1),
        NaiveDate.Filter.byWeekday([Weekday.SUN]),
      ],
    });
    assertDtArrEqs(all(iter), ["1997-12-28", "1999-01-03", "2000-01-02"]);
  },
});

/**
 * Python reference:
 *     def testDailyByWeekNoAndWeekDay53(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               byweekno=53,
 *                               byweekday=MO,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1998, 12, 28, 9, 0),
 *                           datetime(2004, 12, 27, 9, 0),
 *                           datetime(2009, 12, 28, 9, 0)])
 *
 */
Deno.test({
  name: "testDailyByWeekNoAndWeekDay53",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byWeekNo(53),
        NaiveDate.Filter.byWeekday([Weekday.MON]),
      ],
    });
    assertDtArrEqs(all(iter), ["1998-12-28", "2004-12-27", "2009-12-28"]);
  },
});

/**
 * Python reference:
 *     def testUntilNotMatching(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               dtstart=datetime(1997, 9, 2, 9, 0),
 *                               until=datetime(1997, 9, 5, 8, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0)])
 *
 */
Deno.test({
  name: "testUntilNotMatching",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      end: naivedate(1997, 9, 5),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-03", "1997-09-04"]);
  },
});

/**
 * Python reference:
 *     def testUntilMatching(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               dtstart=datetime(1997, 9, 2, 9, 0),
 *                               until=datetime(1997, 9, 4, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0)])
 *
 */
Deno.test({
  name: "testUntilMatching",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      end: naivedate(1997, 9, 4),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-03", "1997-09-04"]);
  },
});

/**
 * Python reference:
 *     def testUntilSingle(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               dtstart=datetime(1997, 9, 2, 9, 0),
 *                               until=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0)])
 *
 */
Deno.test({
  name: "testUntilSingle",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      end: naivedate(1997, 9, 2),
    });
    assertDtArrEqs(all(iter), ["1997-09-02"]);
  },
});

/**
 * Python reference:
 *     def testUntilEmpty(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               dtstart=datetime(1997, 9, 2, 9, 0),
 *                               until=datetime(1997, 9, 1, 9, 0))),
 *                          [])
 *
 */
Deno.test({
  name: "testUntilEmpty",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      end: naivedate(1997, 9, 1),
    });
    assertDtArrEqs(all(iter), []);
  },
});

/**
 * Python reference:
 *     def testUntilWithDate(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               dtstart=datetime(1997, 9, 2, 9, 0),
 *                               until=date(1997, 9, 5))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 3, 9, 0),
 *                           datetime(1997, 9, 4, 9, 0)])
 *
 */
Deno.test({
  name: "testUntilWithDate",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
      end: naivedate(1997, 9, 5),
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-03", "1997-09-04"]);
  },
});

/**
 * Python reference:
 *     def testWkStIntervalMO(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               interval=2,
 *                               byweekday=(TU, SU),
 *                               wkst=MO,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 7, 9, 0),
 *                           datetime(1997, 9, 16, 9, 0)])
 *
 */
Deno.test({
  name: "testWkStIntervalMO",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(2), {
      limit: 3,
      filter: [NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.SUN])],
      weekStart: Weekday.MON,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-07", "1997-09-16"]);
  },
});

/**
 * Python reference:
 *     def testWkStIntervalSU(self):
 *         self.assertEqual(list(rrule(WEEKLY,
 *                               count=3,
 *                               interval=2,
 *                               byweekday=(TU, SU),
 *                               wkst=SU,
 *                               dtstart=datetime(1997, 9, 2, 9, 0))),
 *                          [datetime(1997, 9, 2, 9, 0),
 *                           datetime(1997, 9, 14, 9, 0),
 *                           datetime(1997, 9, 16, 9, 0)])
 *
 */
Deno.test({
  name: "testWkStIntervalSU",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.weeks(2), {
      limit: 3,
      filter: [NaiveDate.Filter.byWeekday([Weekday.TUE, Weekday.SUN])],
      weekStart: Weekday.SUN,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-14", "1997-09-16"]);
  },
});

/**
 * Python reference:
 *     def testDTStartIsDate(self):
 *         self.assertEqual(list(rrule(DAILY,
 *                               count=3,
 *                               dtstart=date(1997, 9, 2))),
 *                          [datetime(1997, 9, 2, 0, 0),
 *                           datetime(1997, 9, 3, 0, 0),
 *                           datetime(1997, 9, 4, 0, 0)])
 *
 */
Deno.test({
  name: "testDTStartIsDate",
  fn() {
    const iter = naivedate(1997, 9, 2).range(DateUnit.days(1), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["1997-09-02", "1997-09-03", "1997-09-04"]);
  },
});

/**
 * Python reference:
 *     def testMaxYear(self):
 *         self.assertEqual(list(rrule(YEARLY,
 *                               count=3,
 *                               bymonth=2,
 *                               bymonthday=31,
 *                               dtstart=datetime(9997, 9, 2, 9, 0, 0))),
 *                          [])
 *
 */
Deno.test({
  name: "testMaxYear",
  fn() {
    const iter = naivedate(9997, 9, 2).range(DateUnit.years(1), {
      limit: 3,
      filter: [
        NaiveDate.Filter.byMonthOfYear([Month.FEB]),
        NaiveDate.Filter.byDayOfMonth([31]),
        NaiveDate.Filter.byWeekday([Weekday.SUN]),
      ],
    });
    assertDtArrEqs(all(iter), []);
  },
});

/**
 * MISC tests
 */

Deno.test({
  name: "3-digit years",
  fn() {
    const iter = naivedate(990, 1, 1).range(DateUnit.days(1), {
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["990-01-01", "990-01-02", "990-01-03"]);
  },
});

Deno.test({
  name: "generates monthly (#233)",
  // As opposed to rrule.js - we don't care about timezones. we simply drop
  // everything after "Mon Aug 06 2018".
  //
  fn() {
    // Date.parse("Mon Aug 06 2018 10:30:00 GMT+0530")
    const iter = naivedate(2018, 8, 6).range(DateUnit.months(1), {
      // Date.parse("Mon Oct 08 2018 11:00:00 GMT+0530")
      end: naivedate(2018, 10, 8),
      limit: 3,
    });
    assertDtArrEqs(all(iter), ["2018-08-06", "2018-09-06", "2018-10-06"]);
  },
});

Deno.test({
  name: "generates weekly events (#247)",
  fn() {
    const start = naivedate(2018, 8, 10);
    const end = naivedate(2018, 11, 30);

    const iter = start.range(DateUnit.weeks(1), {
      end,
    });

    assertDtArrEqs(all(iter), [
      "2018-08-10",
      "2018-08-17",
      "2018-08-24",
      "2018-08-31",
      "2018-09-07",
      "2018-09-14",
      "2018-09-21",
      "2018-09-28",
      "2018-10-05",
      "2018-10-12",
      "2018-10-19",
      "2018-10-26",
      "2018-11-02",
      "2018-11-09",
      "2018-11-16",
      "2018-11-23",
      "2018-11-30",
    ]);
  },
});

Deno.test({
  name: "generates around dst (#249)",
  fn() {
    const iter = naivedate(2018, 11, 1).range(DateUnit.weeks(1), {
      limit: 4,
      filter: NaiveDate.Filter.byWeekday([
        Weekday.MON,
        Weekday.WED,
        Weekday.FRI,
      ]),
      weekStart: Weekday.SUN,
    });
    assertDtArrEqs(all(iter), [
      "2018-11-02",
      "2018-11-05",
      "2018-11-07",
      "2018-11-09",
    ]);
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
