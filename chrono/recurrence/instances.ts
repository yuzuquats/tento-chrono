/**
 * A rule's instances as wall-clock date-times (RFC 5545 §3.3.10), for the
 * rules the date generator cannot place: an HOURLY, MINUTELY or SECONDLY
 * frequency, or BYHOUR / BYMINUTE / BYSECOND, with BYSETPOS over the
 * resulting set. Rules without time parts keep the date generator
 * (`RRule.toFilterProps`), which places one instance a day at DTSTART's time.
 *
 * The date parts (BYMONTH, BYWEEKNO, BYYEARDAY, BYMONTHDAY, BYDAY) select
 * days exactly as they do there. Each period's set (a year, month, week or
 * day of the frequency; an hour, minute or second for the sub-daily ones) is
 * built whole, sorted, narrowed by BYSETPOS, and only then cut at DTSTART,
 * UNTIL and COUNT, so a position counts from the period's start even when
 * DTSTART falls inside it.
 *
 * @module
 */
import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { Time } from "../time.ts";
import type { MsSinceEpoch } from "../units/units.ts";
import { Weekday } from "../units/weekday.ts";
import { weekYearOf } from "../units/year-month-day-filter.ts";
import type { Option } from "../option.ts";
import type { RRule } from "./rrule.ts";
import type { TimezoneRegion } from "../timezone-region.ts";
import type { RruleJsCalendar } from "./rrule-js-calendar.ts";
import { dateutilBackwardClock, validateDateutilExpandedClock } from "./dateutil-clock.ts";
import { RecurrenceExpansionLimitError } from "./generation-limit.ts";
import {
  googleDateToGregorian,
  googleDateToNominal,
  googleNominalToDate,
  gregorianToGoogleDate,
  gregorianToGoogleDateOnOrBefore,
} from "./google-julian-calendar.ts";

export namespace RRuleInstances {
  const JS_DATE_LIMIT = 8_640_000_000_000_000;
  // A full day has this many whole-second slots. COUNT and query bounds
  // can make even a complete clock cheap to read. Keep an allocation guard
  // for combinations beyond a day, including repeated or carried values.
  const CLOCK_GRID_ALLOWANCE = Time.MS_PER_DAY / Time.MS_PER_SEC;
  // The smaller two axes of any grid within that allowance have at most
  // 86,400^(2/3) < 2,048 pairs, even with out-of-range clock selectors.
  const CLOCK_BOUNDARY_PAIR_LIMIT = 2_048;
  /**
   * How many periods (or, for the sub-daily frequencies, period steps) to
   * try without placing an instance before giving up: a rule whose parts
   * never meet (BYMONTH=2;BYMONTHDAY=31) ends instead of spinning.
   */
  export const IDLE_LIMIT = 100_000;

  /**
   * `rule`'s instances from `dtstart` (its wall-clock time), in order. A
   * date-time UNTIL is inclusive; a date-only UNTIL is inclusive by default
   * (RFC 5545 §3.3.10) and exclusive of that day when
   * `useGoogleCalendarBehavior` is true. `useGoogleCalendarBehavior` also
   * selects Google's BYWEEKNO reading, matching the date generator.
   * `horizonMs` is an inclusive wall-clock caller bound. Finite horizons
   * scan all relevant periods unless an explicit work budget is exhausted;
   * unbounded searches without a budget retain graceful IDLE_LIMIT termination.
   */
  export function* expand(
    rule: RRule,
    dtstart: NaiveDateTime,
    useGoogleCalendarBehavior: boolean = false,
    generationLimit?: number,
    untilWallOverride?: Option<NaiveDateTime>,
    ignoreTimeParts: boolean = false,
    horizonMs: number = Infinity,
    useGoogleYearlyWeeks: boolean = false,
    clipFirstWeek: boolean = false,
    countRepeatedSetPositions = false,
    referenceCalendar?: RruleJsCalendar,
  ): Generator<NaiveDateTime> {
    for (const at of scan(
      undefined, rule, dtstart, useGoogleCalendarBehavior, generationLimit,
      untilWallOverride, ignoreTimeParts, horizonMs, useGoogleYearlyWeeks,
      clipFirstWeek, countRepeatedSetPositions, referenceCalendar,
    )) {
      if (at != null) yield at;
    }
  }

  /** @internal Move the inclusive wall-clock bound between cursor reads. */
  export interface Window {
    endMse: number;
  }

  /** @internal A null step pauses at the caller's window without ending the rule. */
  export function* scan(
    window: Window | undefined,
    rule: RRule,
    dtstart: NaiveDateTime,
    useGoogleCalendarBehavior: boolean = false,
    generationLimit?: number,
    untilWallOverride?: Option<NaiveDateTime>,
    ignoreTimeParts: boolean = false,
    horizonMs: number = Infinity,
    useGoogleYearlyWeeks: boolean = false,
    clipFirstWeek: boolean = false,
    countRepeatedSetPositions = false,
    referenceCalendar?: RruleJsCalendar,
  ): Generator<NaiveDateTime | null> {
    if (generationLimit != null && (!Number.isSafeInteger(generationLimit) || generationLimit < 0)) throw new RangeError("generationLimit must be a nonnegative safe integer");
    const options = rule.inner.options;
    const count = options?.count ?? null;
    if (count != null && count <= 0) return;
    const until = options?.until ?? null;
    const untilWall = untilWallOverride !== undefined
      ? untilWallOverride
      : (until?.nt != null ? until.extend() : null);
    const untilDay = until != null && until.nt == null ? until.trunc() : null;
    const ended = (at: NaiveDateTime) =>
      untilWall != null
        ? at.mse > untilWall.mse
        : untilDay != null && (useGoogleCalendarBehavior ? at.date.dse >= untilDay.dse : at.date.dse > untilDay.dse);

    const cutoff = Math.min(horizonMs, untilWall?.mse ?? (untilDay != null
      ? (untilDay.dse + (useGoogleCalendarBehavior ? 0 : 1)) * Time.MS_PER_DAY - 1 : Infinity));
    let emitted = 0;
    const calendar = options?.googleJulianCalendar;
    const startDate = calendar === "nominal" ? googleDateToNominal(dtstart.date)
      : calendar === "continuous" ? googleDateToGregorian(dtstart.date) : dtstart.date;
    const startMse = startDate.mse + dtstart.time.toMs;
    for (const candidate of candidates(
      rule, dtstart, useGoogleCalendarBehavior, generationLimit, ignoreTimeParts, cutoff,
      useGoogleYearlyWeeks, clipFirstWeek && rule.inner.freq === "weekly", countRepeatedSetPositions, referenceCalendar,
      window,
    )) {
      if (candidate == null) {
        yield null;
        continue;
      }
      const rewoundYear = options?.googleYearlyOrdinalRewind && candidate.date.yr < dtstart.date.yr;
      if (candidate.mse < startMse && !rewoundYear &&
        !options?.dateutilCheckUntilBeforeStart && referenceCalendar == null) continue;

      const date = calendar === "nominal" ? googleNominalToDate(candidate.date)
        : calendar === "continuous" ? gregorianToGoogleDate(candidate.date) ??
          (options?.bymonth?.length || options?.bymonthday?.length || options?.bynthday?.length
            ? gregorianToGoogleDate(candidate.date.addDays(1))
            : null)
        : candidate.date;
      if (date == null) {
        // A Julian leap day can consume COUNT even when the API cannot write it.
        if (count != null && ++emitted >= count) return;
        continue;
      }
      const at = date === candidate.date ? candidate : date.withTime(candidate.time);
      if (ended(at) || at.mse > cutoff) return;
      if (referenceCalendar != null && at.mse < dtstart.mse) continue;
      if (generationLimit != null && emitted >= generationLimit) throw new RecurrenceExpansionLimitError(generationLimit);
      yield at;
      emitted++;
      if (count != null && emitted >= count) return;
    }
  }

