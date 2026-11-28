import { NaiveDate } from "../naive-date.ts";
import type { DaysSinceEpoch } from "../units/units.ts";
import { googleDateToNominal, googleNominalToDate } from "./google-julian-calendar.ts";

const FIRST_JULIAN_DAY = 1721424;
const UNIX_EPOCH_JULIAN_DAY = 2440588;
const GREGORIAN_REFORM_DAY = 2299161;
const GREGORIAN_REFORM_YEAR = 1582;
const FIRST_DAY_OF_YEAR_2049 = 2469443;
const FIRST_DAY_OF_YEAR_2101 = 2488435;
const FIRST_DAY_OF_YEAR_10000 = 5373485;
const FIRST_EARLY_JULIAN_RAW_YEAR = 405_686_494;
const EARLY_JULIAN_RAW_YEAR_COUNT = 120;
const LAST_EARLY_JULIAN_RAW_YEAR = FIRST_EARLY_JULIAN_RAW_YEAR + EARLY_JULIAN_RAW_YEAR_COUNT - 1;
// 1,461 Julian days per four years. This step crosses one full day-ordinal wrap.
const JULIAN_ORDINAL_WRAP_YEARS = Math.ceil(4 * 2 ** 32 / 1461);
// The Gregorian day ordinal wraps once per 2^32 days at 146,097
// days per 400 years. A fractional year is dropped in this projection.
const GREGORIAN_ORDINAL_WRAP_YEARS = Math.floor(400 * 2 ** 32 / 146097);
const LAST_GREGORIAN_REWIND_RAW_YEAR = 5_881_302;
const LATE_JULIAN_WRAP_START = 28 * JULIAN_ORDINAL_WRAP_YEARS;
const TRIALS_WITHOUT_PERIOD = 500;

function wrappedCalendarOrdinals(rawYear: number): { julian: number; gregorian: number } {
  const prior = rawYear - 1;
  const julian = 365 * prior + Math.floor(prior / 4) + FIRST_JULIAN_DAY;
  const gregorian = julian - Math.floor(prior / 100) + Math.floor(prior / 400) +
    2;
  return { julian: julian | 0, gregorian: gregorian | 0 };
}

function crossesGregorianOrdinalSign(rawYear: number, julian: number, gregorian: number): boolean {
  if (gregorian < 0) return false;
  const julianWithoutSign = julian & 0x7fffffff;
  // The earlier wraps admit dates after the reform. The late
  // transition begins at 2049 in the sign-cleared Julian ordinal.
  const lowerBound = rawYear < LATE_JULIAN_WRAP_START
    ? GREGORIAN_REFORM_DAY
    : FIRST_DAY_OF_YEAR_2049;
  return julianWithoutSign >= lowerBound &&
    julianWithoutSign < FIRST_DAY_OF_YEAR_2101 &&
    wrappedCalendarOrdinals(rawYear - JULIAN_ORDINAL_WRAP_YEARS).gregorian < 0;
}

// Google can return to a Julian year when the positive rank fills
// before its final eligible month. The captured paths cross to a
// smaller positive raw year with negative ordinals five trials later.
function monthRewindJulianDelay(
  rawYear: number,
  interval: number,
  hasRemainingMonth: boolean,
  hasSevenTrialReturn: boolean,
): number {
  const wrap = Math.floor(rawYear / JULIAN_ORDINAL_WRAP_YEARS);
  if (wrap !== 28 && wrap !== 29 && wrap !== 31) return 0;
  const crossedRaw = (rawYear + 5 * interval) | 0;
  if (crossedRaw < GREGORIAN_REFORM_YEAR || crossedRaw >= rawYear) return 0;
  const crossed = wrappedCalendarOrdinals(crossedRaw);
  if (crossed.julian >= 0 || crossed.gregorian >= 0) return 0;
  // Measure the fifth trial within its Julian wrap. The phase aligns
  // across intervals even when their earlier raw years differ.
  const phase = crossedRaw % JULIAN_ORDINAL_WRAP_YEARS;
  let delay: number;
  if (hasRemainingMonth && wrap === 28 && phase >= 5_881_091 && phase <= 5_881_171) {
    delay = 7;
  } else if (hasSevenTrialReturn && wrap === 29 && phase >= 5_881_263 && phase <= 5_881_343) {
    delay = 7;
  } else if (hasRemainingMonth && wrap === 31 && phase >= 5_881_175 && phase <= 5_881_294) {
    delay = 2;
  } else if (hasSevenTrialReturn && !hasRemainingMonth &&
    rawYear >= 370_409_551 && rawYear <= 370_409_670) {
    // A completed month cursor can continue the earlier seven-trial path.
    delay = 12;
  } else {
    return 0;
  }
  return wrappedCalendarOrdinals((rawYear + (delay - 1) * interval) | 0).julian < 0 ? delay : 0;
}

