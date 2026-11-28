import { range } from "../range.ts";
import { TentoMath } from "../utils.ts";
import { DayOfYear0, DaysSinceEpoch, Month1, WeekOfYear1 } from "./units.ts";
import { Weekday } from "./weekday.ts";
import { YearMonth } from "./year-month.ts";
import { YearMonthDay } from "./year-month-day.ts";

export namespace Year {
  export function dseFromYear(year: number): DaysSinceEpoch {
    // For four-digit calendar years the quotients cannot round across an integer.
    if (Number.isInteger(year) && year >= 0 && year <= 9999) {
      return (365 * (year - 1970) +
        Math.floor((year - 1969) / 4) -
        Math.floor((year - 1901) / 100) +
        Math.floor((year - 1601) / 400)) as DaysSinceEpoch;
    }
    return (365 * (year - 1970) +
      TentoMath.floorDiv(year - 1969, 4) -
      TentoMath.floorDiv(year - 1901, 100) +
      TentoMath.floorDiv(year - 1601, 400)) as DaysSinceEpoch;
  }

  export function isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 != 0) || year % 400 === 0;
  }

  export function length(year: number): number {
    return Year.isLeapYear(year) ? 366 : 365;
  }

  export function doy(year: number): Generator<DayOfYear0> {
    return range(Year.length(year)) as Generator<DayOfYear0>;
  }

  export function isoStartMon(yr: number): YearMonthDay {
    if (Number.isInteger(yr) && yr >= 0 && yr <= 9999) {
      const weekday = Weekday.DOW1[Weekday.fromDse(Year.dseFromYear(yr)) - 1].isoDow;
      // Keep January 1's populated day-number and weekday caches when it is Monday.
      if (weekday !== 0) {
        return weekday <= 3
          ? YearMonthDay.fromYmd1Exp(yr - 1, 12, 32 - weekday)
          : YearMonthDay.fromYmd1Exp(yr, 1, 8 - weekday);
      }
    }
    return YearMonth.isoStartMon({
      yr,
      mth: 1 as Month1,
    });
  }

  // export function isoStart(yr: number): YearMonthDay {
  //   return NaiveDate.fromYmd1Exp(yr, 1, 1).toStartOfWeekIso();
  // }

  export function isoWeekMon(yr: number, wno1: WeekOfYear1): YearMonthDay {
    return Year.isoStartMon(yr).addWeeks(wno1 - 1);
  }

  export function numWeeks(yr: number): number {
    const jan1 = YearMonthDay.fromYmd1Exp(yr, 1, 1);
    const dec31 = YearMonthDay.fromYmd1Exp(yr, 12, 31);
    const jan1Day = jan1.dayOfWeek; // 0 = Sunday, ..., 6 = Saturday
    const dec31Day = dec31.dayOfWeek;
    return jan1Day === Weekday.THU || dec31Day === Weekday.THU ? 53 : 52;
  }
}

export class YearInfo {
  readonly year: number;

  readonly isLeapYear: boolean;
  readonly numDays: number;

  // readonly firstDay: YearMonthDay;

  constructor(year: number) {
    this.year = year;
    this.isLeapYear = Year.isLeapYear(year);
    this.numDays = this.isLeapYear ? 366 : 365;
    // this.firstDay = YearMonthDay.fromYmd1Unchecked(year, 1, 1);
  }

  /**
   * generates (0..<=364/365)
   */
  doy(): Generator<DayOfYear0> {
    return range(this.numDays) as Generator<DayOfYear0>;
  }
}
