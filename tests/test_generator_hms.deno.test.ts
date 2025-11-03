import { assert } from "@std/assert";

Deno.test({
  name: "generator-hms",
  fn() {
    assert(false, "generator-hms, not yet implemented");
  },
});

// testRecurring(
//   'testYearlyByHour',
//   new RRule({
//     freq: RRule.YEARLY,
//     count: 3,
//     byhour: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0),
//     datetime(1998, 9, 2, 6, 0),
//     datetime(1998, 9, 2, 18, 0),
//   ]
// )

// testRecurring(
//   'testYearlyByMinute',
//   new RRule({
//     freq: RRule.YEARLY,
//     count: 3,
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6),
//     datetime(1997, 9, 2, 9, 18),
//     datetime(1998, 9, 2, 9, 6),
//   ]
// )

// testRecurring(
//   'testYearlyBySecond',
//   new RRule({
//     freq: RRule.YEARLY,
//     count: 3,
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 6),
//     datetime(1997, 9, 2, 9, 0, 18),
//     datetime(1998, 9, 2, 9, 0, 6),
//   ]
// )

// testRecurring(
//   'testYearlyByHourAndMinute',
//   new RRule({
//     freq: RRule.YEARLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6),
//     datetime(1997, 9, 2, 18, 18),
//     datetime(1998, 9, 2, 6, 6),
//   ]
// )

// testRecurring(
//   'testYearlyByHourAndSecond',
//   new RRule({
//     freq: RRule.YEARLY,
//     count: 3,
//     byhour: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0, 6),
//     datetime(1997, 9, 2, 18, 0, 18),
//     datetime(1998, 9, 2, 6, 0, 6),
//   ]
// )

// testRecurring(
//   'testYearlyByMinuteAndSecond',
//   new RRule({
//     freq: RRule.YEARLY,
//     count: 3,
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6, 6),
//     datetime(1997, 9, 2, 9, 6, 18),
//     datetime(1997, 9, 2, 9, 18, 6),
//   ]
// )

// testRecurring(
//   'testYearlyByHourAndMinuteAndSecond',
//   new RRule({
//     freq: RRule.YEARLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6, 6),
//     datetime(1997, 9, 2, 18, 6, 18),
//     datetime(1997, 9, 2, 18, 18, 6),
//   ]
// )

// testRecurring(
//   'testMonthlyByHour',
//   new RRule({
//     freq: RRule.MONTHLY,
//     count: 3,
//     byhour: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0),
//     datetime(1997, 10, 2, 6, 0),
//     datetime(1997, 10, 2, 18, 0),
//   ]
// )

// testRecurring(
//   'testMonthlyByMinute',
//   new RRule({
//     freq: RRule.MONTHLY,
//     count: 3,
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6),
//     datetime(1997, 9, 2, 9, 18),
//     datetime(1997, 10, 2, 9, 6),
//   ]
// )

// testRecurring(
//   'testMonthlyBySecond',
//   new RRule({
//     freq: RRule.MONTHLY,
//     count: 3,
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 6),
//     datetime(1997, 9, 2, 9, 0, 18),
//     datetime(1997, 10, 2, 9, 0, 6),
//   ]
// )

// testRecurring(
//   'testMonthlyByHourAndMinute',
//   new RRule({
//     freq: RRule.MONTHLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6),
//     datetime(1997, 9, 2, 18, 18),
//     datetime(1997, 10, 2, 6, 6),
//   ]
// )

// testRecurring(
//   'testMonthlyByHourAndSecond',
//   new RRule({
//     freq: RRule.MONTHLY,
//     count: 3,
//     byhour: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0, 6),
//     datetime(1997, 9, 2, 18, 0, 18),
//     datetime(1997, 10, 2, 6, 0, 6),
//   ]
// )

// testRecurring(
//   'testMonthlyByMinuteAndSecond',
//   new RRule({
//     freq: RRule.MONTHLY,
//     count: 3,
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6, 6),
//     datetime(1997, 9, 2, 9, 6, 18),
//     datetime(1997, 9, 2, 9, 18, 6),
//   ]
// )

// testRecurring(
//   'testMonthlyByHourAndMinuteAndSecond',
//   new RRule({
//     freq: RRule.MONTHLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6, 6),
//     datetime(1997, 9, 2, 18, 6, 18),
//     datetime(1997, 9, 2, 18, 18, 6),
//   ]
// )