  /** The positions BYSETPOS names in `sorted` (1-based from the start, negative from the end), in order. */
  export function pickSetPos<T>(sorted: readonly T[], positions: readonly number[]): T[] {
    return setPositionIndices(sorted.length, positions, false).map((i) => sorted[i]);
  }

  function setPositionIndices(
    size: number,
    positions: readonly number[],
    countRepeated: boolean,
    rruleJsTimesPerDay?: number,
  ): number[] {
    const indices: number[] = [];
    for (const position of positions) {
      const offset = position < 0 ? position : position - 1;
      let index = offset < 0 ? size + offset : offset;
      if (index < 0 && size > 0 && rruleJsTimesPerDay != null) {
        // rrule.js slices the day list with the negative day position. A
        // position past the front selects the first day and keeps the time.
        index = ((offset % rruleJsTimesPerDay) + rruleJsTimesPerDay) %
          rruleJsTimesPerDay;
      }
      if (position === 0 && rruleJsTimesPerDay == null) continue;
      if (index >= 0 && index < size) indices.push(index);
      // Invalid dates take part in the reference sort before iteration skips them.
      else if (rruleJsTimesPerDay != null) indices.push(NaN);
    }
    if (rruleJsTimesPerDay != null) return indices.some(Number.isFinite) ? indices : [];
    return (countRepeated ? indices : [...new Set(indices)]).sort((a, b) => a - b);
  }

  /** Every period's set, from DTSTART's period on: not yet cut at DTSTART, UNTIL or COUNT. */
  function candidates(
    rule: RRule,
    dtstart: NaiveDateTime,
    google: boolean,
    generationLimit?: number,
    ignoreTimeParts: boolean = false,
    horizonMs: number = Infinity,
    useGoogleYearlyWeeks: boolean = false,
    clipFirstWeek: boolean = false,
    countRepeatedSetPositions = false,
    referenceCalendar?: RruleJsCalendar,
    window?: Window,
  ): Generator<NaiveDateTime | null> {
    switch (rule.inner.freq) {
      case "hourly":
      case "minutely":
      case "secondly":
        return subDaily(rule, dtstart, google, generationLimit, ignoreTimeParts, horizonMs, countRepeatedSetPositions, referenceCalendar, window);
      default:
        if (referenceCalendar != null) return rruleJsByDay(rule, dtstart, referenceCalendar, horizonMs, generationLimit, ignoreTimeParts);
        return byDay(rule, dtstart, google, generationLimit, ignoreTimeParts, horizonMs, useGoogleYearlyWeeks, clipFirstWeek, countRepeatedSetPositions, window);
    }
  }

  function referenceOffsetRange(rule: RRule, start: NaiveDateTime): { low: number; high: number } {
    // The counter cannot use a period after the last week of year 9999.
    // An encoded early year may later jump back to literal year 100.
    const options = rule.inner.options;
    const canRewind = options?.rruleJsIntervalText != null || (options?.interval ?? 1) < 0;
    const firstYear = canRewind || start.date.yr < 100 ? 100 : start.date.yr;
    const nominalStart = Date.UTC(firstYear, 0, 1) - 7 * Time.MS_PER_DAY;
    const finalYear = Math.max(10000, start.date.yr + 1);
    return { low: -JS_DATE_LIMIT - Date.UTC(finalYear, 0, 8), high: JS_DATE_LIMIT - nominalStart };
  }

  function mayProjectReferenceOffset(offset: number, range: { low: number; high: number }): boolean {
    return offset >= range.low && offset <= range.high;
  }

  type ClockField = "byhour" | "byminute" | "bysecond";
  type ClockOptions = RRule["inner"]["options"];
  type ClockValue = number | string;

  function expandedClock(options: ClockOptions, field: ClockField, fallback: number): string | readonly ClockValue[] {
    if (options?.dateutilEmptyClock && options[field]?.length === 0) return [];
    return options?.rruleJsClockText?.[field] ?? nonEmpty(options?.[field]) ?? [fallback];
  }

  function clockNumber(value: ClockValue): number {
    return Math.trunc(Number(value));
  }

  function clockOffset(hour: ClockValue, minute: ClockValue, second: ClockValue, truncate = true): number {
    const toNumber = truncate ? clockNumber : Number;
    return toNumber(hour) * Time.MS_PER_HR + toNumber(minute) * Time.MS_PER_MIN +
      toNumber(second) * Time.MS_PER_SEC;
  }

  function limitingClock(options: ClockOptions, field: ClockField, max: number): Option<readonly number[]> {
    const text = options?.rruleJsClockText?.[field];
    if (text == null) return nonEmpty(options?.[field]);
    if (text === "") return null;
    const matches = typeof text === "string"
      ? Array.from({ length: max + 1 }, (_, i) => i).filter((i) => text.includes(String(i)))
      : text.filter((value) => typeof value === "number");
    // An empty match set must still limit the clock.
    return matches.length === 0 ? [Infinity] : matches;
  }

