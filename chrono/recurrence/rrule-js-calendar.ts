import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { Time } from "../time.ts";
import type { DaysSinceEpoch, MsSinceEpoch } from "../units/units.ts";
import { Weekday } from "../units/weekday.ts";
import { Year } from "../units/year.ts";
import { YearMonth } from "../units/year-month.ts";
import {
  libraryWeekIndices,
  westernEaster,
} from "../units/year-month-day-filter.ts";
import type { RRule } from "./rrule.ts";
import { RruleJsCounter } from "./rrule-js-interval.ts";

const DAY = Time.MS_PER_DAY;
const ENCODED_CUTOVER = Date.UTC(2000, 0, 1);
const LITERAL_CUTOVER = Date.UTC(100, 0, 1);
const COUNTER_DISPLACEMENT = ENCODED_CUTOVER - LITERAL_CUTOVER;

function encodedStart(year: number): number {
  return Date.UTC(year, 0, 1) / DAY;
}

function weekday(index: number): Weekday {
  return new Weekday(Weekday.fromDse(index as DaysSinceEpoch));
}

/**
 * A literal external JS Date before year 100 has two calendars in rrule.js.
 * The counter retains its year, but Date.UTC encodes its year start and
 * weekday as 1900–1999. The masks retain the literal year's month lengths.
 * A fractional pre-epoch start also needs the reference counter because
 * a signed millisecond remainder can change its weekly weekday. Weekly
 * rules retain the reference's final period, including adjacent-year days.
 */
export class RruleJsCalendar {
  private readonly options: RRule["inner"]["options"];
  private readonly freq: RRule["inner"]["freq"];
  private readonly months: readonly number[] | undefined;
  private readonly monthDays: readonly number[] | undefined;
  private readonly weekDays: readonly Weekday[] | undefined;
  private readonly weekStart: Weekday;
  private maskYear: number | undefined;
  private weeks: Set<number> | undefined;
  private easter: number | undefined;
  private readonly encodedYears: boolean;
  private early: boolean;
  private readonly clockRemainder: number;
  private lastDay: number | undefined;
  private lastDayKept = false;
  readonly firstLiteralMse: number;

  get counterIsEarly(): boolean {
    return this.early;
  }

  constructor(rule: RRule, private readonly start: NaiveDateTime) {
    this.encodedYears = start.date.yr < 100;
    this.early = this.encodedYears;
    this.options = rule.inner.options;
    this.freq = rule.inner.freq;
    const usesDayGrid = this.freq === "yearly" || this.freq === "monthly" ||
      this.freq === "weekly" || this.freq === "daily";
    // Only the day grid retains the original negative millisecond remainder
    // after the counter reaches the first literal year.
    const earlyFraction = usesDayGrid && start.mse < 0 && start.time.ms !== 0
      ? start.time.ms - Time.MS_PER_SEC
      : 0;
    this.clockRemainder = earlyFraction;
    this.firstLiteralMse = LITERAL_CUTOVER + earlyFraction;
    const options = this.options;
    const defaults = options?.rruleJsWeekNumbers == null &&
      !options?.byweekno?.length &&
      !options?.byyearday?.length &&
      !options?.bymonthday?.length && !options?.byday?.length &&
      !options?.bynthday?.length && options?.rruleJsEasterOffset == null;
    this.months = options?.bymonth ??
      (defaults && this.freq === "yearly" ? [start.date.month1] : undefined);
    this.monthDays = options?.bymonthday ??
      (defaults && (this.freq === "yearly" || this.freq === "monthly")
        ? [start.date.day1]
        : undefined);
    this.weekDays = options?.byday ??
      (defaults && this.freq === "weekly" ? [start.date.dayOfWeek] : undefined);
    this.weekStart = options?.wkst ?? Weekday.MON;
  }

  get axisStart(): number {
    const { date, time } = this.start;
    return Date.UTC(date.yr, date.month1 - 1, date.day1) + time.toMs;
  }

  /** Continuous clock for iterating days and subdaily periods across year 100. */
  axisDateTime(ms: number): NaiveDateTime {
    if (!this.encodedYears) return NaiveDateTime.fromMse(ms as MsSinceEpoch);
    this.early = ms < ENCODED_CUTOVER;
    const counterMs = this.counterIsEarly ? ms : ms - COUNTER_DISPLACEMENT;
    const value = NaiveDateTime.fromMse(counterMs as MsSinceEpoch);
    if (!this.counterIsEarly) return value;
    return NaiveDate.fromYmd1Exp(
      value.date.yr - 1900,
      value.date.month1,
      value.date.day1,
    )
      .withTime(value.time);
  }

