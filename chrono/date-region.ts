import { DateFragment } from "./date-fragment.ts";
import { DateTime } from "./datetime.ts";
import { NaiveDate } from "./naive-date.ts";
import { NaiveDateTime } from "./naive-datetime.ts";
import { Time } from "./time.ts";
import { FixedOffset, Utc } from "./timezone.ts";
import { TimezoneRegion } from "./timezone-region.ts";
import { MsSinceEpoch } from "./units/units.ts";
import type { Option, Optional } from "./option.ts";

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
   * Returns the first shift between adjacent fragments, or null.
   *
   * @returns {Option<DateFragment.Shift>} Information about the shift between fragments, or null
   */
  shift(): Option<DateFragment.Shift> {
    const fragments = this.dateFragments();
    for (let i = 1; i < fragments.length; i++) {
      const before = fragments[i - 1];
      const after = fragments[i];
      if (before.end.mse === after.start.mse) return before.comparison(after);
    }
    return null;
  }

  /** Test exact civil-date membership, including disjoint midnight folds. */
  containsInstant(instant: DateTime): boolean {
    return this.dateFragments().some(({ start, end }) =>
      start.mse <= instant.mse && instant.mse < end.mse
    );
  }

  #uncachedDateFragments(): DateFragment[] {
    const midnight = this.nd.mse;
    const dayEnd = midnight + Time.MS_PER_DAY;
    const from = (midnight - Time.MS_PER_DAY) as MsSinceEpoch;
    const to = (dayEnd + Time.MS_PER_DAY) as MsSinceEpoch;
    const fragments: DateFragment[] = [];

    // Intersect the civil day with each constant-offset segment on the UTC timeline.
    let segmentStart = from;
    let zone = this.tz.activeTransition(from)
      ? this.tz.tzAtMse(from)
      : this.tz.transitions[0]?.before.time.tz ?? Utc;

    const append = (segmentEnd: MsSinceEpoch) => {
      const offset = zone.info.offset.toMs;
      const start = Math.max(segmentStart, midnight - offset) as MsSinceEpoch;
      const end = Math.min(segmentEnd, dayEnd - offset) as MsSinceEpoch;
      if (start < end) {
        fragments.push(new DateFragment(
          new DateTime.Range(DateTime.fromMse(start, zone), DateTime.fromMse(end, zone)),
          this.tz,
        ));
      }
    };

    for (const transition of this.tz.transitionsBetween({ start: from, end: to })) {
      const boundary = transition.before.mse;
      if (boundary <= from || boundary >= to) continue;
      const nextZone = this.tz.tzAtMse(boundary);
      if (nextZone.info.offset.toMs === zone.info.offset.toMs &&
          nextZone.info.tzabbr === zone.info.tzabbr) continue;
      append(boundary);
      segmentStart = boundary;
      zone = nextZone;
    }
    append(to);
    return fragments;
  }

  /**
   * Contiguous range used by day-column callers. A midnight fold can split a
   * civil date into separate intervals, so use dateFragments or containsInstant
   * for exact membership. Skipped civil dates have an empty range.
   */
  get date(): DateTime.Range<FixedOffset> {
    if (this.cache.date) return this.cache.date;
    const fragments = this.dateFragments();
    const nextMidnight = () => this.tz.toWallClock(new NaiveDateTime(this.nd.addDays(1)));
    if (fragments.length === 0) {
      const boundary = nextMidnight();
      return (this.cache.date = new DateTime.Range(boundary, boundary));
    }
    if (fragments.every((f, i) => i === 0 || fragments[i - 1].end.mse === f.start.mse)) {
      return (this.cache.date = new DateTime.Range(fragments[0].start, fragments[fragments.length - 1].end));
    }
    return (this.cache.date = new DateTime.Range(
      this.tz.toWallClock(new NaiveDateTime(this.nd)),
      nextMidnight(),
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