  function rruleJsSubdailyOffsets(
    hour: number,
    periodMinute: number,
    minutes: readonly ClockValue[],
    seconds: readonly ClockValue[],
    milliseconds: number,
    hourly: boolean,
  ): number[] {
    const make = (minute: ClockValue, second: ClockValue) => {
      const base = hour * 3600 + Number(minute) * 60;
      // Time.getTime adds the seconds before multiplication, so a string
      // second can concatenate with the preceding clock fields when sorting.
      const sortKey = typeof second === "string" ? Number(String(base) + second) : base + second;
      const offset = clockOffset(0, hourly ? minute : 0, second) + milliseconds;
      return { sortKey, offset };
    };
    const byKey = (a: ReturnType<typeof make>, b: ReturnType<typeof make>) => a.sortKey - b.sortKey;
    const groups = minutes.flatMap((minute) =>
      seconds.map((second) => make(hourly ? minute : periodMinute, second)).sort(byKey));
    if (hourly) groups.sort(byKey);
    return groups.map(({ offset }) => offset);
  }

  function clockOffsetBoundary(
    values: readonly number[],
    precedesBoundary: (value: number) => boolean,
  ): number {
    let first = 0;
    let end = values.length;
    while (first < end) {
      const mid = Math.floor((first + end) / 2);
      if (precedesBoundary(values[mid])) first = mid + 1;
      else end = mid;
    }
    return first;
  }

  function referenceClockBounds(
    hours: readonly ClockValue[],
    minutes: readonly ClockValue[],
    seconds: readonly ClockValue[],
    range: { low: number; high: number },
  ): { lower: number; upper: number } {
    const dimensions = [
      [hours, Time.MS_PER_HR],
      [minutes, Time.MS_PER_MIN],
      [seconds, Time.MS_PER_SEC],
    ] as const;
    // Repeated slots matter to iteration and BYSETPOS. Each distinct
    // contribution needs to be considered only once for the bounds.
    const axes = dimensions.map(([values, unit]) =>
      [...new Set(values.map((value) => clockNumber(value) * unit).filter(Number.isFinite))]
        .sort((a, b) => a - b)
    );
    const empty = { lower: Infinity, upper: -Infinity };
    if (axes.some((axis) => axis.length === 0)) return empty;

    const min = axes[0][0] + axes[1][0] + axes[2][0];
    const max = axes[0].at(-1)! + axes[1].at(-1)! + axes[2].at(-1)!;
    if (max < range.low || min > range.high) return empty;
    if (min >= range.low && max <= range.high) return { lower: min, upper: max };

    // An extreme clock can fall outside the Date range. Find the first and
    // last projectable offset on the largest sorted axis for each fixed pair.
    // Combining terms in clockOffset's order preserves numeric rounding.
    const search = axes.reduce((largest, axis, i) =>
      axis.length > axes[largest].length ? i : largest, 0);
    const [first, second] = [0, 1, 2].filter((i) => i !== search);
    if (axes[first].length * axes[second].length > CLOCK_BOUNDARY_PAIR_LIMIT) {
      // Cursor construction only needs an enclosing interval. Bound the
      // search here and let the grid allocation check apply the caller's
      // budget if the cursor actually reads the rule.
      return { lower: Math.max(min, range.low), upper: Math.min(max, range.high) };
    }
    const values = axes[search];
    const parts = [0, 0, 0];
    const offset = (value: number) => {
      parts[search] = value;
      return parts[0] + parts[1] + parts[2];
    };
    let lower = min >= range.low ? min : Infinity;
    let upper = max <= range.high ? max : -Infinity;
    for (const a of axes[first]) {
      parts[first] = a;
      for (const b of axes[second]) {
        parts[second] = b;
        if (min < range.low) {
          const i = clockOffsetBoundary(values, (value) => offset(value) < range.low);
          if (i < values.length) {
            const candidate = offset(values[i]);
            if (candidate <= range.high) lower = Math.min(lower, candidate);
          }
        }
        if (max > range.high) {
          const end = clockOffsetBoundary(values, (value) => offset(value) <= range.high);
          if (end > 0) {
            const candidate = offset(values[end - 1]);
            if (candidate >= range.low) upper = Math.max(upper, candidate);
          }
        }
      }
    }
    return { lower, upper };
  }

  /** Extra cursor lookahead when a reference clock selector crosses its normal range. */
  export function rruleJsClockLookahead(rule: RRule, start: NaiveDateTime, ignoreTimeParts: boolean): number {
    const { freq, options } = rule.inner;
    if (!options?.rruleJsClock || ignoreTimeParts) return 0;
    const dayLevel = freq !== "hourly" && freq !== "minutely" && freq !== "secondly";
    const hours = dayLevel ? expandedClock(options, "byhour", start.time.hrs) : [0];
    const minutes = dayLevel || freq === "hourly"
      ? expandedClock(options, "byminute", start.time.mins)
      : [0];
    const seconds = freq !== "secondly" ? expandedClock(options, "bysecond", start.time.secs) : [0];
    if (typeof hours === "string" || typeof minutes === "string" || typeof seconds === "string") return 0;
    const fractional = options.bysetpos?.some((position) => !Number.isInteger(position));
    const rewinds = (options.interval ?? 1) < 0;
    // A first period can span dates later than DTSTART. An expanded clock
    // in an earlier period can return to the query window after those dates.
    const periodLookahead = rewinds && dayLevel
      ? (freq === "yearly" ? 366 : freq === "monthly" ? 31 : freq === "weekly" ? 7 : 1) * Time.MS_PER_DAY
      : 0;
    const carries = hours.some((h) => Number(h) < 0 || Number(h) > 23) ||
      minutes.some((m) => Number(m) < 0 || Number(m) > 59) ||
      seconds.some((s) => Number(s) < 0 || Number(s) > 59);
    if (!fractional && !carries) return periodLookahead;
    const range = referenceOffsetRange(rule, start);
    const bounds = referenceClockBounds(hours, minutes, seconds, range);
    const lower = Math.min(bounds.lower, fractional ? dayLevel ? 0 : -Time.MS_PER_DAY : rewinds ? 0 : Infinity);
    const upper = Math.max(bounds.upper, fractional ? Time.MS_PER_DAY : -Infinity);
    return periodLookahead + Math.max(0, upper - lower);
  }

