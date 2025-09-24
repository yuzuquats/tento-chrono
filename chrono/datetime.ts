import { NaiveDate } from "./naive-date";
import { NaiveDateTime } from "./naive-datetime";
import { NaiveTime } from "./naive-time";
import { GenericRange } from "./range";
import { Result, erm, ok } from "./result";
import { Time } from "./time";
import { FixedOffset, Local, LogicalTimezone, Utc } from "./timezone";
import { Duration } from "./units/duration";
import { DurationTime } from "./units/duration-time";
import { Ms } from "./units/ms";
import { TimeOfDay } from "./units/time-of-day";
import { DaysSinceEpoch, MsSinceEpoch } from "./units/units";
import { Weekday } from "./units/weekday";
import { TentoMath } from "./utils";

/**
 * Regular expression for parsing RFC3339 / ISO 8601 date-time strings.
 * Captures year, month, day, hour, minute, second, fractional seconds, and timezone offset (Z or +/-HH:MM).
 */
const RFC3339_REGEX =
  /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Represents a specific moment in time with associated timezone information.
 * It combines a timezone-naive `NaiveDateTime` with a `LogicalTimezone`.
 * This class provides methods for manipulation, comparison, and conversion between timezones.
 *
 * @template TzType - The specific type of the timezone identifier (e.g., "Utc", "Local", "America/New_York"). Defaults to `any` string.
 *
 * @example
 * // Create a DateTime in UTC
 * const utcNow = DateTime.fromMse(Date.now() as MsSinceEpoch, DateTime.utc);
 * console.log(utcNow.toString()); // e.g., "2023-10-27T10:30:00Z"
 *
 * // Create a DateTime in a specific timezone
 * const nyTime = new DateTime(
 *   new NaiveDateTime(NaiveDate.fromYmd1(2023, 10, 27), new NaiveTime(14, 30)),
 *   { id: "America/New_York", offset: -4 * Time.MS_PER_HR } // Example offset (may vary with DST)
 * );
 * console.log(nyTime.toString()); // e.g., "2023-10-27T14:30:00-04:00"
 *
 * // Convert New York time to UTC
 * const nyInUtc = nyTime.toUtc();
 * console.log(nyInUtc.toString()); // e.g., "2023-10-27T18:30:00Z"
 */
export class DateTime<TzType extends string = any> {
  /** Represents the UTC timezone. */
  static utc = Utc;
  /** Represents the system's local timezone. */
  static local = Local;

  /**
   * Creates a new DateTime instance.
   * @param ndt The timezone-naive date and time component.
   * @param tz The timezone associated with this DateTime.
   */
  constructor(
    public readonly ndt: NaiveDateTime,
    public readonly tz: LogicalTimezone<TzType>,
  ) {}

  /**
   * Gets the total number of milliseconds since the Unix epoch (1970-01-01T00:00:00Z).
   * This value represents the absolute point in time, independent of timezone.
   * @returns Milliseconds since epoch.
   *
   * @example
   * const dt = DateTime.fromRfc3339("1970-01-01T00:00:01Z").unwrap();
   * console.log(dt.mse); // Output: 1000
   */
  get mse(): MsSinceEpoch {
    return (this.ndt.mse - this.tz.info.offset.toMs) as MsSinceEpoch;
  }

  /**
   * Gets the total number of days since the Unix epoch (1970-01-01), based on the UTC representation.
   * @returns Days since epoch.
   *
   * @example
   * const dt = DateTime.fromRfc3339("1970-01-02T00:00:00Z").unwrap();
   * console.log(dt.dse); // Output: 1
   */
  get dse(): DaysSinceEpoch {
    // Convert to UTC first to get the correct epoch days
    return this.ndt.dse;
  }

  /**
   * Gets the date component (`NaiveDate`) of this DateTime in its current timezone.
   * @returns The NaiveDate part.
   */
  get date(): NaiveDate {
    return this.ndt.date;
  }

  /**
   * Gets the time component (`NaiveTime`) of this DateTime in its current timezone.
   * @returns The NaiveTime part.
   */
  get time(): NaiveTime {
    return this.ndt.time;
  }