// testRecurring(
//   'testWeeklyByHour',
//   new RRule({
//     freq: RRule.WEEKLY,
//     count: 3,
//     byhour: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0),
//     datetime(1997, 9, 9, 6, 0),
//     datetime(1997, 9, 9, 18, 0),
//   ]
// )

// testRecurring(
//   'testWeeklyByMinute',
//   new RRule({
//     freq: RRule.WEEKLY,
//     count: 3,
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6),
//     datetime(1997, 9, 2, 9, 18),
//     datetime(1997, 9, 9, 9, 6),
//   ]
// )

// testRecurring(
//   'testWeeklyBySecond',
//   new RRule({
//     freq: RRule.WEEKLY,
//     count: 3,
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 6),
//     datetime(1997, 9, 2, 9, 0, 18),
//     datetime(1997, 9, 9, 9, 0, 6),
//   ]
// )

// testRecurring(
//   'testWeeklyByHourAndMinute',
//   new RRule({
//     freq: RRule.WEEKLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6),
//     datetime(1997, 9, 2, 18, 18),
//     datetime(1997, 9, 9, 6, 6),
//   ]
// )

// testRecurring(
//   'testWeeklyByHourAndSecond',
//   new RRule({
//     freq: RRule.WEEKLY,
//     count: 3,
//     byhour: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0, 6),
//     datetime(1997, 9, 2, 18, 0, 18),
//     datetime(1997, 9, 9, 6, 0, 6),
//   ]
// )

// testRecurring(
//   'testWeeklyByMinuteAndSecond',
//   new RRule({
//     freq: RRule.WEEKLY,
//     count: 3,
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6, 6),
//     datetime(1997, 9, 2, 9, 6, 18),
//     datetime(1997, 9, 2, 9, 18, 6),
//   ]
// )

// testRecurring(
//   'testWeeklyByHourAndMinuteAndSecond',
//   new RRule({
//     freq: RRule.WEEKLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6, 6),
//     datetime(1997, 9, 2, 18, 6, 18),
//     datetime(1997, 9, 2, 18, 18, 6),
//   ]
// )

// testRecurring(
//   'testDailyByHour',
//   new RRule({
//     freq: RRule.DAILY,
//     count: 3,
//     byhour: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0),
//     datetime(1997, 9, 3, 6, 0),
//     datetime(1997, 9, 3, 18, 0),
//   ]
// )

// testRecurring(
//   'testDailyByMinute',
//   new RRule({
//     freq: RRule.DAILY,
//     count: 3,
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6),
//     datetime(1997, 9, 2, 9, 18),
//     datetime(1997, 9, 3, 9, 6),
//   ]
// )

// testRecurring(
//   'testDailyBySecond',
//   new RRule({
//     freq: RRule.DAILY,
//     count: 3,
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 6),
//     datetime(1997, 9, 2, 9, 0, 18),
//     datetime(1997, 9, 3, 9, 0, 6),
//   ]
// )

// testRecurring(
//   'testDailyByHourAndMinute',
//   new RRule({
//     freq: RRule.DAILY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6),
//     datetime(1997, 9, 2, 18, 18),
//     datetime(1997, 9, 3, 6, 6),
//   ]
// )

// testRecurring(
//   'testDailyByHourAndSecond',
//   new RRule({
//     freq: RRule.DAILY,
//     count: 3,
//     byhour: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0, 6),
//     datetime(1997, 9, 2, 18, 0, 18),
//     datetime(1997, 9, 3, 6, 0, 6),
//   ]
// )

// testRecurring(
//   'testDailyByMinuteAndSecond',
//   new RRule({
//     freq: RRule.DAILY,
//     count: 3,
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6, 6),
//     datetime(1997, 9, 2, 9, 6, 18),
//     datetime(1997, 9, 2, 9, 18, 6),
//   ]
// )

// testRecurring(
//   'testDailyByHourAndMinuteAndSecond',
//   new RRule({
//     freq: RRule.DAILY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6, 6),
//     datetime(1997, 9, 2, 18, 6, 18),
//     datetime(1997, 9, 2, 18, 18, 6),
//   ]
// )

// testRecurring(
//   'testHourly',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 2, 10, 0),
//     datetime(1997, 9, 2, 11, 0),
//   ]
// )

// testRecurring(
//   'testHourlyInterval',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     interval: 2,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 2, 11, 0),
//     datetime(1997, 9, 2, 13, 0),
//   ]
// )