  function rruleJsPositionsFit(rule: RRule, timesPerDay: number): boolean {
    const { freq, options } = rule.inner;
    if (!options?.rruleJsClock || !options.bysetpos?.length) return true;
    const days = freq === "yearly" ? 366 : freq === "monthly" ? 31 : freq === "weekly" ? 7 : 1;
    // The last fractional time slot can still select the day's host clock.
    return options.bysetpos.some((position) => position < days * timesPerDay + 1);
  }

  function checkClockGrid(generationLimit: number | undefined, size: number): void {
    if (generationLimit != null && size > Math.max(generationLimit, CLOCK_GRID_ALLOWANCE)) {
      throw new RecurrenceExpansionLimitError(generationLimit);
    }
  }

  /** The times of day BYHOUR × BYMINUTE × BYSECOND name (DTSTART's for a part not given). */
  function timesOfDay(
    rule: RRule,
    dtstart: NaiveDateTime,
    ignoreTimeParts: boolean = false,
    generationLimit?: number,
  ): number[] {
    const options = rule.inner.options;
    const t = dtstart.time;
    const rruleJs = options?.rruleJsClock === true;
    const clockValues = (field: ClockField, fallback: number): readonly ClockValue[] => {
      if (ignoreTimeParts) return [fallback];
      if (rruleJs) {
        const expanded = expandedClock(options, field, fallback);
        if (typeof expanded === "string") throw new RangeError("opts." + field + ".forEach is not a function");
        return expanded;
      }
      if (options?.dateutilEmptyClock && options[field]?.length === 0) return [];
      const selected = nonEmpty(options?.[field]) ?? [fallback];
      return [...new Set(selected)];
    };
    const hours = clockValues("byhour", t.hrs);
    const minutes = clockValues("byminute", t.mins);
    const seconds = clockValues("bysecond", t.secs);
    if (rruleJs) checkClockGrid(generationLimit, hours.length * minutes.length * seconds.length);
    const ms: number[] = [];
    for (const h of hours) {
      for (const m of minutes) {
        for (const s of seconds) {
          if (!rruleJs && (Number(h) < 0 || Number(h) > 23 || Number(m) < 0 ||
              Number(m) > 59 || Number(s) < 0 || Number(s) > 59)) continue;
          // Keep one slot per selector combination, including invalid Dates.
          ms.push(clockOffset(h, m, s, rruleJs) + t.ms);
        }
      }
    }
    // rrule.js uses the input's Cartesian product order for day-level rules.
    if (!rruleJs) ms.sort((a, b) => a - b);
    else {
      const range = referenceOffsetRange(rule, dtstart);
      if (!ms.some((offset) => mayProjectReferenceOffset(offset, range)) &&
          !options?.bysetpos?.some((position) => !Number.isInteger(position))) return [];
    }
    return ms;
  }

  function timeOnDay(day: NaiveDate, offset: number): NaiveDateTime {
    return NaiveDateTime.fromMse((day.mse + offset) as MsSinceEpoch);
  }

  function* rruleJsByDay(
    rule: RRule,
    dtstart: NaiveDateTime,
    calendar: RruleJsCalendar,
    cutoff: number,
    generationLimit?: number,
    ignoreTimeParts?: boolean,
  ): Generator<NaiveDateTime> {
    const times = timesOfDay(rule, dtstart, ignoreTimeParts, generationLimit);
    if (times.length === 0 || !rruleJsPositionsFit(rule, times.length)) return;
    const setpos = nonEmpty(rule.inner.options?.bysetpos);
    // A JS Date before 1970 supplies a negative remainder to the time grid.
    const correction = dtstart.mse < 0 && dtstart.time.ms !== 0 ? Time.MS_PER_SEC : 0;
    const at = (day: NaiveDate, offset: number) => rruleJsWallTime(day.mse + offset - correction);
    const range = referenceOffsetRange(rule, dtstart);
    const earliestTime = times.reduce((earliest, offset) =>
      mayProjectReferenceOffset(offset - correction, range) ? Math.min(earliest, offset) : earliest,
      correction);
    const latestTime = times.reduce((latest, offset) =>
      mayProjectReferenceOffset(offset - correction, range) ? Math.max(latest, offset) : latest,
      setpos == null ? 0 : Time.MS_PER_DAY);
    const earliestDay = Math.min(dtstart.mse, cutoff) + correction - latestTime;
    let examined = 0;
    for (const days of calendar.periodDays(cutoff + correction - earliestTime, earliestDay)) {
      if (generationLimit != null && ++examined > generationLimit) throw new RecurrenceExpansionLimitError(generationLimit);
      if (setpos == null) {
        for (const day of days) for (const time of times) {
          const wall = at(day, time);
          if (wall != null) yield wall;
        }
      } else {
        const indices = setPositionIndices(days.length * times.length, setpos, true, times.length);
        yield* rruleJsPositions(days, times, indices, at, rule.inner.options?.rruleJsHostZone);
      }
    }
  }

  function rruleJsWallTime(mse: number): NaiveDateTime | null {
    return Math.abs(mse) <= JS_DATE_LIMIT
      ? NaiveDateTime.fromMse(mse as MsSinceEpoch)
      : null;
  }

  function rruleJsMidnightClock(midnight: NaiveDateTime, hostZone?: Option<TimezoneRegion>): NaiveDateTime {
    const offset = hostZone?.tzAtMse(midnight.mse).info.offset.toMs ?? 0;
    const clock = ((offset % Time.MS_PER_DAY) + Time.MS_PER_DAY) % Time.MS_PER_DAY;
    return midnight.add({ ms: clock });
  }

  function* rruleJsPositions(
    days: readonly NaiveDate[],
    times: readonly number[],
    indices: readonly number[],
    at: (day: NaiveDate, offset: number) => NaiveDateTime | null,
    hostZone?: Option<TimezoneRegion>,
  ): Generator<NaiveDateTime> {
    const selected = indices.map((i) => {
      if (Number.isNaN(i)) return null;
      const day = days[Math.floor(i / times.length)];
      const time = times[i % times.length];
      return time == null ? rruleJsMidnightClock(day.withTime(), hostZone) : at(day, time);
    });
    selected.sort((a, b) => (a?.mse ?? NaN) - (b?.mse ?? NaN));
    for (const value of selected) if (value != null) yield value;
  }

