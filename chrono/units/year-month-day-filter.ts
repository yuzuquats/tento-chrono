import { NaiveDate } from "../naive-date.ts";
import { Time } from "../time.ts";
import { DateUnit } from "./date-unit.ts";
import { Month } from "./month.ts";
import type { PartialDate } from "./partial-date.ts";
import { DayOfMonth1, DayOfYear1, Month1, WeekOfYear1 } from "./units.ts";
import { Weekday } from "./weekday.ts";
import { Year } from "./year.ts";
import { YearMonth, Ym1Like } from "./year-month.ts";
import { YearMonthDay, Ymd1Like } from "./year-month-day.ts";
import type { Option } from "../option.ts";

export type YearMonthDayFilter = (
  partialdate: PartialDate.Tuple,
) => Generator<PartialDate.Tuple>;

// Meeus/Jones/Butcher Gregorian computus.
export function westernEaster(year: number): NaiveDate {
  const goldenNumber = year % 19;
  const century = Math.floor(year / 100);
  const yearInCentury = year % 100;
  const centuryLeapYears = Math.floor(century / 4);
  const solarCorrection = Math.floor((century + 8) / 25);
  const lunarCorrection = Math.floor((century - solarCorrection + 1) / 3);
  const epact = (19 * goldenNumber + century - centuryLeapYears - lunarCorrection + 15) % 30;
  const weekday = (32 + 2 * (century % 4) + 2 * Math.floor(yearInCentury / 4) - epact - yearInCentury % 4) % 7;
  const correction = Math.floor((goldenNumber + 11 * epact + 22 * weekday) / 451);
  const marchOffset = epact + weekday - 7 * correction + 114;
  return NaiveDate.fromYmd1Exp(year, Math.floor(marchOffset / 31), marchOffset % 31 + 1);
}

/** Zero-based positions in a library year mask, including the trailing week. */
export function libraryWeekIndices(
  weeks: readonly (number | string)[],
  weekStart: Weekday,
  yearLength: number,
  jan1Weekday: Weekday,
  previousYearLength: number,
  priorJan1Weekday?: Weekday,
): Set<number> {
  const firstWeekStart = (weekStart.dow - jan1Weekday.dow + 7) % 7;
  const weekOneStart = firstWeekStart >= 4 ? firstWeekStart - 7 : firstWeekStart;
  const weeksInYear = Math.floor((yearLength - weekOneStart + 3) / 7);
  const days = new Set<number>();
  const addWeek = (start: number) => {
    for (let day = Math.max(0, start); day < start + 7; day++) {
      days.add(day);
    }
  };

  for (const requested of weeks) {
    const week = typeof requested === "number" && requested < 0
      ? requested + weeksInYear + 1
      : Number(requested);
    if (!(week > 0 && week <= weeksInYear)) continue;
    const start = weekOneStart + Math.max(0, week - 1) * 7;
    if (!Number.isInteger(start)) continue;
    const length = 7 - ((start - weekOneStart) % 7 + 7) % 7;
    for (let day = Math.max(0, start); day < start + length; day++) days.add(day);
  }
  const nextWeekOne = weekOneStart + weeksInYear * 7;
  if (weeks.includes(1) && nextWeekOne < yearLength) addWeek(nextWeekOne);

  if (weekOneStart > 0 && weeks.includes(-1)) {
    addWeek(weekOneStart - 7);
  } else if (weekOneStart > 0 && priorJan1Weekday != null) {
    const priorFirstWeekStart = (weekStart.dow - priorJan1Weekday.dow + 7) % 7;
    // Both libraries use the current year's remaining days in the second
    // branch of the previous-year calculation.
    const previousLastWeek = priorFirstWeekStart >= 4
      ? 52 + Math.floor(((previousYearLength + 7 - priorFirstWeekStart) % 7) / 4)
      : 52 + Math.floor(((yearLength - weekOneStart) % 7) / 4);
    if (weeks.includes(previousLastWeek)) {
      addWeek(weekOneStart - 7);
    }
  }
  return days;
}

function week1Start(yr: number, wkst: Weekday): YearMonthDay {
  const jan1 = YearMonthDay.fromYmd1Exp(yr, 1, 1);
  const offset = (jan1.dayOfWeek.dow - wkst.dow + 7) % 7;
  return offset <= 3 ? jan1.addDays(-offset) : jan1.addDays(7 - offset);
}

export function weekYearOf(date: NaiveDate, wkst: Weekday): number {
  if (date.dse < week1Start(date.yr, wkst).dse) return date.yr - 1;
  if (date.dse >= week1Start(date.yr + 1, wkst).dse) return date.yr + 1;
  return date.yr;
}

export namespace YearMonthDayFilter {
  type Filter = YearMonthDayFilter;

  export function identity(): Filter {
    return ([nd]) => _identity(nd);
  }

  function* _identity(
    nd: YearMonthDay.MaybeValid,
  ): Generator<PartialDate.Tuple> {
    yield [nd, "day"];
  }

  const SELECT_MONTH_POSITIONS = Symbol("YearMonthDayFilter.selectMonthPositions");

  interface MonthlyPositionFilter extends Filter {
    readonly [SELECT_MONTH_POSITIONS]?: (
      month: YearMonthDay.MaybeValid,
      positions: readonly number[],
    ) => Generator<PartialDate.Tuple> | undefined;
  }