// testRecurring(
//   'testHourlyIntervalLarge',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     interval: 769,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 10, 4, 10, 0),
//     datetime(1997, 11, 5, 11, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMonth',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     bymonth: [1, 3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 1, 0),
//     datetime(1998, 1, 1, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMonthDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     bymonthday: [1, 3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 3, 0, 0),
//     datetime(1997, 9, 3, 1, 0),
//     datetime(1997, 9, 3, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMonthAndMonthDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     bymonth: [1, 3],
//     bymonthday: [5, 7],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 5, 0, 0),
//     datetime(1998, 1, 5, 1, 0),
//     datetime(1998, 1, 5, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByWeekDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 2, 10, 0),
//     datetime(1997, 9, 2, 11, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByNWeekDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byweekday: [RRule.TU.nth(1), RRule.TH.nth(-1)],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 2, 10, 0),
//     datetime(1997, 9, 2, 11, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMonthAndWeekDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     bymonth: [1, 3],
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 1, 0),
//     datetime(1998, 1, 1, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMonthAndNWeekDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     bymonth: [1, 3],
//     byweekday: [RRule.TU.nth(1), RRule.TH.nth(-1)],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 1, 0),
//     datetime(1998, 1, 1, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMonthDayAndWeekDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     bymonthday: [1, 3],
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 1, 0),
//     datetime(1998, 1, 1, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMonthAndMonthDayAndWeekDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     bymonth: [1, 3],
//     bymonthday: [1, 3],
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 1, 0),
//     datetime(1998, 1, 1, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByYearDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 4,
//     byyearday: [1, 100, 200, 365],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 31, 0, 0),
//     datetime(1997, 12, 31, 1, 0),
//     datetime(1997, 12, 31, 2, 0),
//     datetime(1997, 12, 31, 3, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByYearDayNeg',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 4,
//     byyearday: [-365, -266, -166, -1],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 31, 0, 0),
//     datetime(1997, 12, 31, 1, 0),
//     datetime(1997, 12, 31, 2, 0),
//     datetime(1997, 12, 31, 3, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMonthAndYearDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 4,
//     bymonth: [4, 7],
//     byyearday: [1, 100, 200, 365],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 10, 0, 0),
//     datetime(1998, 4, 10, 1, 0),
//     datetime(1998, 4, 10, 2, 0),
//     datetime(1998, 4, 10, 3, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMonthAndYearDayNeg',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 4,
//     bymonth: [4, 7],
//     byyearday: [-365, -266, -166, -1],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 10, 0, 0),
//     datetime(1998, 4, 10, 1, 0),
//     datetime(1998, 4, 10, 2, 0),
//     datetime(1998, 4, 10, 3, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByWeekNo',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byweekno: 20,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 5, 11, 0, 0),
//     datetime(1998, 5, 11, 1, 0),
//     datetime(1998, 5, 11, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByWeekNoAndWeekDay',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byweekno: 1,
//     byweekday: RRule.MO,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 29, 0, 0),
//     datetime(1997, 12, 29, 1, 0),
//     datetime(1997, 12, 29, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByWeekNoAndWeekDayLarge',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byweekno: 52,
//     byweekday: RRule.SU,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 28, 0, 0),
//     datetime(1997, 12, 28, 1, 0),
//     datetime(1997, 12, 28, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByWeekNoAndWeekDayLast',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byweekno: -1,
//     byweekday: RRule.SU,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 28, 0, 0),
//     datetime(1997, 12, 28, 1, 0),
//     datetime(1997, 12, 28, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByWeekNoAndWeekDay53',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byweekno: 53,
//     byweekday: RRule.MO,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 12, 28, 0, 0),
//     datetime(1998, 12, 28, 1, 0),
//     datetime(1998, 12, 28, 2, 0),
//   ]
// )

// testRecurring.skip(
//   'testHourlyByEaster',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byeaster: 0,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 12, 0, 0),
//     datetime(1998, 4, 12, 1, 0),
//     datetime(1998, 4, 12, 2, 0),
//   ]
// )

// testRecurring.skip(
//   'testHourlyByEasterPos',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byeaster: 1,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 13, 0, 0),
//     datetime(1998, 4, 13, 1, 0),
//     datetime(1998, 4, 13, 2, 0),
//   ]
// )

