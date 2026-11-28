import { DateTime } from "../datetime.ts";
import { NaiveDate } from "../naive-date.ts";
import type { NaiveDateTime } from "../naive-datetime.ts";
import { Time } from "../time.ts";
import type { Utc } from "../timezone.ts";
import type { TimezoneRegion } from "../timezone-region.ts";
import { Weekday } from "../units/weekday.ts";
import { Year } from "../units/year.ts";
import type { ICalDateLine } from "./ical-date-line.ts";
import type { ICalendar } from "./ical.ts";
import { validateDateutilClockCycle } from "./dateutil-clock.ts";
import { sortDateutilDates } from "./dateutil-sort.ts";
import { type DateutilZone, invalidDateutilOffset } from "./dateutil-tzif.ts";
import { RecurrenceExpansionLimitError } from "./generation-limit.ts";
import { RRuleInstances } from "./instances.ts";
import { maxOffsetMsNear } from "./recurrence.ts";
import { easterOffsets, RRule } from "./rrule.ts";
import type { RecurrenceSeries } from "./series.ts";

interface Candidate {
  readonly aware: boolean;
  readonly hasTime: boolean;
  readonly wall: NaiveDateTime;
  readonly zone: TimezoneRegion | null;
  readonly instant: DateTime<Utc>;
  readonly submillisecondMicros: number;
  readonly tzif?: DateutilZone;
  readonly identity?: string | object;
  readonly foldSensitive?: boolean;
}

function candidate(
  wall: NaiveDateTime,
  zone: TimezoneRegion | null,
  tzif: DateutilZone | undefined,
  aware: boolean,
  hasTime: boolean,
  submillisecondMicros = 0,
): Candidate {
  return {
    aware,
    hasTime,
    wall,
    zone,
    tzif,
    submillisecondMicros,
    instant: tzif?.instant(wall) ?? zone?.toDateutilWallClock(wall).toUtc() ??
      wall.asUtc(),
  };
}

function sameZone(a: Candidate, b: Candidate): boolean {
  return (a.identity ?? a.zone?.fullname) === (b.identity ?? b.zone?.fullname);
}

function less(a: Candidate, b: Candidate): boolean {
  const wall = sameZone(a, b);
  if (!wall) {
    a.tzif?.validateOffset(a.wall);
    b.tzif?.validateOffset(b.wall);
  }
  if (a.aware !== b.aware) {
    throw new RangeError(
      "can't compare offset-naive and offset-aware datetimes",
    );
  }
  const lhs = wall ? a.wall.mse : a.instant.mse;
  const rhs = wall ? b.wall.mse : b.instant.mse;
  return lhs === rhs
    ? a.submillisecondMicros < b.submillisecondMicros
    : lhs < rhs;
}

/** A Python datetime bound, with optional named-zone identity and exact fractional precision. */
export type DateutilQueryBound = DateTime | NaiveDateTime | {
  value: DateTime | NaiveDateTime;
  /** TZID or resolver-supplied object of the reference datetime. Its offset comes from value. */
  timeZone?: string | DateutilZone;
  /** Microseconds beyond the millisecond represented by value. */
  submillisecondMicros?: number;
  /** For membership, whether changing the bound's reference fold changes its offset. */
  foldSensitive?: boolean;
};

function dateutilCompareTo(bound: DateutilQueryBound): (item: Candidate) => number {
  const value = "value" in bound ? bound.value : bound;
  const timeZone = "value" in bound ? bound.timeZone : undefined;
  const micros = "value" in bound ? bound.submillisecondMicros ?? 0 : 0;
  const aware = value instanceof DateTime;
  if (!Number.isInteger(micros) || micros < 0 || micros > 999) {
    throw new RangeError("dateutil query submillisecond microseconds must be an integer from 0 to 999");
  }
  if (!aware && timeZone != null) throw new RangeError("dateutil query TZID requires an aware bound");
  const wall = aware ? value.ndt : value;
  return (item) => {
    const sameZone = (!aware && !item.aware) || (timeZone != null && (item.identity ?? item.zone?.fullname) === timeZone);
    // Python asks distinct tzinfo objects for their offsets before it checks awareness.
    if (!sameZone) item.tzif?.validateOffset(item.wall);
    if (item.aware !== aware) {
      throw new RangeError("can't compare offset-naive and offset-aware datetimes");
    }
    const candidateClock = sameZone ? item.wall.mse : item.instant.mse;
    const boundClock = sameZone ? wall.mse : value.mse;
    return (candidateClock - boundClock) || (item.submillisecondMicros - micros);
  };
}

/** Decide membership at the current candidate, or return undefined to keep scanning. */
function dateutilMembership(bound: DateutilQueryBound): (item: Candidate) => boolean | undefined {
  const compare = dateutilCompareTo(bound);
  const timeZone = "value" in bound ? bound.timeZone : undefined;
  const foldSensitive = "value" in bound && bound.foldSensitive === true;
  return (item) => {
    const order = compare(item);
    if (order > 0) return false;
    if (order < 0) return undefined;
    // Python's cross-zone equality is stricter than its ordering at a fold.
    if (!item.aware || (timeZone != null && (item.identity ?? item.zone?.fullname) === timeZone) ||
        (!foldSensitive && !isFold(item))) return true;
    return undefined;
  };
}

function dateutilQueryValue(item: Candidate): DateTime<Utc> | NaiveDateTime {
  validateDateutilProjection(item);
  return item.aware ? item.instant : item.wall;
}

function validateDateutilProjection(item: Candidate): void {
  item.tzif?.validateOffset(item.wall);
  const year = item.instant.ndt.date.yr;
  if (item.aware && (year < 1 || year > 9999)) throw new RangeError("date value out of range");
}