  private dayIndex(day: NaiveDate): number {
    return Date.UTC(day.yr, day.month1 - 1, day.day1) / DAY -
      encodedStart(day.yr);
  }

  private keep(year: number, dayIndex: number): boolean {
    const options = this.options;
    if (year !== this.maskYear) {
      this.maskYear = year;
      const weekNumbers = options?.rruleJsWeekNumbers ?? options?.byweekno;
      this.weeks = weekNumbers?.length
        ? libraryWeekIndices(
          weekNumbers,
          this.weekStart,
          Year.length(year),
          weekday(encodedStart(year)),
          Year.length(year - 1),
          weekday(encodedStart(year - 1)),
        )
        : undefined;
      if (options?.rruleJsEasterOffset != null) {
        const easter = westernEaster(year);
        this.easter = Date.UTC(
              year,
              easter.month1 - 1,
              easter.day1 + options.rruleJsEasterOffset,
            ) / DAY -
          encodedStart(year);
      }
    }
    const length = Year.length(year);
    if (dayIndex < 0 || dayIndex >= length + 7) return false;
    const jan1 = NaiveDate.fromYmd1Exp(year, 1, 1);
    const day = jan1.addDays(dayIndex);
    const encodedJan1 = encodedStart(year);
    const dow = weekday(encodedJan1 + dayIndex).dow;
    if (this.months?.length && !this.months.includes(day.month1)) return false;
    if (
      this.monthDays?.length && !this.monthDays.includes(day.day1) &&
      !this.monthDays.includes(day.day1 - YearMonth.daysInMonth(day) - 1)
    ) return false;
    const index = dayIndex >= length ? dayIndex - length : dayIndex;
    if (
      options?.byyearday?.length && !options.byyearday.includes(index + 1) &&
      !options.byyearday.includes(index - Year.length(day.yr))
    ) return false;
    if (
      this.weekDays?.length && !this.weekDays.some((value) => value.dow === dow)
    ) return false;
    if (this.weeks != null && !this.weeks.has(dayIndex)) return false;
    if (this.easter != null && this.easter !== dayIndex) return false;
    if (!options?.bynthday?.length) return true;
    if (dayIndex >= length) return false;
    const monthMask = this.freq === "monthly" || Boolean(this.months?.length);
    const nth = monthMask ? day.day1 - 1 : dayIndex;
    const remaining = (monthMask ? YearMonth.daysInMonth(day) : length) - nth -
      1;
    return options.bynthday.some(({ weekday, n }) =>
      weekday.dow === dow &&
      (n > 0 ? Math.floor(nth / 7) + 1 : -Math.floor(remaining / 7) - 1) === n
    );
  }

  keepsDay(date: NaiveDate, rewinds = false): boolean {
    if (date.dse !== this.lastDay) {
      this.lastDay = date.dse;
      const year = rewinds ? this.start.date.yr : date.yr;
      const index = rewinds
        ? date.dse - encodedStart(year)
        : this.dayIndex(date);
      this.lastDayKept = rewinds && index < 0
        ? this.keepsBeforeMask(year, index)
        : this.keep(year, index);
    }
    return this.lastDayKept;
  }

  private keepsBeforeMask(year: number, index: number): boolean {
    // Negative day carries leave the original raw year and its masks in place.
    // Array lookups miss before January 1, while BYYEARDAY compares arithmetic
    // against the negative index directly.
    const options = this.options;
    if (
      this.months?.length || this.monthDays?.length || this.weekDays?.length ||
      options?.rruleJsWeekNumbers?.length || options?.byweekno?.length
    ) return false;
    const yearDays = options?.byyearday;
    return !yearDays?.length || yearDays.includes(index + 1) ||
      yearDays.includes(index - Year.length(year));
  }

  /** Convert a subdaily clock from the iteration axis, retaining carries. */
  clockMse(periodMs: number, offset: number): MsSinceEpoch {
    const encoded = !this.encodedYears || periodMs < ENCODED_CUTOVER
      ? periodMs
      : periodMs - COUNTER_DISPLACEMENT;
    return (encoded + offset) as MsSinceEpoch;
  }

