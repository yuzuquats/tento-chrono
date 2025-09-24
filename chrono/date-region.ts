import { DateTime } from "./datetime";
import { NaiveDate } from "./naive-date";
import { NaiveDateTime } from "./naive-datetime";
import { NaiveTime } from "./naive-time";
import { GenericRange } from "./range";
import { Time } from "./time";
import { FixedOffset, LogicalTimezone, Tzabbr, Utc } from "./timezone";
import { TimezoneRegion } from "./timezone-region";
import { Duration } from "./units/duration";
import { Ms } from "./units/ms";
import { TimeOfDay } from "./units/time-of-day";
import { MsSinceEpoch } from "./units/units";

/**
 * Represents a time range using milliseconds since epoch.
 * @interface TimeRange
 * @property {MsSinceEpoch} start - Start time in milliseconds since epoch
 * @property {MsSinceEpoch} end - End time in milliseconds since epoch
 */
export interface TimeRange {
  start: MsSinceEpoch;
  end: MsSinceEpoch;
}

/**
 * Represents a date range with timezone information.
 * @interface DateRange
 * @property {DateTime<FixedOffset>} start - Start datetime with timezone offset
 * @property {DateTime<FixedOffset>} end - End datetime with timezone offset
 */
export interface DateRange {
  start: DateTime<FixedOffset>;
  end: DateTime<FixedOffset>;
}

/**
 * Represents a shift between two DateFragments, typically used for timezone transitions.
 * @typedef {Object} DateFragmentShift
 * @property {DateTime<FixedOffset>} from - The ending DateTime of the first fragment
 * @property {DurationTime} shift - The time difference between fragments
 * @property {DateTime<FixedOffset>} to - The starting DateTime of the second fragment
 */
export type DateFragmentShift = {
  from: DateTime<FixedOffset>;
  shift: Duration.Time;
  to: DateTime<FixedOffset>;
};

/**
 * Represents a continuous time period within a specific day with proper timezone handling.
 *
 * DateFragment is a key class for calendar operations that provides timezone-aware
 * representation of time periods. It's particularly important for handling days with
 * timezone transitions (like DST changes) where a logical day might be represented
 * by multiple fragments with different timezone offsets.
 *
 * A DateFragment maintains the relationship between wall clock time and absolute time,
 * ensuring correct event positioning and duration calculations in the UI.
 */
export class DateFragment {
  /**
   * Creates a new DateFragment instance.
   * @param {DateTime.Range<FixedOffset>} inner - The datetime range with timezone information
   */
  constructor(
    readonly inner: DateTime.Range<FixedOffset>,
    readonly parent: TimezoneRegion,
  ) {}

  get date(): NaiveDate {
    return this.inner.start.date;
  }

  /**
   * Gets the start datetime of this fragment.
   * @returns {DateTime<FixedOffset>} Start datetime with timezone information
   */
  get start(): DateTime<FixedOffset> {
    return this.inner.start;
  }

  /**
   * Gets the end datetime of this fragment.
   * @returns {DateTime<FixedOffset>} End datetime with timezone information
   */
  get end(): DateTime<FixedOffset> {
    return this.inner.end;
  }

  /**
   * Calculates the duration of this fragment.
   * Handles special case where end time is midnight (00:00) by treating it as 24:00.
   * @returns {DurationTime} The length of the fragment as a TimeUnit
   */
  get length(): Duration.Time {
    // TODO: we need precise times here
    if (this.inner.start.time.equals(TimeOfDay.ZERO)) {
      if (this.inner.end.time.equals(TimeOfDay.ZERO)) {
        // 1) Full Day
        return Duration.Time.DAY1;
      } else {
        // 2) 0...End
        // dev(
        //   "0...end",
        //   Duration.Time.from({
        //     ms: this.inner.end.time.toMs as Ms,
        //   })
        // );
        return Duration.Time.from({
          ms: this.inner.end.time.toMs as Ms,
        });
      }
    } else {
      if (this.inner.end.time.equals(TimeOfDay.ZERO)) {
        // 3) start...24
        // dev(
        //   "start...24",
        //   Duration.Time.DAY1.sub(this.inner.start.time.duration()).toHrsF
        // );
        return Duration.Time.DAY1.sub(this.inner.start.time.duration());
      } else {
        // 4) start...end
        // dev(
        //   "start...end",
        //   this.inner.end.time.duration().sub(this.inner.start.time.duration())
        //     .toHrsF,
        //   this.inner.start.time.duration().toMs,
        //   this.inner.end.time.duration().toMs
        // );
        return this.inner.end.time
          .duration()
          .sub(this.inner.start.time.duration());
      }
    }
  }

  /**
   * Gets the timezone of this fragment.
   * @returns {LogicalTimezone} The timezone from the start datetime
   */
  get tz(): LogicalTimezone {
    return this.inner.start.tz;
  }