function isFold({ zone, wall, tzif, foldSensitive }: Candidate): boolean {
  if (foldSensitive != null) return foldSensitive;
  if (tzif != null) return tzif.ambiguous(wall);
  return zone != null &&
    zone.toRfc5545WallClock(wall).mse < zone.toWallClock(wall).mse;
}

function equal(a: Candidate, b: Candidate): boolean {
  if (a.aware !== b.aware) return false;
  if (sameZone(a, b)) {
    return a.wall.mse === b.wall.mse &&
      a.submillisecondMicros === b.submillisecondMicros;
  }
  a.tzif?.validateOffset(a.wall);
  b.tzif?.validateOffset(b.wall);
  if (a.submillisecondMicros !== b.submillisecondMicros) return false;
  // Inter-zone datetime equality is false for a time whose offset depends on fold.
  return a.instant.mse === b.instant.mse && !isFold(a) && !isFold(b);
}

export interface DateutilCompatibleStart {
  readonly line: ICalDateLine;
  readonly instant?: DateTime<Utc>;
}

function dateCandidates(
  lines: readonly ICalDateLine[] | null | undefined,
  tzif: ReadonlyMap<string, DateutilZone>,
  compatibleStart?: DateutilCompatibleStart,
): Candidate[] {
  const inputs = compatibleStart == null ? lines ?? [] : [...(lines ?? []), compatibleStart.line];
  const dates = inputs.flatMap((line) =>
    line.dates.map((wall, i) => {
      const form = line.forms?.[i];
      const zone = form?.utc ? null : line.region ?? null;
      const item = candidate(
        wall,
        zone,
        zone == null ? undefined : tzif.get(zone.fullname),
        form?.utc === true || zone != null,
        form?.timed === true,
        form?.submillisecondMicros,
      );
      return line === compatibleStart?.line && compatibleStart.instant != null
        ? { ...item, instant: compatibleStart.instant }
        : item;
    })
  );
  return sortDateutilDates(dates, less);
}

/** The first period that cannot build dateutil's ordinal weekday mask. */
function firstOrdinalMaskError(
  rule: RRule,
  start: NaiveDate,
): { period: NaiveDate; message: string } | undefined {
  const { freq, options } = rule.inner;
  if (freq !== "monthly" && freq !== "yearly") return;
  const ordinals = options?.bynthday;
  if (!ordinals?.length) return;
  const monthly = freq === "monthly";
  const yearMonths = monthly
    ? undefined
    : options?.bymonth?.toSorted((a, b) => a - b);
  // The shortest mask has 379 entries. These central ordinals fit any
  // ordinary month or year range, but month selectors can name invalid slices.
  if (
    !yearMonths?.some((month) => month < 1 || month > 12) &&
    !ordinals.some(({ n }) => n >= 8 || n <= -59)
  ) return;

  const exactOrdinals = (
    options?.dateutilOrdinalIntegers?.map(({ weekday, value }) => ({ weekday, n: BigInt(value) })) ??
    ordinals.map(({ weekday, n }) => ({ weekday, n: BigInt(n) }))
  ).sort((a, b) => a.weekday.isoDow - b.weekday.isoDow || (a.n < b.n ? -1 : a.n > b.n ? 1 : 0));

  const interval = options?.interval ?? 1;
  if (!Number.isSafeInteger(interval)) return;
  const initial = monthly ? start.yr * 12 + start.month0 : start.yr;
  const monthBoundaries = Array.from({ length: 13 }, (_, i) => i);
  // The Gregorian year lengths and weekdays repeat after 400 years.
  const cycle = interval > 0 ? monthly ? 4800 : 400 : 1;
  for (let i = 0; i < cycle; i++) {
    const counter = initial + i * interval;
    const year = monthly ? Math.floor(counter / 12) : counter;
    if (year < 1 || year > 9999) return;
    const month = monthly ? counter % 12 + 1 : 1;
    const yearStart = NaiveDate.fromYmd1Exp(year, 1, 1);
    const yearLength = Year.isLeapYear(year) ? 366 : 365;
    // dateutil slices 55 weeks by January 1's Monday-based weekday.
    const maskLength = 385 - yearStart.dayOfWeek.isoDow;
    const months = monthly ? [month] : yearMonths;
    // Python uses the written BYMONTH as a slice index, including negatives.
    const ranges = months?.length
      ? months.map((m) =>
        monthBoundaries.slice(m - 1, m + 1).map((boundary) =>
          boundary === 12
            ? yearLength
            : NaiveDate.fromYmd1Exp(year, boundary + 1, 1).dse - yearStart.dse
        )
      )
      : [[0, yearLength]];
    for (const range of ranges) {
      const error = (message: string) => ({
        period: NaiveDate.fromYmd1Exp(year, month, 1),
        message,
      });
      if (range.length !== 2) {
        return error(
          "not enough values to unpack (expected 2, got " + range.length + ")",
        );
      }
      const [first, end] = range;
      for (const { n } of exactOrdinals) {
        const index = n < 0n ? BigInt(end - 1) + (n + 1n) * 7n : BigInt(first) + (n - 1n) * 7n;
        // Python converts the index to ssize_t and then checks the mask.
        if (index < -(1n << 63n) || index >= 1n << 63n) {
          return error("cannot fit 'int' into an index-sized integer");
        }
        if (index >= maskLength || index < -maskLength) return error("list index out of range");
      }
    }
  }
}

const lastDateutilDay = NaiveDate.fromYmd1Exp(9999, 12, 31);