// testRecurring.skip(
//   'testHourlyByEasterNeg',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byeaster: -1,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 11, 0, 0),
//     datetime(1998, 4, 11, 1, 0),
//     datetime(1998, 4, 11, 2, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByHour',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byhour: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0),
//     datetime(1997, 9, 3, 6, 0),
//     datetime(1997, 9, 3, 18, 0),
//   ]
// )

// testRecurring(
//   'testHourlyByMinute',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6),
//     datetime(1997, 9, 2, 9, 18),
//     datetime(1997, 9, 2, 10, 6),
//   ]
// )

// testRecurring(
//   'testHourlyBySecond',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 6),
//     datetime(1997, 9, 2, 9, 0, 18),
//     datetime(1997, 9, 2, 10, 0, 6),
//   ]
// )

// testRecurring(
//   'testHourlyByHourAndMinute',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6),
//     datetime(1997, 9, 2, 18, 18),
//     datetime(1997, 9, 3, 6, 6),
//   ]
// )

// testRecurring(
//   'testHourlyByHourAndSecond',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byhour: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0, 6),
//     datetime(1997, 9, 2, 18, 0, 18),
//     datetime(1997, 9, 3, 6, 0, 6),
//   ]
// )

// testRecurring(
//   'testHourlyByMinuteAndSecond',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6, 6),
//     datetime(1997, 9, 2, 9, 6, 18),
//     datetime(1997, 9, 2, 9, 18, 6),
//   ]
// )

// testRecurring(
//   'testHourlyByHourAndMinuteAndSecond',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6, 6),
//     datetime(1997, 9, 2, 18, 6, 18),
//     datetime(1997, 9, 2, 18, 18, 6),
//   ]
// )

// testRecurring(
//   'testHourlyBySetPos',
//   new RRule({
//     freq: RRule.HOURLY,
//     count: 3,
//     byminute: [15, 45],
//     bysecond: [15, 45],
//     bysetpos: [3, -3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 15, 45),
//     datetime(1997, 9, 2, 9, 45, 15),
//     datetime(1997, 9, 2, 10, 15, 45),
//   ]
// )

// testRecurring(
//   'testMinutely',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 2, 9, 1),
//     datetime(1997, 9, 2, 9, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyInterval',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     interval: 2,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 2, 9, 2),
//     datetime(1997, 9, 2, 9, 4),
//   ]
// )

// testRecurring(
//   'testMinutelyIntervalLarge',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     interval: 1501,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 3, 10, 1),
//     datetime(1997, 9, 4, 11, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByMonth',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     bymonth: [1, 3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 0, 1),
//     datetime(1998, 1, 1, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByMonthDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     bymonthday: [1, 3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 3, 0, 0),
//     datetime(1997, 9, 3, 0, 1),
//     datetime(1997, 9, 3, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByMonthAndMonthDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     bymonth: [1, 3],
//     bymonthday: [5, 7],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 5, 0, 0),
//     datetime(1998, 1, 5, 0, 1),
//     datetime(1998, 1, 5, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByWeekDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 2, 9, 1),
//     datetime(1997, 9, 2, 9, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByNWeekDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byweekday: [RRule.TU.nth(1), RRule.TH.nth(-1)],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 2, 9, 1),
//     datetime(1997, 9, 2, 9, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByMonthAndWeekDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     bymonth: [1, 3],
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 0, 1),
//     datetime(1998, 1, 1, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByMonthAndNWeekDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     bymonth: [1, 3],
//     byweekday: [RRule.TU.nth(1), RRule.TH.nth(-1)],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 0, 1),
//     datetime(1998, 1, 1, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByMonthDayAndWeekDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     bymonthday: [1, 3],
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 0, 1),
//     datetime(1998, 1, 1, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByMonthAndMonthDayAndWeekDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     bymonth: [1, 3],
//     bymonthday: [1, 3],
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0),
//     datetime(1998, 1, 1, 0, 1),
//     datetime(1998, 1, 1, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByYearDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 4,
//     byyearday: [1, 100, 200, 365],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 31, 0, 0),
//     datetime(1997, 12, 31, 0, 1),
//     datetime(1997, 12, 31, 0, 2),
//     datetime(1997, 12, 31, 0, 3),
//   ]
// )

// testRecurring(
//   'testMinutelyByYearDayNeg',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 4,
//     byyearday: [-365, -266, -166, -1],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 31, 0, 0),
//     datetime(1997, 12, 31, 0, 1),
//     datetime(1997, 12, 31, 0, 2),
//     datetime(1997, 12, 31, 0, 3),
//   ]
// )

