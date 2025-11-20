import { DateTime } from "./datetime";
import { NaiveDate } from "./naive-date";
import { NaiveDateTime } from "./naive-datetime";
import { GenericRange } from "./range";
import { Time } from "./time";
import { FixedOffset, LogicalTimezone, Tzabbr, Utc } from "./timezone";
import { TimezoneRegion } from "./timezone-region";
import { Duration } from "./units/duration";
import { Ms } from "./units/ms";
import { TimeOfDay } from "./units/time-of-day";

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
  comparison(other: DateFragment): DateFragment.Shift {
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
    // Start time is the max of fragment start and window start
    const startTime = this.start.time.max(window.start);
    const clampedStart = this.start.withTime(startTime);

    // For the end time, handle overnight windows and full-day fragments specially
    let clampedEnd: DateTime<FixedOffset>;
    if (window.endsOnNextDay) {
      // Window extends to next day (e.g., 22:00-02:00)
      // Use the window's end time on the next day to show the full window
      clampedEnd = this.start.withTime(window.end).add({ days: 1 });
    } else {
      // Window is same-day
      // Check if fragment spans to next day (end time is 00:00 on next day)
      const fragmentSpansDay = !this.start.date.equals(this.end.date);

      if (fragmentSpansDay && this.end.time.equals(TimeOfDay.ZERO)) {
        // Fragment ends at midnight next day, use window end since it's earlier
        clampedEnd = this.start.withTime(window.end);
      } else {
        // Take min of fragment end and window end
        const endTime = this.end.time.min(window.end);
        clampedEnd = this.start.withTime(endTime);
      }
    }

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

export namespace DateFragment {
  /**
   * Represents a shift between two DateFragments, typically used for timezone transitions.
   * @typedef {Object} DateFragmentShift
   * @property {DateTime<FixedOffset>} from - The ending DateTime of the first fragment
   * @property {DurationTime} shift - The time difference between fragments
   * @property {DateTime<FixedOffset>} to - The starting DateTime of the second fragment
   */
  export type Shift = {
    from: DateTime<FixedOffset>;
    shift: Duration.Time;
    to: DateTime<FixedOffset>;
  };

  /**
   * WindowedDateFragment represents a DateFragment with optional windowing transformations.
   *
   * This class provides clean APIs for applying two types of transformations:
   * 1. Partial Window - Clips the fragment to specific start/end NaiveDateTimes
   * 2. Valid Hours - Restricts the fragment to specific hours of the day
   */
  export class Windowed {
    constructor(
      readonly fragment: DateFragment,
      readonly partialWindow?: GenericRange<Option<NaiveDateTime>>,
      readonly validHours?: TimeOfDay.Range,
    ) {}

    /**
     * Applies only the partial window transformation.
     * Returns the fragment clipped to the specified start/end times.
     */
    applyPartialWindow(): DateTime.Range<FixedOffset> {
      if (!this.partialWindow) {
        // Convert end through UTC to get proper offset representation for DST boundaries
        const endWallClock = this.fragment.parent.toTz(this.fragment.end.toUtc());
        return new DateTime.Range(
          this.fragment.start,
          endWallClock,
        );
      }

      let start = this.fragment.start;
      let end = this.fragment.end;

      if (this.partialWindow.start != null) {
        const constraintStart = this.fragment.parent.toWallClock(
          this.partialWindow.start,
        );
        if (constraintStart.mse > start.mse) {
          start = constraintStart;
        }
      }

      if (this.partialWindow.end != null) {
        const constraintEnd = this.fragment.parent.toWallClock(
          this.partialWindow.end,
        );
        if (constraintEnd.mse < end.mse) {
          end = constraintEnd;
        }
      }

      return new DateTime.Range(start, end);
    }

    /**
     * Applies only the valid hours transformation.
     * Returns the fragment restricted to the specified time-of-day window.
     */
    applyValidHours(): DateTime.Range<FixedOffset> {
      if (!this.validHours) {
        return new DateTime.Range(
          this.fragment.start,
          this.fragment.end,
        );
      }

      const clampedRange = this.fragment.clamp(this.validHours);
      return new DateTime.Range(
        clampedRange.start,
        clampedRange.end,
      );
    }

    /**
     * Applies both transformations in sequence: partial window first, then valid hours.
     * Returns the final windowed timespan in the fragment's timezone.
     */
    applyAll(): DateTime.Range<FixedOffset> {
      let start = this.fragment.start;
      let end = this.fragment.end;

      if (this.partialWindow) {
        if (this.partialWindow.start != null) {
          const constraintStart = this.fragment.parent.toWallClock(
            this.partialWindow.start,
          );
          if (constraintStart.mse > start.mse) {
            start = constraintStart;
          }
        }

        if (this.partialWindow.end != null) {
          const constraintEnd = this.fragment.parent.toWallClock(
            this.partialWindow.end,
          );
          if (constraintEnd.mse < end.mse) {
            end = constraintEnd;
          }
        }
      }

      const partialFragment = new DateFragment(
        new DateTime.Range(start, end),
        this.fragment.parent,
      );

      if (this.validHours) {
        const clampedRange = partialFragment.clamp(this.validHours);
        return new DateTime.Range(
          clampedRange.start,
          clampedRange.end,
        );
      }

      return new DateTime.Range(start, end);
    }

    /**
     * Calculates the actual time-of-day from a pixel offset within this windowed fragment.
     * This is the inverse of the positioning calculation used in calendar UI rendering.
     *
     * The calendar UI positions elements using:
     *   visualY = (timeOfDay - tzOffset) * pixelsPerHour
     *
     * This method reverses that to get:
     *   timeOfDay = (visualY / pixelsPerHour) + tzOffset
     *
     * @param offsetY - Pixels from the top of the visible area
     * @param pixelsPerHour - Pixels per hour (typically 48 in the calendar UI)
     * @returns The actual wall-clock time as Duration.Time
     *
     * @example
     * // User clicks 96 pixels from top of a 9am-5pm window
     * const windowed = new DateFragment.Windowed(fragment, null, businessHours);
     * const clickTime = windowed.calculatePointerOffset(96, 48);
     * // Returns Duration.Time representing 11:00 (9am + 2 hours)
     */
    calculatePointerOffset(
      offsetY: number,
      pixelsPerHour: number,
    ): Duration.Time {
      const windowed = this.applyAll();

      const tzOffsetHrs = windowed.start.time.toMs / Time.MS_PER_HR;
      const offsetHrs = (offsetY / pixelsPerHour) + tzOffsetHrs;

      return Duration.Time.from({ hrs: offsetHrs });
    }

    /**
     * Calculates positioning information for rendering this windowed fragment in a calendar UI.
     *
     * This method encapsulates all the calculations needed to position and display a calendar
     * column, including CSS variable values, partial window indicators, and transform/height.
     *
     * @param pixelsPerHour - Pixels per hour in the calendar UI (typically 48)
     * @returns Positioning data or null if the windowed fragment has zero duration
     *
     * @example
     * const windowed = new DateFragment.Windowed(fragment, partialWindow, businessHours);
     * const positioning = windowed.getPositioning(48);
     * if (positioning) {
     *   element.style.setProperty('--tz-offset-hrs', String(positioning.tzOffsetHrs));
     *   element.style.transform = `translateY(${positioning.transformY}px)`;
     *   element.style.height = `${positioning.height}px`;
     * }
     */
    getPositioning(pixelsPerHour: number): Option<{
      tzOffsetHrs: number;
      windowOffsetHrs: number;
      linesOffsetPx: number;
      partialTop: boolean;
      partialBottom: boolean;
      transformY: number;
      height: number;
    }> {
      const df = this.fragment;
      const window = this.validHours ?? TimeOfDay.Range.DAY;

      const windowed = this.applyAll();

      if (windowed.duration.toMs <= 0) return null;

      const start = this.partialWindow?.start
        ? new DateTime(this.partialWindow.start, df.tz)
        : df.start;
      const end = this.partialWindow?.end
        ? new DateTime(this.partialWindow.end, df.tz)
        : df.end;

      const wd = new DateTime.Range(
        df.start.withTime(window.start),
        df.start.withTime(window.end).add({
          days: window.endsOnNextDay ? 1 : 0,
        }),
      );

      const lineOffset = (windowed.start.time.mins / 60) * pixelsPerHour;
      const tzOffsetHrs = windowed.start.time.toMs / Time.MS_PER_HR;
      const windowOffsetHrs = window.start.toMs / Time.MS_PER_HR;

      return {
        tzOffsetHrs,
        windowOffsetHrs,
        linesOffsetPx: lineOffset,
        partialTop: this.partialWindow?.start != null ||
          (start.mse > wd.start.mse && start.mse < wd.end.mse),
        partialBottom: this.partialWindow?.end != null ||
          (end.mse > wd.start.mse && end.mse < wd.end.mse),
        transformY: ((tzOffsetHrs - windowOffsetHrs) * pixelsPerHour),
        height: (windowed.duration.toMs / Time.MS_PER_HR) * pixelsPerHour,
      };
    }
  }
}
