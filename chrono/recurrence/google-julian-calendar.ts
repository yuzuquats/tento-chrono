import { NaiveDate } from "../naive-date.ts";
import type { PartialDate } from "../units/partial-date.ts";
import { Weekday } from "../units/weekday.ts";
import type { RRuleLike } from "./rrule.ts";

const GREGORIAN_CUTOVER = NaiveDate.fromYmd1Exp(1582, 10, 15);
// The nominal axis preserves a slot for each written October date.
export const GOOGLE_REFORM_GAP_DAYS = 10;
const NOMINAL_CUTOVER = GREGORIAN_CUTOVER.addDays(GOOGLE_REFORM_GAP_DAYS);

type Selectors = NonNullable<RRuleLike["options"]>;

export function googleUsesJulianCalendar(date: NaiveDate): boolean {
  return date.dse < GREGORIAN_CUTOVER.dse;
}

function julianOffset(date: NaiveDate): number {
  const year = date.yr - (date.month1 <= 2 ? 1 : 0);
  return Math.floor(year / 100) - Math.floor(year / 400) - 2;
}

/** Project a written Julian date onto the continuous Gregorian day count. */
export function googleDateToGregorian(date: NaiveDate): NaiveDate {
  return googleUsesJulianCalendar(date) ? date.addDays(julianOffset(date)) : date;
}

/** Recover the written date, when it can be represented by Chrono. */
export function gregorianToGoogleDate(date: NaiveDate): NaiveDate | null {
  if (!googleUsesJulianCalendar(date)) return date;
  const estimate = date.addDays(-julianOffset(date));
  const difference = date.dse - googleDateToGregorian(estimate).dse;
  const corrected = estimate.addDays(difference);
  return googleDateToGregorian(corrected).dse === date.dse ? corrected : null;
}

/** A representable bound when a Julian century adds February 29. */
export function gregorianToGoogleDateOnOrBefore(date: NaiveDate): NaiveDate {
  return gregorianToGoogleDate(date) ?? gregorianToGoogleDate(date.addDays(-1))!;
}

function physicalToNominal(date: NaiveDate): NaiveDate {
  return googleUsesJulianCalendar(date) ? date : date.addDays(GOOGLE_REFORM_GAP_DAYS);
}

export function googleDateToNominal(date: NaiveDate): NaiveDate {
  return googleUsesJulianCalendar(date)
    ? googleDateToGregorian(date)
    : date.addDays(GOOGLE_REFORM_GAP_DAYS);
}

export function googleNominalToDate(date: NaiveDate): NaiveDate {
  if (date.dse >= NOMINAL_CUTOVER.dse) return date.addDays(-GOOGLE_REFORM_GAP_DAYS);
  return gregorianToGoogleDate(date) ?? gregorianToGoogleDate(date.addDays(1))!;
}

function monthLength(first: NaiveDate): number {
  const last = first.addMonths(1).castValid().addDays(-1);
  const julianLeap = first.month1 === 2 && last.day === 28 && first.yr % 4 === 0 &&
    googleUsesJulianCalendar(last);
  return last.day + Number(julianLeap);
}

function matchesMonthDay(selectors: readonly number[], day: number, length: number): boolean {
  return selectors.includes(day) || selectors.includes(day - length - 1);
}

function nthWeekday(first: NaiveDate, next: NaiveDate, weekday: Weekday, n: number): NaiveDate {
  if (n > 0) {
    const lead = (weekday.dow - first.dayOfWeek.dow + 7) % 7;
    return first.addDays(lead + (n - 1) * 7);
  }
  const last = next.addDays(-1);
  const trail = (last.dayOfWeek.dow - weekday.dow + 7) % 7;
  return last.addDays(-trail + (n + 1) * 7);
}