  /**
   * Gets the day of the week for this DateTime in its current timezone.
   * @returns The Weekday enum value (0 for Monday, 6 for Sunday).
   */
  get dow(): Weekday {
    return this.ndt.date.dayOfWeek;
  }

  // --- Comparison methods ---

  /**
   * Calculates the duration between this DateTime and an earlier one.
   * The calculation is based on the absolute difference in milliseconds since the epoch.
   * @param before The earlier DateTime instance.
   * @returns A `TimeUnit` representing the duration. Positive if `this` is after `before`.
   *
   * @example
   * const start = DateTime.fromRfc3339("2023-10-27T10:00:00Z").unwrap();
   * const end = DateTime.fromRfc3339("2023-10-27T10:00:05Z").unwrap();
   * const duration = end.durationSince(start);
   * console.log(duration.asSecs); // Output: 5
   */
  durationSince(before: DateTime<any>): Duration.Time {
    // Compare based on milliseconds since epoch for accuracy across timezones
    const mseDiff = this.mse - before.mse;
    return Duration.Time.ms(mseDiff as Ms);
  }

  /**
   * Checks if this DateTime represents an earlier moment in time than another DateTime.
   * Comparison is timezone-aware.
   * @param other The DateTime to compare against.
   * @returns `true` if this DateTime is strictly before the other, `false` otherwise.
   *
   * @example
   * const dt1 = DateTime.fromRfc3339("2023-01-01T12:00:00Z").unwrap();
   * const dt2 = DateTime.fromRfc3339("2023-01-01T12:00:00+01:00").unwrap(); // Earlier instant
   * console.log(dt1.isBefore(dt2)); // Output: false
   * console.log(dt2.isBefore(dt1)); // Output: true
   */
  isBefore(other: DateTime<any>): boolean {
    return this.compare(other) < 0;
  }

  /**
   * Compares this DateTime with another DateTime instance.
   * The comparison is based on the absolute moment in time, automatically handling timezone differences.
   * @param other The DateTime to compare against.
   * @returns A negative number if `this` is earlier than `other`,
   *          a positive number if `this` is later than `other`,
   *          or 0 if they represent the same moment in time.
   *
   * @example
   * const dt1 = DateTime.fromRfc3339("2023-01-01T12:00:00Z").unwrap();
   * const dt2 = DateTime.fromRfc3339("2023-01-01T13:00:00+01:00").unwrap(); // Same instant
   * const dt3 = DateTime.fromRfc3339("2023-01-01T14:00:00+01:00").unwrap(); // Later instant
   * console.log(dt1.compare(dt2)); // Output: 0
   * console.log(dt1.compare(dt3)); // Output: < 0 (negative)
   * console.log(dt3.compare(dt1)); // Output: > 0 (positive)
   */
  compare(other: DateTime<any>): number {
    return this.mse - other.mse;
  }

  /**
   * Compares this DateTime with another DateTime instance *assuming* they are in the same timezone.
   * This method is faster than `compare` if you know the timezones are identical, but gives incorrect results otherwise.
   * @param other The DateTime instance (in the same timezone) to compare against.
   * @returns A negative number if `this` is earlier, positive if later, 0 if equal.
   */
  compareSame(other: DateTime<TzType>): number {
    // Compare NaiveDate first
    const dseDiff = this.ndt.date.dse - other.ndt.date.dse;
    if (dseDiff !== 0) return dseDiff;

    // If dates are same, compare NaiveTime
    const msDiff = this.ndt.time.toMs - other.ndt.time.toMs;
    // Allow for tiny floating point differences if necessary (though unlikely with ms)
    if (Math.abs(msDiff) <= 1) {
      return 0;
    }
    return msDiff;
  }

  // --- Conversion methods ---

  /**
   * Returns a new DateTime instance with the same date and timezone, but a different time component.
   * @param time The new `NaiveTime` component. Defaults to midnight (00:00:00.000).
   * @returns A new DateTime instance with the updated time.
   *
   * @example
   * const dt = DateTime.fromRfc3339("2023-10-27T15:30:00Z").unwrap();
   * const startOfDay = dt.withTime(); // Defaults to NaiveTime.ZERO
   * console.log(startOfDay.toString()); // Output: "2023-10-27T00:00:00Z"
   * const specificTime = dt.withTime(new NaiveTime(9, 0));
   * console.log(specificTime.toString()); // Output: "2023-10-27T09:00:00Z"
   */
  withTime(time: NaiveTime = NaiveTime.ZERO): DateTime<TzType> {
    return new DateTime(new NaiveDateTime(this.date, time), this.tz);
  }

