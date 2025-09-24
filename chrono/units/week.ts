import { Weekday } from "./weekday";
import { NaiveDate } from "../naive-date";
import { Time } from "../time";
import {
  MsSinceEpoch,
  WeekOfYear,
  WeekOfYear1,
  WeeksSinceEpoch1,
} from "./units";
import { Year } from "./year";

export interface YwLike<Index> {
  yr: number;
  wno: WeekOfYear<Index>;
}
export type Yw1Like = YwLike<1>;

export function yw1(yr: number, wno: number): Yw1Like {
  return { yr, wno: wno as WeekOfYear1 };
}

export namespace Week {
  export function differenceInWeeks(from: Yw1Like, to: Yw1Like): number {
    // Special case: if both dates are in epoch week
    if (
      (from.yr === 1969 && from.wno === 52) ||
      (from.yr === 1970 && from.wno === 0)
    ) {
      if (
        (to.yr === 1969 && to.wno === 52) ||
        (to.yr === 1970 && to.wno === 0)
      ) {
        return 0;
      }
    }

    let totalWeeks = 0;

    // Convert week 0 of a year to week 52/53 of previous year for calculation
    const normalizeYearWeek = (yw: Yw1Like): Yw1Like => {
      if (yw.wno === 0) {
        return {
          yr: yw.yr - 1,
          wno: Year.numWeeks(yw.yr - 1) as WeekOfYear1,
        };
      }
      return yw;
    };

    const t = normalizeYearWeek(from);
    const o = normalizeYearWeek(to);

    if (o.yr > t.yr) {
      for (let year = t.yr; year < o.yr; year++) {
        totalWeeks += Year.numWeeks(year);
      }
      totalWeeks += o.wno - t.wno;
    } else if (o.yr < t.yr) {
      for (let year = o.yr; year < t.yr; year++) {
        totalWeeks -= Year.numWeeks(year);
      }
      totalWeeks += o.wno - t.wno;
    } else {
      totalWeeks = o.wno - t.wno;
    }

    return totalWeeks;
  }

  export const sub = differenceInWeeks;

  export function addWeeks(
    { yr, wno: week }: Yw1Like,
    numWeeks: number
  ): Yw1Like {
    let currWeek = week + numWeeks;

    while (currWeek > Year.numWeeks(yr)) {
      currWeek -= Year.numWeeks(yr);
      yr += 1;
    }
    while (currWeek < 1) {
      yr -= 1;
      currWeek += Year.numWeeks(yr);
    }

    return { yr, wno: currWeek as WeekOfYear1 };
  }

  export const add = addWeeks;

  export function weeksSinceEpoch({ yr, wno }: Yw1Like): WeeksSinceEpoch1 {
    // Special cases for epoch-related weeks
    if ((yr === 1969 && wno === 52) || (yr === 1970 && wno === 0)) {
      return 0 as WeeksSinceEpoch1;
    }

    // Handle week 0 of any year by converting to last week of previous year
    if (wno === 0) {
      yr = yr - 1;
      wno = Year.numWeeks(yr) as WeekOfYear1;
    }

    // For 1970, just return the week number since we start counting from week 1
    if (yr === 1970) {
      return wno as unknown as WeeksSinceEpoch1;
    }

    // For years after 1970, count all weeks in previous years
    let weeks = 0;
    for (let y = 1970; y < yr; y++) {
      weeks += Year.numWeeks(y);
    }

    // Add weeks in the target year, subtracting 1 since we count from week 1
    weeks += wno - 1;

    // Add back the offset since we start counting from 1 in 1970
    weeks += 1;

    return weeks as WeeksSinceEpoch1;
  }

  // Helper function: calculate the day of the week for Jan 1
  // Returns 0 for Sunday, 1 for Monday, ..., 6 for Saturday
  function getDayOfWeek(year: number, month: number, day: number): number {
    const a = Math.floor((14 - month) / 12);
    const y = year - a;
    const m = month + 12 * a - 2;
    return (
      (day +
        y +
        Math.floor(y / 4) -
        Math.floor(y / 100) +
        Math.floor(y / 400) +
        Math.floor((31 * m) / 12)) %
      7
    );
  }

  export function dateFromWeekno(
    { yr, wno }: Yw1Like,
    weekday: Weekday
  ): NaiveDate {
    // Day of the week for January 1 (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
    const jan1Day = getDayOfWeek(yr, 1, 1);

    // Determine the ISO week start date (Monday of week 1)
    // If Jan 1 is:
    // - Monday (1): week starts on Jan 1
    // - Tuesday (2) to Friday (5): week starts on the previous Monday
    // - Saturday (6) or Sunday (0): week starts on the next Monday
    const isoWeekStartOffset = jan1Day <= 4 ? jan1Day - 1 : jan1Day - 8;
    const firstWeekStart = NaiveDate.fromYmd1Exp(yr, 1, 1).addDays(
      -isoWeekStartOffset
    );

    // Calculate the target date
    // (weekNo - 1) * 7 gives the offset in days to the start of the week
    // (weekday - 1) gives the offset within the week (Monday = 1)
    return NaiveDate.fromMse(
      (firstWeekStart.mse +
        (wno - 1) * 7 * Time.MS_PER_DAY +
        weekday.isoDow * Time.MS_PER_DAY) as MsSinceEpoch
    );
  }
}
