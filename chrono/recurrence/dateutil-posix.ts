import type { DateTime } from "../datetime.ts";
import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { Time } from "../time.ts";
import type { Utc } from "../timezone.ts";
import type { MsSinceEpoch } from "../units/units.ts";
import { Year } from "../units/year.ts";
import {
  dateutilOffsetMagnitude,
  dateutilTzstrOffset,
} from "./dateutil-numbers.ts";
import {
  DateutilTzif,
  type DateutilZone,
  invalidDateutilOffset,
} from "./dateutil-tzif.ts";

type TransitionDay =
  | { month: number; week: number; weekday: number }
  | { month: number; dayOfMonth: number }
  | { ordinal: number; skipLeapDay: boolean };

interface Rule {
  day: TransitionDay;
  timeMs: number;
}

const OFFSET = String.raw`[+-]?(?:\d+:\d+|\d{4}|\d{1,2})`;
const ABBREVIATION = String.raw`[^0-9,:+\s-]+`;
const ZONE = new RegExp(
  `^(${ABBREVIATION})(${OFFSET})(?:(${ABBREVIATION})(${OFFSET})?)?(?:([,;])(.*))?$`,
);
const DEFAULT_START: Rule = {
  day: { month: 4, week: 1, weekday: 0 },
  timeMs: 2 * Time.MS_PER_HR,
};
const DEFAULT_END: Rule = {
  day: { month: 10, week: -1, weekday: 0 },
  timeMs: 2 * Time.MS_PER_HR,
};

/** The recurring transitions used by dateutil's tzstr fallback. */
export class DateutilPosixZone implements DateutilZone {
  readonly maxOffsetMs: number;
  readonly hasInvalidOffset: boolean;
  private readonly invalidTransitionMonth?: number;
  private cached?: { year: number; start: number; end: number };

  private constructor(
    private readonly standardOffset: number,
    private readonly daylightOffset: number,
    private readonly startRule: Rule,
    private readonly endRule: Rule,
  ) {
    for (const { day } of [startRule, endRule]) {
      if ("month" in day && day.month > 12) {
        this.invalidTransitionMonth = day.month;
        break;
      }
    }
    this.hasInvalidOffset = !validOffset(standardOffset) ||
      !validOffset(daylightOffset);
    this.maxOffsetMs = Math.max(
      validOffset(standardOffset) ? standardOffset : 0,
      validOffset(daylightOffset) ? daylightOffset : 0,
    );
  }

  static parse(name: string): DateutilZone | undefined {
    const parts = ZONE.exec(name);
    if (parts == null) return;
    const [
      ,
      standard,
      standardText,
      daylight,
      daylightText,
      separator,
      ruleText,
    ] = parts;
    // A semicolon can separate nonempty transition fields only after an
    // explicit daylight offset. Otherwise it is part of the abbreviation token.
    if (separator === ";" && ruleText && daylightText == null) return;
    const std = dateutilTzstrOffset(standard, standardText);
    if (std == null || !Number.isFinite(std)) return;
    // Only the standard UTC/GMT abbreviation changes POSIX's sign convention.
    const dst = daylightText == null
      ? std + Time.MS_PER_HR
      : dateutilTzstrOffset(daylight.toLowerCase(), daylightText);
    const fields = ruleText ? ruleText.split(/[,;]/) : [];
    let start: Rule | undefined = DEFAULT_START;
    let end: Rule | undefined = DEFAULT_END;
    let daylightOffset = dst;
    if (fields.length === 2) {
      start = parseRule(fields[0]);
      end = parseRule(fields[1]);
    } else if (fields.length === 8 || fields.length === 9) {
      start = parseNumericRule(fields.slice(0, 4));
      end = parseNumericRule(fields.slice(4, 8));
      if (fields.length === 9) {
        if (!/^[+-]?\d+$/.test(fields[8])) return;
        // The legacy daylight delta applies before UTC/GMT's standard sign flip.
        const posixStandard = standard === "UTC" || standard === "GMT"
          ? -std
          : std;
        daylightOffset = posixStandard + Number(fields[8]) * Time.MS_PER_SEC;
      }
    } else if (fields.length !== 0) {
      return;
    }
    if (
      daylightOffset == null || !Number.isFinite(daylightOffset) ||
      start == null || end == null
    ) return;
    return daylight == null
      ? DateutilTzif.fixed(std)
      : new DateutilPosixZone(std, daylightOffset, start, end);
  }

  instant(wall: NaiveDateTime): DateTime<Utc> {
    if (this.invalidTransitionMonth != null) return wall.asUtc();
    const offset = this.offsetAt(wall);
    // An invalid instant cannot be projected. Keep its wall key until a
    // comparison or output requests the offset, as with fixed invalid offsets.
    return validOffset(offset)
      ? NaiveDateTime.fromMse((wall.mse - offset) as MsSinceEpoch).asUtc()
      : wall.asUtc();
  }

  wall(instant: number): NaiveDateTime {
    // dateutil determines the transition year from the UTC input.
    const year = NaiveDateTime.fromMse(instant as MsSinceEpoch).date.yr;
    const { start, end } = this.transitions(year);
    const std = this.standardOffset;
    const offset = inDaylight(instant, start - std, end - std)
      ? this.daylightOffset
      : std;
    return NaiveDateTime.fromMse((instant + offset) as MsSinceEpoch);
  }

  ambiguous(wall: NaiveDateTime): boolean {
    return this.inOverlap(wall.mse, this.transitions(wall.date.yr).end);
  }

  validateOffset(wall: NaiveDateTime): void {
    this.validateTransitionMonth();
    if (this.hasInvalidOffset && !validOffset(this.offsetAt(wall))) {
      throw invalidDateutilOffset();
    }
  }