  /**
   * Creates a new DateTime instance with the same naive date and time values but associated with a different timezone.
   * **Important:** This does *not* represent the same moment in time. It simply re-labels the existing naive datetime with a new timezone.
   * Use `toTz()` to convert to the equivalent moment in a different timezone.
   *
   * @template Tz - The type of the target timezone identifier.
   * @param offset The target logical timezone.
   * @returns A new DateTime instance with the same naive values but the new timezone.
   *
   * @example
   * const naiveDt = new NaiveDateTime(NaiveDate.fromYmd1(2023, 1, 1), new NaiveTime(12, 0));
   * const dtUtc = new DateTime(naiveDt, DateTime.utc); // 2023-01-01T12:00:00Z
   * const dtAsNy = dtUtc.asTz({ id: "America/New_York", offset: -5 * Time.MS_PER_HR }); // 2023-01-01T12:00:00-05:00 (different instant!)
   *
   * console.log(dtUtc.mse === dtAsNy.mse); // Output: false
   */
  asTz<Tz extends string>(offset: LogicalTimezone<Tz>): DateTime<Tz> {
    return new DateTime(this.ndt, offset);
  }

  /**
   * Creates a new DateTime instance with the same naive date and time values but associated with the UTC timezone.
   * This is a shortcut for `asTz(DateTime.utc)`.
   * **Important:** This does *not* represent the same moment in time unless the original timezone was already UTC. Use `toUtc()` for conversion.
   * @returns A new DateTime instance with the same naive values but the UTC timezone.
   */
  asUtc(): DateTime<Utc> {
    if (this.tz.id === "utc") return this as DateTime<Utc>;
    return this.asTz(Utc);
  }

  /**
   * Converts this DateTime to represent the *same moment in time* but in a different timezone.
   * The naive date and time values will be adjusted according to the difference in timezone offsets.
   *
   * @template Tz - The type of the target timezone identifier.
   * @param tz The target logical timezone.
   * @returns A new DateTime instance representing the same instant in the target timezone.
   *
   * @example
   * const dtUtc = DateTime.fromRfc3339("2023-01-01T12:00:00Z").unwrap();
   * const dtNy = dtUtc.toTz({ id: "America/New_York", offset: -5 * Time.MS_PER_HR });
   * console.log(dtNy.toString()); // Output: "2023-01-01T07:00:00-05:00" (12:00 UTC is 07:00 in NY)
   * console.log(dtUtc.mse === dtNy.mse); // Output: true
   */
  toTz<Tz extends string = any>(tz: LogicalTimezone<Tz>): DateTime<Tz> {
    if (this.tz.info === tz.info) {
      return this as unknown as DateTime<Tz>;
    }
    const offsetDelta = tz.info.offset.sub(this.tz.info.offset);
    return new DateTime(
      this.ndt.add({
        ms: offsetDelta.toMs,
      }),
      tz,
    );
  }

  /**
   * Converts this DateTime to represent the *same moment in time* but in the UTC timezone.
   * This is a shortcut for `toTz(DateTime.utc)`.
   * @returns A new DateTime instance representing the same instant in UTC.
   *
   * @example
   * const dtNy = DateTime.fromRfc3339("2023-01-01T07:00:00-05:00").unwrap();
   * const dtUtc = dtNy.toUtc();
   * console.log(dtUtc.toString()); // Output: "2023-01-01T12:00:00Z"
   */
  toUtc(): DateTime<Utc> {
    if (this.tz.id === "utc") return this as DateTime<Utc>;
    return this.toTz(Utc);
  }