/** Can this weekly phase select a slot after Python's last civil date? */
function maySelectBeyondYear9999(
  start: NaiveDate,
  options: RRule["inner"]["options"],
): boolean {
  if (options?.bymonth?.length && !options.bymonth.includes(1)) return false;
  const weekStart = options?.wkst ?? Weekday.MON;
  const weekOffset = (day: NaiveDate) =>
    (day.dayOfWeek.dow - weekStart.dow + 7) % 7;
  const endOffset = weekOffset(lastDateutilDay);
  const firstWeek = start.dse - weekOffset(start);
  const finalWeek = lastDateutilDay.dse - endOffset;
  const interval = options?.interval ?? 1;
  if (interval > 0 && (finalWeek - firstWeek) / 7 % interval !== 0) {
    return false;
  }
  const weekdays = [
    ...(options?.byday ?? []),
    ...(options?.bynthday?.map(({ weekday }) => weekday) ?? []),
  ];
  for (let i = endOffset + 1; i < 7; i++) {
    const dow = (weekStart.dow - 1 + i) % 7 + 1;
    if (weekdays.length === 0 || weekdays.some((day) => day.dow === dow)) {
      return true;
    }
  }
  return false;
}

/** Advance Python's raw calendar fields, which do not borrow on underflow. */
function* backwardCalendarPeriods(
  start: NaiveDate,
  frequency: RRule["inner"]["freq"],
  step: bigint,
  weekStart: Weekday,
): Generator<NaiveDate, never> {
  let year = BigInt(start.yr);
  let month = BigInt(start.month1);
  let day = BigInt(start.day);
  const monthBoundaries = Array.from({ length: 13 }, (_, i) => i);
  if (frequency === "weekly") {
    day -= BigInt((start.dayOfWeek.dow - weekStart.dow + 7) % 7);
    step *= 7n;
  }
  while (true) {
    if (frequency === "monthly") {
      month += step;
      // mdayset uses the raw month in a Python slice over 13 boundaries.
      // Some negative indices therefore produce dates later in the year.
      const bounds = monthBoundaries
        .slice(Number(month - 1n), Number(month + 1n));
      if (bounds.length !== 2) {
        throw new RangeError(
          "not enough values to unpack (expected 2, got " + bounds.length + ")",
        );
      }
      yield NaiveDate.fromYmd1Exp(Number(year), bounds[0] + 1, 1);
      continue;
    }
    if (frequency === "yearly") year += step;
    else day += step;
    const shifted = frequency === "yearly" ? year : day;
    if (shifted < -(1n << 63n)) {
      throw new RangeError("Python int too large to convert to C long");
    }
    if (shifted < -(1n << 31n)) {
      throw new RangeError("signed integer is less than minimum");
    }
    if (year < 1n) throw new RangeError("year " + year + " is out of range");
    if (day < 1n) throw new RangeError("day is out of range for month");
    yield NaiveDate.fromYmd1Exp(
      Number(year),
      Number(month),
      frequency === "yearly" ? 1 : Number(day),
    );
  }
}

/** @internal Cardinality and step of a plain, forward UTC daily rule. */
export function plainDateutilDailySpan(rule: RRule, start: NaiveDate): { count: number; step: number } | undefined {
  if (rule.inner.freq !== "daily" || start.yr < 1 || start.yr > 9999) return;
  const { count, interval, wkst: _weekStart, ...options } = rule.inner.options ?? {};
  const step = interval ?? 1;
  if (count == null || !Number.isSafeInteger(count) || !Number.isSafeInteger(step) || step <= 0 ||
    Object.values(options).some((value) => value != null)) return;
  // Python dateutil exhausts this unfiltered sequence at the end of year 9999.
  const daysRemaining = Year.dseFromYear(10000) - 1 - start.dse;
  return { count: Math.max(0, Math.min(count, Math.floor(daysRemaining / step) + 1)), step };
}