// testRecurring(
//   'testMinutelyByMonthAndYearDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 4,
//     bymonth: [4, 7],
//     byyearday: [1, 100, 200, 365],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 10, 0, 0),
//     datetime(1998, 4, 10, 0, 1),
//     datetime(1998, 4, 10, 0, 2),
//     datetime(1998, 4, 10, 0, 3),
//   ]
// )

// testRecurring(
//   'testMinutelyByMonthAndYearDayNeg',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 4,
//     bymonth: [4, 7],
//     byyearday: [-365, -266, -166, -1],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 10, 0, 0),
//     datetime(1998, 4, 10, 0, 1),
//     datetime(1998, 4, 10, 0, 2),
//     datetime(1998, 4, 10, 0, 3),
//   ]
// )

// testRecurring(
//   'testMinutelyByWeekNo',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byweekno: 20,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 5, 11, 0, 0),
//     datetime(1998, 5, 11, 0, 1),
//     datetime(1998, 5, 11, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByWeekNoAndWeekDay',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byweekno: 1,
//     byweekday: RRule.MO,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 29, 0, 0),
//     datetime(1997, 12, 29, 0, 1),
//     datetime(1997, 12, 29, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByWeekNoAndWeekDayLarge',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byweekno: 52,
//     byweekday: RRule.SU,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 28, 0, 0),
//     datetime(1997, 12, 28, 0, 1),
//     datetime(1997, 12, 28, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByWeekNoAndWeekDayLast',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byweekno: -1,
//     byweekday: RRule.SU,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 28, 0, 0),
//     datetime(1997, 12, 28, 0, 1),
//     datetime(1997, 12, 28, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByWeekNoAndWeekDay53',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byweekno: 53,
//     byweekday: RRule.MO,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 12, 28, 0, 0),
//     datetime(1998, 12, 28, 0, 1),
//     datetime(1998, 12, 28, 0, 2),
//   ]
// )

// testRecurring.skip(
//   'testMinutelyByEaster',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byeaster: 0,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 12, 0, 0),
//     datetime(1998, 4, 12, 0, 1),
//     datetime(1998, 4, 12, 0, 2),
//   ]
// )

// testRecurring.skip(
//   'testMinutelyByEasterPos',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byeaster: 1,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 13, 0, 0),
//     datetime(1998, 4, 13, 0, 1),
//     datetime(1998, 4, 13, 0, 2),
//   ]
// )

// testRecurring.skip(
//   'testMinutelyByEasterNeg',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byeaster: -1,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 11, 0, 0),
//     datetime(1998, 4, 11, 0, 1),
//     datetime(1998, 4, 11, 0, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByHour',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byhour: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0),
//     datetime(1997, 9, 2, 18, 1),
//     datetime(1997, 9, 2, 18, 2),
//   ]
// )

// testRecurring(
//   'testMinutelyByMinute',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6),
//     datetime(1997, 9, 2, 9, 18),
//     datetime(1997, 9, 2, 10, 6),
//   ]
// )

// testRecurring(
//   'testMinutelyBySecond',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 6),
//     datetime(1997, 9, 2, 9, 0, 18),
//     datetime(1997, 9, 2, 9, 1, 6),
//   ]
// )

// testRecurring(
//   'testMinutelyByHourAndMinute',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6),
//     datetime(1997, 9, 2, 18, 18),
//     datetime(1997, 9, 3, 6, 6),
//   ]
// )

// testRecurring(
//   'testMinutelyByHourAndSecond',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byhour: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0, 6),
//     datetime(1997, 9, 2, 18, 0, 18),
//     datetime(1997, 9, 2, 18, 1, 6),
//   ]
// )

// testRecurring(
//   'testMinutelyByMinuteAndSecond',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6, 6),
//     datetime(1997, 9, 2, 9, 6, 18),
//     datetime(1997, 9, 2, 9, 18, 6),
//   ]
// )

// testRecurring(
//   'testMinutelyByHourAndMinuteAndSecond',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6, 6),
//     datetime(1997, 9, 2, 18, 6, 18),
//     datetime(1997, 9, 2, 18, 18, 6),
//   ]
// )