  /**
   * Returns a new DateTime representing the very end of the current day (23:59:59.999) in the current timezone.
   * @returns A DateTime instance at the end of the day.
   *
   * @example
   * const dt = DateTime.fromRfc3339("2023-10-27T10:30:00Z").unwrap();
   * const endOfDay = dt.toEndOfDay();
   * console.log(endOfDay.toString()); // Output: "2023-10-27T23:59:59.999Z"
   */
  toEndOfDay(): DateTime<TzType> {
    const msPassedToday = this.time.toMs;
    const msRemaining = Time.MS_PER_DAY - 1 - msPassedToday; // -1 to get 999ms
    return this.add({ ms: msRemaining as Ms });
  }

  // --- Mathematical operations ---

  /**
   * Adds a duration to this DateTime.
   * The operation is performed on the underlying `NaiveDateTime`, preserving the timezone.
   * Handles date/time rollovers correctly.
   * @param dt An object specifying the duration components (years, months, weeks, days, hours, minutes, seconds, milliseconds) to add.
   * @returns A new DateTime instance representing the result of the addition.
   *
   * @example
   * const dt = DateTime.fromRfc3339("2023-01-31T12:00:00Z").unwrap();
   * const dtPlus1Month = dt.add({ mths: 1 });
   * console.log(dtPlus1Month.toString()); // Output: "2023-02-28T12:00:00Z" (Handles end of month)
   * const dtPlus30Hours = dt.add({ hrs: 30 });
   * console.log(dtPlus30Hours.toString()); // Output: "2023-02-01T18:00:00Z" (Handles day rollover)
   */
  add(dt: DurationTime.Parts.Opt): DateTime<TzType> {
    // Delegate addition to NaiveDateTime and wrap result with current timezone.
    return new DateTime(this.ndt.add(dt), this.tz);
  }

  /**
   * Subtracts a duration from this DateTime.
   * The operation is performed on the underlying `NaiveDateTime`, preserving the timezone.
   * Handles date/time rollovers correctly.
   * @param dt An object specifying the duration components to subtract.
   * @returns A new DateTime instance representing the result of the subtraction.
   *
   * @example
   * const dt = DateTime.fromRfc3339("2023-03-01T10:00:00Z").unwrap();
   * const dtMinus1Day = dt.sub({ days: 1 });
   * console.log(dtMinus1Day.toString()); // Output: "2023-02-28T10:00:00Z"
   * const dtMinus15Hours = dt.sub({ hrs: 15 });
   * console.log(dtMinus15Hours.toString()); // Output: "2023-02-28T19:00:00Z"
   */
  sub(dt: Duration.Parts.Opt): DateTime<TzType> {
    // Delegate subtraction to NaiveDateTime and wrap result with current timezone.
    return new DateTime(this.ndt.sub(dt), this.tz);
  }

  /**
   * Rounds this DateTime to the nearest specified time unit.
   * The rounding is performed on the underlying `NaiveDateTime`, preserving the timezone.
   * @param time An object specifying the time unit to round to (e.g., { mins: 15 } rounds to the nearest 15 minutes).
   *             Only `hrs`, `mins`, `secs`, and `ms` are considered.
   * @param op The rounding function to use (e.g., `Math.round`, `Math.floor`, `Math.ceil`). Defaults to `Math.round`.
   * @returns A new, rounded DateTime instance.
   *
   * @example
   * const dt = DateTime.fromRfc3339("2023-10-27T10:17:35.600Z").unwrap();
   * const nearest15Min = dt.nearest({ mins: 15 });
   * console.log(nearest15Min.toString()); // Output: "2023-10-27T10:15:00Z"
   * const nearestHourCeil = dt.nearest({ hrs: 1 }, Math.ceil);
   * console.log(nearestHourCeil.toString()); // Output: "2023-10-27T11:00:00Z"
   * const nearest100ms = dt.nearest({ ms: 100 });
   * console.log(nearest100ms.toString()); // Output: "2023-10-27T10:17:35.600Z"
   */
  nearest(
    time: DurationTime.Parts.Opt,
    op: (n: number) => number = Math.round,
  ): DateTime<TzType> {
    // Delegate rounding to NaiveDateTime and wrap result with current timezone.
    return new DateTime(this.ndt.nearest(time, op), this.tz);
  }

  // --- String representations ---