function* ruleCandidates(
  rule: RRule,
  start: NaiveDateTime,
  zone: TimezoneRegion | null,
  tzif: DateutilZone | undefined,
  aware: boolean,
  generationLimit: number | undefined,
  canRepeat?: () => boolean,
): Generator<Candidate> {
  tzif?.validateRuleStart?.(start);
  // dateutil truncates DTSTART microseconds when constructing each rule.
  const ruleStart = start.time.ms === 0
    ? start
    : start.add({ ms: -start.time.ms });
  if (generationLimit == null && zone == null && tzif == null && aware) {
    const daily = plainDateutilDailySpan(rule, ruleStart.date);
    if (daily != null) {
      for (let i = 0; i < daily.count; i++) {
        const wall = i === 0 ? ruleStart : ruleStart.date.addDays(i * daily.step).withTime(ruleStart.time);
        yield candidate(wall, zone, tzif, aware, false);
      }
      return;
    }
  }

  const options = { ...rule.inner.options };
  const weekly = rule.inner.freq === "weekly";
  if (
    weekly && options.byday == null && options.bynthday == null &&
    options.byweekno == null && options.byyearday == null &&
    options.bymonthday == null && options.byeaster == null
  ) {
    // dateutil supplies DTSTART's weekday, even for BYMONTH or BYSETPOS.
    options.byday = [start.date.dayOfWeek];
  }
  // Python removes zero month days after deciding whether DTSTART supplies
  // default date selectors. An explicit zero-only list expands every day.
  if (options.bymonthday?.includes(0)) {
    const monthDays = options.bymonthday.filter((day) => day !== 0);
    options.bymonthday = monthDays.length > 0
      ? monthDays
      : Array.from({ length: 31 }, (_, i) => i + 1);
  }
  const weekStart = options.wkst ?? Weekday.MON;
  // January 1 of year 1 is Monday. These week masks need the previous year.
  const needsPreviousYear = options.byweekno?.length &&
    !options.byweekno.includes(-1) && weekStart.isoDow >= 1 &&
    weekStart.isoDow <= 3;
  if (start.date.yr === 1 && needsPreviousYear) {
    throw new RangeError("year 0 is out of range");
  }
  const until = options.until?.extend();
  const untilOffset = options.dateutilUntilOffsetMs ?? 0;
  const invalidUntilOffset = Math.abs(untilOffset) >= Time.MS_PER_DAY;
  const untilUsesWall = options.dateutilUntilUsesWall ||
    (invalidUntilOffset && untilOffset === tzif?.invalidFixedOffsetMs);
  const cutoff = until == null
    ? undefined
    : until.mse - (untilUsesWall || invalidUntilOffset ? 0 : untilOffset);
  // Easter's day index is 80–114 in a common year, or 81–115 in a leap
  // year. The mask includes seven trailing days and accepts negative indices.
  const easter = options.byeaster == null ? undefined : easterOffsets(options.byeaster);
  const canOverflowEasterMask = easter?.some((offset) =>
    Number(offset) < -452 || Number(offset) > 257
  );
  const freq = rule.inner.freq;
  const subdaily = freq === "hourly" || freq === "minutely" ||
    freq === "secondly";
  if (canOverflowEasterMask && subdaily) {
    // dateutil builds the initial year mask before its first subdaily clock.
    NaiveDate.Filter.byEaster(easter!).checkYear(
      start.date.yr,
    );
  }
  const backwardStep = options.dateutilNegativeInterval;
  const backwardClock = subdaily && backwardStep != null;
  if (!backwardClock) validateDateutilClockCycle(rule.inner, start.time);
  const ordinalMaskError = firstOrdinalMaskError(rule, start.date);
  // These week numbers cannot mark any day in any year. Keep advancing
  // when doing so can still surface a later mask or subdaily clock error.
  const hasClockSelectors = Boolean(
    options.byhour?.length || options.byminute?.length ||
      options.bysecond?.length,
  );
  const hasTime = subdaily || hasClockSelectors;
  if (
    (options.interval ?? 1) > 0 && options.dateutilNegativeInterval == null &&
    !canOverflowEasterMask && ordinalMaskError == null &&
    !(subdaily && hasClockSelectors) && options.byweekno?.length &&
    options.byweekno.every((week) => week === 0 || Math.abs(week) > 53)
  ) return;
  // dateutil can rebuild an invalid mask before it checks COUNT or UNTIL.
  // A week built in year 9999 can still contain year-10000 slots.
  // Python constructs those dates before applying COUNT or UNTIL.
  const weekMayOverflow = weekly && maySelectBeyondYear9999(start.date, options);
  const validateCalendar = weekMayOverflow || canOverflowEasterMask || ordinalMaskError != null;
  const validatePastLimit =
    validateCalendar ||
    (cutoff != null &&
      (invalidUntilOffset || tzif?.hasInvalidOffset));
  // Python checks UNTIL before discarding candidates earlier than DTSTART.
  // In a gap an earlier wall clock can project later than DTSTART in UTC.
  const checkUntilBeforeStart = until != null;
  const stationary = options.interval === 0;
  const backward = backwardStep == null || subdaily
    ? undefined
    : backwardCalendarPeriods(
      start.date,
      freq,
      BigInt(backwardStep),
      options.wkst ?? Weekday.MON,
    );
  const countAfterStart = validatePastLimit || checkUntilBeforeStart ||
    stationary || backwardStep != null;
  let remaining = countAfterStart ? options.count : undefined;
  const expansion = new RRule({
    ...rule.inner,
    options: {
      ...options,
      count: countAfterStart ? undefined : options.count,
      until: backwardClock ? undefined : options.until,
      dateutilOrdinalMaskError: ordinalMaskError,
      dateutilCheckUntilBeforeStart: checkUntilBeforeStart,
      dateutilBoundedCalendar: true,
      dateutilValidateEmptyCalendar: options.dateutilEmptyClock && validateCalendar,
      dateutilSinglePeriod: stationary || backward != null,
    },
  });
  const horizon =
    cutoff == null || validatePastLimit || stationary || backwardStep != null
      ? Infinity
      : cutoff +
        (tzif?.maxOffsetMs ??
          (zone == null ? 0 : maxOffsetMsNear(zone, cutoff)));
  let generated = 0;
  let examined = 1;
  let periodExpansion = expansion;
  let firstWeek = true;
  for (;;) {
    let admitted = false;
    for (
      const wall of RRuleInstances.expand(
        periodExpansion,
        ruleStart,
        false,
        generationLimit,
        null,
        false,
        horizon,
        false,
        firstWeek,
      )
    ) {
      if (wall.date.yr > 9999) {
        throw new RangeError("year 10000 is out of range");
      }
      const item = candidate(wall, zone, tzif, aware, hasTime);
      if (cutoff != null) {
        if (!untilUsesWall) {
          tzif?.validateOffset(wall);
          if (invalidUntilOffset) throw invalidDateutilOffset();
        }
        const position = untilUsesWall ? item.wall : item.instant;
        if (position.mse > cutoff) return;
      }
      if (wall.mse < ruleStart.mse) continue;
      if (remaining != null && remaining-- <= 0) return;
      if (
        stationary && generationLimit != null && ++generated > generationLimit
      ) {
        throw new RecurrenceExpansionLimitError(generationLimit);
      }
      admitted = true;
      yield item;
    }
    if (backward != null) {
      if (generationLimit != null && ++examined > generationLimit) {
        throw new RecurrenceExpansionLimitError(generationLimit);
      }
      const anchor = backward.next().value;
      if (anchor.yr === 1 && needsPreviousYear) {
        throw new RangeError("year 0 is out of range");
      }
      periodExpansion = new RRule({
        ...expansion.inner,
        options: {
          ...expansion.inner.options,
          dateutilPeriodStart: anchor,
          dateutilOrdinalMaskError: firstOrdinalMaskError(rule, anchor),
        },
      });
      firstWeek = false;
      continue;
    }
    if (!stationary) return;
    if (!firstWeek && (!admitted || (remaining == null && !canRepeat?.()))) {
      if (generationLimit != null) {
        throw new RecurrenceExpansionLimitError(generationLimit);
      }
      throw new RangeError("dateutil interval does not advance the recurrence");
    }
    if (firstWeek && weekly) {
      const offset = (ruleStart.date.dayOfWeek.dow - weekStart.dow + 7) % 7;
      if (ruleStart.date.day <= offset) {
        throw new RangeError("day is out of range for month");
      }
    }
    firstWeek = false;
  }
}