function projectedYear(ordinal: number): number | undefined {
  if (ordinal >= GREGORIAN_REFORM_DAY) {
    if (ordinal >= FIRST_DAY_OF_YEAR_10000) return undefined;
    return NaiveDate.fromDse(
      (ordinal - UNIX_EPOCH_JULIAN_DAY) as DaysSinceEpoch,
    ).yr;
  }
  const offset = ordinal - FIRST_JULIAN_DAY;
  const year = Math.floor((4 * offset + 3) / 1461) + 1;
  return year >= -9998 ? year : undefined;
}

/** Large Google yearly steps can wrap the raw year or its day ordinal. */
export function googleUsesWrappedYearlyPeriods(
  year: number,
  interval: number,
): boolean {
  // Shorter steps cannot wrap back into range within the provider's
  // first trial window. The ordinary generator handles them directly.
  return year >= 1 && year <= 2100 && interval >= 20_000;
}

/** A first Gregorian ordinal wrap can send subsequent trials before DTSTART. */
export function googleYearlyOrdinalRewinds(year: number, interval: number): boolean {
  const rawYear = (year + interval) | 0;
  if (year < GREGORIAN_REFORM_YEAR || rawYear < GREGORIAN_ORDINAL_WRAP_YEARS) return false;
  const { gregorian } = wrappedCalendarOrdinals(rawYear);
  if (gregorian < GREGORIAN_REFORM_DAY || gregorian >= FIRST_DAY_OF_YEAR_2101) return false;
  const projected = projectedYear(gregorian);
  return projected != null && projected < year;
}

interface WrappedPeriod {
  year: number;
  afterMonth?: number;
}