// testRecurring(
//   'testMinutelyBySetPos',
//   new RRule({
//     freq: RRule.MINUTELY,
//     count: 3,
//     bysecond: [15, 30, 45],
//     bysetpos: [3, -3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 15),
//     datetime(1997, 9, 2, 9, 0, 45),
//     datetime(1997, 9, 2, 9, 1, 15),
//   ]
// )

// testRecurring(
//   'testSecondly',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 0),
//     datetime(1997, 9, 2, 9, 0, 1),
//     datetime(1997, 9, 2, 9, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyInterval',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     interval: 2,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 0),
//     datetime(1997, 9, 2, 9, 0, 2),
//     datetime(1997, 9, 2, 9, 0, 4),
//   ]
// )

// testRecurring(
//   'testSecondlyIntervalLarge',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     interval: 90061,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 0),
//     datetime(1997, 9, 3, 10, 1, 1),
//     datetime(1997, 9, 4, 11, 2, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByMonth',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     bymonth: [1, 3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0, 0),
//     datetime(1998, 1, 1, 0, 0, 1),
//     datetime(1998, 1, 1, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByMonthDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     bymonthday: [1, 3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 3, 0, 0, 0),
//     datetime(1997, 9, 3, 0, 0, 1),
//     datetime(1997, 9, 3, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByMonthAndMonthDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     bymonth: [1, 3],
//     bymonthday: [5, 7],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 5, 0, 0, 0),
//     datetime(1998, 1, 5, 0, 0, 1),
//     datetime(1998, 1, 5, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByWeekDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 0),
//     datetime(1997, 9, 2, 9, 0, 1),
//     datetime(1997, 9, 2, 9, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByNWeekDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byweekday: [RRule.TU.nth(1), RRule.TH.nth(-1)],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 0),
//     datetime(1997, 9, 2, 9, 0, 1),
//     datetime(1997, 9, 2, 9, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByMonthAndWeekDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     bymonth: [1, 3],
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0, 0),
//     datetime(1998, 1, 1, 0, 0, 1),
//     datetime(1998, 1, 1, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByMonthAndNWeekDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     bymonth: [1, 3],
//     byweekday: [RRule.TU.nth(1), RRule.TH.nth(-1)],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0, 0),
//     datetime(1998, 1, 1, 0, 0, 1),
//     datetime(1998, 1, 1, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByMonthDayAndWeekDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     bymonthday: [1, 3],
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0, 0),
//     datetime(1998, 1, 1, 0, 0, 1),
//     datetime(1998, 1, 1, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByMonthAndMonthDayAndWeekDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     bymonth: [1, 3],
//     bymonthday: [1, 3],
//     byweekday: [RRule.TU, RRule.TH],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 1, 1, 0, 0, 0),
//     datetime(1998, 1, 1, 0, 0, 1),
//     datetime(1998, 1, 1, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByYearDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 4,
//     byyearday: [1, 100, 200, 365],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 31, 0, 0, 0),
//     datetime(1997, 12, 31, 0, 0, 1),
//     datetime(1997, 12, 31, 0, 0, 2),
//     datetime(1997, 12, 31, 0, 0, 3),
//   ]
// )

// testRecurring(
//   'testSecondlyByYearDayNeg',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 4,
//     byyearday: [-365, -266, -166, -1],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 31, 0, 0, 0),
//     datetime(1997, 12, 31, 0, 0, 1),
//     datetime(1997, 12, 31, 0, 0, 2),
//     datetime(1997, 12, 31, 0, 0, 3),
//   ]
// )

// testRecurring(
//   'testSecondlyByMonthAndYearDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 4,
//     bymonth: [4, 7],
//     byyearday: [1, 100, 200, 365],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 10, 0, 0, 0),
//     datetime(1998, 4, 10, 0, 0, 1),
//     datetime(1998, 4, 10, 0, 0, 2),
//     datetime(1998, 4, 10, 0, 0, 3),
//   ]
// )

// testRecurring(
//   'testSecondlyByMonthAndYearDayNeg',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 4,
//     bymonth: [4, 7],
//     byyearday: [-365, -266, -166, -1],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 10, 0, 0, 0),
//     datetime(1998, 4, 10, 0, 0, 1),
//     datetime(1998, 4, 10, 0, 0, 2),
//     datetime(1998, 4, 10, 0, 0, 3),
//   ]
// )