  projectClock(periodMs: number, offset: number): NaiveDateTime {
    return NaiveDateTime.fromMse(this.clockMse(periodMs, offset));
  }

  private selectedDays(
    year: number,
    first: number,
    length: number,
    rewinds = false,
  ): NaiveDate[] {
    const encoded = encodedStart(year);
    const days: NaiveDate[] = [];
    for (let day = first; day < first + length; day++) {
      if (
        rewinds && day < 0
          ? this.keepsBeforeMask(year, day)
          : this.keep(year, day)
      ) {
        days.push(NaiveDate.fromDse((encoded + day) as DaysSinceEpoch));
      }
    }
    return days;
  }

  private *textPeriods(
    interval: string,
    cutoff: number,
  ): Generator<NaiveDate[]> {
    const counter = new RruleJsCounter(this.start, interval);
    const freq = this.freq;
    const weekOffset = (index: number) =>
      (weekday(index).dow - this.weekStart.dow + 7) % 7;
    const carriesBack =
      this.start.time.toMs - this.start.time.ms + this.clockRemainder < 0;
    let firstPeriod = true;
    do {
      const { year, month, dayMs } = counter;
      if (
        !Number.isInteger(year) || year < 0 || (year > 9999 && !firstPeriod) ||
        !Number.isFinite(month) || !Number.isFinite(dayMs)
      ) return;
      firstPeriod = false;
      this.early = year < 100;
      const start = encodedStart(year);
      let first = 0;
      let length = Year.length(year);
      if (freq === "monthly") {
        first = Date.UTC(year, month - 1, 1) / DAY - start;
        length = Number.isInteger(month)
          ? YearMonth.daysInMonth(NaiveDate.fromYmd1Exp(year, month, 1))
          : 0;
      } else if (freq !== "yearly") {
        first = dayMs / DAY - start;
        length = freq === "weekly" ? 7 - weekOffset(start + first) : 1;
      }
      if (!this.early && (start + first) * DAY + this.clockRemainder > cutoff) {
        return;
      }
      yield this.selectedDays(year, first, length);
      // A backwards week starts before this week's boundary, so it cannot
      // produce a new start at or after DTSTART.
      if (freq === "weekly" && Number(interval) < 0) return;
      const offset = freq === "weekly"
        ? weekOffset(dayMs / DAY - (carriesBack ? 1 : 0))
        : 0;
      if (!counter.advanceDate(freq, offset)) return;
    } while (true);
  }

  subdailyClock(
    unitMs: number,
    selectors: readonly (readonly number[] | null | undefined)[],
  ): ((skipDay: boolean) => number) | undefined {
    const numeric = this.options?.interval ?? 1;
    const interval = this.options?.rruleJsIntervalText ??
      (numeric < 0 ? numeric : undefined);
    if (interval == null) return;
    const counter = new RruleJsCounter(this.start, interval);
    let filteredDay: number | undefined;
    const filteredPhases = new Set<number>();
    return (skipDay) => {
      if (numeric < 0 && skipDay) {
        const day = counter.dayMs;
        if (day !== filteredDay) {
          filteredDay = day;
          filteredPhases.clear();
        }
        const phase = counter.periodMs(unitMs);
        if (filteredPhases.has(phase)) return Infinity;
        filteredPhases.add(phase);
      }
      if (!counter.advanceClock(unitMs, skipDay, selectors)) return Infinity;
      const ms = counter.periodMs(unitMs);
      if (!Number.isFinite(ms)) return Infinity;
      return this.encodedYears && counter.year >= 100
        ? ms + COUNTER_DISPLACEMENT
        : ms;
    };
  }