interface CandidateSource {
  readonly values: Iterator<Candidate>;
  readonly rewindWallMse?: number;
}

interface Stream extends CandidateSource {
  current: Candidate;
}

/**
 * dateutil uses Python's heapq for both streams. Equal-in-order values can
 * compare unequal at a fold or gap, so the heap's tie handling affects which
 * candidate represents an occurrence. On a sift, an equal right child wins.
 */
class CandidateHeap {
  private readonly entries: Stream[];

  constructor(streams: readonly CandidateSource[]) {
    this.entries = streams.flatMap((source) => {
      const next = source.values.next();
      return next.done ? [] : [{ ...source, current: next.value }];
    });
  }

  heapify(): void {
    for (let i = Math.floor(this.entries.length / 2) - 1; i >= 0; i--) {
      this.sift(i);
    }
  }

  get head(): Candidate | undefined {
    return this.entries[0]?.current;
  }

  canReach(endMse: number): boolean {
    return this.entries.some(({ current, rewindWallMse }) => {
      // A stationary rule can wrap to an earlier day in the same period.
      const wall = Math.min(current.wall.mse, rewindWallMse ?? Infinity);
      return current.zone == null ? wall <= endMse : wall <= endMse +
          (current.tzif?.maxOffsetMs ?? maxOffsetMsNear(current.zone, endMse));
    });
  }

  advance(): void {
    const entry = this.entries[0]!;
    const next = entry.values.next();
    if (next.done) {
      const last = this.entries.pop()!;
      if (this.entries.length === 0) return;
      this.entries[0] = last;
    } else {
      entry.current = next.value;
    }
    this.sift(0);
  }

  private sift(start: number): void {
    const entries = this.entries;
    const entry = entries[start];
    let index = start;
    let child = index * 2 + 1;
    while (child < entries.length) {
      const right = child + 1;
      if (
        right < entries.length &&
        !less(entries[child].current, entries[right].current)
      ) {
        child = right;
      }
      entries[index] = entries[child];
      index = child;
      child = index * 2 + 1;
    }
    while (index > start) {
      const parent = (index - 1) >> 1;
      if (!less(entry.current, entries[parent].current)) break;
      entries[index] = entries[parent];
      index = parent;
    }
    entries[index] = entry;
  }
}

/** @internal Stream the dateutil recurrence set before projecting its values to UTC. */
export function dateutilGenerator(
  rules: readonly ICalendar.Raw[],
  exclusionRules: readonly ICalendar.Raw[],
  tzif: ReadonlyMap<string, DateutilZone>,
  generationLimit?: number,
  compatibleStart?: DateutilCompatibleStart,
) {
  const streams = (
    dates: readonly ICalDateLine[] | null | undefined,
    inputs: readonly ICalendar.Raw[],
    include?: DateutilCompatibleStart,
  ) => [
    { values: dateCandidates(dates, tzif, include).values() },
    ...inputs.flatMap((raw) => dateutilRuleSource(raw, tzif, generationLimit) ?? []),
  ];
  const { rrule, rdate, exdate } = rules[0]?.lines ?? {};
  const isSet = rules.length !== 1 || rrule == null || !!rdate?.length || !!exdate?.length ||
    exclusionRules.length !== 0 || compatibleStart != null;
  return dateutilMerge(
    () => streams(rdate, rules, compatibleStart),
    () => streams(exdate, exclusionRules),
    generationLimit,
    isSet ? undefined : (canRepeat) => dateutilRuleSource(rules[0], tzif, generationLimit, canRepeat),
  );
}

function dateutilRuleSource(
  { rrule, dtstart }: ICalendar.Raw,
  tzif: ReadonlyMap<string, DateutilZone>,
  generationLimit?: number,
  canRepeat?: () => boolean,
  identity?: DateutilZone,
  cachedValues?: Generator<Candidate>,
): CandidateSource | undefined {
  if (rrule == null || dtstart == null) return;
  const zone = dtstart.region ?? null;
  const reference = zone == null ? undefined : tzif.get(zone.fullname);
  // Compatible mode can retain the original fractional start as an RDATE.
  const wall = dtstart.dates[0];
  const start = wall.time.ms === 0 ? wall : wall.add({ ms: -wall.time.ms });
  const values = cachedValues ?? ruleCandidates(
    rrule,
    start,
    zone,
    reference?.forRule?.() ?? reference,
    zone != null || dtstart.forms?.[0]?.utc === true,
    generationLimit,
    canRepeat,
  );
  function* withIdentity() {
    for (const value of values) yield { ...value, identity };
  }
  return {
    values: identity == null ? values : withIdentity(),
    rewindWallMse: rrule.inner.options?.interval === 0 || rrule.inner.options?.dateutilNegativeInterval != null
      ? start.mse - start.time.ms
      : undefined,
  };
}