  /**
   * Gets the timezone abbreviation of this fragment (e.g., PST, EDT).
   * @returns {Tzabbr} The timezone abbreviation
   * @throws {Error} If the timezone abbreviation is not available
   */
  get tzabbr(): Tzabbr {
    const abbr = this.inner.start.tz.info.tzabbr!;
    return abbr !== "%z"
      ? abbr
      : this.inner.start.tz.info.offset.asSignedHm(true);
  }

  /**
   * Compares this fragment with another fragment to determine the time shift between them.
   * Typically used for analyzing timezone transitions between consecutive fragments.
   *
   * @param {DateFragment} other - The fragment to compare with
   * @returns {DateFragmentShift} Object containing information about the shift between fragments
   */
  comparison(other: DateFragment): DateFragmentShift {
    const start = this.end.time;
    const end = other.start.time;
    return {
      from: this.end,
      shift: start.durationUntil(end),
      to: other.start,
    };
  }

  /**
   * Clamps this fragment to the given time window, returning a new fragment
   * that represents the intersection of this fragment with the window.
   *
   * @param {TimeOfDay.Range} window - The time window to clamp to
   * @returns {DateFragment} A new fragment clamped to the window
   */
  clamp(window: TimeOfDay.Range): DateTime.Range<any> {
    // Create a TimeOfDay.Range from this fragment's start and end times
    const thisRange = new TimeOfDay.Range(
      this.start.time,
      this.end.time,
      !this.start.date.equals(this.end.date),
    );

    // Clamp the range using the existing TimeOfDay.Range clamp method
    const clampedRange = thisRange.clamp(window);

    // Create new DateTimes from the clamped times, preserving the timezone
    // For the end time, we need to be careful about same-day vs next-day
    const clampedStart = this.start.withTime(clampedRange.start);

    // If the clamped range doesn't span to the next day, keep it on the same day
    // If the original fragment was a full day (end time 00:00 next day),
    // we want to clamp it to stay within the same day
    const clampedEnd = clampedRange.endsOnNextDay
      ? this.start.withTime(clampedRange.end).add({ days: 1 })
      : this.start.withTime(clampedRange.end);

    return new DateTime.Range(clampedStart, clampedEnd);
  }

  /**
   * Returns a string representation of this fragment for debugging purposes.
   * @returns {string} String representation including the start time and timezone
   */
  toString(): string {
    return `Fragment { ${this.inner.start.rfc3339()} ${
      this.inner.start.tz.info.tzabbr
    } }`;
  }
}

/**
 * Represents a date in a specific timezone region, handling complexities like DST transitions.
 *
 * DateRegion is responsible for mapping a naive date (without timezone information) to
 * actual datetime ranges with proper timezone handling. It's particularly important for
 * dealing with edge cases like DST transitions where a logical day might span multiple
 * timezone offsets.
 */
export class DateRegion {
  /** The naive date this region represents */
  readonly nd: NaiveDate;

  /** The timezone region for contextualizing the date */
  readonly tz: TimezoneRegion;

  /** Cached calculations to improve performance */
  readonly cache: Optional<{
    dateFragments: DateFragment[];
    date: DateTime.Range<FixedOffset>;
  }> = {};

  /**
   * Creates a new DateRegion instance.
   * @param {NaiveDate} nd - The naive date (without timezone information)
   * @param {TimezoneRegion} tz - The timezone region to contextualize the date
   */
  constructor(nd: NaiveDate, tz: TimezoneRegion) {
    this.nd = nd;
    this.tz = tz;
  }

  /**
   * Returns all DateFragments that represent this logical date.
   *
   * Most days have just one fragment (00:00-23:59 in the same timezone offset),
   * but days with timezone transitions (like DST changes) will have multiple fragments
   * with different timezone offsets.
   *
   * @returns {DateFragment[]} Array of fragments representing this date
   */
  dateFragments(): DateFragment[] {
    if (this.cache.dateFragments) return this.cache.dateFragments;
    return (this.cache.dateFragments = this.#uncachedDateFragments());
  }

  /**
   * Calculates the time shift between fragments if this date has a timezone transition.
   * Returns null if the date has only one fragment (no transitions).
   *
   * @returns {Option<DateFragmentShift>} Information about the shift between fragments, or null
   */
  shift(): Option<DateFragmentShift> {
    const df = this.dateFragments();
    if (df.length === 1) return null;
    return df[0].comparison(df[1]);
  }

  /**
   * Calculates the DateFragments for this region without using the cache.
   *
   * Given a naive date (2024-11-03), produces the appropriate fragments.
   * For example, during a "fall back" DST transition:
   *
   *   2024-11-03T00:00:00-07:00 to 2024-11-03T02:00:00-07:00
   *   2024-11-03T01:00:00-08:00 to 2024-11-04T00:00:00-08:00
   *
   * These represent all datetime ranges for the logical date, accounting for
   * the timezone transition. Most days have just one fragment covering the
   * entire day in a single timezone offset.
   *
   * @private
   * @returns {DateFragment[]} Array of fragments representing this date
   */
  #uncachedDateFragments(): DateFragment[] {
    const transitions = this.#transitions();

    const dateStart = this.date.start;
    if (transitions.length === 0) {
      return [
        new DateFragment(
          new DateTime.Range(dateStart, dateStart.add({ hrs: 24 })),
          this.tz,
        ),
      ];
    }

    const transition = transitions[0];
    return [
      new DateFragment(
        new DateTime.Range(dateStart, transition.after.time.toTz(dateStart.tz)),
        this.tz,
      ),
      new DateFragment(
        new DateTime.Range(
          transition.after.time,
          transition.after.time.add({ days: 1 }).withTime(NaiveTime.ZERO),
        ),
        this.tz,
      ),
    ];
  }