  function googleWeekNumber(date: NaiveDate, weekStart: Weekday, julianCalendar: boolean): number {
    const daysIntoWeek = (date.dayOfWeek.dow - weekStart.dow + 7) % 7;
    const week = date.addDays(-daysIntoWeek);
    // The week containing January 1 is week zero, even when it starts in December.
    const end = week.addDays(6);
    const year = julianCalendar ? gregorianToGoogleDateOnOrBefore(end).yr : end.yr;
    const january = NaiveDate.fromYmd1Exp(year, 1, 1);
    const first = julianCalendar ? googleDateToGregorian(january) : january;
    const lead = (first.dayOfWeek.dow - weekStart.dow + 7) % 7;
    return (week.dse - first.dse + lead) / 7;
  }

  /** YEARLY, MONTHLY, WEEKLY or DAILY: each period's days (the date generator's filters) at each time of day. */
  function* byDay(
    rule: RRule,
    dtstart: NaiveDateTime,
    google: boolean,
    generationLimit?: number,
    ignoreTimeParts: boolean = false,
    horizonMs: number = Infinity,
    useGoogleYearlyWeeks: boolean = false,
    clipFirstWeek: boolean = false,
    countRepeatedSetPositions = false,
    window?: Window,
  ): Generator<NaiveDateTime | null> {
    const options = rule.inner.options;
    const positiveWeeklyPositions = options?.googlePositiveWeeklyPositions === true;
    const selectFromGrid = clipFirstWeek || countRepeatedSetPositions || positiveWeeklyPositions ||
      (options?.rruleJsClock === true && Boolean(options.bysetpos?.length));
    const props = rule.toFilterProps(
      null, null, google, null, ignoreTimeParts, useGoogleYearlyWeeks ? dtstart.date : undefined, selectFromGrid,
    );
    const step = props.step;
    const filter = filterOf(props);
    // Without time parts the day filter already applied BYSETPOS (`toFilterProps`).
    const setpos = selectFromGrid || (!ignoreTimeParts && rule.hasTimeParts())
      ? nonEmpty(rule.inner.options?.bysetpos)
      : null;
    const times = timesOfDay(rule, dtstart, ignoreTimeParts, generationLimit);
    if ((times.length === 0 && !options?.dateutilValidateEmptyCalendar) || !rruleJsPositionsFit(rule, times.length)) return;
    const rruleJs = rule.inner.options?.rruleJsClock === true;
    const latestTime = rruleJs
      ? times.reduce((latest, offset) => Number.isFinite(offset) ? Math.max(latest, offset) : latest, -Infinity)
      : times[times.length - 1];
    const range = referenceOffsetRange(rule, dtstart);
    const earliestTime = rruleJs
      ? times.reduce((earliest, offset) =>
        mayProjectReferenceOffset(offset, range) ? Math.min(earliest, offset) : earliest, 0)
      : 0;
    const referenceTime = (day: NaiveDate, offset: number) => rruleJsWallTime(day.mse + offset);

    const julianCalendar = options?.googleJulianCalendar === "continuous";
    const axisStart = julianCalendar ? googleDateToGregorian(dtstart.date) : dtstart.date;
    const axisStartMse = options?.googleJulianCalendar === "nominal"
      ? googleDateToNominal(dtstart.date).mse + dtstart.time.toMs
      : axisStart.mse + dtstart.time.toMs;
    let start: NaiveDate.MaybeValid = options?.dateutilPeriodStart ??
      (options?.rfcWeekYear
        ? NaiveDate.fromYmd1Exp(weekYearOf(dtstart.date, options.wkst ?? Weekday.MON), 1, 1)
        : axisStart);
    const weekStart = props.options?.weekStart ?? axisStart.dayOfWeek;
    if (step.type === "week" && options?.dateutilPeriodStart == null) {
      let diff = start.dayOfWeek.dow - weekStart.dow;
      if (diff < 0) diff += 7;
      if (diff !== 0) start = axisStart.addDays(-diff);
    }

    let examined = 0;
    let idle = 0;
    const boundedCalendar = options?.dateutilBoundedCalendar ||
      (rruleJs && options?.rruleJsIntervalText == null);
    const limitIdle = window == null && generationLimit == null &&
      !Number.isFinite(horizonMs) && !boundedCalendar;
    let firstPeriod = true;
    let priorWeekNumber: number | undefined;
    const periods = props.options?.periods?.(start) ?? NaiveDate.ndsucc(start, step, Number.MAX_SAFE_INTEGER);
    for (const period of periods) {
      if (options?.dateutilSinglePeriod && !firstPeriod) return;
      if (period.yr > 9999 && (options?.dateutilBoundedCalendar || (rruleJs && !firstPeriod))) return;
      firstPeriod = false;
      const firstDay = step.type === "year" ? NaiveDate.fromYmd1Exp(period.yr, 1, 1)
        : step.type === "month" ? NaiveDate.fromYmd1Exp(period.yr, period.mth, 1) : period;
      // BYWEEKNO may select the preceding year's final days.
      const slack = props.options?.periodLookbehindDays ?? 0;
      const firstDate = julianCalendar
        ? gregorianToGoogleDateOnOrBefore(firstDay.castValid())
        : firstDay;
      const earliest = (firstDate.dse - slack) * Time.MS_PER_DAY + earliestTime;
      if (earliest > horizonMs) return;
      while (window != null && earliest > window.endMse) yield null;
      const ordinalMaskError = options?.dateutilOrdinalMaskError;
      if (ordinalMaskError != null && firstDay.dse >= ordinalMaskError.period.dse) {
        throw new RangeError(ordinalMaskError.message);
      }
      if (generationLimit != null && ++examined > generationLimit) throw new RecurrenceExpansionLimitError(generationLimit);
      let first: NaiveDate | undefined;
      let days: Map<number, NaiveDate> | undefined;
      for (const [day] of filter([period, step.type])) {
        const valid = day.toResult().asOk();
        // The first weekly day set in dateutil and rrule.js starts on DTSTART's
        // date. Times on that date still participate in selecting positions.
        if (valid == null || (clipFirstWeek && valid.dse < dtstart.date.dse)) continue;
        if (first === undefined) {
          // A period with one date needs neither deduplication nor sorting.
          first = valid;
        } else {
          if (days === undefined) {
            days = new Map();
            days.set(first.dse, first);
          }
          days.set(valid.dse, valid);
        }
      }
      const sorted = days === undefined ? (first === undefined ? [] : [first])
        : [...days.values()].sort((a, b) => a.dse - b.dse);
      if (times.length === 0 && (sorted.at(-1)?.yr ?? 0) > 9999) {
        throw new RangeError("year 10000 is out of range");
      }
      // Select positions by index, or yield the grid lazily. A yearly rule
      // can describe millions of candidates; COUNT and caller budgets must
      // stop iteration before that whole product is materialized.
      const size = sorted.length * times.length;
      const indices = setpos == null ? null : setPositionIndices(size, setpos, countRepeatedSetPositions, rruleJs ? times.length : undefined);
      if (positiveWeeklyPositions && indices?.length) {
        // Even a position before DTSTART occupies its week number.
        const number = googleWeekNumber(period.castValid(), options?.wkst ?? Weekday.MON, julianCalendar);
        if (number === priorWeekNumber) continue;
        priorWeekNumber = number;
      }
      const last = size === 0 ? null : sorted[sorted.length - 1].mse + latestTime;
      // Periods wholly before DTSTART (none: the first period holds it) and empty ones count toward the idle limit.
      if (last == null || (indices != null && indices.length === 0) ||
        (last < axisStartMse && !options?.dateutilCheckUntilBeforeStart &&
          !(options?.googleYearlyOrdinalRewind && period.yr < dtstart.date.yr))) {
        if (limitIdle && ++idle >= IDLE_LIMIT) return;
        continue;
      }
      idle = 0;
      if (indices != null) {
        if (options?.dateutilBoundedCalendar &&
          indices.some((i) => sorted[Math.floor(i / times.length)].yr > 9999)) {
          throw new RangeError("year 10000 is out of range");
        }
        if (rruleJs) {
          yield* rruleJsPositions(sorted, times, indices, referenceTime, options?.rruleJsHostZone);
        } else {
          for (const i of indices) yield timeOnDay(sorted[Math.floor(i / times.length)], times[i % times.length]);
        }
      } else {
        for (const day of sorted) for (const time of times) {
          const wall = rruleJs ? referenceTime(day, time) : timeOnDay(day, time);
          if (wall != null) yield wall;
        }
      }
    }
  }