// testRecurring(
//   'testSecondlyByWeekNo',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byweekno: 20,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 5, 11, 0, 0, 0),
//     datetime(1998, 5, 11, 0, 0, 1),
//     datetime(1998, 5, 11, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByWeekNoAndWeekDay',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byweekno: 1,
//     byweekday: RRule.MO,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 29, 0, 0, 0),
//     datetime(1997, 12, 29, 0, 0, 1),
//     datetime(1997, 12, 29, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByWeekNoAndWeekDayLarge',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byweekno: 52,
//     byweekday: RRule.SU,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 28, 0, 0, 0),
//     datetime(1997, 12, 28, 0, 0, 1),
//     datetime(1997, 12, 28, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByWeekNoAndWeekDayLast',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byweekno: -1,
//     byweekday: RRule.SU,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 12, 28, 0, 0, 0),
//     datetime(1997, 12, 28, 0, 0, 1),
//     datetime(1997, 12, 28, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByWeekNoAndWeekDay53',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byweekno: 53,
//     byweekday: RRule.MO,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 12, 28, 0, 0, 0),
//     datetime(1998, 12, 28, 0, 0, 1),
//     datetime(1998, 12, 28, 0, 0, 2),
//   ]
// )

// testRecurring.skip(
//   'testSecondlyByEaster',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byeaster: 0,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 12, 0, 0, 0),
//     datetime(1998, 4, 12, 0, 0, 1),
//     datetime(1998, 4, 12, 0, 0, 2),
//   ]
// )

// testRecurring.skip(
//   'testSecondlyByEasterPos',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byeaster: 1,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 13, 0, 0, 0),
//     datetime(1998, 4, 13, 0, 0, 1),
//     datetime(1998, 4, 13, 0, 0, 2),
//   ]
// )

// testRecurring.skip(
//   'testSecondlyByEasterNeg',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byeaster: -1,
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1998, 4, 11, 0, 0, 0),
//     datetime(1998, 4, 11, 0, 0, 1),
//     datetime(1998, 4, 11, 0, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByHour',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byhour: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0, 0),
//     datetime(1997, 9, 2, 18, 0, 1),
//     datetime(1997, 9, 2, 18, 0, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByMinute',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6, 0),
//     datetime(1997, 9, 2, 9, 6, 1),
//     datetime(1997, 9, 2, 9, 6, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyBySecond',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0, 6),
//     datetime(1997, 9, 2, 9, 0, 18),
//     datetime(1997, 9, 2, 9, 1, 6),
//   ]
// )

// testRecurring(
//   'testSecondlyByHourAndMinute',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6, 0),
//     datetime(1997, 9, 2, 18, 6, 1),
//     datetime(1997, 9, 2, 18, 6, 2),
//   ]
// )

// testRecurring(
//   'testSecondlyByHourAndSecond',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byhour: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0, 6),
//     datetime(1997, 9, 2, 18, 0, 18),
//     datetime(1997, 9, 2, 18, 1, 6),
//   ]
// )

// testRecurring(
//   'testSecondlyByMinuteAndSecond',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 6, 6),
//     datetime(1997, 9, 2, 9, 6, 18),
//     datetime(1997, 9, 2, 9, 18, 6),
//   ]
// )

// testRecurring(
//   'testSecondlyByHourAndMinuteAndSecond',
//   new RRule({
//     freq: RRule.SECONDLY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [6, 18],
//     bysecond: [6, 18],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 6, 6),
//     datetime(1997, 9, 2, 18, 6, 18),
//     datetime(1997, 9, 2, 18, 18, 6),
//   ]
// )

// testRecurring(
//   'testDTStartWithMicroseconds',
//   new RRule({
//     freq: RRule.DAILY,
//     count: 3,
//     dtstart: parse('19970902T090000.5'),
//   }),
//   [
//     datetime(1997, 9, 2, 9, 0),
//     datetime(1997, 9, 3, 9, 0),
//     datetime(1997, 9, 4, 9, 0),
//   ]
// )

// testRecurring(
//   'testSubsecondStartYearly',
//   new RRule({
//     freq: RRule.YEARLY,
//     count: 1,
//     dtstart: new Date(1420063200001),
//   }),
//   [new Date(1420063200001)]
// )

// testRecurring(
//   'testSubsecondStartMonthlyByMonthDay',
//   new RRule({
//     freq: RRule.MONTHLY,
//     count: 1,
//     bysetpos: [-1, 1],
//     dtstart: new Date(1356991200001),
//   }),
//   [new Date(1356991200001)]
// )