  /**
   * Formats the DateTime as an RFC 3339 / ISO 8601 string.
   * Includes the date, time (with millisecond precision if non-zero), and timezone offset (Z for UTC or +/-HH:MM).
   * @returns The formatted string.
   *
   * @example
   * const dtUtc = DateTime.fromRfc3339("2023-10-27T10:17:35Z").unwrap();
   * console.log(dtUtc.rfc3339()); // Output: "2023-10-27T10:17:35Z"
   * const dtOffset = DateTime.fromRfc3339("2023-10-27T12:17:35+02:00").unwrap();
   * console.log(dtOffset.rfc3339()); // Output: "2023-10-27T12:17:35+02:00"
   * const dtMs = new DateTime(
   *   new NaiveDateTime(NaiveDate.fromYmd1(2023,1,1), new NaiveTime(1,2,3,456)),
   *   DateTime.utc
   * );
   * console.log(dtMs.rfc3339()); // Output: "2023-01-01T01:02:03.456Z" (Implementation dependent on NaiveTime.toString)
   */
  rfc3339(): string {
    const sb: string[] = ["", "T", "", ""];
    sb[0] = this.ndt.date.rfc3339(); // YYYY-MM-DD
    sb[2] = this.ndt.time.toString(); // HH:MM:SS or HH:MM:SS.ms
    sb[3] = this.tz.rfc3339; // Z or +/-HH:MM
    return sb.join("");
  }

  /**
   * Returns the RFC 3339 string representation of the DateTime.
   * Alias for `rfc3339()`.
   * @returns The formatted string.
   */
  toString(): string {
    return this.rfc3339();
  }

  /**
   * Serializes the DateTime to its RFC 3339 string representation when using `JSON.stringify()`.
   * @returns The RFC 3339 formatted string.
   */
  toJSON(): string {
    return this.rfc3339();
  }

  eq(o: DateTime<any>): boolean {
    return this.mse === o.mse;
  }

  jsdate(): Date {
    return new Date(this.mse);
  }
}

/**
 * Namespace containing static factory methods and nested types related to DateTime.
 */
export namespace DateTime {
  /**
   * Creates a DateTime instance from the number of milliseconds since the Unix epoch.
   * The resulting DateTime will be in the specified timezone.
   * @template TzType - The type of the target timezone identifier.
   * @param mse The total number of milliseconds since 1970-01-01T00:00:00Z.
   * @param tz The target logical timezone for the resulting DateTime.
   * @returns A new DateTime instance representing the given epoch milliseconds in the specified timezone.
   *
   * @example
   * const epochMs = 0 as MsSinceEpoch;
   * const dtUtc = DateTime.fromMse(epochMs, DateTime.utc);
   * console.log(dtUtc.toString()); // Output: "1970-01-01T00:00:00Z"
   * const dtNy = DateTime.fromMse(epochMs, { id: "America/New_York", offset: -5 * Time.MS_PER_HR });
   * console.log(dtNy.toString()); // Output: "1969-12-31T19:00:00-05:00"
   */
  export function fromMse<TzType extends string>(
    mse: MsSinceEpoch,
    tz: LogicalTimezone<TzType>,
  ): DateTime<TzType> {
    if (tz.info.offset.toMs === 0) {
      return new DateTime(NaiveDateTime.fromMse(mse), tz);
    }
    return new DateTime(
      NaiveDateTime.fromMse((mse + tz.info.offset.toMs) as MsSinceEpoch),
      tz,
    );
  }

  /**
   * Creates a DateTime instance from the number of days since the Unix epoch.
   * The time component will be midnight (00:00:00.000) in the specified timezone.
   * @template TzType - The type of the target timezone identifier.
   * @param dse The total number of days since 1970-01-01.
   * @param tz The target logical timezone.
   * @returns A new DateTime instance representing midnight on the given epoch day in the specified timezone.
   *
   * @example
   * const epochDay1 = 1 as DaysSinceEpoch;
   * const dtUtc = DateTime.fromDse(epochDay1, DateTime.utc);
   * console.log(dtUtc.toString()); // Output: "1970-01-02T00:00:00Z"
   */
  export function fromDse<TzType extends string>(
    dse: DaysSinceEpoch,
    tz: LogicalTimezone<TzType>,
  ): DateTime<TzType> {
    // Convert days to milliseconds and delegate to fromMse
    return DateTime.fromMse((dse * Time.MS_PER_DAY) as MsSinceEpoch, tz);
  }

