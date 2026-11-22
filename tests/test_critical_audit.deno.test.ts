import { assertEquals, assert, assertThrows } from "@std/assert";
import { DateTime } from "../chrono/datetime.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { DurationTime } from "../chrono/units/duration-time.ts";
import { Recurrence, splitRdatesAt } from "../chrono/recurrence/recurrence.ts";
import { RRule } from "../chrono/recurrence/rrule.ts";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { RecurrenceExpansionLimitError } from "../chrono/recurrence/generation-limit.ts";
import { EthiopianConverter } from "../chrono/secondary-calendars/ethiopian-converter.ts";
import { IslamicConverter } from "../chrono/secondary-calendars/islamic-converter.ts";
import { DateUnit } from "../chrono/units/date-unit.ts";
import type { DaysSinceEpoch } from "../chrono/units/units.ts";

const day = (y: number, m: number, d: number) => NaiveDate.fromYmd1Exp(y, m, d);
const at = (s: string) => DateTime.fromRfc3339(s).exp();

Deno.test("audit: Monday alignment includes Sunday in the previous six days", () => {
  for (let d = 3; d <= 9; d++) assertEquals(day(2024, 6, d).toStartOfWeekMon().rfc3339(), "2024-06-03");
});
Deno.test("audit: signed duration rounding follows numeric floor/ceil and zero is unchanged", () => {
  const d = DurationTime.ms(-1600);
  assertEquals(d.round({ secs: 1 }).toMs, -2000);
  assertEquals(d.floor({ secs: 1 }).toMs, -2000);
  assertEquals(d.ceil({ secs: 1 }).toMs, -1000);
  assertEquals(d.round({ ms: 0 }), d);
  assertEquals(DurationTime.ms(1600).round({ secs: 1 }).toMs, 2000);
});
Deno.test("audit: RFC3339 validates complete syntax, ranges and fraction carry", () => {
  for (const s of ["2024-06-09\n", "2024x06x09", "2024-06-09garbage", "2024-06-09T01x02x03Z", "2024-06-09T24:00:00Z", "2024-06-09T00:60:00Z", "2024-06-09T00:00:60Z", "2024-02-30T00:00:00Z", "2024-06-09T00:00:00+24:00", "2024-06-09T00:00:00+01:60", "2024-06-09T00:00:00+01:00:60", "2024-06-09T00:00:00.Z", "2024-06-09T00:00:00Zjunk"]) {
    assert(DateTime.fromRfc3339(s).isErr, s);
  }
  assertEquals(at("2024-12-31t23:59:59.9999z").rfc3339(), "2025-01-01T00:00:00Z");
  assertEquals(at("2024-02-28T23:59:59.9999Z").rfc3339(), "2024-02-29T00:00:00Z");
  assertEquals(at("2024-06-09T01:02:03+01:02:03").tz.info.offset.toMs, 3723000);
  assertEquals(at("2024-06-09").rfc3339(), "2024-06-09T00:00:00Z");
  assertEquals(at("2024-06-09T01:02:03").rfc3339(), "2024-06-09T01:02:03Z");
});
Deno.test("audit: ranges distinguish containment from overlap and retain interior points", () => {
  const dt = (n: number) => at(`2024-06-09T${String(n).padStart(2, "0")}:00:00Z`);
  const range = (a: number, b: number) => new DateTime.Range(dt(a), dt(b));
  const r = range(10, 12);
  assertEquals(r.containsRangeInclusive(range(11, 13)), false);
  assertEquals(r.containsRangeExclusive(range(11, 13)), false);
  assert(r.containsRangeInclusive(r));
  assertEquals(r.containsRangeExclusive(r), false);
  assert(r.overlapsExclusive(r));
  assert(r.overlapsExclusive(range(11, 13)));
  assert(r.overlapsExclusive(range(11, 11)));
  assertEquals(r.overlapsExclusive(range(12, 12)), false);
  assert(r.overlapsInclusive(range(12, 13)));
  assertEquals(r.overlapsExclusive(range(12, 13)), false);
});
Deno.test("audit: host today refreshes after local midnight and backward clock changes", () => {
  const RealDate = globalThis.Date;
  const cached = NaiveDate._today;
  let now = new RealDate(2024, 5, 9, 23, 59, 59).getTime();
  class ClockDate extends RealDate {
    constructor() { super(now); }
  }
  try {
    globalThis.Date = ClockDate as DateConstructor;
    assertEquals(NaiveDate.today().rfc3339(), "2024-06-09");
    now += 2000;
    assertEquals(NaiveDate.today().rfc3339(), "2024-06-10");
    now -= 86400000;
    assertEquals(NaiveDate.today().rfc3339(), "2024-06-09");
  } finally { globalThis.Date = RealDate; NaiveDate._today = cached; }
});
Deno.test("audit: zero interval is serialized unchanged and advances in BYHOUR expansion", async () => {
  const r = (await Recurrence.parse(["DTSTART:20260101T090000Z", "RRULE:FREQ=DAILY;INTERVAL=0;BYHOUR=9;COUNT=3"])).exp();
  assertEquals(r.inner.rrule!.inner.options!.interval, 0);
  assert(r.inner.rrule!.toString().includes("INTERVAL=0"));
  assert(!r.inner.rrule!.toReadableDisplay().includes("Every 0"));
  assertEquals([...r.generateToDate(undefined, day(2026, 1, 5))].map(d => d.rfc3339()), ["2026-01-01", "2026-01-02", "2026-01-03"]);
});
Deno.test("audit: finite recurrence windows are complete and explicit limits remain effective", async () => {
  const r = (await Recurrence.parse(["DTSTART:20260101T090000Z", "RRULE:FREQ=DAILY"])).exp();
  assertEquals([...r.generateToDate(undefined, day(2028, 12, 31))].length, 1096);
  assertEquals([...r.generate(undefined, 3)].length, 3);
  assertEquals([...r.generate()].length, 1000);
  const gen = await r.generateGoogleEvents(at("2026-01-01T09:00:00Z"), null);
  const first = gen.generateUpToDate(day(2027, 12, 31));
  const second = gen.generateUpToDate(day(2028, 12, 31));
  assertEquals(first.length + second.length, 1096);
  const limited = await r.generateGoogleEvents(at("2026-01-01T09:00:00Z"), null, 10);
  assertThrows(() => limited.generateUpToDate(day(2028, 12, 31)), RecurrenceExpansionLimitError);
});
Deno.test("audit: malformed EXDATE/UNTIL return Err and unsplittable RDATE stays before", async () => {
  assert((await ICalendar.Raw.parse(["RRULE:FREQ=DAILY", "EXDATE:notadate"])).isErr);
  assert(RRule.parseWithRecurrence(["RRULE:FREQ=DAILY", "EXDATE:notadate"]).isErr);
  assert(RRule.parse("RRULE:FREQ=DAILY;UNTIL=20250230").isErr);
  assert((await Recurrence.parse(["RRULE:FREQ=DAILY;UNTIL=20250230"])).isErr);
  const result = await splitRdatesAt(["RDATE:notadate"], at("2026-01-02T00:00:00Z").toUtc(), at("2026-01-01T00:00:00Z"), null);
  assertEquals(result, { before: ["RDATE:notadate"], from: [] });
});
Deno.test("audit: secondary calendar years have no missing or duplicated leap day", () => {
  // Verify each day over complete leap cycles, using the retained numeric epochs.
  const check = (convert: typeof EthiopianConverter.toEthiopianDate, epoch: number, years: number, length: (y: number) => number, months: number) => {
    let jdn = epoch;
    for (let y = 1; y <= years; y++) {
      const days = length(y);
      for (let i = 0; i < days; i++, jdn++) {
        const got = convert(NaiveDate.fromDse((jdn - 2440588) as DaysSinceEpoch));
        assert(got != null, `missing ${y}/${i}`);
        assertEquals(got.year, y);
        if (i === 0) assertEquals(got, { year: y, month: 1, day: 1 });
        if (i === days - 1) assertEquals(got, { year: y, month: months, day: months === 13 ? days - 360 : days - 325 });
      }
    }
  };
  check(EthiopianConverter.toEthiopianDate, 1724221, 8, y => y % 4 === 3 ? 366 : 365, 13);
  check(IslamicConverter.toHijriDate, 1948439, 30, y => [2,5,7,10,13,16,18,21,24,26,29].includes(y) ? 355 : 354, 12);
});