  /**
   * HOURLY, MINUTELY or SECONDLY: periods of the frequency's unit, every
   * INTERVAL units from DTSTART's. The date parts and the time parts at or
   * above the unit limit which periods count (a day the date parts refuse
   * is skipped whole); the time parts below it expand each period.
   */
  function* subDaily(
    rule: RRule,
    dtstart: NaiveDateTime,
    google: boolean,
    generationLimit?: number,
    ignoreTimeParts: boolean = false,
    horizonMs: number = Infinity,
    countRepeatedSetPositions = false,
    referenceCalendar?: RruleJsCalendar,
    window?: Window,
  ): Generator<NaiveDateTime | null> {
    const options = rule.inner.options;
    const freq = rule.inner.freq;
    const unitMs = freq === "hourly" ? Time.MS_PER_HR : freq === "minutely" ? Time.MS_PER_MIN : Time.MS_PER_SEC;
    const interval = options?.interval ?? 1;
    const rruleJs = options?.rruleJsClock === true;
    const hasReferenceCalendar = rruleJs && referenceCalendar != null;
    const rewindingReference = hasReferenceCalendar && interval < 0;
    // A positive interval above the safe integer range advances past
    // rrule.js's calendar even at the one-second frequency.
    const beyondReferenceCalendar = hasReferenceCalendar && interval > Number.MAX_SAFE_INTEGER;
    if (!rewindingReference && !beyondReferenceCalendar && (!Number.isSafeInteger(interval) || interval < 0)) {
      throw new RangeError("recurrence interval must be a nonnegative safe integer");
    }
    const stepMs = unitMs * Math.max(1, interval);
    const negativeInterval = options?.dateutilNegativeInterval;
    const backward = negativeInterval == null
      ? undefined
      : dateutilBackwardClock(rule.inner, BigInt(negativeInterval), generationLimit);
    const setpos = nonEmpty(options?.bysetpos);
    const byhour = ignoreTimeParts ? null : rruleJs
      ? limitingClock(options, "byhour", 23) : nonEmpty(options?.byhour);
    const byminute = ignoreTimeParts ? null : rruleJs
      ? limitingClock(options, "byminute", 59) : nonEmpty(options?.byminute);
    const bysecond = ignoreTimeParts ? null : rruleJs
      ? limitingClock(options, "bysecond", 59) : nonEmpty(options?.bysecond);
    const t = dtstart.time;
    const hourly = freq === "hourly";
    const secondly = freq === "secondly";

    // The parts below the frequency expand each period's clock.
    const minutes = hourly ? ignoreTimeParts ? [t.mins] : expandedClock(options, "byminute", t.mins) : [0];
    const seconds = secondly ? [0] : ignoreTimeParts ? [t.secs] : expandedClock(options, "bysecond", t.secs);
    const minuteGrid = typeof minutes === "string" ? [] : minutes;
    const secondGrid = typeof seconds === "string" ? [] : seconds;
    const invalidGrid = typeof minutes === "string" ? "this.options.byminute.forEach is not a function"
      : typeof seconds === "string" ? "this.options.bysecond.map is not a function" : null;
    if (invalidGrid &&
        (byhour == null || byhour.includes(t.hrs)) &&
        (hourly || byminute == null || byminute.includes(t.mins)) &&
        (!secondly || bysecond == null || bysecond.includes(t.secs))) {
      throw new RangeError(invalidGrid);
    }
    const hasText = minuteGrid.some((value) => typeof value === "string") ||
      secondGrid.some((value) => typeof value === "string");
    if (rruleJs) checkClockGrid(generationLimit, minuteGrid.length * secondGrid.length);
    const candidates: number[] = [];
    for (const minute of minuteGrid) {
      for (const second of secondGrid) {
        const offset = clockOffset(0, minute, second, rruleJs) + t.ms;
        if (rruleJs || (offset >= 0 && offset < unitMs)) candidates.push(offset);
      }
    }
    const offsets = (rruleJs ? candidates : [...new Set(candidates)]).sort((a, b) => a - b);
    const validateEmptyDateutilDays = options?.dateutilValidateEmptyCalendar && offsets.length === 0;
    if (backward == null && !invalidGrid &&
        ((offsets.length === 0 && !validateEmptyDateutilDays) || !rruleJsPositionsFit(rule, offsets.length))) return;
    if (rruleJs && !invalidGrid) {
      const range = referenceOffsetRange(rule, dtstart);
      if (!offsets.some((offset) => mayProjectReferenceOffset(offset, range)) && setpos == null) return;
    }

    // The forward dateutil scan checks clock errors before entering this
    // generator. An out-of-grid position can only leave calendar mask work.
    const emptyDateutilPositions = backward == null && options?.dateutilBoundedCalendar &&
      generationLimit == null && setpos != null &&
      !setpos.some((position) => Math.abs(position) <= offsets.length);
    if (emptyDateutilPositions && options?.byeaster == null) return;

    const dayOk = referenceCalendar == null
      ? dayFilter(rule, google)
      : (day: NaiveDate) => referenceCalendar.keepsDay(day, rewindingReference);
    const first = Math.floor((referenceCalendar?.axisStart ?? dtstart.mse) / unitMs) * unitMs;

    const useLibraryClock = rruleJs && freq !== "hourly" &&
      (byhour != null || (freq === "secondly" && byminute != null));
    const libraryClock = useLibraryClock
      ? rruleJsSubdailyClock(unitMs, Math.max(1, interval), byhour, byminute, bysecond)
      : undefined;
    const referenceClock = referenceCalendar?.subdailyClock(unitMs, [byhour, byminute, bysecond]);
    const ownClock = hourly ? byhour : secondly ? bysecond : byminute;
    const clockBase = hourly ? 24 : 60;
    const firstClock = hourly ? t.hrs : secondly ? t.secs : t.mins;
    // Without field carries the limiting selector follows a small modular
    // cycle. Preserve the first period's negative-position fallback even
    // when no subsequent period can pass the clock selector.
    const cannotReachClock = rruleJs && generationLimit == null &&
      referenceClock == null && libraryClock == null && ownClock != null &&
      !Array.from({ length: clockBase }, (_, i) =>
        (firstClock + i * (interval % clockBase)) % clockBase
      ).some((clock) => ownClock.includes(clock));
    let periodMs = first;
    let firstIteration = true;
    let examined = 0;
    let idle = 0;
    const boundedCalendar = options?.dateutilBoundedCalendar ||
      (rruleJs && options?.rruleJsIntervalText == null);
    const limitIdle = window == null && generationLimit == null &&
      !Number.isFinite(horizonMs) && !boundedCalendar;
    let period: NaiveDateTime;
    const advance = (minimum = periodMs + stepMs, skipDay = false) => {
      firstIteration = false;
      if (backward != null) {
        periodMs = backward(period, skipDay);
        return;
      }
      periodMs = beyondReferenceCalendar || cannotReachClock || options?.dateutilSinglePeriod ? Infinity
        : referenceClock != null ? referenceClock(skipDay)
        : libraryClock != null ? libraryClock(periodMs, skipDay)
        : periodMs + Math.max(1, Math.ceil((minimum - periodMs) / stepMs)) * stepMs;
    };
    const range = referenceOffsetRange(rule, dtstart);
    const earliestOffset = rruleJs
      ? Math.min(setpos?.some((position) => !Number.isInteger(position)) ? -Time.MS_PER_DAY : 0,
        offsets.reduce((earliest, offset) =>
          mayProjectReferenceOffset(offset, range) ? Math.min(earliest, offset) : earliest, 0) - t.ms)
      : 0;
    const latestOffset = rewindingReference
      ? offsets.reduce((latest, offset) => mayProjectReferenceOffset(offset, range)
        ? Math.max(latest, offset) : latest, 0)
      : 0;
    while (Number.isFinite(periodMs) && (invalidGrid != null || referenceCalendar != null || periodMs + earliestOffset <= horizonMs)) {
      if (rewindingReference && invalidGrid == null &&
        referenceCalendar.clockMse(periodMs, latestOffset) < Math.min(dtstart.mse, horizonMs)) {
        // An accepted day rewinds the period. A skipped day can revisit
        // clocks only within that rejected day, which has no candidates.
        return;
      }
      while (window != null && periodMs + earliestOffset > window.endMse) yield null;
      period = referenceCalendar == null || rewindingReference
        ? NaiveDateTime.fromMse(periodMs as MsSinceEpoch)
        : referenceCalendar.axisDateTime(periodMs);
      if (period.date.yr > 9999 &&
        (options?.dateutilBoundedCalendar || (rruleJs && !firstIteration))) return;
      if (!rewindingReference && invalidGrid == null && referenceCalendar != null &&
        !referenceCalendar.counterIsEarly && period.mse + earliestOffset > horizonMs) return;
      if (generationLimit != null && ++examined > generationLimit) throw new RecurrenceExpansionLimitError(generationLimit);
      if (limitIdle && ++idle > IDLE_LIMIT) return;

      const time = period.time;
      const filteredHour = byhour != null && !byhour.includes(time.hrs);
      const filteredMinute = !hourly && byminute != null && !byminute.includes(time.mins);
      const filteredSecond = secondly && bysecond != null && !bysecond.includes(time.secs);
      if (invalidGrid && !filteredHour && !filteredMinute && !filteredSecond) {
        throw new RangeError(invalidGrid);
      }
      if (backward != null && firstIteration && !filteredHour && !filteredMinute && !filteredSecond) {
        validateDateutilExpandedClock(rule.inner);
      }
      const filteredDay = !dayOk(period.date);
      if (filteredDay && options?.dateutilSinglePeriod) {
        throw new RangeError("integer division or modulo by zero");
      }
      if (filteredDay || emptyDateutilPositions || validateEmptyDateutilDays) {
        advance((Math.floor(periodMs / Time.MS_PER_DAY) + 1) * Time.MS_PER_DAY, true);
        continue;
      }
      if (rruleJs && firstIteration && setpos != null &&
        (filteredHour || filteredMinute || filteredSecond)) {
        // A negative position can pick the day despite the empty time set.
        // combine then reads that midnight Date's clock in the reference host.
        const midnight = referenceCalendar?.projectClock(Math.floor(periodMs / Time.MS_PER_DAY) * Time.MS_PER_DAY, 0) ??
          period.date.withTime();
        for (const position of setpos) {
          if (position < 0) yield rruleJsMidnightClock(midnight, options?.rruleJsHostZone);
        }
      }
      if (filteredHour) {
        advance(Math.floor(periodMs / Time.MS_PER_HR + 1) * Time.MS_PER_HR);
        continue;
      }
      if (filteredMinute) {
        advance(Math.floor(periodMs / Time.MS_PER_MIN + 1) * Time.MS_PER_MIN);
        continue;
      }
      if (filteredSecond) {
        advance();
        continue;
      }

      // rrule.js rebuilds later subdaily time sets with zero milliseconds.
      const correction = rruleJs && !firstIteration ? t.ms
        : referenceCalendar != null && dtstart.mse < 0 && t.ms !== 0 ? Time.MS_PER_SEC : 0;
      const project = (o: number) => {
        const mse = referenceCalendar?.clockMse(periodMs, o - correction) ??
          periodMs + o - correction;
        return rruleJs ? rruleJsWallTime(mse) : NaiveDateTime.fromMse(mse as MsSinceEpoch);
      };
      const periodOffsets = hasText
        ? rruleJsSubdailyOffsets(time.hrs, time.mins, minuteGrid, secondGrid, t.ms, hourly)
        : offsets;
      const indices = setpos == null ? null
        : setPositionIndices(periodOffsets.length, setpos, countRepeatedSetPositions, rruleJs ? periodOffsets.length : undefined);
      const selected = indices == null ? periodOffsets.map(project) : indices.map((i) => {
        if (Number.isNaN(i)) return null;
        if (Number.isInteger(i)) return project(periodOffsets[i]);
        const midnight = referenceCalendar?.projectClock(Math.floor(periodMs / Time.MS_PER_DAY) * Time.MS_PER_DAY, 0) ??
          period.date.withTime();
        return rruleJsMidnightClock(midnight, options?.rruleJsHostZone);
      });
      if (rruleJs && setpos != null) selected.sort((a, b) => (a?.mse ?? NaN) - (b?.mse ?? NaN));
      const set = selected.filter((value) => value != null);
      if (set.length > 0 &&
        (hasText || set[set.length - 1].mse >= dtstart.mse ||
          options?.dateutilCheckUntilBeforeStart || referenceCalendar != null)) {
        idle = 0;
        yield* set;
      }
      advance();
    }
  }