  /**
   * Parses an RFC 3339 / ISO 8601 formatted string into a DateTime object.
   * The resulting DateTime will have a `FixedOffset` timezone based on the offset in the string (Z or +/-HH:MM).
   * @param rfc3339 The string to parse (e.g., "2023-10-27T10:30:00Z", "2023-10-27T12:30:00+02:00").
   * @param tzname Optional timezone name to associate (not used for calculation).
   * @param tzabbr Optional timezone abbreviation to associate (not used for calculation).
   * @returns A `Result` containing the parsed `DateTime<FixedOffset>` on success, or an Error string on failure.
   *
   * @example
   * const res1 = DateTime.fromRfc3339("2023-10-27T10:30:00Z");
   * if (Result.isOk(res1)) console.log(res1.value.toString()); // Output: "2023-10-27T10:30:00Z"
   *
   * const res2 = DateTime.fromRfc3339("2023-10-27T12:30:00+02:00");
   * if (Result.isOk(res2)) {
   *   console.log(res2.value.toString()); // Output: "2023-10-27T12:30:00+02:00"
   *   console.log(res2.value.tz.offset.asHrs); // Output: 2
   * }
   *
   * const res3 = DateTime.fromRfc3339("invalid-string");
   * console.log(Result.isErr(res3)); // Output: true
   */
  export function fromRfc3339(
    rfc3339: string,
    tzname?: Option<string>,
    tzabbr?: Option<string>,
  ): Result<DateTime<FixedOffset>> {
    const match = rfc3339.match(RFC3339_REGEX);
    if (!match) return erm("DateTime.fromRfc3339: Invalid format");

    // Extract components (handle optional time/timezone)
    const [
      _,
      yearStr,
      monthStr,
      dayStr,
      hourStr = "00", // Default to midnight if time is missing
      minuteStr = "00",
      secondStr = "00",
      fractionStr = ".0", // Default to zero milliseconds
      timezoneStr = "Z", // Default to UTC if timezone is missing
    ] = match;

    const ndr = NaiveDate.fromYmd1Str(yearStr, monthStr, dayStr);
    if (ndr.isErr) return ndr.expeCast();
    const nd = ndr.exp();

    const ms = Math.round(Number.parseFloat("0" + fractionStr) * 1000); // Convert ".123" to 123ms
    const ntr = NaiveTime.tryFrom({
      hrs: TentoMath.int(hourStr),
      mins: TentoMath.int(minuteStr),
      secs: TentoMath.int(secondStr),
      ms: ms as Ms,
    });

    if (ntr.isErr) return ntr.expeCast();
    const nt = ntr.exp();

    const tz = LogicalTimezone.parse(timezoneStr, tzname, tzabbr);
    return ok(new DateTime(new NaiveDateTime(nd, nt), tz));
  }