function dateutilMerge(
  inclusionSources: () => CandidateSource[],
  exclusionSources: () => CandidateSource[],
  generationLimit: number | undefined,
  standaloneSource?: (canRepeat?: () => boolean) => CandidateSource | undefined,
) {
  if (
    generationLimit != null &&
    (!Number.isSafeInteger(generationLimit) || generationLimit < 0)
  ) {
    throw new RangeError(
      "recurrence generation limit must be a nonnegative safe integer",
    );
  }
  let inclusions: CandidateHeap | undefined;
  let exclusions: CandidateHeap | undefined;
  let last: Candidate | undefined;
  let throughMse = -Infinity;
  let generated = 0;
  let failure: Error | undefined;
  let pending: Candidate[] = [];

  function* traverseStandalone(canRepeat?: () => boolean): Generator<Candidate> {
    const source = standaloneSource?.(canRepeat);
    if (source == null) return;
    for (let item = source.values.next(); !item.done; item = source.values.next()) {
      if (generationLimit != null && ++generated > generationLimit) {
        throw new RecurrenceExpansionLimitError(generationLimit);
      }
      yield item.value;
    }
  }

  function* traverse(
    stopBefore?: (item: Candidate, heap: CandidateHeap) => boolean,
  ): Generator<Candidate> {
    if (inclusions == null || exclusions == null) {
      // dateutil pulls the first item from every stream before comparing
      // any streams, so an exclusion read error can precede a heap error.
      const included = new CandidateHeap(inclusionSources());
      const excluded = new CandidateHeap(exclusionSources());
      included.heapify();
      excluded.heapify();
      inclusions = included;
      exclusions = excluded;
    }
    for (let item = inclusions.head; item != null; item = inclusions.head) {
      if (stopBefore?.(item, inclusions)) return;
      if (last == null || !equal(last, item)) {
        if (generationLimit != null && ++generated > generationLimit) {
          throw new RecurrenceExpansionLimitError(generationLimit);
        }
        while (exclusions.head != null && less(exclusions.head, item)) {
          exclusions.advance();
        }
        // Leave the stream on this value until the caller asks for the next one.
        if (exclusions.head == null || !equal(item, exclusions.head)) yield item;
        last = item;
      }
      inclusions.advance();
    }
  }

  return {
    query(forceSet: boolean, canRepeat?: () => boolean): Generator<Candidate> {
      // A standalone query preserves repeats and has no other stream to merge.
      if (!forceSet && standaloneSource != null) return traverseStandalone(canRepeat);
      return traverse();
    },
    generateUpToDate(through: NaiveDate): Candidate[] {
      if (failure != null) throw failure;
      const endMse = (through.dse + 1) * Time.MS_PER_DAY - 1;
      if (endMse <= throughMse) return [];
      const result: Candidate[] = [];
      const later: Candidate[] = [];
      const collect = (item: Candidate) => {
        if (item.instant.mse <= endMse) {
          validateDateutilProjection(item);
          result.push(item);
        } else {
          later.push(item);
        }
      };
      try {
        pending.forEach(collect);
        // A later wall candidate can move backwards in UTC across a gap.
        for (const item of traverse((item, heap) => item.instant.mse > endMse && !heap.canReach(endMse))) {
          collect(item);
        }
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        throw failure;
      }

      throughMse = endMse;
      pending = later;
      return result.sort((a, b) => a.instant.mse - b.instant.mse);
    },
  };
}

export interface DateutilSetOptions {
  cache?: boolean;
  generationLimit?: number;
}

export interface DateutilSlice {
  start?: number;
  stop?: number;
  step?: number;
}
export interface DateutilXAfterOptions {
  inclusive?: boolean;
  count?: number;
}

type DateutilValue = DateTime<Utc> | NaiveDateTime;

/** Mutable recurrence set with dateutil's traversal and query behavior. */
export interface DateutilRecurrenceSet extends Iterable<DateTime<Utc> | NaiveDateTime> {
  rrule(rule: RecurrenceSeries): void;
  exrule(rule: RecurrenceSeries): void;
  rdate(date: DateutilQueryBound): void;
  exdate(date: DateutilQueryBound): void;
  contains(at: DateutilQueryBound): boolean;
  before(at: DateutilQueryBound, inclusive?: boolean): DateutilValue | null;
  after(at: DateutilQueryBound, inclusive?: boolean): DateutilValue | null;
  between(after: DateutilQueryBound, before: DateutilQueryBound, inclusive?: boolean): DateutilValue[];
  xafter(at: DateutilQueryBound, options?: DateutilXAfterOptions): Generator<DateutilValue>;
  at(index: number): DateutilValue;
  slice(options?: DateutilSlice): DateutilValue[];
  count(): number;
}

interface DateutilSetRule {
  raw: ICalendar.Raw;
  tzif: ReadonlyMap<string, DateutilZone>;
  identity?: DateutilZone;
  cachedValues?: (generationLimit?: number) => Generator<Candidate>;
}