  /**
   * rrule.js skips filtered hours and minutes during a carry, retaining
   * the lower clock fields from that carry. An absolute interval grid
   * loses that phase. Each search can stop when its time of day repeats.
   */
  function rruleJsSubdailyClock(
    unitMs: number,
    interval: number,
    hours: Option<readonly number[]>,
    minutes: Option<readonly number[]>,
    seconds: Option<readonly number[]>,
  ): (periodMs: number, skipDay: boolean) => number {
    const mod = (value: number, base: number) => ((value % base) + base) % base;
    const allowed = (values: Option<readonly number[]>, value: number) =>
      values == null || values.includes(value);
    const hourAllowed = (hour: number) => allowed(hours, mod(hour, 24));
    const minuteAllowed = (minute: number) =>
      hourAllowed(Math.floor(minute / 60)) && allowed(minutes, mod(minute, 60));

    const addHours = (hour: number, step: number): number => {
      for (let i = 0; i < 24; i++) {
        hour += step;
        if (hourAllowed(hour)) return hour;
      }
      return Infinity;
    };
    const addMinutes = (minute: number, step: number, daySkip = 0): number => {
      for (let i = 0; i < 1440; i++) {
        const part = mod(minute, 60) + step + daySkip;
        daySkip = 0;
        const carry = Math.floor(part / 60);
        let hour = Math.floor(minute / 60);
        if (carry > 0) hour = addHours(hour, carry);
        if (!Number.isFinite(hour)) return Infinity;
        minute = hour * 60 + mod(part, 60);
        if (minuteAllowed(minute)) return minute;
      }
      return Infinity;
    };
    return (periodMs, skipDay) => {
      const perDay = Time.MS_PER_DAY / unitMs;
      let tick = periodMs / unitMs;
      // Add the skipped steps before carrying the field, so a filtered
      // day can carry multiple hours or minutes in one operation.
      let daySkip = skipDay
        ? Math.floor((perDay - 1 - mod(tick, perDay)) / interval) * interval
        : 0;
      if (unitMs === Time.MS_PER_MIN) return addMinutes(tick, interval, daySkip) * unitMs;
      for (let i = 0; i < perDay; i++) {
        const part = mod(tick, 60) + interval + daySkip;
        daySkip = 0;
        const carry = Math.floor(part / 60);
        let minute = Math.floor(tick / 60);
        if (carry > 0) minute = addMinutes(minute, carry);
        if (!Number.isFinite(minute)) return Infinity;
        tick = minute * 60 + mod(part, 60);
        if (minuteAllowed(minute) && allowed(seconds, mod(tick, 60))) return tick * unitMs;
      }
      return Infinity;
    };
  }