function matchesWeekday(axis: NaiveDate, month: NaiveDate, options: Selectors, byYear: boolean): boolean {
  if (options.byday?.includes(axis.dayOfWeek)) return true;
  if (!options.bynthday?.length) return !options.byday?.length;

  const first = byYear ? NaiveDate.fromYmd1Exp(month.yr, 1, 1) : month;
  const next = (byYear ? first.addYears(1) : first.addMonths(1)).castValid();
  if (googleUsesJulianCalendar(first) && next.dse > GREGORIAN_CUTOVER.dse) {
    // Across the reform, a Gregorian ordinal before October 15 falls back
    // to the ordinal on the Julian calendar. Two ordinals can name one day.
    const julianFirst = first.addDays(julianOffset(first));
    const julianNext = next.addDays(julianOffset(next));
    return options.bynthday.some(({ weekday, n }) => {
      if (weekday !== axis.dayOfWeek) return false;
      const gregorian = nthWeekday(first, next, weekday, n);
      const selected = googleUsesJulianCalendar(gregorian)
        ? nthWeekday(julianFirst, julianNext, weekday, n)
        : gregorian;
      return selected.dse === axis.dse;
    });
  }
  const positive = 1 + Math.floor((axis.dse - googleDateToGregorian(first).dse) / 7);
  const negative = -1 - Math.floor((googleDateToGregorian(next).dse - 1 - axis.dse) / 7);
  return options.bynthday.some(({ weekday, n }) =>
    weekday === axis.dayOfWeek && (n === positive || n === negative)
  );
}

/** Apply civil selectors to periods on the continuous day axis. */
export function googleJulianDayFilter(options: Selectors): NaiveDate.Filter {
  return function* ([period, unit]: PartialDate.Tuple) {
    const length = unit === "week" && (options.byday?.length || options.bynthday?.length) ? 7 : 1;
    for (let offset = 0; offset < length; offset++) {
      const axis = period.addDays(offset);
      const civil = gregorianToGoogleDateOnOrBefore(axis);
      if (options.bymonth?.length && !options.bymonth.includes(civil.month1)) continue;
      const month = NaiveDate.fromYmd1Exp(civil.yr, civil.month1, 1);
      if (options.bymonthday?.length) {
        const day = civil.day + Number(googleDateToGregorian(civil).dse !== axis.dse);
        if (!matchesMonthDay(options.bymonthday, day, monthLength(month))) continue;
      }
      if (matchesWeekday(axis, month, options, options.ordinalWeekdayPeriod === "year")) {
        yield [axis, "day"];
      }
    }
  };
}

/** Expand numeric dates in written order and ordinal weekdays in calendar order. */
export function googleJulianPeriodFilter(options: Selectors, frequency: RRuleLike["freq"]): NaiveDate.Filter {
  return function* ([period, unit]: PartialDate.Tuple) {
    const months = options.bymonth?.length
      ? options.bymonth
      : options.implicitYearlyMonth != null ? [options.implicitYearlyMonth] : undefined;
    const hasWeekdays = Boolean(options.byday?.length || options.bynthday?.length);
    const monthDays = options.bymonthday;
    const yearDays = options.byyearday;
    const numericDays = Boolean(monthDays?.length || yearDays?.length);
    const expandsYear = unit === "year" && (months != null || hasWeekdays || numericDays);
    const from = expandsYear ? 1 : period.month1;
    const to = expandsYear ? 12 : period.month1;
    const january = NaiveDate.fromYmd1Exp(period.yr, 1, 1);
    const yearStart = googleDateToNominal(january).dse;
    const yearLength = googleDateToNominal(january.addYears(1).castValid()).dse - yearStart;
    const byYear = frequency === "daily" || (unit === "year" && !options.bymonth?.length);
    for (let monthNumber = from; monthNumber <= to; monthNumber++) {
      if (months != null && !months.includes(monthNumber)) continue;
      const month = NaiveDate.fromYmd1Exp(period.yr, monthNumber, 1);
      if (hasWeekdays && !numericDays) {
        const first = googleDateToGregorian(month);
        const next = googleDateToGregorian(month.addMonths(1).castValid());
        for (let date = first; date.dse < next.dse; date = date.addDays(1)) {
          if (matchesWeekday(date, month, options, byYear)) {
            yield [physicalToNominal(date), "day"];
          }
        }
        continue;
      }

      const length = monthLength(month);
      for (let day = 1; day <= length; day++) {
        if (monthDays?.length && !matchesMonthDay(monthDays, day, length)) continue;
        if (!numericDays && day !== period.day) continue;
        const written = NaiveDate.fromYmd1Unchecked(month.yr, month.month1, day).toResult().asOk();
        // A Julian century leap day is between February 28 and March 1 on the axis.
        const date = written != null ? googleDateToNominal(written) : googleDateToNominal(month).addDays(day - 1);
        if (yearDays?.length && !matchesMonthDay(yearDays, date.dse - yearStart + 1, yearLength)) continue;
        const physical = written != null ? googleDateToGregorian(written) : date;
        if (matchesWeekday(physical, month, options, byYear)) yield [date, "day"];
      }
    }
  };
}