  private *backwardPeriods(
    interval: number,
    earliestDayMse: number,
  ): Generator<NaiveDate[]> {
    const counter = new RruleJsCounter(this.start, interval);
    const freq = this.freq;
    const weekly = freq === "weekly";
    const carriesBack =
      this.start.time.toMs - this.start.time.ms + this.clockRemainder < 0;
    const weekOffset = (day: number) =>
      (weekday(day).dow - this.weekStart.dow + 7) % 7;
    let firstPeriod = true;
    do {
      const { year, month, dayMs } = counter;
      const encoded = encodedStart(year);
      if (
        !Number.isFinite(encoded) || (year > 9999 && !firstPeriod) ||
        (freq === "monthly" && (month < 1 || month > 12))
      ) return;
      firstPeriod = false;
      this.early = year >= 0 && year < 100;
      let first = 0;
      let length = Year.length(year);
      if (freq === "monthly") {
        // The month masks follow the literal year's leap status even
        // when the reference's year start projects into 1900–1999.
        const monthStart = NaiveDate.fromYmd1Exp(year, month, 1);
        first = monthStart.dse - NaiveDate.fromYmd1Exp(year, 1, 1).dse;
        length = YearMonth.daysInMonth(monthStart);
      } else if (freq !== "yearly") {
        if (!Number.isFinite(dayMs)) return;
        first = dayMs / DAY - encoded;
        if (weekly) {
          const offset = weekOffset(encoded + Math.max(0, first));
          length = first < 0
            ? Math.min(7, -first + (7 - offset) % 7)
            : 7 - offset;
        } else length = 1;
      }
      const lastMse = (encoded + first + length - 1) * DAY;
      // At raw year 99 Date.UTC can jump forward to the encoded year 1999.
      const canReachEncodedYears = freq === "yearly" && year >= 100 &&
        Date.UTC(1999, 11, 31) >= earliestDayMse;
      if (lastMse < earliestDayMse && !canReachEncodedYears) return;
      yield this.selectedDays(year, first, length, true);
    } while (
      counter.advanceDate(
        freq,
        weekly ? weekOffset(counter.dayMs / DAY - (carriesBack ? 1 : 0)) : 0,
      )
    );
  }

  *periodDays(
    cutoff: number,
    earliestDayMse = -Infinity,
  ): Generator<NaiveDate[]> {
    const text = this.options?.rruleJsIntervalText;
    if (text != null) {
      yield* this.textPeriods(text, cutoff);
      return;
    }
    const interval = this.options?.interval ?? 1;
    if (interval < 0) {
      yield* this.backwardPeriods(interval, earliestDayMse);
      return;
    }
    const freq = this.freq;
    const carriesBack =
      this.start.time.toMs - this.start.time.ms + this.clockRemainder < 0;
    const onlyWeekStart = this.weekDays?.length &&
      this.weekDays.every((day) => day.dow === this.weekStart.dow);
    let axis = this.axisStart;
    let year = this.start.date.yr;
    let month = this.start.date.month1;
    let firstPeriod = true;
    while (year <= 9999 || firstPeriod) {
      let first = 0;
      let length: number;
      if (freq === "yearly" || freq === "monthly") {
        this.early = year < 100;
        if (freq === "monthly") {
          const jan1 = NaiveDate.fromYmd1Exp(year, 1, 1);
          const firstDay = NaiveDate.fromYmd1Exp(year, month, 1);
          first = firstDay.dse - jan1.dse;
          length = YearMonth.daysInMonth(firstDay);
        } else {
          length = Year.length(year);
        }
      } else {
        const day = this.axisDateTime(axis).date;
        year = day.yr;
        if (year > 9999 && !firstPeriod) return;
        first = this.dayIndex(day);
        if (freq === "weekly") {
          const start = encodedStart(year) + first;
          const weekOffset = (day: number) =>
            (weekday(day).dow - this.weekStart.dow + 7) % 7;
          length = 7 - weekOffset(start);
          // The day set starts at midnight, while addWeekly reads the
          // counter's weekday after applying the negative millisecond remainder.
          // Later literal periods then open a day after WKST and never
          // contain that weekday. The encoded-year cutover can reset the phase.
          if (!this.early && carriesBack && onlyWeekStart && length === 6) {
            return;
          }
          axis += DAY *
            (interval * 7 - weekOffset(start - (carriesBack ? 1 : 0)));
        } else {
          length = 1;
          axis += DAY * interval;
        }
      }
      const encoded = encodedStart(year);
      if (
        !this.early && (encoded + first) * DAY + this.clockRemainder > cutoff
      ) return;
      firstPeriod = false;
      yield this.selectedDays(year, first, length);
      // Even in seconds, an unsafe positive interval leaves year 9999
      // behind after the first period.
      if (!Number.isSafeInteger(interval)) return;
      if (freq === "yearly") year += interval;
      else if (freq === "monthly") {
        const total = month - 1 + interval;
        year += Math.floor(total / 12);
        month = total % 12 + 1 as typeof month;
      }
    }
  }
}