/** Rank B.C. candidates on the Julian calendar before converting their era. */
export function googleWrappedYearlyFilter(
  interval: number,
  commonEraFilter: NaiveDate.Filter,
  beforeCommonEraFilter: NaiveDate.Filter,
  nominal: boolean,
  dayPositions?: readonly number[],
  highestPositiveRank?: number,
  ordinalRewind = false,
): Pick<NaiveDate.FilterPropsOptions, "filter" | "periods" | "allowBeforeStart"> {
  const frames = new WeakMap<NaiveDate.MaybeValid, WrappedPeriod>();

  const candidatesOf: NaiveDate.Filter = function* ([anchor, unit]) {
    const frame = frames.get(anchor);
    const astronomical = frame != null && frame.year <= 0;
    const start = astronomical
      ? NaiveDate.fromYmd1Unchecked(frame.year, anchor.month1, anchor.day1)
      : anchor;
    const select = astronomical ? beforeCommonEraFilter : commonEraFilter;
    for (const candidate of select([start, unit])) {
      if (frame?.afterMonth == null ||
        (candidate[0].yr === frame.year && candidate[0].month1 > frame.afterMonth)) {
        yield candidate;
      }
    }
  };
  const select = dayPositions == null
    ? candidatesOf
    : NaiveDate.Filter.bySetPos(candidatesOf, dayPositions);

  const filter: NaiveDate.Filter = function* (period) {
    const frame = frames.get(period[0]);
    if (frame == null || frame.year > 0) {
      yield* select(period);
      return;
    }
    for (const [candidate, candidateUnit] of select(period)) {
      const date = candidate.toResult().asOk();
      if (date == null) continue;
      const civil = googleNominalToDate(date);
      // A Julian leap day can normalize to March 1 in the year of era.
      const firstOfMonth = NaiveDate.fromYmd1Exp(1 - civil.yr, civil.month1, 1);
      const folded = firstOfMonth.addDays(civil.day1 - 1);
      yield [nominal ? googleDateToNominal(folded) : folded, candidateUnit];
    }
  };

  function rankStatus(period: NaiveDate.MaybeValid, rank: number): RankStatus {
    const days = new Map<number, NaiveDate>();
    for (const [candidate] of candidatesOf([period, "year"])) {
      const day = candidate.toResult().asOk();
      if (day != null) days.set(day.dse, day);
    }
    if (days.size < rank) return { hasDays: days.size > 0 };
    const ranked = [...days.values()].sort((a, b) => a.dse - b.dse);
    const month = ranked[rank - 1].month1;
    return { hasDays: true, month, finalMonth: month === ranked[ranked.length - 1].month1 };
  }

  const inspectRanks = highestPositiveRank == null
    ? undefined
    : (period: NaiveDate.MaybeValid) => rankStatus(period, highestPositiveRank);
  return {
    filter,
    periods: (start) => googleWrappedYearlyPeriods(start, interval, filter, frames, inspectRanks, ordinalRewind),
    allowBeforeStart: ordinalRewind,
  };
}

interface RankStatus {
  hasDays: boolean;
  month?: number;
  finalMonth?: boolean;
}