Deno.test("audit follow-up: rounding canonicalizes zero and keeps signed boundaries", () => {
  for (const ms of [-501, -500, -400, 0, 400, 500, 501]) {
    const d = DurationTime.ms(ms);
    for (const step of [-1, 1]) {
      for (const [method, op] of [["round", Math.round], ["ceil", Math.ceil], ["floor", Math.floor]] as const) {
        const expected = op(ms / 1000) * 1000;
        assertEquals(d[method]({ secs: step }).toMs, expected === 0 ? 0 : expected);
      }
    }
  }
});
Deno.test("audit follow-up: zero output budgets and counts stop before yielding", async () => {
  for (const parts of ["", ";BYHOUR=9"]) {
    const r = (await Recurrence.parse(["DTSTART:20260101T090000Z", `RRULE:FREQ=DAILY${parts};COUNT=0`])).exp();
    assert(r.inner.rrule!.toString().includes("COUNT=0"));
    assertEquals([...r.generate()], []);
    assertEquals([...r.generateToDate(undefined, day(2026, 1, 9))], []);
    const emptyEvents = await r.generateGoogleEvents(at("2026-01-01T09:00:00Z"), null);
    assertEquals(emptyEvents.generateUpToDate(day(2026, 1, 9)), []);
    const normal = (await Recurrence.parse(["DTSTART:20260101T090000Z", `RRULE:FREQ=DAILY${parts}`])).exp();
    assertEquals([...normal.generate(undefined, 0)], []);
    const budget = await normal.generateGoogleEvents(at("2026-01-01T09:00:00Z"), null, 0);
    assertThrows(() => budget.generateUpToDate(day(2026, 1, 9)), RecurrenceExpansionLimitError);
  }
  const props = RRule.parse("RRULE:FREQ=DAILY;COUNT=0").exp().toFilterProps();
  assertEquals([...day(2026, 1, 1).range(props.step, props.options)], []);
});
Deno.test("audit follow-up: invalid programmatic steps fail without stalling", async () => {
  for (const n of [0, NaN, Infinity, 0.5]) {
    assertThrows(() => [...NaiveDate.ndsucc(day(2026, 1, 1), DateUnit.days(n), 3)], RangeError);
  }
  for (const parts of ["", ";BYHOUR=9", ";BYHOUR=9;BYMINUTE=10"]) {
    const r = (await Recurrence.parse(["DTSTART:20260101T090000Z", `RRULE:FREQ=DAILY${parts}`])).exp();
    r.inner.rrule!.inner.options!.interval = NaN;
    assertThrows(() => [...r.generate(undefined, 2)], RangeError);
  }
});
Deno.test("audit follow-up: COUNT and UNTIL both shorten query horizons", async () => {
  for (const parts of ["", ";BYHOUR=9"]) {
    const r = (await Recurrence.parse(["DTSTART:20260101T090000Z", `RRULE:FREQ=DAILY${parts};COUNT=2;UNTIL=20260104T090000Z`])).exp();
    assertEquals([...r.generate(undefined, 10)].length, 2);
    assertEquals([...r.generateToDate(undefined, day(2026, 1, 1))].length, 1);
    assertEquals([...r.generateToDate(undefined, day(2026, 1, 9))].length, 2);
    const until = (await Recurrence.parse(["DTSTART:20260101T090000Z", `RRULE:FREQ=DAILY${parts};UNTIL=20260102T090000Z`])).exp();
    assertEquals([...until.generateToDate(undefined, day(2026, 1, 9))].length, 2);
  }
});
Deno.test("audit follow-up: parser names, negative offset seconds, cache and full match", () => {
  const text = "2024-06-09t01:02:03-01:02:03";
  assertEquals(at(text).tz.info.offset.toMs, -3723000);
  assertEquals(DateTime.fromRfc3339(text), DateTime.fromRfc3339(text));
  const named = DateTime.fromRfc3339(text, "Custom", "C").exp();
  assertEquals(named.tz.info.offset.toMs, -3723000);
  assert(named !== at(text));
  for (const suffix of ["\n", "\r\n", "x", "Z"]) assert(DateTime.fromRfc3339(text + suffix).isErr);
});

