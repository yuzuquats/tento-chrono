import { NaiveDate } from "./naive-date.ts";
import { NaiveDateTime } from "./naive-datetime.ts";
import { NaiveTime } from "./naive-time.ts";
import { GenericRange } from "./range.ts";
import { Result, erm, ok } from "./result.ts";
import { Time } from "./time.ts";
import { FixedOffset, Local, LocalTimezone, LogicalTimezone, Utc } from "./timezone.ts";
import { Duration } from "./units/duration.ts";
import { DurationTime } from "./units/duration-time.ts";
import { Ms } from "./units/ms.ts";
import { TimeOfDay } from "./units/time-of-day.ts";
import { DayOfMonth1, DaysSinceEpoch, Month1, MsSinceEpoch } from "./units/units.ts";
import { YearMonth } from "./units/year-month.ts";
import { Weekday } from "./units/weekday.ts";
import { YearMonthDay, Ymd1Like } from "./units/year-month-day.ts";
import type { Option } from "./option.ts";
import { readAsciiDigitPair } from "./utils.ts";

const RFC3339_CACHE_MAX = 128;
// Keep recency in a linked list so a cache hit need not rewrite the map.
interface Rfc3339CacheEntry {
  text: string;
  result: Result<DateTime<FixedOffset>>;
  older: Rfc3339CacheEntry | undefined;
  newer: Rfc3339CacheEntry | undefined;
}
const _rfc3339Cache = new Map<string, Rfc3339CacheEntry>();
let oldestRfc3339: Rfc3339CacheEntry | undefined;
let newestRfc3339: Rfc3339CacheEntry | undefined;

function unlinkRfc3339(entry: Rfc3339CacheEntry): void {
  if (entry.older) entry.older.newer = entry.newer;
  else oldestRfc3339 = entry.newer;
  if (entry.newer) entry.newer.older = entry.older;
  else newestRfc3339 = entry.older;
}

function appendRfc3339(entry: Rfc3339CacheEntry): void {
  entry.older = newestRfc3339;
  entry.newer = undefined;
  if (newestRfc3339) newestRfc3339.newer = entry;
  else oldestRfc3339 = entry;
  newestRfc3339 = entry;
}
const RFC3339_PENDING_SLOTS = 512;

class Rfc3339Pending {
  #keys = new Array<string | undefined>(RFC3339_PENDING_SLOTS).fill(undefined);
  #lookups = new Uint32Array(RFC3339_PENDING_SLOTS);
  #size = 0;
  #collisions = new Map<string, number>();

  get size(): number {
    return this.#size + this.#collisions.size;
  }