  /**
   * Gets the DateTime range spanning this date in its timezone.
   * This range goes from 00:00 to 23:59:59.999 in the local timezone.
   *
   * @returns {DateTime.Range<FixedOffset>} The datetime range for the whole day
   */
  get date(): DateTime.Range<FixedOffset> {
    if (this.cache.date) return this.cache.date;
    return (this.cache.date = new DateTime.Range(
      this.tz.toWallClock(new NaiveDateTime(NaiveDate.fromMse(this.nd.mse))),
      this.tz.toWallClock(
        new NaiveDateTime(
          // TODO: i dont think this is actually right
          NaiveDate.fromMse((this.nd.mse + Time.MS_PER_DAY) as MsSinceEpoch),
        ),
      ),
    ));
  }

  /**
   * Returns a string representation of this DateRegion.
   * @returns {string} String with the date and timezone name
   */
  toString(): string {
    return `${this.nd.rfc3339()} ${this.tz.fullname}`;
  }

  /**
   * Finds timezone transitions occurring on this date.
   * Looks for transitions where the "after" time falls on this date.
   *
   * @private
   * @returns {TimezoneRegion.Transition[]} Array of timezone transitions
   */
  #transitions(): TimezoneRegion.Transition[] {
    return this.tz
      .transitionsBetween({
        start: (this.nd.mse - Time.MS_PER_DAY) as MsSinceEpoch,
        end: (this.nd.mse + Time.MS_PER_DAY) as MsSinceEpoch,
      })
      .filter((t) => {
        return t.after.time.ndt.date.equals(this.nd);
      });
  }

  /**
   * Returns transitions occurring strictly within this date's 24-hour period.
   * Unlike #transitions, this doesn't look at surrounding days.
   *
   * @returns {TimezoneRegion.Transition[]} Array of timezone transitions
   */
  currentTransitions(): TimezoneRegion.Transition[] {
    return this.tz.transitionsBetween({
      start: this.nd.mse as MsSinceEpoch,
      end: (this.nd.mse + Time.MS_PER_DAY) as MsSinceEpoch,
    });
  }
}

/**
 * Represents a datetime in a specific timezone region.
 *
 * Similar to DateRegion, but works with a specific time point rather than
 * an entire day. Used for more precise timezone operations when an exact
 * time is needed.
 */
export class DateTimeRegion {
  /** The naive datetime this region represents */
  readonly ndt: NaiveDateTime;

  /** The timezone region for contextualizing the datetime */
  readonly tz: TimezoneRegion;

  readonly cache: Optional<{
    resolved: DateTime;
    wallclock: DateTime;
  }> = {};

  /**
   * Creates a new DateTimeRegion instance.
   * @param {NaiveDateTime} ndt - The naive datetime (without timezone information)
   * @param {TimezoneRegion} tz - The timezone region to contextualize the datetime
   */
  constructor(ndt: NaiveDateTime, tz: TimezoneRegion) {
    this.ndt = ndt;
    this.tz = tz;
  }

  asUtcTp(): DateTime {
    if (this.cache.resolved) return this.cache.resolved;
    return (this.cache.resolved = this.tz.toTz(new DateTime(this.ndt, Utc)));
  }

  asWallClock(): DateTime {
    if (this.cache.wallclock) return this.cache.wallclock;
    return (this.cache.wallclock = this.tz.toWallClock(this.ndt));
  }

  toString(): string {
    return `${this.ndt.toString()} [${this.tz.fullname}]`;
  }
}

export namespace DateTimeRegion {
  export class Range extends GenericRange<DateTimeRegion> {
    duration(): Duration.Time {
      return this.end.asWallClock().durationSince(this.start.asWallClock());
    }

    asWallClock(): DateTime.Range {
      return new DateTime.Range(
        this.start.asWallClock(),
        this.end.asWallClock(),
      );
    }
  }
}