Deno.test("audit follow-up: direct ranges and sparse explicit work budgets", async () => {
  const start = day(2026, 1, 1);
  assertEquals([...start.range(DateUnit.days(1), { limit: 0 })], []);
  assertThrows(() => [...start.range(DateUnit.days(0))], RangeError);
  const until = day(2026, 1, 4);
  assertEquals([...start.range(DateUnit.days(1), { end: until, recurLimit: Infinity })].length, 4);
  for (const parts of ["", ";BYHOUR=9"]) {
    const sparse = (await Recurrence.parse(["DTSTART:20260101T090000Z", `RRULE:FREQ=DAILY;BYMONTH=12${parts}`])).exp();
    const gen = await sparse.generateGoogleEvents(at("2026-01-01T09:00:00Z"), null, 4);
    assertThrows(() => gen.generateUpToDate(day(2026, 12, 31)), RecurrenceExpansionLimitError);
  }
});
Deno.test("audit follow-up: malformed date-list members return errors", async () => {
  for (const line of ["EXDATE:20260101T090000Z,notadate", "EXDATE:20260101T090000Z,20260230T090000Z", "RDATE:20260101T090000Z,notadate"]) {
    assert((await ICalendar.Raw.parse(["RRULE:FREQ=DAILY", line])).isErr, line);
  }
});

Deno.test("audit follow-up: zero COUNT keeps independent RDATEs and subdaily NaN fails", async () => {
  for (const parts of ["", ";BYHOUR=9"]) {
    const r = (await Recurrence.parse(["DTSTART:20260101T090000Z", `RRULE:FREQ=DAILY;COUNT=0${parts}`, "RDATE:20260103T090000Z"])).exp();
    assertEquals([...r.generateToDate(undefined, day(2026, 1, 9))].map(d => d.rfc3339()), ["2026-01-03"]);
    const events = await r.generateGoogleEvents(at("2026-01-01T09:00:00Z"), null);
    assertEquals(events.generateUpToDate(day(2026, 1, 9)).map(String), ["2026-01-03T09:00:00Z"]);
  }
  for (const freq of ["HOURLY", "MINUTELY", "SECONDLY"]) {
    const r = (await Recurrence.parse(["DTSTART:20260101T090000Z", `RRULE:FREQ=${freq};BYHOUR=9`])).exp();
    r.inner.rrule!.inner.options!.interval = NaN;
    assertThrows(() => [...r.generate(undefined, 2)], RangeError);
  }
});