function weekStart(date: NaiveDate, wkst: Weekday): NaiveDate {
  return date.addDays(-((date.dayOfWeek.dow - wkst.dow + 7) % 7));
}

function firstWeek(year: number, wkst: Weekday, julian: boolean): NaiveDate {
  const january = NaiveDate.fromYmd1Exp(year, 1, 1);
  const date = julian ? january.addDays(julianOffset(january)) : january;
  const start = weekStart(date, wkst);
  return date.dse - start.dse <= 3 ? start : start.addDays(7);
}

function numberedWeek(year: number, n: number, wkst: Weekday, start: NaiveDate, julian: boolean): NaiveDate | null {
  const first = firstWeek(year, wkst, julian);
  if (n > 0) return first.addDays((n - 1) * 7);
  const lastDay = NaiveDate.fromYmd1Exp(year, 12, 31);
  const last = julian ? lastDay.addDays(julianOffset(lastDay)) : lastDay;
  const seriesStart = julian ? start.addDays(julianOffset(start)) : start;
  const countYear = start.yr === year && seriesStart.dse >= weekStart(last, Weekday.SUN).dse
    ? year + 1 : year;
  const weeks = (firstWeek(countYear + 1, wkst, julian).dse - firstWeek(countYear, wkst, julian).dse) / 7;
  const index = weeks + n;
  return index >= 0 ? first.addDays(index * 7) : null;
}

/** Select numbered weeks on either side of the reform before applying weekday filters. */
export function googleJulianWeekFilter(
  options: Selectors,
  start: NaiveDate,
  gregorian: NaiveDate.Filter,
): NaiveDate.Filter {
  const wkst = options.wkst ?? Weekday.MON;
  return function* (period: PartialDate.Tuple) {
    const year = period[0].yr;
    const january = NaiveDate.fromYmd1Exp(year, 1, 1);
    if (!googleUsesJulianCalendar(january)) {
      for (const [day] of gregorian(period)) {
        const date = day.toResult().asOk();
        if (date != null) yield [physicalToNominal(date), "day"];
      }
      return;
    }

    const first = googleDateToGregorian(january);
    const next = googleDateToGregorian(january.addYears(1).castValid());
    const seen = new Set<number>();
    for (const number of options.byweekno ?? []) {
      const gregorianWeek = numberedWeek(year, number, wkst, start, false);
      const week = gregorianWeek == null || googleUsesJulianCalendar(gregorianWeek)
        ? numberedWeek(year, number, wkst, start, true)
        : gregorianWeek;
      if (week == null) continue;
      for (let i = 0; i < 7; ++i) {
        const date = week.addDays(i);
        if (date.dse < first.dse || date.dse >= next.dse || seen.has(date.dse)) continue;
        const civil = gregorianToGoogleDateOnOrBefore(date);
        if (options.bymonth?.length && !options.bymonth.includes(civil.month1)) continue;
        const month = NaiveDate.fromYmd1Exp(year, civil.month1, 1);
        if (!matchesWeekday(date, month, options, true)) continue;
        seen.add(date.dse);
        yield [physicalToNominal(date), "day"];
      }
    }
  };
}