/** Supply projected periods, preserving nonconsecutive repetitions for COUNT. */
function* googleWrappedYearlyPeriods(
  start: NaiveDate.MaybeValid,
  interval: number,
  filter: NaiveDate.Filter,
  frames: WeakMap<NaiveDate.MaybeValid, WrappedPeriod>,
  inspectRanks: ((period: NaiveDate.MaybeValid) => RankStatus) | undefined,
  ordinalRewind: boolean,
): Generator<NaiveDate.MaybeValid> {
  let rawYear = start.yr;
  let idle = 0;
  let firstPending = true;
  let initialPeriodHasCandidate = false;
  let filledPositiveRanks = false;
  let filledFinalMonth = false;
  let repeatedJulianRetry = false;
  let allowJulianFallback = false;
  let earlyFallbackTrial = -1;
  let julianFallbackTrial = -1;
  let sevenTrialFallback = -1;
  let hasSevenTrialReturn = false;
  let rewindFallbackTrial = -1;
  let hasRewindReturn = false;
  const gregorianStartYear = wrappedCalendarOrdinals(start.yr).gregorian;
  const gregorianRecentYear = wrappedCalendarOrdinals(start.yr - 2).gregorian;
  let previousYear: number | undefined;
  let filledGroup:
    | (WrappedPeriod & { month: number; rewindOnRetry: boolean })
    | undefined;
  for (
    let trial = 0;
    idle < TRIALS_WITHOUT_PERIOD;
    trial++, rawYear = (rawYear + interval) | 0
  ) {
    if (trial > 0 && rawYear === start.yr) return;
    idle++;
    const { julian, gregorian } = wrappedCalendarOrdinals(rawYear);
    const modern = rawYear >= GREGORIAN_REFORM_YEAR;
    const preferred = modern ? gregorian : julian;
    // A wrapped January ordinal can land on the other side of the reform.
    const ordinal = (preferred >= GREGORIAN_REFORM_DAY) === modern
      ? preferred
      : modern ? julian : gregorian;
    const julianRetry = modern && preferred < GREGORIAN_REFORM_DAY && ordinal >= FIRST_JULIAN_DAY;
    const julianAlias = julianRetry && ordinal >= GREGORIAN_REFORM_DAY;
    // Live captures bracket an early Julian return 17 trials after
    // this raw-year band. A later Gregorian trial clears the return.
    if (modern && gregorian >= GREGORIAN_REFORM_DAY) {
      const inEarlyBand = rawYear >= FIRST_EARLY_JULIAN_RAW_YEAR &&
        rawYear <= LAST_EARLY_JULIAN_RAW_YEAR;
      const hasRemainingMonth = filledPositiveRanks && !filledFinalMonth;
      const inNextBand = rawYear > LAST_EARLY_JULIAN_RAW_YEAR &&
        rawYear <= LAST_EARLY_JULIAN_RAW_YEAR + EARLY_JULIAN_RAW_YEAR_COUNT;
      earlyFallbackTrial = (filledFinalMonth && inEarlyBand) ||
        (hasRemainingMonth && inNextBand) ? trial + 17 : -1;
      if (hasRemainingMonth || (filledFinalMonth && hasSevenTrialReturn)) {
        const delay = monthRewindJulianDelay(rawYear, interval, hasRemainingMonth, hasSevenTrialReturn);
        if (delay > 0) {
          julianFallbackTrial = trial + delay;
          if (delay === 7) sevenTrialFallback = julianFallbackTrial;
        }
      }
    }
    let projected = projectedYear(ordinal);
    // A pre-reform Julian return can enter the common era after a
    // Gregorian sign change or continue an established Julian retry run.
    const julianEraReturn = rawYear < 0 && ordinal >= FIRST_JULIAN_DAY &&
      ordinal < GREGORIAN_REFORM_DAY && gregorian >= 0 &&
      (repeatedJulianRetry || wrappedCalendarOrdinals((rawYear - interval) | 0).gregorian < 0);
    const changesEra = !julianEraReturn && ((rawYear > 0) !== (ordinal >= FIRST_JULIAN_DAY));
    const allowFallback = allowJulianFallback ||
      trial === earlyFallbackTrial || trial === julianFallbackTrial;
    const skipFallback = julianRetry && (!julianAlias || !allowFallback);
    allowJulianFallback = false;
    if (filledFinalMonth && modern && julian < 0) {
      const gregorianWithoutSign = gregorian & 0x7fffffff;
      const isRewind = gregorian < 0 &&
        rawYear < 2 * GREGORIAN_ORDINAL_WRAP_YEARS &&
        rawYear % GREGORIAN_ORDINAL_WRAP_YEARS <= LAST_GREGORIAN_REWIND_RAW_YEAR &&
        gregorianWithoutSign >= gregorianRecentYear &&
        gregorianWithoutSign < gregorianStartYear &&
        (julian & 0x7fffffff) >= GREGORIAN_REFORM_DAY &&
        wrappedCalendarOrdinals((rawYear + 2 * interval) | 0).gregorian < 0;
      const crossesSign = crossesGregorianOrdinalSign(rawYear, julian, gregorian);
      if ((isRewind || crossesSign) &&
        wrappedCalendarOrdinals((rawYear + interval) | 0).julian < 0) {
        julianFallbackTrial = trial + 2;
        rewindFallbackTrial = isRewind ? julianFallbackTrial : -1;
      }
      // After a rewind return, a trial just past the signed Gregorian
      // edge refreshes the search even though it emits no occurrence.
      if (hasRewindReturn && rawYear < LATE_JULIAN_WRAP_START &&
        gregorian < 0 &&
        wrappedCalendarOrdinals(rawYear + JULIAN_ORDINAL_WRAP_YEARS).gregorian >= 0 &&
        wrappedCalendarOrdinals((rawYear + interval) | 0).julian < 0) {
        idle = 1;
      }
    }
    // The immediate advance can retain the last year and move the month
    // cursor. When looking for a new year, a filled positive group skips
    // modern aliases found only by falling back to the Julian calculation.
    const preReformRetry = julianRetry && !julianAlias;
    // After a negative raw trial returns to the common era, each
    // following Julian retry reranks the preceding year, even if that
    // year already produced an occurrence before this return.
    // Both a positive raw Julian retry and an incompatible era can
    // continue a rewind from a previously admitted pre-reform year.
    const rewindGroup = filledGroup?.rewindOnRetry === true &&
      (julianRetry || changesEra);
    const repeatGroup = filledGroup != null && filledGroup.year > 0 &&
      filledGroup.year < GREGORIAN_REFORM_YEAR && (changesEra || preReformRetry || rewindGroup);
    if (repeatGroup && preReformRetry) repeatedJulianRetry = true;
    const retained = filledGroup != null &&
        (repeatGroup || changesEra || julianAlias || projected === filledGroup.year)
      ? filledGroup
      : undefined;
    filledGroup = undefined;
    if (retained != null) projected = retained.year - (rewindGroup ? 1 : 0);
    const adjacentRepeat = projected === previousYear;
    previousYear = undefined;
    if (projected == null || (retained == null && filledPositiveRanks && (changesEra || skipFallback))) continue;

    // Astronomical year -1800 is written as 1801 after applying selectors.
    const yearOfEra = projected > 0 ? projected : 1 - projected;
    const rewoundOrdinal = ordinalRewind && initialPeriodHasCandidate &&
      modern && ordinal === gregorian &&
      gregorian >= GREGORIAN_REFORM_DAY && yearOfEra < start.yr;
    if (yearOfEra < start.yr && !rewoundOrdinal) continue;
    const period = NaiveDate.fromYmd1Unchecked(yearOfEra, start.month1, start.day1);
    // A retry keeps the selected month's starting position. Each
    // resulting occurrence consumes COUNT before deduplication.
    const frame = { year: projected, afterMonth: repeatGroup ? retained?.afterMonth : retained?.month };
    frames.set(period, frame);
    const candidates = filter([period, "year"]);
    const ranked = inspectRanks == null ? undefined : Array.from(candidates);
    if (inspectRanks != null && (ranked?.length || retained != null)) {
      const { hasDays, month, finalMonth } = inspectRanks(period);
      // If no eligible month remains, the next raw trial can supply a
      // Julian alias before the serial search continues.
      allowJulianFallback = retained != null && !hasDays;
      if (ranked?.length) {
        filledPositiveRanks = month != null;
        filledFinalMonth = finalMonth === true;
        if (month != null) {
          filledGroup = {
            ...frame,
            month,
            rewindOnRetry: julianEraReturn || rewindGroup,
          };
        }
      }
    }
    let found = false;
    for (const [candidate] of ranked ?? candidates) {
      const day = candidate.toResult().asOk();
      if (day == null || (!rewoundOrdinal && day.cmpInvalid(start) < 0)) continue;
      // Keep the initial period on the trial axis even if it lies beyond
      // the output ceiling. The query can stop here if the start survives.
      if (!(ordinalRewind && (trial === 0 || rewoundOrdinal)) &&
        (day.yr > 2100 || (day.yr === 2100 && (day.month1 !== 1 || day.day1 !== 1)))) return;
      found = true;
      // Initialization buffers the first match using the original budget.
      // Fetching another match refreshes it, even within that first period.
      if (!firstPending) {
        idle = 1;
        break;
      }
      firstPending = false;
      if (idle === 1 || day.yr === 2100) break;
    }
    if (!found) {
      // An exhausted month cursor does not split adjacent aliases of the
      // same year or let their repeated occurrence consume COUNT.
      if (allowJulianFallback) previousYear = projected;
      continue;
    }
    // A date selected at or after DTSTART in the initial period seeds the
    // rewind, even when a recurrence-set exclusion later removes that date.
    if (trial === 0) initialPeriodHasCandidate = true;
    previousYear = projected;
    if (trial === sevenTrialFallback && trial === julianFallbackTrial) hasSevenTrialReturn = true;
    if (trial === rewindFallbackTrial) hasRewindReturn = true;
    if (!adjacentRepeat || retained != null) yield period;
  }
}