  clear(): void {
    const keys = this.#keys;
    for (let i = 0; i < keys.length; i++) keys[i] = undefined;
    this.#size = 0;
    if (this.#collisions.size !== 0) this.#collisions.clear();
  }

  // The deferred key is distinct from all keys already in the table.
  add(text: string, bucket: number, lookup: number): void {
    if (this.#keys[bucket] === undefined) {
      this.#keys[bucket] = text;
      this.#lookups[bucket] = lookup;
      this.#size++;
    } else {
      this.#collisions.set(text, lookup);
    }
  }

  // A probationary match is removed whether we admit it or refresh its lookup.
  take(text: string, bucket: number): number | undefined {
    if (this.#keys[bucket] === text) {
      this.#keys[bucket] = undefined;
      this.#size--;
      return this.#lookups[bucket];
    }
    const lookup = this.#collisions.get(text);
    if (lookup !== undefined) this.#collisions.delete(text);
    return lookup;
  }
}

let rfc3339Pending: Rfc3339Pending | undefined;

// Mix fields already read by the scanner. The table also compares the exact text.
function rfc3339PendingBucket(
  text: string,
  year: number,
  month: number,
  day: number,
  timeMs: number,
): number {
  return typeof text === "string"
    ? (Math.imul((year * 372 + month * 31 + day) ^ timeMs, 0x9e3779b1) >>> 16) &
      (RFC3339_PENDING_SLOTS - 1)
    : 0;
}

let rfc3339Lookup = 0;
// Keep the newest probationary key out of the map until another miss arrives.
const lastPendingRfc3339 = {
  text: undefined as string | undefined,
  lookup: 0,
  year: 0,
  month: 0,
  day: 0,
  timeMs: 0,
  bucket: 0,
  timezone: undefined as LogicalTimezone<FixedOffset> | undefined,
};
let lastRfc3339OffsetKey = 0;
let lastRfc3339OffsetZone: LogicalTimezone<FixedOffset> | undefined;
let rfc3339OffsetZones: Map<number, LogicalTimezone<FixedOffset>> | undefined;

/**
 * Represents a specific moment in time with associated timezone information.
 * It combines a timezone-naive `NaiveDateTime` with a `LogicalTimezone`.
 * This class provides methods for manipulation, comparison, and conversion between timezones.
 *
 * @template TzType - The specific type of the timezone identifier (e.g., "Utc", "Local", "America/New_York"). Defaults to `any` string.
 *
 * @example
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { DateTime, naivedatetime, Utc } from "@tento/chrono";
 *
 * // A DateTime is a naive wall-clock time plus a timezone.
 * const utc = new DateTime(naivedatetime(2023, 10, 27, 18, 30), Utc);
 * assertEquals(utc.toString(), "2023-10-27T18:30:00Z");
 *
 * // Parsing keeps the offset the string was written in.
 * const ny = DateTime.fromRfc3339("2023-10-27T14:30:00-04:00").exp();
 * assertEquals(ny.toUtc().toString(), "2023-10-27T18:30:00Z");
 * assertEquals(ny.eq(utc), true);
 * ```
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
  private _mse: Option<MsSinceEpoch> = null;

  constructor(
    public readonly ndt: NaiveDateTime,
    public readonly tz: LogicalTimezone<TzType>,
  ) {
    if (tz instanceof LocalTimezone) this.tz = tz.atWallClock(ndt.mse) as typeof tz;
  }

  /**
   * Gets the total number of milliseconds since the Unix epoch (1970-01-01T00:00:00Z).
   * This value represents the absolute point in time, independent of timezone.
   * @returns Milliseconds since epoch.
   *
   * @example
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * assertEquals(DateTime.fromRfc3339("1970-01-01T00:00:01Z").exp().mse, 1000);
   * ```
   */
  get mse(): MsSinceEpoch {
    if (this._mse != null) return this._mse;
    return (this._mse = (this.ndt.mse - this.tz.info.offset.toMs) as MsSinceEpoch);
  }