  /**
   * `inner`'s days in each period, narrowed to the positions BYSETPOS names
   * (1-based from the period's first day, negative from its last), in order.
   * Days that do not exist (Feb 31) are not counted.
   */
  interface RestrictableFilter extends Filter {
    readonly restrict: (keep: (date: YearMonthDay.MaybeValid) => boolean) => Filter;
  }

  function keepFilter(
    inner: Filter,
    keep: (date: YearMonthDay.MaybeValid) => boolean,
  ): Filter {
    if ("restrict" in inner) return (inner as RestrictableFilter).restrict(keep);
    return function* (partialdate: PartialDate.Tuple): Generator<PartialDate.Tuple> {
      for (const t of inner(partialdate)) {
        if (keep(t[0])) yield t;
      }
    };
  }

  export function bySetPos(inner: Filter, positions: readonly number[]): Filter {
    const selectMonthPositions = (inner as MonthlyPositionFilter)[SELECT_MONTH_POSITIONS];
    const filter = function* (partialdate: PartialDate.Tuple): Generator<PartialDate.Tuple> {
      if (partialdate[1] === "month" && selectMonthPositions) {
        const selected = selectMonthPositions(partialdate[0], positions);
        if (selected) {
          yield* selected;
          return;
        }
      }
      if (positions.length === 1) {
        const position = positions[0];
        const rank = Math.abs(position);
        if (rank === 1 || rank === 2) {
          const selected = selectEdge(inner(partialdate), rank, position < 0);
          if (selected != null) yield selected;
          return;
        }
      }

      const days = new Map<number, PartialDate.Tuple>();
      for (const [day, unit] of inner(partialdate)) {
        const valid = day.toResult().asOk();
        if (valid != null) days.set(valid.dse, [valid, unit]);
      }
      const sorted = [...days.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
      for (const i of positionIndices(positions, sorted.length)) yield sorted[i];
    };
    return Object.assign(filter, {
      restrict: (keep: (date: YearMonthDay.MaybeValid) => boolean): Filter =>
        bySetPos(keepFilter(inner, keep), positions),
    });
  }

  function positionIndex(position: number, length: number): number {
    const index = position > 0 ? position - 1 : length + position;
    return index >= 0 && index < length ? index : -1;
  }

  function positionIndices(positions: readonly number[], length: number): number[] {
    const picked = new Set<number>();
    for (const position of positions) {
      const index = positionIndex(position, length);
      if (index >= 0) picked.add(index);
    }
    return [...picked].sort((a, b) => a - b);
  }

  /** Rank the first or last two distinct days in a single pass. */
  function selectEdge(
    candidates: Generator<PartialDate.Tuple>,
    rank: 1 | 2,
    fromEnd: boolean,
  ): PartialDate.Tuple | undefined {
    const direction = fromEnd ? 1 : -1;
    let firstKey = -Infinity;
    let secondKey = -Infinity;
    let firstDay: YearMonthDay | undefined;
    let secondDay: YearMonthDay | undefined;
    let firstUnit: DateUnit.Type = "day";
    let secondUnit: DateUnit.Type = "day";
    for (const [day, unit] of candidates) {
      const valid = day.toResult().asOk();
      if (valid == null) continue;
      const key = direction * valid.dse;
      // An equal key replaces the earlier tuple, as the general map does.
      if (key >= firstKey) {
        if (rank === 2 && key > firstKey) {
          secondKey = firstKey;
          secondDay = firstDay;
          secondUnit = firstUnit;
        }
        firstKey = key;
        firstDay = valid;
        firstUnit = unit;
      } else if (rank === 2 && key >= secondKey) {
        secondKey = key;
        secondDay = valid;
        secondUnit = unit;
      }
    }

    if (rank === 1 && firstDay != null) return [firstDay, firstUnit];
    if (rank === 2 && secondDay != null) return [secondDay, secondUnit];
  }

  const COMPOSED_FILTERS = Symbol("YearMonthDayFilter.composedFilters");

  interface ComposedFilter extends RestrictableFilter {
    readonly [COMPOSED_FILTERS]?: readonly Filter[];
  }

  function flattenComposed(filters: readonly Filter[]): Filter[] {
    const flat: Filter[] = [];
    for (const f of filters) {
      const inner = (f as ComposedFilter)[COMPOSED_FILTERS];
      if (inner != null && inner.length > 0) {
        flat.push(...inner);
      } else {
        flat.push(f);
      }
    }
    return flat;
  }

  function buildComposed(
    filters: readonly Filter[],
    inheritedKeeps: readonly ((date: YearMonthDay.MaybeValid) => boolean)[],
  ): Filter {
    // Pipeline composition is associative: flattening nested compose() chains
    // ensures MonthLimit straddling and downstream bySetPos restrictions behave
    // identically regardless of how sub-pipelines are grouped.
    const flat = flattenComposed(filters);
    const last = flat.length - 1;
    const activeKeeps: Array<(date: YearMonthDay.MaybeValid) => boolean> = [...inheritedKeeps];
    const chain: Filter[] = [];
    for (let i = 0; i < flat.length; i++) {
      const f = flat[i]!;
      if (i < last && "straddling" in f) {
        const limit = f as MonthLimit;
        chain.push(limit.straddling);
        activeKeeps.push(limit.keeps);
      } else if (activeKeeps.length > 0 && "restrict" in f) {
        const currentKeeps = [...activeKeeps];
        chain.push(
          (f as RestrictableFilter).restrict((d) => currentKeeps.every((k) => k(d))),
        );
      } else {
        chain.push(f);
      }
    }
    const base: Filter = activeKeeps.length === 0
      ? (partialdate) => _compose(partialdate, chain)
      : function* (
          partialdate: PartialDate.Tuple,
        ): Generator<PartialDate.Tuple> {
          for (const t of _compose(partialdate, chain)) {
            if (activeKeeps.every((k) => k(t[0]))) yield t;
          }
        };
    const meta: {
      restrict: (keep: (date: YearMonthDay.MaybeValid) => boolean) => Filter;
      [COMPOSED_FILTERS]?: readonly Filter[];
    } = {
      restrict: (keep) => buildComposed(flat, [...inheritedKeeps, keep]),
    };
    if (inheritedKeeps.length === 0 && flat.length > 0) {
      meta[COMPOSED_FILTERS] = flat;
    }
    return Object.assign(base, meta);
  }

  export function compose(filters: Filter[]): Filter {
    return buildComposed(filters, []);
  }

  function* _compose(
    partialdate: PartialDate.Tuple,
    filters: Filter[],
  ): Generator<PartialDate.Tuple> {
    const generators: Generator<PartialDate.Tuple>[] = [];
    const uniqueDates = new Set<string>(); // To deduplicate final dates

    let iterationFailed = false;
    try {
      let curr: PartialDate.Tuple = partialdate;
      for (const [idx, f] of filters.entries()) {
        const gen = f(curr);
        const next = gen.next();
        if (next.done) break;
        generators.push(gen);
        curr = next.value;
        if (idx === filters.length - 1) {
          const dateKey = curr[0].toString();
          if (!uniqueDates.has(dateKey)) {
            uniqueDates.add(dateKey);
            yield curr;
          }
        }
      }

      while (true) {
        if (generators.length === filters.length) {
          const leaf = generators.pop();
          if (!leaf) return;
          for (const value of leaf) {
            const dateKey = value[0].toString();
            if (!uniqueDates.has(dateKey)) {
              uniqueDates.add(dateKey);
              yield value;
            }
          }
        }

        const top = generators.pop();
        if (!top) break;

        const next = top.next();
        if (next.done) continue;

        curr = next.value;
        generators.push(top);

        const gen = filters[generators.length]!(curr);
        generators.push(gen);
      }
    } catch (error) {
      iterationFailed = true;
      throw error;
    } finally {
      // Close still-suspended iterators in the same order as nested for-of.
      let closeFailure: { error: unknown } | undefined;
      while (generators.length > 0) {
        try {
          generators.pop()!.return(undefined);
        } catch (error) {
          closeFailure ??= { error };
        }
      }
      if (!iterationFailed && closeFailure) throw closeFailure.error;
    }
  }

  export function byWeekday(dayOfWeeks: Weekday[]): Filter {
    const dow1: Option<boolean>[] = [];
    for (const dow of dayOfWeeks) {
      dow1[dow.dow] = true;
    }
    const filter = (partialdate: PartialDate.Tuple) => _byWeekday(partialdate, dow1);
    return Object.assign(filter, {
      [SELECT_MONTH_POSITIONS]: (
        { yr, mth }: YearMonthDay.MaybeValid,
        positions: readonly number[],
      ) => {
        const start = { yr, mth, day: 1 as DayOfMonth1 };
        const daysInMonth = YearMonth.daysInMonth(start);
        const firstDay = Ymd1Like.dse(start);
        // The iterator ranks and deduplicates by epoch day. Keep that path
        // when day counts lose precision or a position is not an integer.
        if (
          !Number.isSafeInteger(firstDay) ||
          !Number.isSafeInteger(firstDay + daysInMonth) ||
          !positions.every(Number.isInteger)
        ) return undefined;
        return selectMonthlyWeekdays(start, daysInMonth, Weekday.fromDse(firstDay), dow1, positions);
      },
    });
  }

  function* selectMonthlyWeekdays(
    { yr, mth }: Ym1Like,
    daysInMonth: number,
    firstWeekday: number,
    dow1: Option<boolean>[],
    positions: readonly number[],
  ): Generator<PartialDate.Tuple> {
    const daysInWeek: number[] = [];
    let count = 0;
    for (let day = 1; day <= 7; day++) {
      if (dow1[(firstWeekday + day - 2) % 7 + 1]) {
        daysInWeek.push(day);
        count += Math.floor((daysInMonth - day) / 7) + 1;
      }
    }

    // Each full week repeats the first week's candidates in the same order.
    const dayAt = (index: number) =>
      7 * Math.floor(index / daysInWeek.length) + daysInWeek[index % daysInWeek.length];
    if (positions.length === 1) {
      const index = positionIndex(positions[0], count);
      if (index >= 0) yield [YearMonthDay.fromYmd1Exp(yr, mth, dayAt(index)), "day"];
      return;
    }
    for (const index of positionIndices(positions, count)) {
      yield [YearMonthDay.fromYmd1Exp(yr, mth, dayAt(index)), "day"];
    }
  }

  function* _byWeekday(
    [cand, unit]: PartialDate.Tuple,
    dow1: Option<boolean>[],
  ): Generator<PartialDate.Tuple> {
    switch (unit) {
      case "year": {
        // The calendar year holding `cand` (not a year-long window from it).
        const { yr } = cand;
        const jan1 = YearMonthDay.fromYmd1Unchecked(yr, 1, 1);
        let firstDow0 = jan1.dayOfWeek.dow - 1;
        for (let mth = 1; mth <= 12; mth++) {
          const daysInMonth = YearMonth.daysInMonth({ yr, mth: mth as Month1 });
          for (let day0 = 0; day0 < daysInMonth; day0++) {
            if (dow1[(firstDow0 + day0) % 7 + 1]) {
              yield [YearMonthDay.fromYmd1Exp(yr, mth, day0 + 1), "day"];
            }
          }
          firstDow0 = (firstDow0 + daysInMonth) % 7;
        }
        break;
      }
      case "month": {
        const { yr, mth } = cand;
        const daysInMonth = YearMonth.daysInMonth(cand);
        const first = YearMonthDay.fromYmd1Unchecked(yr, mth, 1);
        const firstDow0 = first.dayOfWeek.dow - 1;
        for (let day0 = 0; day0 < daysInMonth; day0++) {
          if (dow1[(firstDow0 + day0) % 7 + 1]) {
            yield [YearMonthDay.fromYmd1Unchecked(yr, mth, day0 + 1), "day"];
          }
        }
        break;
      }
      case "week":
        for (let i = 0; i < 7; ++i) {
          const day = cand.addDays(i);
          if (dow1[day.dayOfWeek.dow]) yield [day, "day"];
        }
        break;
      case "day":
        if (dow1[cand.dayOfWeek.dow]) yield [cand, "day"];
        break;
    }
  }

  /**
   * A filter that limits dates to a set of months (BYMONTH). On its own, a
   * week is kept when its own date is in the months. Inside `compose`,
   * before filters that expand the week into days, `straddling` keeps a
   * week holding any day of the months instead, and `compose` holds each
   * date the chain yields to the months (`keeps`).
   */
  export interface MonthLimit extends Filter {
    readonly straddling: Filter;
    readonly keeps: (date: YearMonthDay.MaybeValid) => boolean;
  }

  export function byMonthOfYear(months: Month[]): MonthLimit {
    const mths = new Set(months.map((mth) => mth.mth1));
    const ordered: Month1[] = [];
    for (let month = 1; month <= 12; month++) {
      if (mths.has(month as Month1)) ordered.push(month as Month1);
    }
    const filter = (partialdate: PartialDate.Tuple) => _byMonthOfYear(partialdate, mths, ordered, false);
    return Object.assign(filter, {
      straddling: (partialdate: PartialDate.Tuple) => _byMonthOfYear(partialdate, mths, ordered, true),
      keeps: (date: YearMonthDay.MaybeValid) => mths.has(date.mth),
    });
  }

  function* _byMonthOfYear(
    [partialdate, unit]: PartialDate.Tuple,
    mths: Set<Month1>,
    ordered: readonly Month1[],
    straddling: boolean,
  ): Generator<PartialDate.Tuple> {
    switch (unit) {
      case "year": {
        const start = YearMonthDay.fromYmd1Exp(
          partialdate.yr,
          1,
          partialdate.day,
        );
        for (const month of ordered) yield [start.addMonths(month - 1), "month"];
        break;
      }
      case "month":
        if (mths.has(partialdate.mth)) yield [partialdate, "month"];
        break;
      case "week":
        if (!straddling) {
          if (mths.has(partialdate.mth)) yield [partialdate, "week"];
          break;
        }
        for (let i = 0; i < 7; ++i) {
          if (mths.has(partialdate.addDays(i).mth)) {
            yield [partialdate, "week"];
            break;
          }
        }
        break;
      case "day":
        if (mths.has(partialdate.mth)) yield [partialdate, "day"];
        break;
    }
  }


  export function byDayOfMonth(dayOfMonths: DayOfMonth1[] | number[]): Filter {
    const domsPos = dayOfMonths.filter((doy) => doy >= 0);
    domsPos.sort((a, b) => a - b);
    const domsNeg = dayOfMonths.filter((doy) => doy < 0);
    domsNeg.sort((a, b) => b - a);

    // The resolved list depends only on month length.
    const byLength = new Map<number, DayOfMonth1[]>();
    // The month's days the values name, each once, in order (a negative
    // and a positive value can name the same day: -2 and 30 in a 31-day month).
    const makeDoms = (ym1: Ym1Like): DayOfMonth1[] => {
      const monthLen = YearMonth.daysInMonth(ym1);
      let resolved = byLength.get(monthLen);
      if (resolved == null) {
        const doms = new Set([
          ...domsPos,
          ...domsNeg.map((dom) => monthLen + dom + 1),
        ]);
        resolved = [...doms].sort((a, b) => a - b) as DayOfMonth1[];
        byLength.set(monthLen, resolved);
      }
      return resolved;
    };
    return (partialdate: PartialDate.Tuple) =>
      _byDayOfMonth(partialdate, makeDoms);
  }

  function* _byDayOfMonth(
    [cand, unit]: PartialDate.Tuple,
    makeDoms: (ym1: Ym1Like) => DayOfMonth1[],
  ): Generator<PartialDate.Tuple> {
    switch (unit) {
      case "year":
        {
          const start = YearMonthDay.fromYmd1Exp(cand.yr, 1, 1);
          for (const mth of start.succ(DateUnit.months(1), 12)) {
            for (const day of makeDoms(mth)) {
              yield [
                YearMonthDay.fromYmd1Unchecked(mth.yr, mth.mth, day),
                "day",
              ];
            }
          }
        }
        break;
      case "month":
        for (const day of makeDoms(cand)) {
          yield [YearMonthDay.fromYmd1Unchecked(cand.yr, cand.mth, day), "day"];
        }
        break;
      case "week":
        for (let i = 0; i < 7; ++i) {
          const date = cand.add({ days: i });
          const doms = makeDoms(date);
          if (doms.includes(date.day)) yield [date, "day"];
        }
        break;
      case "day":
        if (makeDoms(cand).includes(cand.day)) yield [cand, "day"];
        break;
    }
  }

  export function byDayOfYear(dayOfYears: DayOfYear1[] | number[]): Filter {
    const doysPos = dayOfYears.filter((doy) => doy >= 0);
    const doysNeg = dayOfYears.filter((doy) => doy < 0);

    // The year's days the values name, each once, in order; a value past the
    // year's end (366 in a 365-day year) names none.
    const doysOf = (len: number) =>
      [...new Set([...doysPos, ...doysNeg.map((doy) => len + doy + 1)])]
        .filter((doy) => doy >= 1 && doy <= len)
        .sort((a, b) => a - b);
    const doys365 = doysOf(365);
    const doys366 = doysOf(366);

    return (partialdate: PartialDate.Tuple) =>
      _byDayOfYear(partialdate, doys365, doys366);
  }

  function* _byDayOfYear(
    [cand, unit]: PartialDate.Tuple,
    doys365: number[],
    doys366: number[],
  ): Generator<PartialDate.Tuple> {
    // Handle years, months, and days cases normally with current year
    if (unit !== "week") {
      const yr = cand.yr;
      const doys = Year.isLeapYear(yr) ? doys366 : doys365;
      const jan1 = YearMonthDay.fromYmd1Exp(yr, 1, 1);
      for (const doy of doys) {
        const date = jan1.addDays(doy - 1);
        switch (unit) {
          case "year":
            if (date.yr === cand.yr) yield [date, "day"];
            break;
          case "month":
            if (date.yr === cand.yr && date.mth === cand.mth) yield [date, "day"];
            break;
          case "day":
            if (date.cmpInvalid(cand) === 0) yield [date, "day"];
            break;
        }
      }
      return;
    }

    const yearsToCheck = [cand.yr];

    const weekStart = cand.castValid();
    const weekEnd = weekStart.addDays(6);

    if (weekStart.yr !== weekEnd.yr) {
      yearsToCheck.push(weekEnd.yr);
    }

    if (cand.mth === 12 && cand.day >= 24) {
      yearsToCheck.push(cand.yr + 1);
    } else if (cand.mth === 1 && cand.day <= 7) {
      yearsToCheck.push(cand.yr - 1);
    }

    const first = weekStart.dse;
    const last = weekEnd.dse;
    for (const yr of new Set(yearsToCheck)) {
      const doys = Year.isLeapYear(yr) ? doys366 : doys365;
      const jan1 = YearMonthDay.fromYmd1Exp(yr, 1, 1);
      const yearStart = jan1.dse;
      for (const doy of doys) {
        const dse = yearStart + doy - 1;
        if (dse >= first && dse <= last) yield [jan1.addDays(doy - 1), "day"];
      }
    }
  }

  /** Western Easter plus the dateutil rule's day offsets. */
  export function byEaster(
    offsets: readonly (number | string)[],
    start?: NaiveDate,
  ): Filter & { checkYear(year: number): void } {
    const datesByYear = new Map<number, NaiveDate[]>();
    function datesOf(year: number): NaiveDate[] {
      const saved = datesByYear.get(year);
      if (saved != null) return saved;
      const jan1 = NaiveDate.fromYmd1Exp(year, 1, 1);
      const easterIndex = westernEaster(year).dse - jan1.dse;
      const maskLength = Year.length(year) + 7;
      const days = new Set<number>();
      for (const offset of offsets) {
        const slot = typeof offset === "string" ? BigInt(easterIndex) + BigInt(offset) : easterIndex + offset;
        // dateutil indexes a year mask with seven trailing slots and permits negative indices.
        if (typeof slot === "bigint" && (slot < -(1n << 63n) || slot >= 1n << 63n)) {
          throw new RangeError("cannot fit 'int' into an index-sized integer");
        }
        const index = Number(slot) < 0 ? maskLength + Number(slot) : Number(slot);
        if (index < 0 || index >= maskLength) {
          throw new RangeError(typeof slot === "bigint"
            ? "list assignment index out of range"
            : "BYEASTER offset is outside the year mask");
        }
        days.add(index);
      }
      const dates = [...days].sort((a, b) => a - b).map((day) => jan1.addDays(day));
      datesByYear.set(year, dates);
      return dates;
    }
    const select: Filter = function* ([candidate, unit]) {
      const first = unit === "year" ? NaiveDate.fromYmd1Exp(candidate.yr, 1, 1)
        : unit === "month" ? NaiveDate.fromYmd1Exp(candidate.yr, candidate.mth, 1)
        : candidate.castValid();
      const end = unit === "year" ? first.add({ yrs: 1 })
        : unit === "month" ? first.add({ mths: 1 })
        : first.addDays(unit === "week" ? 7 : 1);
      // dateutil starts the first partial week at DTSTART. Later weeks
      // use their starting year's mask, including its trailing January slots.
      const lower = unit === "week" && start != null && first.dse < start.dse ? start : first;
      for (const day of datesOf(lower.yr)) {
        if (day.dse >= lower.dse && day.dse < end.dse) yield [day, "day"];
      }
    };
    return Object.assign(select, {
      checkYear(year: number): void {
        datesOf(year);
      },
    });
  }

  /** rrule.js matches one zero-based day index within each yearly period. */
  export function byRruleJsEaster(offset: number): Filter {
    let year: number | undefined;
    let selected: NaiveDate | undefined;
    return function* ([candidate, unit]) {
      if (year !== candidate.yr) {
        year = candidate.yr;
        const easter = westernEaster(year);
        const midnight = Date.UTC(year, easter.month1 - 1, easter.day1 + offset);
        const dayIndex = (midnight - Date.UTC(year, 0, 1)) / Time.MS_PER_DAY;
        selected = dayIndex >= 0 && dayIndex < Year.length(year)
          ? NaiveDate.fromYmd1Exp(year, 1, 1).addDays(dayIndex)
          : undefined;
      }
      if (
        selected != null &&
        (unit === "year" || (unit === "month" && selected.mth === candidate.mth) ||
          (unit === "day" && selected.dse === candidate.dse))
      ) yield [selected, "day"];
    };
  }

  /** Expand week numbers within the selected recurrence year. */
  export function byWeekOfRecurrenceYear(
    weeks: readonly number[],
    weekStart: Weekday,
  ): Filter {
    const selected = new Set(weeks);
    return function* ([period]) {
      const start = week1Start(period.yr, weekStart);
      const yearWeeks = (week1Start(period.yr + 1, weekStart).dse - start.dse) / 7;
      for (let ordinal = 1; ordinal <= yearWeeks; ordinal++) {
        if (!selected.has(ordinal) && !selected.has(ordinal - yearWeeks - 1)) continue;
        const offset = (ordinal - 1) * 7;
        for (let day = 0; day < 7; day++) yield [start.addDays(offset + day), "day"];
      }
    };
  }

  /** The calendar-year week mask used by dateutil 2.8.2 and rrule.js 2.8.1. */
  export function byLibraryWeekNo(
    weeks: readonly number[],
    weekStart: Weekday,
    weeklyStart?: NaiveDate,
  ): Filter {
    const cached = new Map<number, readonly NaiveDate[]>();
    function weekDays(year: number): readonly NaiveDate[] {
      const prior = cached.get(year);
      if (prior != null) return prior;

      const jan1 = NaiveDate.fromYmd1Exp(year, 1, 1);
      const yearLength = Year.length(year);
      const previous = year > 1 ? NaiveDate.fromYmd1Exp(year - 1, 1, 1) : undefined;
      const days = libraryWeekIndices(
        weeks, weekStart, yearLength, jan1.dayOfWeek,
        Year.length(year - 1), previous?.dayOfWeek,
      );
      const dates = [...days].sort((a, b) => a - b).map((day) => jan1.addDays(day));
      cached.set(year, dates);
      return dates;
    }

    return function* ([cand, unit]) {
      if (weeklyStart != null && (unit === "week" || unit === "day")) {
        const first = cand.castValid();
        const elapsed = (first.dayOfWeek.dow - weekStart.dow + 7) % 7;
        const anchor = first.dse - elapsed < weeklyStart.dse
          ? weeklyStart
          : first.addDays(-elapsed);
        const end = first.dse + (unit === "week" ? 7 : 1);
        for (const day of weekDays(anchor.yr)) {
          if (day.dse >= first.dse && day.dse >= anchor.dse && day.dse < end) yield [day, "day"];
        }
        return;
      }
      for (const day of weekDays(cand.yr)) {
        if (day.yr !== cand.yr) continue;
        if (unit === "year" || (unit === "month" && day.mth === cand.mth) ||
            (unit === "day" && day.dse === cand.dse)) {
          yield [day, "day"];
        }
      }
    };
  }

  export function byWeekNo(
    weekno1: number,
    useCalendarYear: boolean = false,
    wkst: Weekday = Weekday.MON,
  ): Filter {
    if (weekno1 === 0) throw new Error("weekno1 cannot be 0");
    return (partialdate: PartialDate.Tuple) =>
      _byWeekNo(
        partialdate,
        weekno1 as WeekOfYear1,
        useCalendarYear,
        wkst,
      );
  }

  export function byWeekNoGoogle(
    weekno1: number,
    useCalendarYear: boolean = false,
    wkst: Weekday = Weekday.MON,
    seriesStart?: NaiveDate,
  ): Filter {
    if (weekno1 === 0) throw new Error("weekno1 cannot be 0");
    return (partialdate: PartialDate.Tuple) =>
      _byWeekNoGoogle(
        partialdate,
        weekno1 as WeekOfYear1,
        useCalendarYear,
        wkst,
        seriesStart,
      );
  }

  function* _byWeekNo(
    [cand, unit]: PartialDate.Tuple,
    weekno1: WeekOfYear1,
    useCalendarYear: boolean = false,
    wkst: Weekday = Weekday.MON,
  ): Generator<PartialDate.Tuple> {
    let bounds: NaiveDate.Range;
    
    switch (unit) {
      case "year": {
        const start = NaiveDate.fromYmd1Exp(cand.yr, 1, 1);
        bounds = new NaiveDate.Range(start, start.add({ yrs: 1 }));
        break;
      }
      case "month": {
        const start = NaiveDate.fromYmd1Exp(cand.yr, cand.month1, 1);
        bounds = new NaiveDate.Range(start, start.add({ mths: 1 }));
        break;
      }
      case "day": {
        const maybeStart = NaiveDate.fromYmd1(cand.yr, cand.month1, cand.day1);
        if (maybeStart.isErr) return;
        const start = maybeStart.exp();
        bounds = new NaiveDate.Range(start, start.add({ days: 1 }));
        break;
      }
      case "week": {
        const maybeStart = NaiveDate.fromYmd1(cand.yr, cand.month1, cand.day1);
        if (maybeStart.isErr) return;
        const start = maybeStart.exp();
        bounds = new NaiveDate.Range(start, start.add({ days: 7 }));
        break;
      }
    }

    if (!useCalendarYear) {
      yield* isoWeekDates(cand.yr, bounds, weekno1, wkst);
      return;
    }

    const seen = new Set<string>();
    if (weekno1 < 0) {
      const monday = weekFromEnd(cand.yr, weekno1);
      if (monday != null) yield* clippedWeek(monday, 0, bounds, seen);
      return;
    }

    for (const year of [cand.yr - 1, cand.yr, cand.yr + 1]) {
      const week1 = Year.isoWeekMon(year, 1 as WeekOfYear1);
      const offset = (weekno1 - 1) * 7;
      if (Number.isSafeInteger(offset)) yield* clippedWeek(week1, offset, bounds, seen);
      else yield* clippedWeek(week1.addDays(offset), 0, bounds, seen);
    }
  }

  function weekFromEnd(year: number, weekno1: WeekOfYear1): YearMonthDay | undefined {
    const weeks = Year.numWeeks(year);
    const ordinal = weeks + weekno1 + 1;
    if (ordinal > 0 && ordinal <= weeks) {
      return Year.isoWeekMon(year, 1 as WeekOfYear1).addDays((ordinal - 1) * 7);
    }
  }

  function* isoWeekDates(
    year: number,
    bounds: NaiveDate.Range,
    weekno1: WeekOfYear1,
    wkst: Weekday = Weekday.MON,
  ): Generator<PartialDate.Tuple> {
    const seen = new Set<string>();
    const isMon = wkst.dow === Weekday.MON.dow;
    for (const yr of [year - 1, year, year + 1]) {
      const week1 = isMon ? Year.isoWeekMon(yr, 1 as WeekOfYear1) : week1Start(yr, wkst);
      const weeks = isMon
        ? Year.numWeeks(week1.isoYw1.yr)
        : (week1Start(yr + 1, wkst).dse - week1.dse) / 7;
      if (!(Math.abs(weekno1) <= weeks)) continue;
      const ordinal = weekno1 > 0 ? weekno1 : weeks + weekno1 + 1;
      yield* clippedWeek(week1, (ordinal - 1) * 7, bounds, seen);
    }
  }

  function* clippedWeek(
    anchor: YearMonthDay,
    offset: number,
    bounds: NaiveDate.Range,
    seen: Set<string>,
    onlyYear?: number,
  ): Generator<PartialDate.Tuple> {
    const start = anchor.dse + offset;
    const first = bounds.start.dse;
    const end = bounds.end.dse;
    // Clip integral offsets before constructing dates. Fractional offsets
    // retain the calendar conversion and validation of addDays.
    const integral = Number.isSafeInteger(start) && Number.isSafeInteger(offset);
    for (let i = 0; i < 7; i++) {
      const dse = start + i;
      if (integral && !(dse >= first && dse < end)) continue;
      const day = anchor.addDays(offset + i);
      if (!integral && !bounds.contains(day)) continue;
      if (onlyYear != null && day.yr !== onlyYear) continue;
      const key = day.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      yield [day, "day"];
    }
  }

  export function byNthWeekday(
    dayOfWeeks: Weekday.Nth[],
    simpleEqForDays: boolean = true,
    ordinalPeriod?: "year" | "month",
  ): Filter {
    if (ordinalPeriod == null) {
      return (partialdate) => _byNthWeekday(partialdate, dayOfWeeks, simpleEqForDays);
    }
    return function* (partialdate: PartialDate.Tuple) {
      const [start, unit] = partialdate;
      if (unit !== "day" && unit !== "week") {
        yield* _byNthWeekday(partialdate, dayOfWeeks, simpleEqForDays);
        return;
      }
      const length = unit === "week" ? 7 : 1;
      for (let i = 0; i < length; i++) {
        const date = start.addDays(i);
        for (const [ranked] of _byNthWeekday([date, ordinalPeriod], dayOfWeeks)) {
          if (ranked.castValid().dse === date.dse) {
            yield [date, "day"];
            break;
          }
        }
      }
    };
  }

  function* _byNthWeekday(
    [cand, unit]: PartialDate.Tuple,
    dayOfWeeks: Weekday.Nth[],
    simpleEqForDays: boolean = true,
  ): Generator<PartialDate.Tuple> {
    switch (unit) {
      case "year":
        {
          const wrap = Year.length(cand.yr);
          const start = YearMonthDay.fromYmd1Exp(cand.yr, 1, 1);
          const end = YearMonthDay.fromYmd1Exp(cand.yr, 12, 31);
          const days = Weekday.nthForYear(dayOfWeeks, start, end, wrap);

          for (const ndow of days) {
            yield [start.add({ days: ndow }), "day"];
          }
        }
        break;
      case "month":
        {
          const wrap = YearMonth.daysInMonth(cand);
          const start = YearMonthDay.fromYmd1Exp(cand.yr, cand.mth, 1);
          const end = YearMonthDay.fromYmd1Exp(cand.yr, cand.mth, wrap);
          const days = Weekday.nthForYear(dayOfWeeks, start, end, wrap);

          for (const ndow of days) {
            const resultDate = start.add({ days: ndow });
            yield [resultDate, "day"];
          }
        }
        break;
      case "week": {
        for (let i = 0; i < 7; ++i) {
          const date = cand.addDays(i);
          for (const ndow of dayOfWeeks) {
            if (ndow.weekday.dow === date.dayOfWeek.dow) {
              yield [date, "day"];
              break;
            }
          }
        }
        return;
      }
      case "day":
        {
          if (simpleEqForDays) {
            for (const ndow of dayOfWeeks) {
              if (ndow.weekday === cand.dayOfWeek) {
                yield [cand, "day"];
                break;
              }
            }
            return;
          }

          // NOTE: represents Nth of every month
          //
          const wrap = YearMonth.daysInMonth(cand);
          const start = YearMonthDay.fromYmd1Exp(cand.yr, cand.mth, 1);
          const end = YearMonthDay.fromYmd1Exp(cand.yr, cand.mth, wrap);
          const days = Weekday.nthForYear(dayOfWeeks, start, end, wrap);

          for (const day0 of days) {
            if (day0 + 1 === cand.day) yield [start.addDays(day0), "day"];
          }
        }
        break;
    }
  }

  function* _byWeekNoGoogle(
    [cand, unit]: PartialDate.Tuple,
    weekno1: WeekOfYear1,
    useCalendarYear: boolean,
    wkst: Weekday,
    seriesStart?: NaiveDate,
  ): Generator<PartialDate.Tuple> {
    let bounds: NaiveDate.Range;
    
    // Google Calendar behavior: BYWEEKNO with monthly frequency spans entire year
    if (unit === "month") {
      const start = NaiveDate.fromYmd1Exp(cand.yr, 1, 1);
      bounds = new NaiveDate.Range(start, start.add({ yrs: 1 }));
    } else {
      switch (unit) {
        case "year": {
          const start = NaiveDate.fromYmd1Exp(cand.yr, 1, 1);
          bounds = new NaiveDate.Range(start, start.add({ yrs: 1 }));
          break;
        }
        case "day": {
          const maybeStart = NaiveDate.fromYmd1(cand.yr, cand.month1, cand.day1);
          if (maybeStart.isErr) return;
          const start = maybeStart.exp();
          bounds = new NaiveDate.Range(start, start.add({ days: 1 }));
          break;
        }
        case "week": {
          const maybeStart = NaiveDate.fromYmd1(cand.yr, cand.month1, cand.day1);
          if (maybeStart.isErr) return;
          const start = maybeStart.exp();
          bounds = new NaiveDate.Range(start, start.add({ days: 7 }));
          break;
        }
      }
    }

    if (!useCalendarYear) {
      yield* isoWeekDates(cand.yr, bounds, weekno1);
      return;
    }

    const seen = new Set<string>();
    const week1 = week1Start(cand.yr, wkst);
    let ordinal: number = weekno1;
    if (weekno1 < 0) {
      const lastDay = NaiveDate.fromYmd1Exp(cand.yr, 12, 31);
      const sunday = lastDay.addDays(-(lastDay.dayOfWeek.dow - Weekday.SUN.dow + 7) % 7);
      // At a start in the final Sunday-based week, Google uses the next year's
      // week count for the initial year's negative ordinals. Later years use
      // their own count. The selected week remains anchored to the candidate year.
      const countYear = seriesStart?.yr === cand.yr && seriesStart.dse >= sunday.dse
        ? cand.yr + 1
        : cand.yr;
      const weeks = (week1Start(countYear + 1, wkst).dse - week1Start(countYear, wkst).dse) / 7;
      ordinal = weeks + weekno1 + 1;
      if (ordinal <= 0) return;
    }

    const week = week1.addDays((ordinal - 1) * 7);
    if (unit === "year" || week.yr === cand.yr || weekno1 < 0) {
      yield* clippedWeek(week, 0, bounds, seen, cand.yr);
    }
  }
}