function explicitDate(input: DateutilQueryBound): Candidate {
  const value = "value" in input ? input.value : input;
  const micros = "value" in input ? input.submillisecondMicros ?? 0 : 0;
  const identity = "value" in input ? input.timeZone : undefined;
  const wall = value instanceof DateTime ? value.ndt : value;
  const aware = value instanceof DateTime;
  if (!aware && identity != null) throw new RangeError("dateutil explicit TZID requires an aware datetime");
  if (!Number.isInteger(micros) || micros < 0 || micros > 999) {
    throw new RangeError("dateutil explicit submillisecond microseconds must be an integer from 0 to 999");
  }
  return {
    wall,
    instant: aware ? value.toUtc() : value.asUtc(),
    zone: null,
    aware,
    hasTime: true,
    submillisecondMicros: micros,
    identity: identity ?? (aware && value.tz.info.offset.toMs !== 0 ? value.tz : undefined),
    tzif: typeof identity === "object" ? identity : undefined,
    foldSensitive: "value" in input ? input.foldSensitive : undefined,
  };
}

/** The reference fills ten raw candidates before exposing any from a batch. */
export class DateutilCandidateCache {
  private readonly values: Candidate[] = [];
  private source?: Iterator<Candidate>;
  private complete = false;
  private failure?: { error: unknown; index: number };
  private canRepeat?: () => boolean;

  constructor(private readonly open: (canRepeat: () => boolean) => Iterator<Candidate>) {}

  get completed(): readonly Candidate[] | undefined {
    return this.complete ? this.values : undefined;
  }

  at(index: number): Candidate | undefined {
    if (this.complete) return this.values.at(index);
    // A failed prefetch may have stored items from a batch it never exposed.
    if (index >= 0 && (this.failure == null || index < this.failure.index)) {
      return this.values[index];
    }
  }

  *read(canRepeat?: () => boolean): Generator<Candidate> {
    for (let index = 0;; index++) {
      if (this.failure != null && index >= this.failure.index) throw this.failure.error;
      if (index === this.values.length && !this.complete) {
        this.source ??= this.open(() => this.values.length < 10 || this.canRepeat?.() === true);
        this.canRepeat = canRepeat;
        try {
          for (let i = 0; i < 10; i++) {
            const next = this.source.next();
            if (next.done) {
              this.complete = true;
              this.source = undefined;
              break;
            }
            this.values.push(next.value);
          }
        } catch (error) {
          this.failure = { error, index };
          this.source = undefined;
          throw error;
        } finally {
          this.canRepeat = undefined;
        }
      }
      if (index === this.values.length) return;
      yield this.values[index];
    }
  }
}

/** Completed-cache membership uses datetime equality without an early stop. */
function dateutilCacheContains(items: readonly Candidate[], bound: DateutilQueryBound): boolean {
  const target = explicitDate(bound);
  return items.some((item) => equal(item, target));
}

export interface DateutilQueryTraversal {
  bound(value: DateutilQueryBound): DateutilQueryBound;
  cache(): DateutilCandidateCache | undefined;
  read(canRepeat?: () => boolean): Generator<Candidate>;
}

export function queryDateutilContains(traversal: DateutilQueryTraversal, at: DateutilQueryBound): boolean {
  const bound = traversal.bound(at);
  const completed = traversal.cache()?.completed;
  if (completed != null) return dateutilCacheContains(completed, bound);
  const membership = dateutilMembership(bound);
  for (const item of traversal.read()) {
    const result = membership(item);
    if (result != null) return result;
  }
  return false;
}

export function queryDateutilBefore(traversal: DateutilQueryTraversal, at: DateutilQueryBound, inclusive = false): DateutilValue | null {
  const compare = dateutilCompareTo(traversal.bound(at));
  let last;
  for (const item of traversal.read()) {
    const order = compare(item);
    if (inclusive ? order > 0 : order >= 0) break;
    last = item;
  }
  return last == null ? null : dateutilQueryValue(last);
}

export function queryDateutilAfter(traversal: DateutilQueryTraversal, at: DateutilQueryBound, inclusive = false): DateutilValue | null {
  const compare = dateutilCompareTo(traversal.bound(at));
  for (const item of traversal.read()) {
    const order = compare(item);
    if (inclusive ? order >= 0 : order > 0) return dateutilQueryValue(item);
  }
  return null;
}

export function queryDateutilBetween(
  traversal: DateutilQueryTraversal, after: DateutilQueryBound, before: DateutilQueryBound, inclusive = false,
): DateutilValue[] {
  const lower = dateutilCompareTo(traversal.bound(after));
  const upper = dateutilCompareTo(traversal.bound(before));
  const result: (DateTime<Utc> | NaiveDateTime)[] = [];
  for (const item of traversal.read()) {
    const upperOrder = upper(item);
    if (inclusive ? upperOrder > 0 : upperOrder >= 0) break;
    if (result.length === 0) {
      const lowerOrder = lower(item);
      if (inclusive ? lowerOrder < 0 : lowerOrder <= 0) continue;
    }
    result.push(dateutilQueryValue(item));
  }
  return result;
}

export function* queryDateutilXAfter(
  traversal: DateutilQueryTraversal, at: DateutilQueryBound, { inclusive = false, count }: DateutilXAfterOptions = {},
): Generator<DateutilValue> {
  if (count != null && !Number.isSafeInteger(count)) {
    throw new RangeError("dateutil query count must be a safe integer");
  }
  const compare = dateutilCompareTo(traversal.bound(at));
  let yielded = 0;
  // Once a bounded standalone query has a match, repeated periods can fill its count.
  const canRepeat = count == null ? undefined : () => yielded > 0;
  for (const item of traversal.read(canRepeat)) {
    const order = compare(item);
    if (inclusive ? order < 0 : order <= 0) continue;
    if (count != null && yielded++ >= count) return;
    yield dateutilQueryValue(item);
  }
}

