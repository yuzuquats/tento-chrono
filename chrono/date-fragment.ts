import { DateTime } from "./datetime.ts";
import { NaiveDate } from "./naive-date.ts";
import { NaiveDateTime } from "./naive-datetime.ts";
import { GenericRange } from "./range.ts";
import { Time } from "./time.ts";
import { FixedOffset, LogicalTimezone, Tzabbr, Utc } from "./timezone.ts";
import { TimezoneRegion } from "./timezone-region.ts";
import { Duration } from "./units/duration.ts";
import { Ms } from "./units/ms.ts";
import { TimeOfDay } from "./units/time-of-day.ts";
import type { Option, Optional } from "./option.ts";

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

  /** Elapsed time between the endpoints, including their calendar dates. */
  get length(): Duration.Time {
    return this.end.durationSince(this.start);
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
    return {
      from: this.end,
      shift: Duration.Time.ms(other.start.ndt.mse - this.end.ndt.mse),
      to: other.start,
    };
  }

  /**
   * Intersects this fragment with a time window on its civil date.
   * A disjoint window produces a zero-length range at the nearest boundary.
   */
  clamp(window: TimeOfDay.Range): DateTime.Range<FixedOffset> {
    return clampFragment(this, window, false);
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

function clampFragment(
  fragment: DateFragment,
  window: TimeOfDay.Range,
  extendOvernight: boolean,
): DateTime.Range<FixedOffset> {
  const start = fragment.start.withTime(window.start);
  const end = fragment.start.withTime(window.end);
  if (!window.endsOnNextDay) return clipRange(fragment.start, fragment.end, start, end);
  const overnightEnd = end.add({ days: 1 });
  // Overnight display can continue a fragment that reaches the next
  // midnight. Fragments ending at an earlier transition stop there.
  const limit = extendOvernight && fragment.end.mse === overnightEnd.mse - window.end.toMs
    ? overnightEnd
    : fragment.end;
  return clipRange(fragment.start, limit, start, overnightEnd);
}

function clipRange(
  start: DateTime<FixedOffset>,
  end: DateTime<FixedOffset>,
  lower?: DateTime<FixedOffset>,
  upper?: DateTime<FixedOffset>,
): DateTime.Range<FixedOffset> {
  if (lower != null && lower.mse > start.mse) {
    start = lower.mse <= end.mse ? lower : end;
  }
  if (upper != null && upper.mse < end.mse) {
    end = upper.mse >= start.mse ? upper : start;
  }
  return new DateTime.Range(start, end);
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
   * Represents a DateFragment with optional windowing transformations applied.
   *
   * This class handles two independent transformations that can be combined:
   *
   * **Partial Window** (`partialWindow`):
   * Clips the fragment to absolute start/end times as NaiveDateTime values.
   * Used for scrolling views where only part of a day is visible.
   * - `partialWindow.start`: Earliest visible time (null = fragment start)
   * - `partialWindow.end`: Latest visible time (null = fragment end)
   *
   * **Valid Hours** (`validHours`):
   * Restricts the fragment to a recurring time-of-day window.
   * Used for business hours or custom day views.
   * - Same-day: e.g., 09:00-17:00 (8 hours)
   * - Overnight: e.g., 22:00-02:00 (4 hours, spans midnight)
   * - Full day: 00:00-00:00 (default, 24 hours)
   *
   * **Transformation Order**:
   * `applyAll()` applies partial window first, then valid hours.
   * This ensures valid hours restricts what's visible within the partial window.
   *
   * @example
   * // Business hours view (9am-5pm)
   * const windowed = new DateFragment.Windowed(fragment, undefined, businessHours);
   *
   * @example
   * // Scrolled partial day with overnight valid hours
   * const windowed = new DateFragment.Windowed(fragment, partialWindow, overnightHours);
   */
  export class Windowed {
    constructor(
      readonly fragment: DateFragment,
      readonly partialWindow?: GenericRange<Option<NaiveDateTime>>,
      readonly validHours: TimeOfDay.Range = TimeOfDay.Range.DAY,
    ) {}

    get tzr(): TimezoneRegion {
      return this.fragment.parent;
    }

    private cache: Optional<{
      applyAll: DateTime.Range<FixedOffset>;
    }> = {};

    /**
     * Applies only the partial window transformation.
     * Returns the fragment clipped to the specified start/end times.
     */
    applyPartialWindow(): DateTime.Range<FixedOffset> {
      if (!this.partialWindow) {
        // Convert end through UTC to get proper offset representation for DST boundaries
        const endWallClock = this.fragment.parent.toTz(
          this.fragment.end.toUtc(),
        );
        return new DateTime.Range(this.fragment.start, endWallClock);
      }

      return this.#applyPartialWindow(this.fragment.inner);
    }

    #applyPartialWindow(range: DateTime.Range<FixedOffset>): DateTime.Range<FixedOffset> {
      const start = this.partialWindow?.start;
      const end = this.partialWindow?.end;
      return clipRange(
        range.start,
        range.end,
        start == null ? undefined : this.tzr.toWallClock(start),
        end == null ? undefined : this.tzr.toWallClock(end),
      );
    }

    /**
     * Applies only the valid hours transformation.
     * Returns the fragment's portion of the display window.
     */
    applyValidHours(): DateTime.Range<FixedOffset> {
      return clampFragment(this.fragment, this.validHours, true);
    }

    /**
     * Applies both the valid hours and partial window constraints.
     */
    applyAll(): DateTime.Range<FixedOffset> {
      if (this.cache.applyAll) return this.cache.applyAll;

      const valid = clampFragment(this.fragment, this.validHours, this.partialWindow?.end == null);
      return (this.cache.applyAll = this.#applyPartialWindow(valid));
    }

    /**
     * Truncates a UTC time range to fit within this windowed fragment, returning the
     * visible portion as a TimeOfDay.Range in the fragment's timezone.
     *
     * This is used to determine what portion of an event (or any time range) is visible
     * within a calendar column that has been windowed by both partial window constraints
     * and valid hours restrictions.
     *
     * @param originalTime - The original time range in UTC to truncate
     * @returns The visible portion as a TimeOfDay.Range, or null if no overlap
     *
     * @example
     * // An event from 8am-10am UTC, viewed in a 9am-5pm business hours window
     * const windowed = new DateFragment.Windowed(fragment, null, businessHours);
     * const visible = windowed.truncate(eventTimeUtc);
     * // Returns TimeOfDay.Range from 9am-10am (the visible portion)
     *
     * @example
     * // An event entirely outside the window returns null
     * const visible = windowed.truncate(eveningEventUtc);
     * // Returns null (no overlap with business hours)
     */
    truncate(originalTime: DateTime.Range<Utc>): Option<TimeOfDay.Range> {
      const windowedUtc = this.applyAll().toUtc();

      const intersection = originalTime.intersectionDtr(windowedUtc);
      if (!intersection) {
        return null;
      }

      const inFragTz = intersection.toTz(this.fragment.tz);
      return new TimeOfDay.Range(
        inFragTz.start.time,
        inFragTz.end.time,
        !inFragTz.start.date.equals(inFragTz.end.date),
      );
    }

    /**
     * Like truncate(), but only applies the partial window transformation.
     * Ignores valid hours restrictions.
     *
     * Useful when you need to know if an event overlaps the scrollable area
     * without considering the valid hours mask.
     *
     * @param originalTime - The original time range in UTC to truncate
     * @returns The visible portion as a TimeOfDay.Range, or null if no overlap
     */
    truncatePartial(
      originalTime: DateTime.Range<Utc>,
    ): Option<TimeOfDay.Range> {
      const windowedUtc = this.applyPartialWindow().toUtc();

      const intersection = originalTime.intersectionDtr(windowedUtc);
      if (!intersection) {
        return null;
      }

      const inFragTz = intersection.toTz(this.fragment.tz);
      return new TimeOfDay.Range(
        inFragTz.start.time,
        inFragTz.end.time,
        !inFragTz.start.date.equals(inFragTz.end.date),
      );
    }

    /**
     * The effective start hour after applying both constraints.
     * Returns the later of validHours start and partialWindow start.
     * Used for positioning calculations in calendar UI.
     *
     * @example
     * // validHours: 09:00-17:00, partialWindow: 11:00-15:00
     * // validHoursStartHrs = 9, partialWindowStartHrs = 11
     * // effectiveStartHrs = max(9, 11) = 11
     *
     * @example
     * // validHours: 09:00-17:00, no partialWindow
     * // validHoursStartHrs = 9, partialWindowStartHrs = 0
     * // effectiveStartHrs = max(9, 0) = 9
     */
    get effectiveStartHrs(): number {
      return Math.max(this.validHoursStartHrs, this.partialWindowStartHrs);
    }

    /**
     * The actual start hour after applying all windowing transformations.
     * This is the wall-clock hour where the windowed fragment begins.
     *
     * @example
     * // Fragment: full day, validHours: 09:00-17:00, no partialWindow
     * // applyAll() returns 09:00-17:00
     * // windowedStartHrs = 9
     *
     * @example
     * // Fragment: full day, validHours: 09:00-17:00, partialWindow: 11:00-15:00
     * // applyAll() returns 11:00-15:00 (partial window applied first, then clamped to valid hours)
     * // windowedStartHrs = 11
     *
     * @example
     * // Fragment: full day, validHours: 22:00-02:00 (overnight), no partialWindow
     * // applyAll() returns 22:00-02:00 (next day)
     * // windowedStartHrs = 22
     */
    get windowedStartHrs(): number {
      return this.applyAll().start.time.toMs / Time.MS_PER_HR;
    }

    /**
     * The start hour of the valid hours window (0-24).
     *
     * @example
     * // validHours: 09:00-17:00 (business hours)
     * // validHoursStartHrs = 9
     *
     * @example
     * // validHours: 22:00-02:00 (overnight)
     * // validHoursStartHrs = 22
     *
     * @example
     * // validHours: 00:00-00:00 (full day, default)
     * // validHoursStartHrs = 0
     */
    get validHoursStartHrs(): number {
      return this.validHours.start.toMs / Time.MS_PER_HR;
    }

    /**
     * The start hour from the partial window constraint, or 0 if none.
     *
     * @example
     * // partialWindow: 14:30-18:00
     * // partialWindowStartHrs = 14.5
     *
     * @example
     * // partialWindow: null (no constraint)
     * // partialWindowStartHrs = 0
     *
     * @example
     * // partialWindow: { start: null, end: 15:00 } (end only)
     * // partialWindowStartHrs = 0
     */
    get partialWindowStartHrs(): number {
      return this.partialWindow?.start?.time.duration().toHrsF ?? 0;
    }

    /**
     * Checks if a position is near the edges of the windowed fragment.
     * Used to determine if pointer capture should be enabled during drag gestures.
     * Returns true if position is within 15 minutes of validHours start or end.
     *
     * @param position - The current pointer position as Duration.Time
     * @returns true if position is within 15 mins of start or end boundary
     *
     * @example
     * // validHours: 09:00-17:00
     * // position: 09:10 -> true (within 15 mins of start)
     * // position: 12:00 -> false (middle of window)
     * // position: 16:50 -> true (within 15 mins of end)
     */
    isNearEdge(position: Duration.Time): boolean {
      const startBoundary = this.validHours.start.asMs;
      const endBoundary =
        this.validHours.end.asMs === 0
          ? Time.MS_PER_DAY
          : this.validHours.end.asMs;
      const thresholdMs = Time.MS_PER_MIN * 15;

      const nearStart = position.toMs <= startBoundary + thresholdMs;
      const nearEnd = position.toMs >= endBoundary - thresholdMs;

      return nearStart || nearEnd;
    }

    /**
     * Calculates positioning information for rendering this windowed fragment in a calendar UI.
     *
     * Returns the data needed to position and size a calendar column:
     * - `linesOffsetPx`: Pixel offset for hour lines alignment
     * - `partialTop/partialBottom`: Whether to show partial day indicators
     * - `transformY`: CSS translateY value in pixels
     * - `height`: Column height in pixels
     *
     * @param pixelsPerHour - Pixels per hour in the calendar UI (typically 48)
     * @returns Positioning data or null if the windowed fragment has zero duration
     *
     * @example
     * const windowed = new DateFragment.Windowed(fragment, partialWindow, businessHours);
     * const positioning = windowed.getPositioning(48);
     * if (positioning) {
     *   element.style.setProperty('--cell-y-offset', String(-windowed.effectiveStartHrs));
     *   element.style.transform = `translateY(${positioning.transformY}px)`;
     *   element.style.height = `${positioning.height}px`;
     * }
     */
    getPositioning(pixelsPerHour: number): Option<{
      linesOffsetPx: number;
      partialTop: boolean;
      partialBottom: boolean;
      transformY: number;
      height: number;
    }> {
      const df = this.fragment;

      const windowed = this.applyAll();
      if (windowed.duration.toMs <= 0) return null;

      const start = this.partialWindow?.start
        ? new DateTime(this.partialWindow.start, df.tz)
        : df.start;
      const end = this.partialWindow?.end
        ? new DateTime(this.partialWindow.end, df.tz)
        : df.end;

      const wd = new DateTime.Range(
        df.start.withTime(this.validHours.start),
        df.start.withTime(this.validHours.end).add({
          days: this.validHours.endsOnNextDay ? 1 : 0,
        }),
      );

      const lineOffset = (windowed.start.time.mins / 60) * pixelsPerHour;
      const windowedStartHrs = windowed.start.time.toMs / Time.MS_PER_HR;
      const validHoursStartHrs = this.validHours.start.toMs / Time.MS_PER_HR;

      return {
        linesOffsetPx: lineOffset,
        partialTop:
          this.partialWindow?.start != null ||
          (start.mse > wd.start.mse && start.mse < wd.end.mse),
        partialBottom:
          this.partialWindow?.end != null ||
          (end.mse > wd.start.mse && end.mse < wd.end.mse),
        transformY: (windowedStartHrs - validHoursStartHrs) * pixelsPerHour,
        height: (windowed.duration.toMs / Time.MS_PER_HR) * pixelsPerHour,
      };
    }

    toString(): string {
      return `Windowed {${this.fragment.toString()}, pw=${this.partialWindow?.start?.toString()}-${this.partialWindow?.end?.toString()} vh=${this.validHours?.start.toString()}-${this.validHours?.end.toString()}}`;
    }
  }
}