  /** Whether the rule's date parts keep `day`, read as a DAILY rule's would (each a limit on the day). */
  function dayFilter(rule: RRule, google: boolean): (day: NaiveDate) => boolean {
    const options = rule.inner.options;
    const daily = new (rule.constructor as typeof RRule)({
      freq: "daily",
      options: {
        wkst: options?.wkst,
        byday: options?.byday,
        bynthday: options?.bynthday,
        bymonth: options?.bymonth,
        bymonthday: options?.bymonthday,
        byweekno: options?.byweekno,
        libraryWeekNumberStart: options?.libraryWeekNumberStart,
        byyearday: options?.byyearday,
        byeaster: options?.byeaster,
      },
    });
    const filter = filterOf(daily.toFilterProps(null, null, google));
    let lastDse = -Infinity;
    let lastKept = false;
    return (day) => {
      if (day.dse === lastDse) return lastKept;
      lastDse = day.dse;
      lastKept = false;
      for (const [kept] of filter([day, "day"])) {
        if (kept.toResult().asOk()?.dse === day.dse) {
          lastKept = true;
          break;
        }
      }
      return lastKept;
    };
  }

  /** The one filter `props` names (a list composes). */
  function filterOf(props: NaiveDate.FilterProps): NaiveDate.Filter {
    const f = props.options?.filter;
    if (f == null) return NaiveDate.Filter.identity();
    return Array.isArray(f) ? NaiveDate.Filter.compose(f) : f;
  }

  function nonEmpty<T>(xs: Option<readonly T[]>): Option<readonly T[]> {
    return xs != null && xs.length > 0 ? xs : null;
  }
}