  /**
   * Represents a continuous range between two DateTime instances (start and end).
   * The start and end points have the same timezone type.
   * Inherits generic range functionality from `GenericRange`.
   *
   * @template Tz - The timezone identifier type for the start and end points.
   */
  export class Range<Tz extends string = any> extends GenericRange<
    DateTime<Tz>
  > {
    constructor(
      public readonly start: DateTime<Tz>,
      public readonly end: DateTime<Tz>,
    ) {
      super(start, end);
    }

    /**
     * Creates a `DateTime.Range` from a `GenericRange<DateTime<Tz>>`.
     * Useful for type casting or ensuring the instance has `DateTime.Range` specific methods.
     * @template Tz - The timezone identifier type.
     * @param r The generic range containing DateTime start and end points.
     * @returns A `DateTime.Range` instance.
     */
    static from<Tz extends string = any>(
      r: GenericRange<DateTime<Tz>>,
    ): Range<Tz> {
      // Optimization: If already the correct type, return it.
      if (r instanceof Range) return r;
      // Otherwise, create a new instance.
      return new Range(r.start, r.end);
    }

    /**
     * Determines how a given day (represented by a DateTime within that day) overlaps with this range.
     * Compares the date part only.
     * @param date A DateTime instance representing the day to check. Timezone should match the range.
     * @returns "start" if the date matches the start day of the range.
     *          "end" if the date matches the end day of the range.
     *          "middle" if the date is between the start and end days (inclusive of start, exclusive of end based on `contains`).
     *          "none" if the date is completely outside the range days.
     *
     * @example
     * const start = DateTime.fromRfc3339("2023-10-27T10:00:00Z").unwrap();
     * const end = DateTime.fromRfc3339("2023-10-29T15:00:00Z").unwrap();
     * const range = new DateTime.Range(start, end);
     * const day1 = DateTime.fromRfc3339("2023-10-27T00:00:00Z").unwrap();
     * const day2 = DateTime.fromRfc3339("2023-10-28T12:00:00Z").unwrap();
     * const day3 = DateTime.fromRfc3339("2023-10-29T20:00:00Z").unwrap(); // Note: time is after range end time
     * const day4 = DateTime.fromRfc3339("2023-10-30T00:00:00Z").unwrap();
     *
     * console.log(range.overlapsWithDay(day1)); // Output: "start"
     * console.log(range.overlapsWithDay(day2)); // Output: "middle"
     * console.log(range.overlapsWithDay(day3)); // Output: "end" (matches end date, even if time is outside)
     * console.log(range.overlapsWithDay(day4)); // Output: "none"
     */
    overlapsWithDay(date: NaiveDate): Option<"start" | "middle" | "end"> {
      const dse = date.dse;
      const startDse = this.start.dse;
      const endDse = this.end.dse;
      if (dse === startDse) {
        return "start";
      } else if (dse === endDse) {
        return "end";
      } else if (dse > startDse && dse < endDse) {
        return "middle";
      }
      return null;
    }

    containsRangeInclusive(o: DateTime.Range): boolean {
      return this.containsInclusive(o.start) || this.containsInclusive(o.end);
    }

    containsRangeExclusive(o: DateTime.Range): boolean {
      return (
        this.containsExclusiveBoth(o.start) || this.containsExclusiveBoth(o.end)
      );
    }

    overlapsInclusive(o: DateTime.Range): boolean {
      return this.containsRangeInclusive(o) || o.containsRangeInclusive(this);
    }

    overlapsExclusive(o: DateTime.Range): boolean {
      return this.containsRangeExclusive(o) || o.containsRangeExclusive(this);
    }

    /**
     * Checks if a DateTime instance falls within this range, inclusive of both start and end points.
     * Comparison is based on milliseconds since epoch.
     * @param d The DateTime to check. Timezone will be handled implicitly by `mse`.
     * @returns `true` if the DateTime is within the range (inclusive), `false` otherwise.
     */
    containsInclusive(d: DateTime<any>): boolean {
      const n = d.mse;
      return n >= this.start.mse && n <= this.end.mse;
    }

    /**
     * Checks if a DateTime instance falls within this range (start inclusive, end exclusive).
     * This is the typical behavior for time ranges (e.g., events).
     * Comparison is based on milliseconds since epoch.
     * @param d The DateTime to check. Timezone will be handled implicitly by `mse`.
     * @returns `true` if the DateTime is within the range (end exclusive), `false` otherwise.
     *
     * @example
     * const start = DateTime.fromRfc3339("2023-10-27T10:00:00Z").unwrap();
     * const end = DateTime.fromRfc3339("2023-10-27T11:00:00Z").unwrap();
     * const range = new DateTime.Range(start, end);
     * const inside = DateTime.fromRfc3339("2023-10-27T10:30:00Z").unwrap();
     * const edgeStart = DateTime.fromRfc3339("2023-10-27T10:00:00Z").unwrap();
     * const edgeEnd = DateTime.fromRfc3339("2023-10-27T11:00:00Z").unwrap();
     *
     * console.log(range.contains(inside)); // Output: true
     * console.log(range.contains(edgeStart)); // Output: true
     * console.log(range.contains(edgeEnd)); // Output: false
     */
    containsExclusiveEnd(d: DateTime<any>): boolean {
      const n = d.mse;
      // Check if timestamp is greater than or equal to start AND strictly less than end
      return n >= this.start.mse && n < this.end.mse;
    }

    containsExclusiveBoth(d: DateTime<any>): boolean {
      const n = d.mse;
      // Check if timestamp is greater than or equal to start AND strictly less than end
      return n > this.start.mse && n < this.end.mse;
    }

    /**
     * Converts this range to UTC, transforming both the start and end points.
     * The resulting range represents the same time interval, but expressed in UTC.
     * @returns A new `DateTime.Range` instance in the UTC timezone.
     */
    toUtc(): Range<Utc> {
      return new Range(this.start.toUtc(), this.end.toUtc());
    }

    /**
     * Converts this range to a specified timezone, transforming both the start and end points.
     * The resulting range represents the same time interval, but expressed in the target timezone.
     * @param tz The target logical timezone. Defaults to UTC if not provided.
     * @returns A new `DateTime.Range` instance in the target timezone.
     */
    toTz(tz: LogicalTimezone<FixedOffset> = Utc): Range<FixedOffset> {
      return new Range(this.start.toTz(tz), this.end.toTz(tz));
    }

    /**
     * Extracts a `TimePoint.Range` representing just the time-of-day components of the start and end points.
     * This ignores the date and timezone, focusing only on the time part.
     * @returns A `TimePoint.Range` (which uses `NaiveTime`).
     */
    time(): TimeOfDay.Range {
      // Create a range using the NaiveTime components of the start and end DateTimes.
      return new TimeOfDay.Range(
        this.start.time,
        this.end.time,
        this.start.dse !== this.end.dse,
      );
    }

    /**
     * Given a datetime range, callers can query for the slice that intersects
     * with the given day.
     *
     * eg.
     *    this: `2025-01-01 4pm` to `2025-01-04 8pm`
     *
     *    `2025-01-01`
     *       -> TimeOfDay(start: 16:00, end 00:00, endsOnNextDay: true)
     *
     *    `2025-01-02`
     *       -> TimeOfDay(start: 00:00, end 00:00, endsOnNextDay: true)
     *
     *    `2025-01-04`
     *       -> TimeOfDay(start: 00:00, end 20:00, endsOnNextDay: false)
     *
     * @param nd The date to find the intersection with
     * @returns A TimeOfDay.Range representing the portion of the DateTime range that falls on the given date
     */
    intersection(nd: NaiveDate): TimeOfDay.Range {
      const overlap = this.overlapsWithDay(nd);
      if (!overlap) {
        return new TimeOfDay.Range(TimeOfDay.ZERO, TimeOfDay.ZERO, false);
      }

      const isMultiDay = this.start.dse !== this.end.dse;
      if (!isMultiDay) {
        return new TimeOfDay.Range(this.start.time, this.end.time, false);
      }

      switch (overlap) {
        case "start":
          return new TimeOfDay.Range(this.start.time, TimeOfDay.ZERO, true);
        case "middle":
          return new TimeOfDay.Range(TimeOfDay.ZERO, TimeOfDay.ZERO, true);
        case "end":
          return new TimeOfDay.Range(TimeOfDay.ZERO, this.end.time, false);
      }
    }

    intersectionDtr(other: DateTime.Range): Option<DateTime.Range> {
      const start = this.start.mse > other.start.mse ? this.start : other.start;
      const end = this.end.mse < other.end.mse ? this.end : other.end;

      // dev("  ", start.toString());
      // dev("  ", end.toString());
      if (end.durationSince(start).toMs <= 0) return null;
      return new DateTime.Range(start, end);
    }

    /**
     * Gets the duration of this time range.
     * Calculated as the difference between the end and start points.
     * @returns A `TimeUnit` representing the length of the range.
     */
    get duration(): DurationTime {
      return this.end.durationSince(this.start);
    }

    eq(o: DateTime.Range<any>): boolean {
      return this.start.mse === o.start.mse && this.end.mse === o.end.mse;
    }

    toString(): string {
      return `${this.start.toString()}..${this.end.toString()}`;
    }
  }
}