  /**
   * Gets the day index of the date in this DateTime's timezone relative to 1970-01-01.
   * Use `toUtc().dse` for the UTC day index.
   * @returns Days since epoch.
   *
   * @example
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * assertEquals(DateTime.fromRfc3339("1970-01-02T00:00:00Z").exp().dse, 1);
   * ```
   */
  get dse(): DaysSinceEpoch {
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * const start = DateTime.fromRfc3339("2023-10-27T10:00:00Z").exp();
   * const end = DateTime.fromRfc3339("2023-10-27T10:00:05Z").exp();
   * assertEquals(end.durationSince(start).toSecs, 5);
   * ```
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * const noonUtc = DateTime.fromRfc3339("2023-01-01T12:00:00Z").exp();
   * const noonParis = DateTime.fromRfc3339("2023-01-01T12:00:00+01:00").exp(); // an hour earlier
   * assertEquals(noonUtc.isBefore(noonParis), false);
   * assertEquals(noonParis.isBefore(noonUtc), true);
   * ```
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * const dt1 = DateTime.fromRfc3339("2023-01-01T12:00:00Z").exp();
   * const dt2 = DateTime.fromRfc3339("2023-01-01T13:00:00+01:00").exp(); // same instant
   * const dt3 = DateTime.fromRfc3339("2023-01-01T14:00:00+01:00").exp(); // an hour later
   * assertEquals(dt1.compare(dt2), 0);
   * assertEquals(dt1.compare(dt3) < 0, true);
   * assertEquals(dt3.compare(dt1) > 0, true);
   * ```
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime, naivetime } from "@tento/chrono";
   *
   * const dt = DateTime.fromRfc3339("2023-10-27T15:30:00Z").exp();
   * assertEquals(dt.withTime().toString(), "2023-10-27T00:00:00Z");
   * assertEquals(dt.withTime(naivetime(9)).toString(), "2023-10-27T09:00:00Z");
   * ```
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime, Duration, FixedTimezone, naivedatetime, Tzname, Utc } from "@tento/chrono";
   *
   * const est = new FixedTimezone("EST", {
   *   tzabbr: "EST",
   *   tzname: "America/New_York" as Tzname,
   *   offset: Duration.Time.from({ hrs: -5 }),
   * });
   * const dtUtc = new DateTime(naivedatetime(2023, 1, 1, 12), Utc);
   * const relabelled = dtUtc.asTz(est);
   * assertEquals(relabelled.toString(), "2023-01-01T12:00:00-05:00");
   * assertEquals(relabelled.eq(dtUtc), false); // a different instant
   * ```
   */
  asTz<Tz extends string>(offset: LogicalTimezone<Tz>): DateTime<Tz> {
    return new DateTime(this.ndt, offset);
  }

  /**
   * Creates a new DateTime instance with the same naive date and time values but associated with the UTC timezone.
   * This is a shortcut for `asTz(Utc)`.
   * **Important:** This does *not* represent the same moment in time unless the original timezone was already UTC. Use `toUtc()` for conversion.
   * @returns A new DateTime instance with the same naive values but the UTC timezone.
   */
  asUtc(): DateTime<Utc> {
    if ((this.tz as LogicalTimezone<string>) === Utc) return this as DateTime<Utc>;
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime, Duration, FixedTimezone, Tzname } from "@tento/chrono";
   *
   * const est = new FixedTimezone("EST", {
   *   tzabbr: "EST",
   *   tzname: "America/New_York" as Tzname,
   *   offset: Duration.Time.from({ hrs: -5 }),
   * });
   * const dtUtc = DateTime.fromRfc3339("2023-01-01T12:00:00Z").exp();
   * const dtNy = dtUtc.toTz(est);
   * assertEquals(dtNy.toString(), "2023-01-01T07:00:00-05:00");
   * assertEquals(dtNy.eq(dtUtc), true); // the same instant
   * ```
   */
  toTz<Tz extends string = any>(tz: LogicalTimezone<Tz>): DateTime<Tz> {
    if (tz instanceof LocalTimezone) tz = tz.atInstant(this.mse) as typeof tz;
    if (this.tz.info === tz.info) {
      // The same offset: the same wall clock, labelled with `tz` (a +00:00 zone's time `toUtc` is Utc's).
      return (this.tz as LogicalTimezone<string>) === tz ? this as unknown as DateTime<Tz> : new DateTime(this.ndt, tz);
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
   * This is a shortcut for `toTz(Utc)`.
   * @returns A new DateTime instance representing the same instant in UTC.
   *
   * @example
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * const dtNy = DateTime.fromRfc3339("2023-01-01T07:00:00-05:00").exp();
   * assertEquals(dtNy.toUtc().toString(), "2023-01-01T12:00:00Z");
   * ```
   */
  toUtc(): DateTime<Utc> {
    if ((this.tz as LogicalTimezone<string>) === Utc) return this as DateTime<Utc>;
    return this.toTz(Utc);
  }

  /**
   * Returns a new DateTime representing the very end of the current day (23:59:59.999) in the current timezone.
   * @returns A DateTime instance at the end of the day.
   *
   * @example
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * const dt = DateTime.fromRfc3339("2023-10-27T10:30:00Z").exp();
   * assertEquals(dt.toEndOfDay().toString(), "2023-10-27T23:59:59.999Z");
   * ```
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * const dt = DateTime.fromRfc3339("2023-01-31T12:00:00Z").exp();
   * assertEquals(dt.add({ mths: 1 }).toString(), "2023-02-28T12:00:00Z"); // the month's last day
   * assertEquals(dt.add({ hrs: 30 }).toString(), "2023-02-01T18:00:00Z");
   * ```
   */
  add(dt: Duration.Parts.Opt): DateTime<TzType> {
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * const dt = DateTime.fromRfc3339("2023-03-01T10:00:00Z").exp();
   * assertEquals(dt.sub({ days: 1 }).toString(), "2023-02-28T10:00:00Z");
   * assertEquals(dt.sub({ hrs: 15 }).toString(), "2023-02-28T19:00:00Z");
   * ```
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * const dt = DateTime.fromRfc3339("2023-10-27T10:17:35.600Z").exp();
   * assertEquals(dt.nearest({ mins: 15 }).toString(), "2023-10-27T10:15:00Z");
   * assertEquals(dt.nearest({ hrs: 1 }, Math.ceil).toString(), "2023-10-27T11:00:00Z");
   * ```
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
   * Historical offsets with seconds are rounded to a minute, with the wall time adjusted to preserve the instant.
   * If the nearest minute would produce a 24-hour offset or a year outside 0000–9999,
   * use the other adjacent minute when it fits. If neither minute fits, format in UTC.
   * UTC years outside 0000–9999 keep the extended year spelling, outside RFC 3339.
   * @returns The formatted string.
   *
   * @example
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime, naivedatetime, Utc } from "@tento/chrono";
   *
   * assertEquals(DateTime.fromRfc3339("2023-10-27T10:17:35Z").exp().rfc3339(), "2023-10-27T10:17:35Z");
   * assertEquals(
   *   DateTime.fromRfc3339("2023-10-27T12:17:35+02:00").exp().rfc3339(),
   *   "2023-10-27T12:17:35+02:00",
   * );
   * assertEquals(
   *   new DateTime(naivedatetime(2023, 1, 1, 1, 2, 3, 456), Utc).rfc3339(),
   *   "2023-01-01T01:02:03.456Z",
   * );
   * ```
   */
  rfc3339(): string {
    const offset = this.tz.info.offset;
    if (offset.toMs % Time.MS_PER_MIN === 0 && Math.abs(offset.toMs) < Time.MS_PER_DAY) {
      return `${this.ndt.date.rfc3339()}T${this.ndt.time.toString()}${this.tz.rfc3339}`;
    }
    const offsetMins = offset.toMinsF;
    const lower = Math.floor(offsetMins);
    const nearest = Math.round(offsetMins);
    const adjacent = nearest === lower ? Math.ceil(offsetMins) : lower;
    const epoch = this.mse;
    for (const mins of [nearest, adjacent]) {
      const rounded = Duration.Time.mins(mins);
      if (Math.abs(rounded.toMs) >= Time.MS_PER_DAY) continue;
      const wall = NaiveDateTime.fromMse((epoch + rounded.toMs) as MsSinceEpoch);
      if (wall.date.yr >= 0 && wall.date.yr <= 9999) {
        return `${wall.date.rfc3339()}T${wall.time.toString()}${rounded.asSignedHm()}`;
      }
    }
    return this.toUtc().rfc3339();
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime, Duration, FixedTimezone, MsSinceEpoch, Tzname, Utc } from "@tento/chrono";
   *
   * const est = new FixedTimezone("EST", {
   *   tzabbr: "EST",
   *   tzname: "America/New_York" as Tzname,
   *   offset: Duration.Time.from({ hrs: -5 }),
   * });
   * const epoch = 0 as MsSinceEpoch;
   * assertEquals(DateTime.fromMse(epoch, Utc).toString(), "1970-01-01T00:00:00Z");
   * assertEquals(DateTime.fromMse(epoch, est).toString(), "1969-12-31T19:00:00-05:00");
   * ```
   */
  export function fromMse<TzType extends string>(
    mse: MsSinceEpoch,
    tz: LogicalTimezone<TzType>,
  ): DateTime<TzType> {
    if (tz instanceof LocalTimezone) tz = tz.atInstant(mse) as typeof tz;
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
   * Projects midnight UTC on that epoch day into the specified timezone.
   * @template TzType - The type of the target timezone identifier.
   * @param dse The total number of days since 1970-01-01.
   * @param tz The target logical timezone.
   * @returns A DateTime for UTC midnight on the given epoch day, expressed in the specified timezone.
   *
   * @example
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime, DaysSinceEpoch, Utc } from "@tento/chrono";
   *
   * assertEquals(DateTime.fromDse(1 as DaysSinceEpoch, Utc).toString(), "1970-01-02T00:00:00Z");
   * ```
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
   * ```ts
   * import { assertEquals } from "@std/assert";
   * import { DateTime } from "@tento/chrono";
   *
   * const dt = DateTime.fromRfc3339("2023-10-27T12:30:00+02:00").exp();
   * assertEquals(dt.toString(), "2023-10-27T12:30:00+02:00");
   * assertEquals(dt.tz.info.offset.toHrs, 2);
   *
   * assertEquals(DateTime.fromRfc3339("invalid-string").isErr, true);
   * ```
   */
  export function fromRfc3339(
    rfc3339: string,
    tzname?: Option<string>,
    tzabbr?: Option<string>,
  ): Result<DateTime<FixedOffset>> {
    // LRU cache for repeated parses of the same string (common during
    // calendar cold start where cells share dates).
    const cacheable = !tzname && !tzabbr;
    const lookup = cacheable ? (rfc3339Lookup = (rfc3339Lookup + 1) >>> 0) : 0;
    if (cacheable) {
      if (lookup === 0) {
        rfc3339Pending?.clear();
        lastPendingRfc3339.text = undefined;
      }
      const cached = _rfc3339Cache.get(rfc3339);
      if (cached) {
        if (cached !== newestRfc3339) {
          unlinkRfc3339(cached);
          appendRfc3339(cached);
        }
        return cached.result;
      }
      const pending = lastPendingRfc3339;
      if (rfc3339 === pending.text && pending.text !== undefined && lookup === pending.lookup + 1) {
        // Reuse validation, but keep the mutable date fields and caches independent.
        const fields = {
          yr: pending.year,
          mth: pending.month as Month1,
          day: pending.day as DayOfMonth1,
        };
        const result = buildRfc3339(fields, pending.timeMs, pending.timezone!);
        replaceOldestRfc3339(rfc3339, result);
        return result;
      }
    }

    return scanRfc3339(rfc3339, false, cacheable ? lookup : undefined, tzname, tzabbr);
  }

  /**
   * Reads the Unix epoch milliseconds encoded by a timestamp without creating
   * a DateTime. Uses the same input grammar and millisecond rounding as
   * `fromRfc3339`. A timestamp without an offset is read as UTC.
   * The value is derived from the text independently of cached DateTimes.
   */
  export function epochFromRfc3339(rfc3339: string): Result<MsSinceEpoch> {
    return scanRfc3339(rfc3339, true);
  }

  function scanRfc3339(rfc3339: string, epochOnly: true): Result<MsSinceEpoch>;
  function scanRfc3339(
    rfc3339: string,
    epochOnly: false,
    lookup: number | undefined,
    tzname?: Option<string>,
    tzabbr?: Option<string>,
  ): Result<DateTime<FixedOffset>>;
  function scanRfc3339(
    rfc3339: string,
    epochOnly: boolean,
    lookup?: number,
    tzname?: Option<string>,
    tzabbr?: Option<string>,
  ): Result<DateTime<FixedOffset> | MsSinceEpoch> {
    // Scan fixed fields without match arrays, field slices or offset splits.
    // Every separator/digit and the final cursor are checked before construction.
    const len = rfc3339.length;
    const year = readAsciiDigitPair(rfc3339, 0) * 100 + readAsciiDigitPair(rfc3339, 2);
    const month = readAsciiDigitPair(rfc3339, 5), day = readAsciiDigitPair(rfc3339, 8);
    let h = 0, m = 0, sec = 0, fractionMs = 0, cursor = 10;
    let offsetStart = 0, offsetKey = 0, offsetMs = 0;
    if (len < 10 || rfc3339[4] !== "-" || rfc3339[7] !== "-" ||
      !Number.isFinite(year + month + day)) return erm("DateTime.fromRfc3339: Invalid format");
    if (len > 10) {
      if ((rfc3339[10] !== "T" && rfc3339[10] !== "t") ||
        rfc3339[13] !== ":" || rfc3339[16] !== ":") return erm("DateTime.fromRfc3339: Invalid format");
      h = readAsciiDigitPair(rfc3339, 11);
      m = readAsciiDigitPair(rfc3339, 14);
      sec = readAsciiDigitPair(rfc3339, 17);
      cursor = 19;
      if (!Number.isFinite(h + m + sec) || h > 23 || m > 59 || sec > 59) return erm("DateTime.fromRfc3339: Invalid time");
      if (rfc3339[cursor] === ".") {
        const start = ++cursor;
        const digits = readAsciiDigitPair(rfc3339, start);
        const third = rfc3339.charCodeAt(start + 2) - 48;
        const next = rfc3339.charCodeAt(start + 3) - 48;
        if (digits >= 0 && third >= 0 && third <= 9 && !(next >= 0 && next <= 9)) {
          fractionMs = digits * 10 + third;
          cursor += 3;
        } else {
          for (; cursor < len; cursor++) {
            const digit = rfc3339.charCodeAt(cursor) - 48;
            if (digit < 0 || digit > 9) break;
            const index = cursor - start;
            if (index < 3) fractionMs = fractionMs * 10 + digit;
            else if (index === 3 && digit >= 5) fractionMs++;
          }
          const length = cursor - start;
          if (length === 0) return erm("DateTime.fromRfc3339: Invalid fraction");
          if (length < 3) fractionMs *= length === 1 ? 100 : 10;
        }
      }
      if (cursor < len) {
        const begin = cursor;
        const sign = rfc3339[cursor++];
        if (sign !== "Z" && sign !== "z") {
          if (sign !== "+" && sign !== "-") return erm("DateTime.fromRfc3339: Invalid offset");
          const oh = readAsciiDigitPair(rfc3339, cursor), om = readAsciiDigitPair(rfc3339, cursor + 3);
          if (rfc3339[cursor + 2] !== ":" || !Number.isFinite(oh + om) || oh > 23 || om > 59) return erm("DateTime.fromRfc3339: Invalid offset");
          cursor += 5;
          let os = -1;
          if (rfc3339[cursor] === ":") {
            os = readAsciiDigitPair(rfc3339, cursor + 1);
            if (!Number.isFinite(os) || os > 59) return erm("DateTime.fromRfc3339: Invalid offset");
            cursor += 3;
          }
          const offsetSign = sign === "-" ? -1 : 1;
          if (epochOnly) {
            offsetMs = ((oh * 60 + om) * 60 + Math.max(os, 0)) * 1000 * offsetSign;
          } else {
            offsetStart = begin;
            // Preserve the sign of zero and distinguish omitted seconds from :00.
            offsetKey = ((oh * 60 + om) * 61 + os + 2) * offsetSign;
          }
        }
      }
    }
    if (cursor !== len) return erm("DateTime.fromRfc3339: Invalid format");
    // The scanner has already checked that the civil fields are integers.
    // Preserve the general validator's diagnostics for invalid fields.
    const fields = { yr: year, mth: month as Month1, day: day as DayOfMonth1 };
    if (month < 1 || month > 12 || day < 1 || (day > 28 && day > YearMonth.daysInMonth(fields))) {
      return YearMonthDay.fromYmd1Unchecked(year, month, day).toResult().expeCast();
    }
    let timeMs = (h * 3600 + m * 60 + sec) * 1000 + fractionMs;
    // At the upper RFC 3339 boundary, retain the closest representable timestamp.
    if (timeMs === Time.MS_PER_DAY && year === 9999 && month === 12 && day === 31) timeMs--;
    if (epochOnly) {
      return ok((Ymd1Like.daysSinceEpoch(fields) * Time.MS_PER_DAY + timeMs - offsetMs) as MsSinceEpoch);
    }
    let timezone: LogicalTimezone<FixedOffset> = Utc;
    if (offsetStart !== 0) {
      if (lookup !== undefined && lastRfc3339OffsetKey === offsetKey) {
        timezone = lastRfc3339OffsetZone!;
      } else {
        if (lookup !== undefined && typeof rfc3339 === "string") {
          const zones = rfc3339OffsetZones ??= new Map();
          const cached = zones.get(offsetKey);
          if (cached !== undefined) {
            timezone = cached;
          } else {
            timezone = LogicalTimezone.parse(rfc3339.slice(offsetStart));
            if (zones.size >= RFC3339_CACHE_MAX) zones.clear();
            zones.set(offsetKey, timezone);
          }
        } else {
          timezone = LogicalTimezone.parse(rfc3339.slice(offsetStart), tzname, tzabbr);
        }
        if (lookup !== undefined) {
          lastRfc3339OffsetKey = offsetKey;
          lastRfc3339OffsetZone = timezone;
        }
      }
    }
    const result = buildRfc3339(fields, timeMs, timezone);
    if (lookup !== undefined) {
      if (_rfc3339Cache.size >= RFC3339_CACHE_MAX) {
        // Admitting a miss from an earlier scan can evict results that
        // still have active reuse. Require a second lookup within one cache
        // capacity and keep the pending keys bounded as well.
        const pending = lastPendingRfc3339;
        const deferred = pending.text === rfc3339;
        const table = rfc3339Pending;
        const tableSize = table?.size ?? 0;
        // An immediate repeat can admit directly from the deferred snapshot.
        const bucket = tableSize !== 0 || pending.text !== undefined
          ? rfc3339PendingBucket(rfc3339, year, month, day, timeMs)
          : -1;
        const previous = deferred ? pending.lookup :
          (tableSize === 0 ? undefined : table!.take(rfc3339, bucket));
        if (previous == null || ((lookup - previous) >>> 0) > RFC3339_CACHE_MAX) {
          if (!deferred) {
            const size = tableSize + (pending.text == null ? 0 : 1);
            if (previous == null && size >= RFC3339_CACHE_MAX) {
              table!.clear();
            } else if (pending.text != null) {
              const pendingTable = rfc3339Pending ??= new Rfc3339Pending();
              const priorBucket = pending.bucket >= 0 ? pending.bucket :
                rfc3339PendingBucket(pending.text, pending.year, pending.month, pending.day, pending.timeMs);
              pendingTable.add(pending.text, priorBucket, pending.lookup);
            }
          }
          lastPendingRfc3339.text = rfc3339;
          lastPendingRfc3339.lookup = lookup;
          lastPendingRfc3339.year = year;
          lastPendingRfc3339.month = month;
          lastPendingRfc3339.day = day;
          lastPendingRfc3339.timeMs = timeMs;
          lastPendingRfc3339.bucket = bucket;
          lastPendingRfc3339.timezone = timezone;
          return result;
        }
        replaceOldestRfc3339(rfc3339, result);
      } else {
        cacheRfc3339(rfc3339, result);
      }
    }
    return result;
  }


  function buildRfc3339(
    fields: { yr: number; mth: Month1; day: DayOfMonth1 },
    timeMs: number,
    timezone: LogicalTimezone<FixedOffset>,
  ): Result<DateTime<FixedOffset>> {
    const date = new YearMonthDay.Class(fields, { isValid: true }).castValid();
    // Rounding a fraction can carry through midnight into the following date.
    const nd = timeMs >= Time.MS_PER_DAY ? date.addDays(1) : date;
    const nt = new NaiveTime((timeMs % Time.MS_PER_DAY) as Ms);
    return ok(new DateTime(new NaiveDateTime(nd, nt), timezone));
  }

  function cacheRfc3339(
    text: string,
    result: Result<DateTime<FixedOffset>>,
  ): void {
    const entry = { text, result, older: undefined, newer: undefined };
    appendRfc3339(entry);
    _rfc3339Cache.set(text, entry);
  }

  function replaceOldestRfc3339(text: string, result: Result<DateTime<FixedOffset>>): void {
    if (lastPendingRfc3339.text === text) lastPendingRfc3339.text = undefined;
    const oldest = oldestRfc3339!;
    unlinkRfc3339(oldest);
    _rfc3339Cache.delete(oldest.text);
    oldest.text = text;
    oldest.result = result;
    appendRfc3339(oldest);
    _rfc3339Cache.set(text, oldest);
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
      public override readonly start: DateTime<Tz>,
      public override readonly end: DateTime<Tz>,
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
     * ```ts
     * import { assertEquals } from "@std/assert";
     * import { DateTime, naivedate } from "@tento/chrono";
     *
     * const range = new DateTime.Range(
     *   DateTime.fromRfc3339("2023-10-27T10:00:00Z").exp(),
     *   DateTime.fromRfc3339("2023-10-29T15:00:00Z").exp(),
     * );
     * assertEquals(range.overlapsWithDay(naivedate(2023, 10, 27)), "start");
     * assertEquals(range.overlapsWithDay(naivedate(2023, 10, 28)), "middle");
     * assertEquals(range.overlapsWithDay(naivedate(2023, 10, 29)), "end");
     * assertEquals(range.overlapsWithDay(naivedate(2023, 10, 30)), null);
     * ```
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

    /** Both endpoints must be inside this range (inclusive of its bounds). */
    containsRangeInclusive(o: DateTime.Range): boolean {
      return this.containsInclusive(o.start) && this.containsInclusive(o.end);
    }

    /** Both endpoints must be strictly inside this range. */
    containsRangeExclusive(o: DateTime.Range): boolean {
      return (
        this.containsExclusiveBoth(o.start) && this.containsExclusiveBoth(o.end)
      );
    }

    overlapsInclusive(o: DateTime.Range): boolean {
      return this.start.mse <= o.end.mse && o.start.mse <= this.end.mse;
    }

    /** Strict crossing; a point inside a nonempty range still overlaps it. */
    overlapsExclusive(o: DateTime.Range): boolean {
      return this.start.mse < o.end.mse && o.start.mse < this.end.mse;
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
     * ```ts
     * import { assertEquals } from "@std/assert";
     * import { DateTime } from "@tento/chrono";
     *
     * const at = (s: string) => DateTime.fromRfc3339(s).exp();
     * const range = new DateTime.Range(at("2023-10-27T10:00:00Z"), at("2023-10-27T11:00:00Z"));
     * assertEquals(range.containsExclusiveEnd(at("2023-10-27T10:30:00Z")), true);
     * assertEquals(range.containsExclusiveEnd(at("2023-10-27T10:00:00Z")), true);
     * assertEquals(range.containsExclusiveEnd(at("2023-10-27T11:00:00Z")), false);
     * ```
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

    override toString(): string {
      return `${this.start.toString()}..${this.end.toString()}`;
    }
  }
}
