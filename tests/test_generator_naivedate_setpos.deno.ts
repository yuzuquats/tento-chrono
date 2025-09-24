import { assert } from "jsr:@std/assert";

Deno.test({
  name: "generator-setpos",
  fn() {
    assert(false, "generator-setpos, not yet implemented");
  },
});

// testRecurring(
//   'testYearlyBySetPos',
//   new RRule({
//     freq: RRule.YEARLY,
//     count: 3,
//     bymonthday: 15,
//     byhour: [6, 18],
//     bysetpos: [3, -3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 11, 15, 18, 0),
//     datetime(1998, 2, 15, 6, 0),
//     datetime(1998, 11, 15, 18, 0),
//   ]
// )

// testRecurring(
//   'testMonthlyBySetPos',
//   new RRule({
//     freq: RRule.MONTHLY,
//     count: 3,
//     bymonthday: [13, 17],
//     byhour: [6, 18],
//     bysetpos: [3, -3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 13, 18, 0),
//     datetime(1997, 9, 17, 6, 0),
//     datetime(1997, 10, 13, 18, 0),
//   ]
// )

// testRecurring(
//   'testWeeklyBySetPos',
//   new RRule({
//     freq: RRule.WEEKLY,
//     count: 3,
//     byweekday: [RRule.TU, RRule.TH],
//     byhour: [6, 18],
//     bysetpos: [3, -3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 0),
//     datetime(1997, 9, 4, 6, 0),
//     datetime(1997, 9, 9, 18, 0),
//   ]
// )

// testRecurring(
//   'testDailyBySetPos',
//   new RRule({
//     freq: RRule.DAILY,
//     count: 3,
//     byhour: [6, 18],
//     byminute: [15, 45],
//     bysetpos: [3, -3],
//     dtstart: parse('19970902T090000'),
//   }),
//   [
//     datetime(1997, 9, 2, 18, 15),
//     datetime(1997, 9, 3, 6, 45),
//     datetime(1997, 9, 3, 18, 15),
//   ]
// )
