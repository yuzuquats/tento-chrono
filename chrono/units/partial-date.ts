import { NaiveDate } from "../naive-date";
import { GenericRange } from "../range";
import { Result, erm, ok } from "../result";
import { TimezoneRegion } from "../timezone-region";
import { TentoMath } from "../utils";
import { DateUnit } from "./date-unit";
import { Month } from "./month";
import { DayOfMonth1, Month0, Month1, WeekOfYear1 } from "./units";
import { Week, Yw1Like } from "./week";
import { Weekday } from "./weekday";
import { Year } from "./year";
import { YearMonth, Ym1Like } from "./year-month";
import { YearMonthDay } from "./year-month-day";

export class PartialDate {
  constructor(
    readonly type: DateUnit.Type,
    readonly yr: number,
    readonly mth: Option<Month1> = null,
    readonly day: Option<DayOfMonth1> = null,
    readonly wno: Option<WeekOfYear1> = null,
    readonly cached: Optional<{
      start: NaiveDate;
      end: NaiveDate;
      index: number;
    }> = {},
  ) {}

  // biome-ignore lint/suspicious/useGetterReturn: is correct
  get #index(): number {
    switch (this.type) {
      case "year":
        return this.yr;
      case "month":
        return this.yr * 12 + this.mth! - 1;
      case "day":
        return this.start.dse;
      case "week":
        return Week.weeksSinceEpoch(this as Yw1Like);
    }
  }
  get index(): number {
    if (this.cached.index != null) return this.cached.index;
    return (this.cached.index = this.#index);
  }

  toType(type: DateUnit.Type): PartialDate {
    if (type === this.type) return this;

    const date = this.start;
    switch (type) {
      case "year":
        return new PartialDate("year", date.yr);
      case "month":
        return new PartialDate("month", date.yr, date.month1);
      case "week":
        return new PartialDate("week", date.yr, null, null, date.isoWno);
      case "day":
        return new PartialDate("day", date.yr, date.month1, date.day1);
    }
  }

  toString(): string {
    switch (this.type) {
      case "year":
        return `y-${this.yr}`;
      case "month":
        return `ym-${this.yr}-${this.mth!}`;
      case "day":
        return `ymd-${this.yr}-${this.mth!}-${this.day!}`;
      case "week":
        return `yw-${this.yr}-${this.wno!}`;
    }
  }

  toStringReadable(): string {
    switch (this.type) {
      case "year":
        return `${this.yr}`;
      case "month":
        return `${Month.MONTHS0[(this.mth as number) - 1].shortName}, ${
          this.yr
        }`;
      case "day":
        return `${Month.MONTHS0[(this.mth as number) - 1].shortName} ${
          this.day
        }, ${this.yr}`;
      case "week":
        return `Week ${this.wno!}, ${this.yr}`;
    }
  }

  private _start(): NaiveDate {
    switch (this.type) {
      case "year":
        return NaiveDate.fromYmd1Exp(this.yr, 1, 1);
      case "month":
        return NaiveDate.fromYmd1Exp(this.yr, this.mth!, 1);
      case "day":
        return NaiveDate.fromYmd1Exp(this.yr, this.mth!, this.day!);
      case "week":
        return Week.dateFromWeekno(this as Yw1Like, Weekday.MON);
    }
  }

  get start(): NaiveDate {
    return this.cached.start ?? (this.cached.start = this._start());
  }

  get end(): NaiveDate {
    return this.cached.end ?? (this.cached.end = this.start.add(this.du));
  }

  equals(other: PartialDate): boolean {
    return (
      this.type === other.type &&
      this.yr === other.yr &&
      this.mth === other.mth &&
      this.day === other.day &&
      this.wno === other.wno
    );
  }

  get du(): DateUnit {
    return new DateUnit(1, this.type);
  }

  toRange(): NaiveDate.Range {
    return new NaiveDate.Range(this.start, this.end);
  }

  add(scalar: number): PartialDate {
    switch (this.type) {
      case "year": {
        return new PartialDate(this.type, this.yr + scalar);
      }
      case "month": {
        const { yr, mth } = YearMonth.add(this as Ym1Like, {
          mth: scalar as Option<Month0>,
        });
        return new PartialDate(this.type, yr, mth);
      }
      case "day": {
        return PartialDate.fromDate(this.start.addDays(scalar));
      }
      case "week": {
        const { yr, wno: week } = Week.addWeeks(
          { yr: this.yr, wno: this.wno! },
          scalar,
        );
        return new PartialDate(this.type, yr, null, null, week);
      }
    }
  }

  offsetFrom(date: NaiveDate): {
    index: number;
    days: number;
    maxDays: number;
  } {
    switch (this.type) {
      case "year": {
        return {
          index: date.yr - this.yr,
          days: date.dayOfYear,
          maxDays: Year.length(date.yr),
        };
      }
      case "month": {
        return {
          index: (date.yr - this.yr) * 12 + (date.mth - this.mth!),
          days: date.dayOfMonth,
          maxDays: YearMonth.daysInMonth(date),
        };
      }
      case "day": {
        return {
          index: date.differenceInDays(this.start),
          days: 0,
          maxDays: 1,
        };
      }
      case "week": {
        return {
          index: Week.differenceInWeeks(this as Yw1Like, date.isoYw1),
          days: date.dayOfWeek.isoDow,
          maxDays: 7,
        };
      }
    }
  }

  /**
   * Generate constituent sub-partials in a finer timescale.
   *
   * For example:
   * - A year PartialDate can generate its constituent months
   * - A month PartialDate can generate its constituent days
   * - A week PartialDate can generate its constituent days
   *
   * @param subType The finer timescale to generate (must be finer than this PartialDate's type)
   * @param count Optional limit on number of sub-partials to generate
   * @returns Array of PartialDates in the specified sub-timescale
   */
  generateSubPartials(subType: DateUnit.Type, count?: number): PartialDate[] {
    const subPartials: PartialDate[] = [];

    // Start with the first sub-partial at the beginning of this PartialDate's range
    let currentPd: PartialDate;

    switch (subType) {
      case "day": {
        currentPd = PartialDate.fromDate(this.start);
        break;
      }
      case "week": {
        const startDate = this.start;
        currentPd = new PartialDate(
          "week",
          startDate.isoYear,
          null,
          null,
          startDate.isoWno,
        );
        break;
      }
      case "month": {
        const startDate = this.start;
        currentPd = PartialDate.fromMonth(startDate.yr, startDate.mth);
        break;
      }
      case "year": {
        currentPd = PartialDate.fromYear(this.start.yr);
        break;
      }
    }

    // Generate sub-partials until we reach the count or exceed this PartialDate's range
    const endDate = this.end;
    let generated = 0;
    const maxCount = count ?? 1000; // Safety limit

    while (generated < maxCount) {
      // Check if we're still within this PartialDate's range
      if (currentPd.start.isBefore(endDate)) {
        subPartials.push(currentPd);
        generated++;

        // If count is specified and we've reached it, stop
        if (count != null && generated >= count) {
          break;
        }

        currentPd = currentPd.add(1);
      } else {
        break;
      }
    }

    return subPartials;
  }
}