  validateRuleStart(wall: NaiveDateTime): void {
    this.validateTransitionMonth();
    // rrule._iter calls datetime.timetuple(), which reads dst() first.
    const daylightDelta = this.daylightOffset - this.standardOffset;
    if (
      !validOffset(daylightDelta) && this.offsetAt(wall) === this.daylightOffset
    ) {
      throw invalidDateutilOffset();
    }
  }

  private offsetAt(wall: NaiveDateTime): number {
    const { start, end } = this.transitions(wall.date.yr);
    return inDaylight(wall.mse, start, end) || this.inOverlap(wall.mse, end)
      ? this.daylightOffset
      : this.standardOffset;
  }

  private inOverlap(wall: number, end: number): boolean {
    return end <= wall &&
      wall < end + this.daylightOffset - this.standardOffset;
  }

  private validateTransitionMonth(): void {
    if (this.invalidTransitionMonth != null) {
      throw new RangeError(
        `bad month number ${this.invalidTransitionMonth}; must be 1-12`,
      );
    }
  }

  private transitions(year: number) {
    this.validateTransitionMonth();
    if (this.cached?.year !== year) {
      this.cached = {
        year,
        start: transitionMse(this.startRule, year),
        // dateutil expresses both transitions on the standard side.
        end: transitionMse(
          this.endRule,
          year,
          this.standardOffset - this.daylightOffset,
        ),
      };
    }
    return this.cached;
  }
}

function validOffset(offset: number): boolean {
  return Math.abs(offset) < Time.MS_PER_DAY;
}

function inDaylight(at: number, start: number, end: number): boolean {
  return start < end ? start <= at && at < end : at < end || at >= start;
}

function parseRule(text: string): Rule | undefined {
  const fields = text.split("/");
  if (fields.length > 2) return;
  const [writtenDay, clock] = fields;
  const timeMs = clock == null ? 2 * Time.MS_PER_HR : transitionClock(clock);
  if (timeMs == null) return;
  const month = /^M(\d+)[.-](\d+)[.-](\d+)$/.exec(writtenDay);
  if (month != null) {
    const [, m, w, d] = month.map(Number);
    if (
      !Number.isSafeInteger(m) || !Number.isSafeInteger(w) ||
      !Number.isSafeInteger(d)
    ) return;
    return {
      day: { month: m || 1, week: w === 5 ? -1 : w, weekday: d % 7 },
      timeMs,
    };
  }
  const ordinal = /^(J?)(\d+)$/.exec(writtenDay);
  if (ordinal == null) return;
  const skipLeapDay = ordinal[1] === "J";
  const day = Number(ordinal[2]);
  if (day > (skipLeapDay ? 366 : 365)) return;
  return {
    day: { ordinal: skipLeapDay ? Math.max(0, day - 1) : day, skipLeapDay },
    timeMs,
  };
}

function parseNumericRule(fields: string[]): Rule | undefined {
  const [monthText, weekText, dayText, timeText] = fields;
  if (
    !/^\d+$/.test(monthText) || !/^-?\d+$/.test(weekText) ||
    !/^\d+$/.test(dayText) || !/^\d+$/.test(timeText)
  ) return;
  const [month, week, day, seconds] = fields.map(Number);
  const timeMs = seconds * Time.MS_PER_SEC;
  if (
    !Number.isSafeInteger(month) || !Number.isSafeInteger(week) ||
    !Number.isSafeInteger(day) || !Number.isSafeInteger(timeMs)
  ) return;
  return {
    day: week === 0
      ? { month: month || 1, dayOfMonth: Math.max(day, 1) }
      : { month: month || 1, week, weekday: day % 7 },
    timeMs,
  };
}

function transitionClock(clock: string): number | undefined {
  const seconds = /^(\d+:\d+):(\d+)$/.exec(clock);
  const minutesMs = dateutilOffsetMagnitude(seconds?.[1] ?? clock);
  if (minutesMs == null) return;
  const result = minutesMs + Number(seconds?.[2] ?? 0) * Time.MS_PER_SEC;
  return Number.isSafeInteger(result) ? result : undefined;
}

function transitionMse(
  { day, timeMs }: Rule,
  year: number,
  clockAdjustment = 0,
): number {
  const clock = timeMs + clockAdjustment;
  if ("month" in day) {
    const first = NaiveDate.fromYmd1Exp(year, day.month, 1);
    const last = first.add({ mths: 1 }).addDays(-1);
    if ("dayOfMonth" in day) {
      return first.addDays(Math.min(day.dayOfMonth, last.day) - 1).mse + clock;
    }

    // relativedelta applies the clock before aligning to the requested weekday.
    const base = day.week > 0 ? first : last;
    const shifted = NaiveDateTime.fromMse((base.mse + clock) as MsSinceEpoch);
    const weekday = shifted.date.dayOfWeek.dow - 1;
    if (day.week < 0) {
      const fromLast = (weekday - day.weekday + 7) % 7;
      return shifted.mse + ((day.week + 1) * 7 - fromLast) * Time.MS_PER_DAY;
    }
    const fromFirst = (day.weekday - weekday + 7) % 7;
    return shifted.mse +
      (fromFirst + (Math.max(day.week, 1) - 1) * 7) * Time.MS_PER_DAY;
  }
  const leap = Year.isLeapYear(year);
  // relativedelta caps the December day at 31 before applying leapdays.
  const ordinal = Math.min(day.ordinal, 364) +
    Number(day.skipLeapDay && leap && day.ordinal >= 59);
  return NaiveDate.fromYmd1Exp(year, 1, 1).addDays(ordinal).mse + clock;
}
