import { NaiveDate } from "../naive-date.ts";
import { DateUnit } from "./date-unit.ts";
import { Month } from "./month.ts";
import type { PartialDate } from "./partial-date.ts";
import { DayOfMonth1, DayOfYear1, Month1, WeekOfYear1 } from "./units.ts";
import { Weekday } from "./weekday.ts";
import { Year } from "./year.ts";
import { YearMonth, Ym1Like } from "./year-month.ts";
import { YearMonthDay } from "./year-month-day.ts";
import type { Option } from "../option.ts";

export type YearMonthDayFilter = (
  partialdate: PartialDate.Tuple,
) => Generator<PartialDate.Tuple>;

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
    const filter = function* (partialdate: PartialDate.Tuple): Generator<PartialDate.Tuple> {
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
      const picked = new Set<number>();
      for (const p of positions) {
        const i = p > 0 ? p - 1 : sorted.length + p;
        if (p !== 0 && i >= 0 && i < sorted.length) picked.add(i);
      }
      for (const i of [...picked].sort((a, b) => a - b)) yield sorted[i];
    };
    return Object.assign(filter, {
      restrict: (keep: (date: YearMonthDay.MaybeValid) => boolean): Filter =>
        bySetPos(keepFilter(inner, keep), positions),
    });
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

  function buildComposed(
    filters: readonly Filter[],
    inheritedKeeps: readonly ((date: YearMonthDay.MaybeValid) => boolean)[],
  ): Filter {
    // A month limit before another filter passes the weeks that straddle its
    // months; each date the chain yields is then held to them (`MonthLimit`).
    // Any downstream positional selector (bySetPos), including one inside a
    // nested compose(), is restricted before ranking so out-of-month days in
    // a straddling week do not steal positions.
    const last = filters.length - 1;
    const activeKeeps: Array<(date: YearMonthDay.MaybeValid) => boolean> = [...inheritedKeeps];
    const chain: Filter[] = [];
    for (let i = 0; i < filters.length; i++) {
      const f = filters[i]!;
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
    return Object.assign(base, {
      restrict: (keep: (date: YearMonthDay.MaybeValid) => boolean): Filter =>
        buildComposed(filters, [...inheritedKeeps, keep]),
    });
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
  }

  export function byWeekday(dayOfWeeks: Weekday[]): Filter {
    const dow1: Option<boolean>[] = [];
    for (const dow of dayOfWeeks) {
      dow1[dow.dow] = true;
    }
    return (partialdate: PartialDate.Tuple) => _byWeekday(partialdate, dow1);
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
  ): Filter {
    if (weekno1 === 0) throw new Error("weekno1 cannot be 0");
    return (partialdate: PartialDate.Tuple) =>
      _byWeekNoGoogle(
        partialdate,
        weekno1 as WeekOfYear1,
        useCalendarYear,
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

  function week1Start(yr: number, wkst: Weekday): YearMonthDay {
    const jan1 = YearMonthDay.fromYmd1Exp(yr, 1, 1);
    const offset = (jan1.dayOfWeek.dow - wkst.dow + 7) % 7;
    return offset <= 3 ? jan1.addDays(-offset) : jan1.addDays(7 - offset);
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
  ): Filter {
    return (partialdate: PartialDate.Tuple) =>
      _byNthWeekday(partialdate, dayOfWeeks, simpleEqForDays);
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
    useCalendarYear: boolean = false,
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
    if (weekno1 < 0) {
      const monday = weekFromEnd(cand.yr, weekno1);
      if (monday != null) yield* clippedWeek(monday, 0, bounds, seen, cand.yr);
      return;
    }

    const week1 = Year.isoWeekMon(cand.yr, 1 as WeekOfYear1);
    const monday = week1.addDays((weekno1 - 1) * 7);
    if (unit === "year" || monday.yr === cand.yr) {
      yield* clippedWeek(monday, 0, bounds, seen, cand.yr);
    }
  }
}