export namespace PartialDate {
  export function fromDateAndType(
    type: DateUnit.Type,
    date: NaiveDate,
  ): PartialDate {
    switch (type) {
      case "year":
        return new NaiveDate.Partial("year", date.yr);
      case "month":
        return new NaiveDate.Partial("month", date.yr, date.month1);
      case "week":
        return new NaiveDate.Partial("week", date.yr, null, null, date.isoWno);
      case "day":
        return new NaiveDate.Partial("day", date.yr, date.month1, date.day1);
    }
  }

  export function parse(s: string): Result<PartialDate> {
    const [ty, yr, mw, d] = s.split("-");
    switch (ty) {
      case "ymd":
        return PartialDate.fromStr("day", yr, mw, d, null);
      case "ym":
        return PartialDate.fromStr("month", yr, mw, null, null);
      case "y":
        return PartialDate.fromStr("year", yr, null, null, null);
      case "yw":
        return PartialDate.fromStr("week", yr, null, null, mw);
    }
    return erm("unknown ty");
  }

  export function fromDate(d: NaiveDate): PartialDate {
    return new PartialDate("day", d.yr, d.month1, d.dayOfMonth, null, {
      start: d,
    });
  }

  export function fromWeek(yr: number, week1: number): PartialDate {
    return new PartialDate("week", yr, null, null, week1 as WeekOfYear1);
  }

  export function fromMonth(yr: number, mth: number): PartialDate {
    return new PartialDate("month", yr, mth as Month1, null, null);
  }

  export function fromYear(yr: number): PartialDate {
    return new PartialDate("year", yr, null, null, null);
  }

  export function fromYw1(yw1: Yw1Like): PartialDate {
    return new PartialDate("week", yw1.yr, null, null, yw1.wno);
  }

  export function fromStr(
    type: DateUnit.Type,
    yr: string,
    mth1: Option<string>,
    dom1: Option<string>,
    wk1: Option<string>,
  ): Result<PartialDate> {
    let _yr = parse1idx(yr);
    if (_yr.isErr) return _yr.expeCast();

    let _mth1 = parse1idx(mth1);
    if (_mth1.isErr) return _mth1.expeCast();

    let _dom1 = parse1idx(dom1);
    if (_dom1.isErr) return _dom1.expeCast();

    let _wk1 = parse1idx(wk1);
    if (_wk1.isErr) return _wk1.expeCast();

    return ok(
      new PartialDate(
        type,
        _yr.exp()!,
        _mth1.exp()! as Month1,
        _dom1.exp()! as DayOfMonth1,
        _wk1.exp()! as WeekOfYear1,
      ),
    );
  }

  function parse1idx(s: Option<string>): Result<Option<number>> {
    if (s == null) return ok(null);
    const num = TentoMath.int(s);
    if (Number.isNaN(num)) return erm("not a number");
    if (num < 1) return erm("<1");
    return ok(num);
  }
}

export namespace PartialDate {
  export type Tuple = [YearMonthDay.MaybeValid, DateUnit.Type];

  export type WithTz = [PartialDate, TimezoneRegion];
  export namespace WithTz {
    export class Range extends GenericRange<WithTz> {
      toRange(): NaiveDate.Range {
        return new NaiveDate.Range(this.start[0].start, this.end[0].end);
      }

      toRangeExl(): NaiveDate.Range {
        return new NaiveDate.Range(this.start[0].start, this.end[0].start);
      }

      toString(): string {
        return `${this.start[0].toString()}..${this.end[0].toString()}`;
      }
    }
  }
}