export function queryDateutilAt(traversal: DateutilQueryTraversal, index: number): DateutilValue {
  if (!Number.isSafeInteger(index)) throw new RangeError("dateutil index must be a safe integer");
  const cache = traversal.cache();
  const cached = cache?.at(index);
  if (cached != null) return dateutilQueryValue(cached);
  if (cache?.completed != null) throw new RangeError("dateutil recurrence index out of range");
  if (index < 0) {
    const item = Array.from(traversal.read()).at(index);
    if (item != null) return dateutilQueryValue(item);
  } else {
    for (const item of traversal.read(() => true)) {
      if (index-- === 0) return dateutilQueryValue(item);
    }
  }
  throw new RangeError("dateutil recurrence index out of range");
}

export function queryDateutilSlice(
  traversal: DateutilQueryTraversal, { start, stop, step = 1 }: DateutilSlice = {},
): DateutilValue[] {
  if ([start, stop, step].some((value) => value != null && !Number.isSafeInteger(value))) {
    throw new RangeError("dateutil slice bounds and step must be safe integers");
  }
  const completed = traversal.cache()?.completed;
  const selected: Candidate[] = [];
  if (completed != null && step >= 0) {
    if (step === 0) throw new RangeError("slice step cannot be zero");
    const normalize = (index: number) => Math.max(0, index < 0 ? completed.length + index : index);
    const end = Math.min(completed.length, normalize(stop ?? completed.length));
    for (let index = normalize(start ?? 0); index < end; index += step) selected.push(completed[index]);
  } else if (step < 0) {
    const items = completed ?? Array.from(traversal.read());
    const normalize = (index: number) =>
      Math.max(-1, Math.min(index < 0 ? items.length + index : index, items.length - 1));
    const end = stop == null ? -1 : normalize(stop);
    for (let index = normalize(start ?? items.length - 1); index > end; index += step) {
      selected.push(items[index]);
    }
  } else {
    // The uncached reference uses islice(start or 0, stop or sys.maxsize, step or 1).
    const first = start ?? 0;
    const end = stop || Infinity;
    const stride = step || 1;
    if (end === -1) {
      throw new RangeError("Stop argument for islice() must be None or an integer: 0 <= x <= sys.maxsize.");
    }
    if (first < 0 || end < 0) {
      throw new RangeError("Indices for islice() must be None or an integer: 0 <= x <= sys.maxsize.");
    }
    const consumed = Math.max(first, end);
    let index = 0;
    for (const item of traversal.read(Number.isFinite(consumed) ? () => true : undefined)) {
      if (index >= first && index < end && (index - first) % stride === 0) {
        selected.push(item);
      }
      if (++index >= consumed) break;
    }
  }
  return selected.map(dateutilQueryValue);
}

interface MutableSetState {
  count?: number;
  cache?: DateutilCandidateCache;
}

/** @internal Construct a set without flattening separately anchored rules into text. */
export function createDateutilSet(
  readRule: (series: RecurrenceSeries) => DateutilSetRule,
  { cache = false, generationLimit }: DateutilSetOptions,
): DateutilRecurrenceSet {
  const rules: DateutilSetRule[] = [];
  const exclusions: DateutilSetRule[] = [];
  const dates: Candidate[] = [];
  const excludedDates: Candidate[] = [];
  let current: MutableSetState = {};
  function add<T>(collection: T[], value: T): void {
    collection.push(value);
    current = {};
  }

  function readTraversal() {
    const streams = (dates: Candidate[], rules: DateutilSetRule[]) => () => [
      { values: sortDateutilDates(dates, less).values() },
      ...rules.flatMap(({ raw, tzif, identity, cachedValues }) =>
        dateutilRuleSource(raw, tzif, generationLimit, undefined, identity, cachedValues?.(generationLimit)) ?? []
      ),
    ];
    return dateutilMerge(
      streams(cache ? [...dates] : dates, rules),
      streams(cache ? [...excludedDates] : excludedDates, exclusions),
      generationLimit,
    ).query(true);
  }

  function* read(state: MutableSetState): Generator<Candidate> {
    if (!cache) {
      let count = 0;
      for (const value of readTraversal()) {
        count++;
        yield value;
      }
      state.count = count;
      return;
    }
    state.cache ??= new DateutilCandidateCache(readTraversal);
    yield* state.cache.read();
    state.count = state.cache.completed!.length;
  }

  const traversal: DateutilQueryTraversal = {
    bound(value) {
      if ("value" in value && typeof value.timeZone === "object" && value.foldSensitive == null && value.value instanceof DateTime) {
        return { ...value, foldSensitive: value.timeZone.ambiguous(value.value.ndt) };
      }
      return value;
    },
    cache: () => current.cache,
    read: () => read(current),
  };
  return {
    rrule: (rule) => add(rules, readRule(rule)),
    contains: (at) => queryDateutilContains(traversal, at),
    before: (at, inclusive) => queryDateutilBefore(traversal, at, inclusive),
    after: (at, inclusive) => queryDateutilAfter(traversal, at, inclusive),
    between: (after, before, inclusive) => queryDateutilBetween(traversal, after, before, inclusive),
    xafter: (at, options) => queryDateutilXAfter(traversal, at, options),
    at: (index) => queryDateutilAt(traversal, index),
    slice: (options) => queryDateutilSlice(traversal, options),
    exrule: (rule) => add(exclusions, readRule(rule)),
    rdate: (date) => add(dates, explicitDate(date)),
    exdate: (date) => add(excludedDates, explicitDate(date)),
    count() {
      const state = current;
      if (state.count == null) for (const _ of read(state)) { /* Count raw datetimes, without UTC projection. */ }
      return state.count!;
    },
    *[Symbol.iterator]() {
      for (const item of read(current)) yield dateutilQueryValue(item);
    },
  };
}
