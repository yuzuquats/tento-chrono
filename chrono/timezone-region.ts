import { DateRegion } from "./date-region.ts";
import { DateTimeRegion } from "./date-time-region.ts";
import { DateTime } from "./datetime.ts";
import type { NaiveDate } from "./naive-date.ts";
import { NaiveDateTime } from "./naive-datetime.ts";
import {
  FixedOffset,
  FixedTimezone,
  LogicalTimezone,
  TimezoneInfo,
  Tzabbr,
  Tzname,
  Utc,
} from "./timezone.ts";
import { Time } from "./time.ts";
import { PlatformZone } from "./timezone-platform.ts";
import { Epoch } from "./units/epoch.ts";
import { Duration } from "./units/duration.ts";
import { TimeOfDay } from "./units/time-of-day.ts";
import { MsSinceEpoch } from "./units/units.ts";
import type { Option } from "./option.ts";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// Chrono runs under a standalone Deno import map, so this fallback loader cannot
// import @tento-core/resource-client. UI/app code should use ResourceClient for
// static-domain resources when package boundaries allow it.
//
// The static host that serves a page's zone files, from the page's own
// hostname: the first label becomes `static`, keeping an instance prefix.
//   calendar.example.com      -> static.example.com
//   dev--calendar.example.com -> dev--static.example.com
//   example.com               -> static.example.com
// Null when the hostname names no domain to derive one from: no page at all
// (Deno, a worker without a location), a bare or `.localhost` name, or an IP
// address.
function staticHostOf(hostname: string): string | null {
  const parts = hostname.split(".");
  const top = parts[parts.length - 1];
  if (parts.length < 2 || parts.includes("") || top === "localhost") return null;
  if (hostname.includes(":") || /^\d+$/.test(top)) return null;
  if (parts.length === 2) return `static.${hostname}`;
  const instance = parts[0].includes("--") ? parts[0].split("--")[0] + "--" : "";
  return `${instance}static.${parts.slice(1).join(".")}`;
}

/** The origin a host configured for zone files (`TimezoneRegion.setStaticOrigin`); null when it configured none. */
let configuredStaticOrigin: (() => string) | null = null;
let defaultStaticOrigin: (() => string) | null = null;

// Where the served loader fetches zone files, first match wins:
//   1. the app shell's `globalThis.getStaticOrigin()` (private wrappers,
//      explicit ports);
//   2. the origin the host configured (`TimezoneRegion.setStaticOrigin`);
//   3. the host application's default (`setDefaultStaticOrigin`);
//   4. `static.<the page's own domain>` (`staticHostOf`).
// This module names no server of its own, so with none of the three it throws.
function getStaticResourceOrigin(): string {
  const getOrigin = Reflect.get(globalThis, "getStaticOrigin");
  if (typeof getOrigin === "function") {
    const origin = getOrigin();
    if (typeof origin === "string" && origin) return origin.replace(/\/$/, "");
  }
  if (configuredStaticOrigin != null) return configuredStaticOrigin().replace(/\/$/, "");
  if (defaultStaticOrigin != null) return defaultStaticOrigin().replace(/\/$/, "");
  const host = staticHostOf(globalThis.location?.hostname ?? "");
  if (host == null) {
    throw new Error(
      "no static origin for timezone data: call TimezoneRegion.setStaticOrigin(), define globalThis.getStaticOrigin(), or load from a page on a named domain",
    );
  }
  return `https://${host}`;
}

function isJsonRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const platformSources = new WeakMap<TimezoneRegion, Tzname>();
const platformRecurrenceViews = new WeakMap<TimezoneRegion, Map<number, TimezoneRegion>>();
const platformRecurrenceSources = new WeakMap<TimezoneRegion, TimezoneRegion>();
const PLATFORM_YEAR_PADDING_MS = 4 * Time.MS_PER_DAY;
const PLATFORM_YEAR_CACHE_SIZE = 8;

function platformTransitions(
  name: Tzname,
  source: Tzname = name,
  from?: number,
  to?: number,
): TimezoneRegion.Transition[] | undefined {
  return PlatformZone.offsetTransitions(source, from, to)?.map(
    ({ ms, before, after, beforeAbbr, afterAbbr }) => {
      const mse = ms as MsSinceEpoch;
      const fixed = (secs: number, tzabbr: string) =>
        DateTime.fromMse(mse, new FixedTimezone(tzabbr, {
          offset: Duration.Time.from({ secs }),
          tzabbr,
          tzname: name,
        }));
      return {
        before: { mse, time: fixed(before, beforeAbbr), tzabbr: beforeAbbr },
        after: { time: fixed(after, afterAbbr), tzabbr: afterAbbr },
      };
    },
  );
}

function sameTransitionState(a: TimezoneRegion.Transition["after"], b: TimezoneRegion.Transition["after"]): boolean {
  return a.tzabbr === b.tzabbr && a.time.tz.info.offset.toMs === b.time.tz.info.offset.toMs;
}

export class TimezoneRegion {
  readonly fullname: Tzname;
  readonly transitions: TimezoneRegion.Transition[];
  /**
   * Where the zone service's transitions for this zone disagreed with the
   * platform's offset, when this region was built from the platform's
   * instead (`getOpt`); null for a region taken as served.
   */
  readonly mismatch: Option<TimezoneRegion.OffsetMismatch>;
  /**
   * The zone this name's file says it links to (a tzdata `backward` name's
   * file carries `linkOf`, its resolved canonical zone; requests/tz-to-sdk-1),
   * kept as provenance; null for a zone's own file or a file without the field.
   */
  readonly linkOf: Option<Tzname>;
  /**
   * Why the zone service had no data for this zone (`TimezoneRegion.Unserved`),
   * or `no-answer` when its fetch got none, when this region was built from
   * the platform's offsets instead (`getOpt`); null for a region the service
   * served.
   */
  readonly unserved: Option<TimezoneRegion.FromPlatformReason>;
  private tzs: Map<Tzabbr, FixedTimezone> = new Map();
  #calendarInitialTimezone?: LogicalTimezone<FixedOffset>;
  #calendarCoverageEnd?: number;
  #recurrenceWindows?: {
    transitionRange(start: number, end: number): TimezoneRegion.Transition[] | undefined;
    start: number;
    end: number;
    retainBase: boolean;
    platform?: true;
    years: Map<number, TimezoneRegion>;
  };

  constructor(
    fullname: Tzname,
    transitions: TimezoneRegion.Transition[],
    mismatch: Option<TimezoneRegion.OffsetMismatch> = null,
    linkOf: Option<Tzname> = transitions[0]?.linkOf ?? null,
    unserved: Option<TimezoneRegion.FromPlatformReason> = null,
  ) {
    this.fullname = fullname;
    this.transitions = transitions.sort((a, b) => a.before.mse - b.before.mse);
    this.mismatch = mismatch;
    this.linkOf = linkOf;
    this.unserved = unserved;
  }

  /** @internal Exclusive compiled horizon for a timezone with TZUNTIL. */
  get calendarCoverageEnd(): number | undefined {
    return this.#calendarCoverageEnd;
  }

  /** @internal A calendar definition supplies its own offset before the first onset. */
  static fromCalendarTransitions(
    name: Tzname,
    transitions: TimezoneRegion.Transition[],
    coverageEnd?: number,
  ): TimezoneRegion {
    const region = new TimezoneRegion(name, transitions);
    region.#calendarCoverageEnd = coverageEnd;
    const initial = region.transitions[0]?.before.time.tz;
    if (initial != null) region.#calendarInitialTimezone = region.asAsked(initial);
    return region;
  }

  /** @internal Use the same platform source beyond the initial recurrence timezone window. */
  static forPlatformRecurrence(
    region: TimezoneRegion,
    { extendServedPast = false, extendServedFuture = false }: {
      extendServedPast?: boolean;
      extendServedFuture?: boolean;
    } = {},
  ): TimezoneRegion {
    if (region.#calendarInitialTimezone != null) return region;
    const original = platformRecurrenceSources.get(region);
    if (original != null) {
      if (!extendServedPast && !extendServedFuture) return region;
      region = original;
    }
    const platform = platformSources.get(region);
    if (platform == null && !extendServedPast && !extendServedFuture) return region;
    // Platform-derived tables have the same policy regardless of served options.
    const cacheKey = platform == null ? Number(extendServedPast) + 2 * Number(extendServedFuture) : 0;
    const cached = platformRecurrenceViews.get(region);
    const existing = cached?.get(cacheKey);
    if (existing != null) return existing;
    const source = platform ?? region.fullname;
    let start = PlatformZone.WINDOW_START_MS;
    let end = PlatformZone.WINDOW_END_MS;
    if (platform == null) {
      // Retain the covered table and extend each side independently.
      const at = PlatformZone.offsets(source);
      if (at == null) return region;
      start = -Infinity;
      end = Infinity;
      const first = region.transitions[0];
      const last = region.transitions.at(-1);
      if (
        extendServedPast && first != null &&
        at(first.before.mse - 1) * 1000 === first.before.time.tz.info.offset.toMs
      ) start = first.before.mse;
      if (extendServedFuture) {
        const boundary = last == null ? PlatformZone.WINDOW_END_MS
          : Math.max(PlatformZone.WINDOW_END_MS, Date.UTC(new Date(last.before.mse).getUTCFullYear() + 1, 0, 1));
        const before = (boundary - 1) as MsSinceEpoch;
        if (at(before) * 1000 === region.tzAtMse(before).info.offset.toMs) end = boundary;
      }
      if (!Number.isFinite(start) && !Number.isFinite(end)) return region;
    }
    const view = new TimezoneRegion(
      region.fullname,
      [...region.transitions],
      region.mismatch,
      region.linkOf,
      region.unserved,
    );
    view.#recurrenceWindows = {
      start,
      end,
      retainBase: platform == null,
      platform: true,
      years: new Map(),
      transitionRange(from, to) {
        return platformTransitions(region.fullname, source, from, to);
      },
    };
    const views = cached ?? new Map<number, TimezoneRegion>();
    views.set(cacheKey, view);
    platformRecurrenceViews.set(region, views);
    platformRecurrenceSources.set(view, region);
    return view;
  }

  /** @internal Replace future recurrence offsets with a provider's annual transitions. */
  static withFutureRecurrence(
    region: TimezoneRegion,
    firstYear: number,
    transitionsOfYear: (year: number) => TimezoneRegion.Transition[],
  ): TimezoneRegion {
    const end = new Date(0).setUTCFullYear(firstYear, 0, 1);
    const view = new TimezoneRegion(
      region.fullname,
      region.transitions.filter(({ before }) => before.mse < end),
      region.mismatch,
      region.linkOf,
      region.unserved,
    );
    view.#recurrenceWindows = {
      start: -Infinity,
      end,
      retainBase: true,
      years: new Map(),
      transitionRange(from, to) {
        const transitions: TimezoneRegion.Transition[] = [];
        const first = Math.max(firstYear, new Date(from).getUTCFullYear());
        const last = new Date(Math.min(to, PlatformZone.DATE_MAX_MS)).getUTCFullYear();
        // Keep the preceding year's final offset available in January.
        for (let year = first; year <= last; year++) {
          transitions.push(...transitionsOfYear(year));
        }
        return transitions;
      },
    };
    return view;
  }

  #recurrenceWindow(start: number, end: number): TimezoneRegion | undefined {
    const recurrence = this.#recurrenceWindows;
    if (
      recurrence == null ||
      (start >= recurrence.start && end < recurrence.end)
    ) return;
    const { DATE_MIN_MS: min, DATE_MAX_MS: max } = PlatformZone;
    const center = start + (end - start) / 2;
    const year = new Date(Math.min(max, Math.max(min, center))).getUTCFullYear();
    if (!Number.isFinite(year)) return;
    const cached = recurrence.years.get(year);
    if (cached != null) return cached;
    // Use setUTCFullYear, which preserves years 0–99. The edge years'
    // January boundaries can fall outside the inclusive Date range.
    const midnight = new Date(0).setUTCFullYear(year, 0, 1);
    const next = new Date(0).setUTCFullYear(year + 1, 0, 1);
    const windowStart = Number.isNaN(midnight) ? min : Math.max(min, midnight - PLATFORM_YEAR_PADDING_MS);
    const windowEnd = Number.isNaN(next) ? max + 1 : Math.min(max + 1, next + PLATFORM_YEAR_PADDING_MS);
    const overlapsBase = recurrence.retainBase &&
      windowStart <= recurrence.end && windowEnd > recurrence.start;
    let transitions: TimezoneRegion.Transition[] | undefined;
    if (overlapsBase) {
      const earlier = windowStart < recurrence.start
        ? recurrence.transitionRange(windowStart, recurrence.start)
        : [];
      // Read one second before the seam to capture a transition at the seam.
      const later = windowEnd > recurrence.end
        ? recurrence.transitionRange(recurrence.end - Time.MS_PER_SEC, windowEnd)
        : [];
      if (earlier == null || later == null) return;
      transitions = [
        ...earlier.filter(({ before }) => before.mse < recurrence.start),
        ...this.transitions,
        ...later.filter(({ before }) => before.mse >= recurrence.end),
      ];
    } else {
      transitions = recurrence.transitionRange(windowStart, windowEnd);
    }
    if (transitions == null) return;
    const window = new TimezoneRegion(this.fullname, transitions);
    const oldest = recurrence.years.keys().next();
    if (recurrence.years.size === PLATFORM_YEAR_CACHE_SIZE && !oldest.done) {
      recurrence.years.delete(oldest.value);
    }
    recurrence.years.set(year, window);
    return window;
  }

  static async local(): Promise<TimezoneRegion> {
    return TimezoneRegion.get();
  }

  static UTC: TimezoneRegion = new TimezoneRegion("UTC" as Tzname, [
    {
      before: {
        mse: 0 as MsSinceEpoch,
        time: DateTime.fromMse(0 as MsSinceEpoch, Utc),
        tzabbr: "utc",
      },
      after: {
        time: DateTime.fromMse(0 as MsSinceEpoch, Utc),
        tzabbr: "utc",
      },
    },
  ]);

  activeTransition(mse: MsSinceEpoch): Option<TimezoneRegion.Transition> {
    const window = this.#recurrenceWindow(mse, mse);
    if (window != null) return window.activeTransition(mse);
    const found = this.bst(mse);
    if (found < 0) return null;

    const transition = this.transitions[found];
    return transition;
  }

  /**
   * Return the transition in force at start and subsequent entries through end, inclusive.
   * Platform recurrence ranges clamp to the Date limits. With Temporal, work is
   * proportional to the number of transitions returned. Older runtimes scan at
   * weekly intervals, so wide ranges still take time proportional to their span.
   */
  transitionsBetween({
    start,
    end,
  }: {
    start: MsSinceEpoch;
    end: MsSinceEpoch;
  }): TimezoneRegion.Transition[] {
    return this.#transitionsInRange(start, end, true);
  }

  /** @internal Actual transitions in the bounded window around a recurrence cutoff. */
  recurrenceTransitions(start: number, end: number): TimezoneRegion.Transition[] {
    return this.#transitionsInRange(start, end, false);
  }

  #transitionsInRange(
    start: number,
    end: number,
    includeActive: boolean,
  ): TimezoneRegion.Transition[] {
    if (start > end) return [];
    const recurrence = this.#recurrenceWindows;
    if (recurrence == null || !Number.isFinite(start) || !Number.isFinite(end)) {
      return this.#tableTransitions(start, end, includeActive);
    }
    const { DATE_MIN_MS: min, DATE_MAX_MS: max } = PlatformZone;
    start = Math.max(start, min);
    end = Math.min(end, max);
    if (start > end) return [];
    if (start >= recurrence.start && end < recurrence.end && (includeActive || start > recurrence.start)) {
      return this.#tableTransitions(start, end, includeActive);
    }

    // Reuse the cached padded year for short reads around recurrence
    // cutoffs. Long platform ranges use the transition list directly.
    const scanPlatform = recurrence.platform && end - start > 366 * Time.MS_PER_DAY;
    const result: TimezoneRegion.Transition[] = [];
    let from = start;
    while (from <= end) {
      const keepActive = includeActive && from === start;
      const inBase = from >= recurrence.start && from < recurrence.end;
      let boundary = from >= recurrence.end ? max + 1 : inBase ? recurrence.end : recurrence.start;
      if (!inBase && scanPlatform) {
        // Use one continuous platform read for this span. Start a second
        // early so the actual onset at the boundary is visible.
        if (keepActive) {
          const active = this.activeTransition(from as MsSinceEpoch);
          if (active != null) result.push(active);
        }
        const through = Math.min(end, boundary - 1);
        const transitions = recurrence.transitionRange(Math.max(min, from - Time.MS_PER_SEC), through + 1);
        // The first platform entry is the seed offset. An onset at start
        // may already have been returned as the requested active entry.
        for (let i = 1; transitions != null && i < transitions.length; i++) {
          const tr = transitions[i]!;
          if (tr.before.mse >= from && tr.before.mse !== result.at(-1)?.before.mse) result.push(tr);
        }
      } else {
        if (!inBase) {
          // Short platform reads and provider rules use the point-read years.
          const year = new Date(from).getUTCFullYear();
          const nextYear = new Date(0).setUTCFullYear(year + 1, 0, 1);
          if (!Number.isNaN(nextYear)) boundary = Math.min(boundary, nextYear);
        }
        const through = Math.min(end, boundary - 1);
        const region = this.#recurrenceWindow(from, from) ?? this;
        for (const transition of region.#tableTransitions(from, through, keepActive)) {
          if (inBase && from === recurrence.start && !keepActive && transition.before.mse === from &&
              sameTransitionState(transition.before, transition.after)) {
            const previous = this.activeTransition((from - 1) as MsSinceEpoch)?.after;
            if (previous != null) {
              if (sameTransitionState(previous, transition.after)) continue;
              // A base seed can also land on a real change. Recover the
              // preceding state from the span that actually covers it.
              const { mse } = transition.before;
              result.push({
                ...transition,
                before: { mse, time: DateTime.fromMse(mse, previous.time.tz), tzabbr: previous.tzabbr },
              });
              continue;
            }
          }
          result.push(transition);
        }
      }
      from = boundary;
    }
    return result;
  }

  #tableTransitions(
    start: number,
    end: number,
    includeActive: boolean,
  ): TimezoneRegion.Transition[] {
    if (includeActive) {
      const startIdx = this.bst(start);
      const endIdx = this.bst(end);
      return this.transitions.slice(Math.max(0, startIdx), endIdx + 1);
    }
    const transitions = this.transitions;
    let lo = 0;
    let hi = transitions.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (transitions[mid]!.before.mse < start) lo = mid + 1;
      else hi = mid;
    }
    const result: TimezoneRegion.Transition[] = [];
    for (let i = lo; i < transitions.length && transitions[i]!.before.mse <= end; i++) {
      result.push(transitions[i]!);
    }
    return result;
  }

  private bst(target: number): number {
    let left = 0;
    let right = this.transitions.length - 1;
    let result = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const cmp = this.transitions[mid].before.mse - target;
      if (cmp === 0) {
        return mid;
      } else if (cmp > 0) {
        right = mid - 1;
      } else {
        result = mid;
        left = mid + 1;
      }
    }

    return result;
  }

  today(): DateRegion {
    return new DateRegion(this.now().ndt.date, this);
  }

  now(): DateTimeRegion {
    return DateTimeRegion.fromInstant(DateTime.fromMse(Epoch.currentMse(), Utc), this);
  }

  date(nd: NaiveDate): DateRegion {
    return new DateRegion(nd, this);
  }

  datetime(ndt: NaiveDateTime): DateTimeRegion {
    return new DateTimeRegion(ndt, this);
  }

  /**
   * Google Calendar-specific datetime resolution that handles DST transitions
   * by preserving local time but using appropriate timezone rules for each date.
   *
   * ## Key Findings from DST Testing
   *
   * Google Calendar uses a unique approach to DST transition handling in recurring events:
   *
   * ### Spring Forward Transitions (e.g., PST -> PDT)
   * - When clocks "spring forward" (e.g., 2:00 AM becomes 3:00 AM), there's a gap in local time
   * - Google Calendar uses a universal 1-hour boundary rule regardless of actual DST gap size
   * - If recurrence time is >=60 minutes after the transition time, use post-transition timezone
   * - If recurrence time is <60 minutes after the transition time, use pre-transition timezone
   * - This rule applies universally: Australia/Lord_Howe (30min gap) still uses 60min boundary
   *
   * ### Fall Back Transitions (e.g., PDT -> PST)
   * - When clocks "fall back" (e.g., 2:00 AM becomes 1:00 AM), local time repeats
   * - Google Calendar uses post-transition timezone if recurrence time >= transition time
   * - This creates consistent UTC times across the transition
   *
   * ### Test Case Validation
   * - Validated across multiple timezones: America/Los_Angeles, Europe/London, Australia/Adelaide, Australia/Lord_Howe
   * - Tested boundary conditions: 59min vs 60min gaps
   * - Achieved 100% test success rate (53/53 tests) with this implementation
   *
   * @param ndt The naive datetime to resolve
   * @param originalDateTime The original datetime from the recurring event start (used to determine timezone context)
   * @returns DateTime with appropriate timezone for Google Calendar compatibility
   */
  googleDatetimeResolved(
    ndt: NaiveDateTime,
    originalDateTime?: DateTime<any>,
    useActualSpringGap = false,
  ): DateTime<FixedOffset> {
    // If no original datetime context, fall back to standard resolution
    if (!originalDateTime) {
      return this.toWallClock(ndt);
    }

    const originalDate = originalDateTime.ndt.date;
    const currentDate = ndt.date;

    // Find any DST transitions between the original date and current date
    const transitionStart = new NaiveDateTime(originalDate);
    const transitionEnd = new NaiveDateTime(currentDate).add({
      hrs: 23,
      mins: 59,
      secs: 59,
    });

    const transitions = this.transitionsBetween({
      start: transitionStart.mse,
      end: transitionEnd.mse,
    });

    // No DST transitions found - use original timezone
    if (transitions.length === 0) {
      return new DateTime(ndt, originalDateTime.tz);
    }

    const lastTransition = transitions[transitions.length - 1];
    const transitionDate = lastTransition.after.time.ndt.date;

    // Current date is after transition date - use post-transition timezone
    if (currentDate.dse > transitionDate.dse) {
      return new DateTime(ndt, lastTransition.after.time.tz);
    }

    // Current date is before transition date - use original timezone
    if (currentDate.dse < transitionDate.dse) {
      return new DateTime(ndt, originalDateTime.tz);
    }

    // Current date equals transition date - check time-specific rules
    const transitionTime = lastTransition.before.time.ndt.time;
    const currentTime = ndt.time;

    const beforeOffset = lastTransition.before.time.tz.info.offset.toHrsF;
    const afterOffset = lastTransition.after.time.tz.info.offset.toHrsF;
    const isFallBack = afterOffset < beforeOffset;
    const isSpringForward = afterOffset > beforeOffset;

    if (isFallBack) {
      // Fall back: use post-transition timezone if at or after transition time
      if (currentTime.toMs >= transitionTime.toMs) {
        return new DateTime(ndt, lastTransition.after.time.tz);
      }
      return new DateTime(ndt, originalDateTime.tz);
    }

    if (isSpringForward) {
      // Spring forward: use post-transition timezone if >=60 minutes after transition
      const timeGapMs = currentTime.toMs - transitionTime.toMs;
      const gap = useActualSpringGap
        ? lastTransition.after.time.ndt.mse - lastTransition.before.time.ndt.mse
        : Time.MS_PER_HR;

      if (timeGapMs >= gap) {
        return new DateTime(ndt, lastTransition.after.time.tz);
      }
      return new DateTime(ndt, originalDateTime.tz);
    }

    // Default case - use original timezone
    return new DateTime(ndt, originalDateTime.tz);
  }

  // Cache the offset for civil days with no offset change.
  private _wallClockTzCache = new Map<number, LogicalTimezone<any>>();
  private _rfc5545WallClockTzCache = new Map<number, LogicalTimezone<any>>();

  /**
   * Resolve a wall-clock NaiveDateTime according to RFC 5545 §3.3.5 and
   * Verified Erratum 4271:
   * - Fall-back overlap (ambiguous local time): uses the first occurrence
   *   (pre-transition offset).
   * - Spring-forward gap (non-existent local time): uses the pre-transition
   *   offset (exact gap size, including 30-minute transitions like Lord Howe).
   * - Valid post-transition times: uses the post-transition offset.
   *
   * An explicit recurrence start can prefer the first valid occurrence at
   * or after its instant. If there is none, use the ordinary RFC result.
   */
  toRfc5545WallClock(ndt: NaiveDateTime, notBeforeMse?: number): DateTime<FixedOffset> {
    return this.#recurrenceWallClock(ndt, false, notBeforeMse);
  }

  /** @internal Project an RFC recurrence instant using the table's initial offset. */
  toRfc5545LocalTime(instant: DateTime<any>): DateTime<FixedOffset> {
    const region = this.#recurrenceWindow(instant.mse, instant.mse) ?? this;
    const first = region.transitions[0];
    return first != null && instant.mse < first.before.mse
      ? instant.toTz(region.asAsked(first.before.time.tz))
      : region.toTz(instant);
  }

  /** Resolve wall values as dateutil 2.8.2's TZif loader does at recurrence boundaries. */
  toDateutilWallClock(ndt: NaiveDateTime): DateTime<FixedOffset> {
    return this.#recurrenceWallClock(ndt, true);
  }

  #recurrenceWallClock(
    ndt: NaiveDateTime,
    useDateutilCutoffs: boolean,
    notBeforeMse = -Infinity,
  ): DateTime<FixedOffset> {
    const dse = ndt.date.dse;
    const cached = this._rfc5545WallClockTzCache.get(dse);
    if (cached) return ndt.withTz(cached);

    const dayStartMse = ndt.date.withTime(TimeOfDay.fromHms({ hrs: 0 })).mse;
    const dayEndMse = dayStartMse + 24 * 60 * 60 * 1000;
    const windowMs = 36 * 60 * 60 * 1000;
    const extended = this.#recurrenceWindow(dayStartMse - windowMs, dayEndMse + windowMs);
    if (extended != null) return extended.#recurrenceWallClock(ndt, useDateutilCutoffs, notBeforeMse);
    const transitions = this.transitionsBetween({
      start: (dayStartMse - windowMs) as MsSinceEpoch,
      end: (dayEndMse + windowMs) as MsSinceEpoch,
    });

    if (transitions.length === 0) {
      const tz = this.tzAtMse(ndt.mse);
      this._rfc5545WallClockTzCache.set(dse, tz);
      return ndt.withTz(tz);
    }

    const wallMse = ndt.mse;
    let resolved: LogicalTimezone<any> = this.asAsked(transitions[0]!.before.time.tz);
    let hasTransitionOnDay = false;
    let intervalStart = -Infinity;
    let intervalZone = resolved;
    let firstMatch: LogicalTimezone<any> | undefined;
    let preferredMatch: LogicalTimezone<any> | undefined;
    let gapZone: LogicalTimezone<any> | undefined;
    for (const tr of transitions) {
      const beforeWall = tr.before.time.ndt.mse;
      const afterWall = tr.after.time.ndt.mse;
      const minWall = Math.min(beforeWall, afterWall);
      const cutoffWall = Math.max(beforeWall, afterWall);
      if (minWall < dayEndMse && cutoffWall >= dayStartMse) {
        hasTransitionOnDay = true;
      }
      if (!useDateutilCutoffs && preferredMatch == null) {
        // Local intervals can overlap across several nearby transitions.
        // Check actual UTC intervals in order to select the first occurrence.
        const candidate = wallMse - intervalZone.info.offset.toMs;
        if (intervalStart <= candidate && candidate < tr.before.mse) {
          firstMatch ??= intervalZone;
          if (candidate >= notBeforeMse) preferredMatch = intervalZone;
        }
        if (gapZone == null && beforeWall <= wallMse && wallMse < afterWall) {
          gapZone = intervalZone;
        }
        intervalStart = tr.before.mse;
        intervalZone = this.asAsked(tr.after.time.tz);
      }
      let cutoff = cutoffWall;
      if (useDateutilCutoffs && afterWall > beforeWall) {
        if (afterWall - beforeWall < Time.MS_PER_DAY) {
          cutoff = beforeWall;
        } else if (this.fullname === "Pacific/Apia") {
          // Apia's date-line jump kept its one-hour DST adjustment. TZif's
          // standard-time boundary is 23:00 on the skipped day.
          cutoff = afterWall - Time.MS_PER_HR;
        }
      }
      if (cutoff <= wallMse) {
        resolved = this.asAsked(tr.after.time.tz);
      }
    }

    if (!useDateutilCutoffs) {
      const candidate = wallMse - intervalZone.info.offset.toMs;
      if (preferredMatch == null && candidate >= intervalStart) {
        firstMatch ??= intervalZone;
        if (candidate >= notBeforeMse) preferredMatch = intervalZone;
      }
      resolved = preferredMatch ?? firstMatch ?? gapZone ?? resolved;
    }
    if (!hasTransitionOnDay) {
      this._rfc5545WallClockTzCache.set(dse, resolved);
    }
    return ndt.withTz(resolved);
  }

  /**
   * Resolve a local wall clock, choosing the post-transition offset in a gap or overlap.
   */
  toWallClock(ndt: NaiveDateTime): DateTime<FixedOffset> {
    // Keep the UTC region's existing fixed-offset representation.
    if (this === TimezoneRegion.UTC) return ndt.withTz(this.tzAtMse(ndt.mse));
    const dse = ndt.date.dse;
    const cached = this._wallClockTzCache.get(dse);
    if (cached) return ndt.withTz(cached);

    const dayStart = dse * Time.MS_PER_DAY;
    const dayEnd = dayStart + Time.MS_PER_DAY;
    const extended = this.#recurrenceWindow(dayStart - Time.MS_PER_DAY, dayEnd + Time.MS_PER_DAY);
    if (extended != null) return extended.toWallClock(ndt);
    // A transition's UTC instant can fall on either side of the local date.
    const first = this.bst((dayStart - Time.MS_PER_DAY) as MsSinceEpoch);
    const last = this.bst((dayEnd + Time.MS_PER_DAY) as MsSinceEpoch);
    let resolved = this.transitions[first]?.after.time.tz ??
      this.transitions[0]?.before.time.tz ?? Utc;
    let changesOnDay = false;

    for (let i = first + 1; i <= last; i++) {
      const transition = this.transitions[i];
      const cutoff = Math.min(transition.before.time.ndt.mse, transition.after.time.ndt.mse);
      if (cutoff >= dayStart && cutoff < dayEnd) changesOnDay = true;
      if (cutoff <= ndt.mse) resolved = transition.after.time.tz;
    }

    resolved = this.asAsked(resolved);
    if (!changesOnDay) this._wallClockTzCache.set(dse, resolved);
    return ndt.withTz(resolved);
  }

  /**
   * A transition's own timezone under the name this region was asked by. A merged city that shares a platform-built
   * target's transitions (operator Q23) keeps its own name on a transition day, as tzAtMse does on every other day
   * (review I I-4); the offset and abbreviation stay the transition's.
   */
  private asAsked(tz: LogicalTimezone<any>): LogicalTimezone<any> {
    if (!(tz instanceof FixedTimezone) || tz.info.tzname === this.fullname) return tz;
    return new FixedTimezone(tz.id, { ...tz.info, tzname: this.fullname });
  }

  toTz(dt: DateTime<any>): DateTime<FixedOffset> {
    const mse = dt.mse;
    if (this.#calendarCoverageEnd != null && mse >= this.#calendarCoverageEnd) {
      throw new RangeError("VTIMEZONE table does not cover the requested instant");
    }
    return dt.toTz(this.tzAtMse(mse));
  }

  tzAtMse(mse: MsSinceEpoch): LogicalTimezone<any> {
    const transition = this.activeTransition(mse);
    if (!transition) {
      return this.#calendarInitialTimezone ??
        this.asAsked(this.transitions[0]?.before.time.tz ?? Utc);
    }
    const tzabbr = transition.after.tzabbr;

    // Remove all caching to avoid issues with GMT/BST sharing the same tzabbr
    const tz = new FixedTimezone(tzabbr, {
      offset: transition.after.time.tz.info.offset,
      tzabbr,
      tzname: this.fullname,
    });
    return tz;
  }

  print() {
    for (const [idx, transition] of this.transitions.entries()) {
      TimezoneRegion.Transition.print(transition, idx);
    }
  }

  toString(): string {
    return `[${this.fullname}]`;
  }
}

export namespace TimezoneRegion {
  /**
   * Loader
   */
  export interface Loader {
    load: (tzname: Tzname) => Promise<Transition[]>;
    /** Forget what the loader decided for this process (`setLoader` calls it when the loader is installed). */
    restart?: () => void;
    /** The data version it loads in place of the one asked for, once it decided so (`dataVersionFallback`); `null` while it has not. */
    versionFallback?: () => Option<VersionFallback>;
  }

  /**
   * The tzdata version of the zone data `DYNAMIC_LOADER` asks the zone
   * service for: the regenerated tento-tz 2025a files (every zone's current
   * offset, a base offset for constant zones, a file per backward name). The
   * service still answers the earlier `2024b` label for older clients.
   */
  export const DATA_VERSION = "2025a";

  /** The label the zone service answered before `DATA_VERSION`, served to older clients: `servedLoader`'s fallback. */
  export const LEGACY_DATA_VERSION = "2024b";

  /** A zone every data version the service has served carries: its 404 means the version itself is not served. */
  const VERSION_PROBE_ZONE = "America/New_York" as Tzname;

  /** A data version the zone service did not serve, and the one `servedLoader` loads instead (`takeVersionFallbacks`). */
  export interface VersionFallback {
    readonly asked: string;
    readonly used: string;
  }

  const versionFallbacksUnreported: VersionFallback[] = [];

  /**
   * The data version fallbacks loaders took since the last call, each once:
   * for a host to report that the service does not serve the configured
   * data (the SDK's `ZoneLoad.report` traces each as `tz/data-version-fallback`).
   */
  export function takeVersionFallbacks(): VersionFallback[] {
    return versionFallbacksUnreported.splice(0);
  }

  /**
   * The data version fallback the installed loader took (`servedLoader`:
   * the service does not serve the version asked for, so it loads the
   * legacy one), for as long as that loader stands; `null` when it took
   * none, or keeps no such record. A standing condition every reader can
   * ask, unlike `takeVersionFallbacks`, which hands each fallback out once.
   */
  export function dataVersionFallback(): Option<VersionFallback> {
    return loader.versionFallback?.() ?? null;
  }

  /**
   * The origin `servedLoader` fetches zone files from when the app shell
   * supplies none (`globalThis.getStaticOrigin`): a fixed origin, or a
   * function asked on each fetch so it can follow the page it runs on.
   * `null` restores the application default, or `static.<the page's own domain>`. A host
   * without a page (a CLI, a server, a test) has no domain to derive one
   * from and calls this once before the first served read.
   */
  export function setStaticOrigin(origin: Option<string | (() => string)>): void {
    configuredStaticOrigin = origin == null ? null : typeof origin === "string" ? () => origin : origin;
  }

  /**
   * Supply a host application's default without replacing an origin explicitly
   * configured with setStaticOrigin. The app shell still takes precedence.
   * Passing null removes this default.
   */
  export function setDefaultStaticOrigin(origin: Option<string | (() => string)>): void {
    defaultStaticOrigin = origin == null ? null : typeof origin === "string" ? () => origin : origin;
  }

  /**
   * The zone service's `1900_2050` files of `version`. A 404 can mean the
   * zone has no data or that `version` is not deployed (a frontend shipped
   * before the service): on the first 404 the loader asks once whether
   * `version` is served at all (one fetch of `VERSION_PROBE_ZONE`). When it
   * is not, the loader records the fallback (`takeVersionFallbacks`) and
   * loads this and every later zone from `legacy`, so served data (checked
   * against the platform as any served zone is) replaces an Intl build per
   * zone; only a zone `legacy` has no data for either is `Unserved`. A probe
   * that gets no answer decides nothing: the zone is `Unserved` and the
   * next 404 asks again. Every fetch, its body included, ends after
   * `timeoutMs` (`FETCH_TIMEOUT_MS`): a fetch that does not answer by then
   * rejects as no answer (`getOpt`), so a stalled network never stalls a
   * zone read past it. The loader throws `NoAnswer` for a fetch or body read
   * that `fetch` rejected (a network failure, the deadline) and for a status
   * that says "not now" (5xx, 429, 408); a 404 is `Unserved`, and any other
   * failure (another status, a malformed file) is a plain error.
   */
  export function servedLoader(
    version: string = DATA_VERSION,
    legacy: string = LEGACY_DATA_VERSION,
    timeoutMs: number = FETCH_TIMEOUT_MS,
  ): Loader {
    const fileUrl = (v: string, tzname: Tzname) =>
      `${getStaticResourceOrigin()}/timezones/${v}/1900_2050/${tzname.replaceAll("/", "~")}.json`;
    const fetchFile = (v: string, tzname: Tzname) =>
      fetch(fileUrl(v, tzname), { signal: AbortSignal.timeout(timeoutMs) }).catch((e) => {
        throw noAnswerOf(tzname, e);
      });
    let decided: Option<string> = null;
    let probing: Option<Promise<Option<string>>> = null;
    const servedVersion = (): Promise<Option<string>> => {
      probing ??= fetchFile(version, VERSION_PROBE_ZONE).then(async (probe) => {
        await probe.body?.cancel();
        if (probe.ok) return decided = version;
        if (probe.status !== 404) return null;
        versionFallbacksUnreported.push({ asked: version, used: legacy });
        announce({ kind: "data-version-fallback", asked: version, used: legacy });
        return decided = legacy;
      }, () => null).finally(() => probing = null);
      return probing;
    };
    return {
      load: async (tzname: Tzname) => {
        let response = await fetchFile(decided ?? version, tzname);
        if (response.status === 404 && decided == null && await servedVersion() === legacy) {
          await response.body?.cancel();
          response = await fetchFile(legacy, tzname);
        }
        if (response.status === 404) throw new Unserved(tzname, "not-found");
        if (!response.ok) {
          await response.body?.cancel();
          const failed = new Error(`Failed to fetch timezone ${tzname}: ${response.status}`);
          if (NOT_NOW.has(response.status) || response.status >= 500) {
            throw new NoAnswer(tzname, `HTTP ${response.status}`, failed);
          }
          throw failed;
        }

        // A body `fetch` stops reading (the deadline, a dropped connection) is no answer; a body that is not JSON is a malformed file.
        const raw: JsonValue = await response.json().catch((e) => {
          throw noAnswerOf(tzname, e);
        });
        const transitions = parseTimezoneTransitions(raw);
        return transitions.map((transition) => Transition.parse(transition, tzname));
      },
      restart: () => {
        decided = null;
      },
      versionFallback: () => decided === legacy && legacy !== version ? { asked: version, used: legacy } : null,
    };
  }

  /**
   * How long `servedLoader` waits for one zone file (its body included)
   * before it takes the fetch as unanswered: well past a healthy fetch (tens
   * of milliseconds), well short of an OS connect timeout.
   */
  export const FETCH_TIMEOUT_MS = 10_000;

  /** The statuses besides 5xx that say "not now" rather than "no such file": too many requests, request timeout. */
  const NOT_NOW: ReadonlySet<number> = new Set([429, 408]);

  /** `e` as `NoAnswer` when `fetch` rejected with it (`TypeError`, or an abort: the loader's deadline); anything else unchanged. */
  function noAnswerOf(tzname: Tzname, e: unknown): unknown {
    const unanswered = e instanceof TypeError ||
      (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError"));
    return unanswered ? new NoAnswer(tzname, e instanceof Error ? e.message : String(e), e) : e;
  }

  /**
   * The zone service's `DATA_VERSION` files, falling back to
   * `LEGACY_DATA_VERSION` when it is not served (`servedLoader`). Opt in with
   * `setLoader(DYNAMIC_LOADER)`; the default is `PLATFORM_LOADER`.
   */
  export const DYNAMIC_LOADER: Loader = servedLoader();

  function parseTimezoneTransitions(
    raw: JsonValue,
  ): TimezoneRegion.Transition.Serialized[] {
    if (!Array.isArray(raw)) {
      throw new Error("expected timezone transition list");
    }
    return raw.map(parseTimezoneTransition);
  }

  function parseTimezoneTransition(
    raw: JsonValue,
  ): TimezoneRegion.Transition.Serialized {
    if (!isJsonRecord(raw)) {
      throw new Error("expected timezone transition");
    }

    if (
      typeof raw.before !== "string" ||
      typeof raw.before_tz_abbr !== "string" ||
      typeof raw.after !== "string" ||
      typeof raw.after_tz_abbr !== "string"
    ) {
      throw new Error("expected timezone transition");
    }
    // Optional (tz-to-sdk-1), read when present: the first entry's standing
    // offset, and a backward name's canonical zone. A wrong type rejects the file.
    const base = raw.baseOffsetSeconds;
    const linkOf = raw.linkOf;
    if ((base !== undefined && (typeof base !== "number" || !Number.isInteger(base))) ||
      (linkOf !== undefined && typeof linkOf !== "string")) {
      throw new Error("expected timezone transition");
    }

    return {
      before: raw.before,
      before_tz_abbr: raw.before_tz_abbr,
      after: raw.after,
      after_tz_abbr: raw.after_tz_abbr,
      ...(base !== undefined ? { baseOffsetSeconds: base } : {}),
      ...(linkOf !== undefined ? { linkOf } : {}),
    };
  }

  /** Why the zone service had no data for a zone: no file (a 404), or a file with no transitions. */
  export type UnservedReason = "not-found" | "no-transitions";

  /**
   * Why a region was built from the platform's offsets for want of served
   * data: the service had none (`UnservedReason`), or its fetch got no answer
   * (`no-answer`: a network failure or the loader's deadline).
   */
  export type FromPlatformReason = UnservedReason | "no-answer";

  /**
   * The zone service answered that it has no data for a zone (`reason`), as
   * opposed to not answering: `getOpt` builds such a zone from the
   * platform's offsets when the platform knows the name (`unserved`). A
   * loader throws it for a name the service does not serve.
   */
  export class Unserved extends Error {
    readonly tzname: Tzname;
    readonly reason: UnservedReason;

    constructor(tzname: Tzname, reason: UnservedReason) {
      super(`zone ${tzname}: the zone service has no data for it (${reason})`);
      this.name = "TimezoneRegion.Unserved";
      this.tzname = tzname;
      this.reason = reason;
    }
  }

  /**
   * The zone service gave no answer for a zone: its fetch was rejected (a
   * network failure, the loader's deadline) or it answered "not now" (5xx,
   * 429, 408). `servedLoader` throws it, wrapping the failure as `cause`;
   * `getOpt` builds such a zone from the platform's offsets
   * (`unserved: "no-answer"`) and asks again after `UNLOADABLE_RETRY_MS`.
   * A custom loader throws it to say the same; any other error it throws
   * (its own `TypeError` included) means the zone does not load.
   */
  export class NoAnswer extends Error {
    readonly tzname: Tzname;

    constructor(tzname: Tzname, detail: string, cause?: unknown) {
      super(`zone ${tzname}: the zone service gave no answer (${detail})`, { cause });
      this.name = "TimezoneRegion.NoAnswer";
      this.tzname = tzname;
    }
  }

  /**
   * Every zone built from the platform's own timezone data (`Intl`), with no
   * network: the default loader. A name the platform does not know is
   * `Unserved`. Its abbreviations are the platform's (`GMT-5`, not `EST`).
   */
  export const PLATFORM_LOADER: Loader = {
    load: (tzname: Tzname) => {
      const transitions = platformTransitions(tzname);
      if (transitions == null) return Promise.reject(new Unserved(tzname, "not-found"));
      return Promise.resolve(transitions);
    },
  };

  const platformRecurrenceZones = new Map<Tzname, TimezoneRegion>();

  /** @internal Use the runtime timezone table independently of the configured loader. */
  export function platformRecurrenceZone(tzname: Tzname): TimezoneRegion | null {
    if (tzname === Tzname.UTC) return TimezoneRegion.UTC;
    const cached = platformRecurrenceZones.get(tzname);
    if (cached != null) return cached;
    const transitions = platformTransitions(tzname);
    if (transitions == null) return null;
    const region = new TimezoneRegion(tzname, transitions);
    platformSources.set(region, tzname);
    const recurrence = TimezoneRegion.forPlatformRecurrence(region);
    platformRecurrenceZones.set(tzname, recurrence);
    return recurrence;
  }

  let loader: Loader = PLATFORM_LOADER;

  /**
   * Api
   */
  const defaultCache = new Map([
    ["UTC", new TimezoneRegion("UTC" as Tzname, [])],
  ]);
  /**
   * Load the named timezone or throw if it is unavailable. Supply
   * `fallbackTz` to try a different timezone when the requested one fails.
   * A successful fallback is recorded with the caller's `source`.
   */
  export async function get(
    tzname: Tzname = TimezoneInfo.local().tzname!,
    fallbackTz?: Tzname,
    source: FallbackSource = "other",
  ): Promise<TimezoneRegion> {
    const region = answerCachedRegion(tzname) ?? await loadUncachedRegion(tzname);
    if (region != null) return region;
    if (fallbackTz == null) throw new RangeError(`Unable to load timezone "${tzname}"`);

    const fallback = await getOpt(fallbackTz);
    if (fallback == null) {
      throw new RangeError(`Unable to load timezone "${tzname}" or fallback timezone "${fallbackTz}"`);
    }

    const used = fallback.fullname;
    if (!fallbacksUnreported.some((f) => f.requested === tzname && f.used === used)) {
      fallbacksUnreported.push({ requested: tzname, used, source });
    }
    announce({ kind: "fallback", requested: tzname, used, source });
    return fallback;
  }

  /** Which of chrono's reads took a fallback (`get`): an iCal line's `TZID`, a recurrence rule's zone, the runtime's zone, or another caller. */
  export type FallbackSource = "ical-tzid" | "rrule" | "runtime" | "other";

  /** A zone `get` could not load (`requested`), the zone it answered instead (`used`), and the read that asked (`source`). */
  export interface Fallback {
    readonly requested: Tzname;
    readonly used: Tzname;
    readonly source: FallbackSource;
  }

  /**
   * A zone outcome as it happens (`onOutcome`): a fallback a zone read took
   * (`source`: chrono's own `FallbackSource`, or what a loader above chrono
   * names its reads, `reportFallback`); a zone whose times come from the
   * platform's offsets (`region.unserved`: the service has no data for it;
   * `region.mismatch`: its served data disagreed with the platform); a data
   * version the service does not serve (`servedLoader`).
   */
  export type Outcome =
    | { readonly kind: "fallback"; readonly requested: string; readonly used: Tzname; readonly source: string }
    | { readonly kind: "from-platform"; readonly region: TimezoneRegion }
    | { readonly kind: "data-version-fallback"; readonly asked: string; readonly used: string };

  const outcomeListeners = new Set<(outcome: Outcome) => void>();

  /**
   * Tell `listener` every zone outcome from now on, as it happens, until the
   * returned function removes it. Unlike the take-queues (`takeRebuilt`,
   * `takeFallbacks`, `takeVersionFallbacks`), which hand each outcome out
   * once to whichever caller drains first, every listener hears every
   * outcome; and a zone built from the platform is told again each time a
   * load answers it (`getOpt`, a cache hit too), so a reader that started
   * listening after the zone was built hears it when it uses the zone. A
   * listener that throws is logged and the others still hear the outcome.
   */
  export function onOutcome(listener: (outcome: Outcome) => void): () => void {
    outcomeListeners.add(listener);
    return () => outcomeListeners.delete(listener);
  }

  /**
   * A fallback a zone loader above chrono took (the SDK's: an event's zone,
   * a ground index with none), told to every outcome listener with the
   * caller's `source`. It joins no take-queue: the reporter traces its own.
   */
  export function reportFallback(fallback: { readonly requested: string; readonly used: Tzname; readonly source: string }): void {
    announce({ kind: "fallback", ...fallback });
  }

  function announce(outcome: Outcome): void {
    for (const listener of outcomeListeners) {
      try {
        listener(outcome);
      } catch (e) {
        console.error("TimezoneRegion.onOutcome: a listener threw", e);
      }
    }
  }

  /** Tell the listeners `region` when its times come from the platform's offsets (`unserved`, or a `mismatch` rebuild). */
  function announceFromPlatform(region: TimezoneRegion): void {
    if (outcomeListeners.size > 0 && (region.unserved != null || region.mismatch != null)) {
      announce({ kind: "from-platform", region });
    }
  }

  const fallbacksUnreported: Fallback[] = [];

  /**
   * The fallbacks `get` took since the last call (an iCal line's TZID, a
   * recurrence rule's zone, a runtime zone that does not load, read in the
   * default zone instead), each pending (requested, used) pair once: for a
   * host to report every fallback, whichever chrono read took it (the SDK's
   * `ZoneLoad.report` traces each as `tz/zone-fallback`).
   */
  export function takeFallbacks(): Fallback[] {
    return fallbacksUnreported.splice(0);
  }

  /**
   * Synchronously return an ALREADY-LOADED region, or null if it hasn't been
   * loaded yet. For hot sync paths that can tolerate a miss (the async `get`
   * warms `defaultCache`, so a region in active use — e.g. an expanded
   * recurrence series — is present here). UTC is always available. A zone
   * `getOpt` holds from the platform for want of an answer is answered here
   * too, so a synchronous reader reads the zone the async readers got.
   */
  export function getLoaded(tzname: Tzname): TimezoneRegion | null {
    return defaultCache.get(tzname) ?? provisional.get(tzname)?.region ?? null;
  }

  /**
   * Gets a timezone region or returns null if it is invalid or unavailable.
   * Use get() to throw on a missing zone or to supply an explicit fallback.
   * A zone the service serves with no transitions (Pacific/Port_Moresby) is
   * not loaded. A loaded zone is checked against the platform's offset for
   * the same name now, half a year either side and at its last transition
   * (from 1970);
   * when they disagree (a service file that dropped the zone's last offset
   * change), the region is built from the platform's offsets instead and
   * carries the disagreement (`mismatch`).
   * A backward link name (US/Pacific) loads as the zone the platform
   * canonicalizes it to (America/Los_Angeles) and is cached under both names.
   * When the platform's canonical name does not load (V8 resolves
   * Asia/Kolkata to Asia/Calcutta, Europe/Kyiv to Europe/Kiev), the name
   * itself is loaded; when neither loads, the current IANA name of a legacy
   * spelling (`legacyNames`: V8 reports an India runtime as Asia/Calcutta,
   * which the zone service does not serve) loads, cached under the name too.
   * When nothing loads because the service has no data for the name (a 404,
   * or no transitions: `Unserved`) and the platform knows it, the zone is
   * built from the platform's offsets (`unserved`; America/Coyhaique,
   * Pacific/Port_Moresby). A zone the service gave no answer for (`NoAnswer`:
   * `fetch` rejected, the loader's deadline, a 5xx, 429 or 408) is built
   * from the platform's offsets too (`unserved: "no-answer"`) and held
   * provisionally: reads inside `UNLOADABLE_RETRY_MS` answer it at once with
   * no fetch, `getLoaded` answers it (so the synchronous readers read the
   * same zone), and it is queued once (`takeRebuilt`). A read after the
   * window still answers it at once and asks the service again in the
   * background; served data replaces it once the service answers. A name
   * that does not load (the service has no data for it and the platform
   * does not know it, a malformed file, a loader's own error, no answer for
   * a name the platform does not know) is remembered as not loading for
   * `UNLOADABLE_RETRY_MS` (at most `UNLOADABLE_MAX` names, the oldest
   * forgotten first), so asking again inside that window answers null at
   * once, with no fetch and no error line, and asking after it loads afresh.
   * `setLoader` forgets both, and a load still in flight under the loader it
   * replaced is neither joined by a later ask nor cached nor remembered.
   * Concurrent first loads of one name share one load: one
   * fetch, one build, one region (the platform build, about 1 ms from the
   * platform's transition list and 10-20 ms of Intl scanning where the
   * platform has none, runs at most once per zone per process, inside this async load
   * and never on a synchronous read path such as `getLoaded`).
   */
  export function getOpt(tzname: Tzname): Promise<TimezoneRegion | null> {
    const cached = answerCachedRegion(tzname);
    return cached == null ? loadUncachedRegion(tzname) : Promise.resolve(cached);
  }

  function answerCachedRegion(tzname: Tzname): TimezoneRegion | undefined {
    const existing = defaultCache.get(tzname);
    if (existing != null) {
      announceFromPlatform(existing);
      return existing;
    }
    const held = provisional.get(tzname);
    if (held != null) {
      // Answered at once; after the window the service is asked again in the background.
      if (Epoch.currentMse() >= held.retryAt && !resolving.has(tzname)) void startLoad(tzname).catch(() => null);
      announceFromPlatform(held.region);
      return held.region;
    }
  }

  function loadUncachedRegion(tzname: Tzname): Promise<TimezoneRegion | null> {
    const retryAt = unloadable.get(tzname);
    if (retryAt != null) {
      if (Epoch.currentMse() < retryAt) return Promise.resolve(null);
      unloadable.delete(tzname);
    }
    return (resolving.get(tzname) ?? startLoad(tzname)).then((region) => {
      if (region != null) announceFromPlatform(region);
      return region;
    });
  }

  /** Load `tzname` under the loader installed now, shared by every ask until it settles (`resolving`). */
  function startLoad(tzname: Tzname): Promise<TimezoneRegion | null> {
    const generation = loaderGeneration;
    const pending: Promise<TimezoneRegion | null> = resolve(tzname, generation).then((region) => {
      if (generation !== loaderGeneration) return region;
      const held = provisional.get(tzname);
      if (region?.unserved === "no-answer") {
        if (held == null) rebuiltUnreported.push(region);
        provisional.set(tzname, { region: held?.region ?? region, retryAt: Epoch.currentMse() + UNLOADABLE_RETRY_MS });
        return held?.region ?? region;
      }
      if (region != null) return region;
      // Nothing loaded: a held platform build stays the answer until the next window; otherwise the name is remembered.
      if (held != null) provisional.set(tzname, { region: held.region, retryAt: Epoch.currentMse() + UNLOADABLE_RETRY_MS });
      else rememberUnloadable(tzname);
      return held?.region ?? null;
    }).finally(() => {
      if (resolving.get(tzname) === pending) resolving.delete(tzname);
    });
    resolving.set(tzname, pending);
    return pending;
  }

  /** Each name's `getOpt` load still in flight under the installed loader, shared by every concurrent caller. */
  const resolving = new Map<Tzname, Promise<TimezoneRegion | null>>();

  /** A zone built from the platform because the service gave no answer, and when to ask the service again. */
  interface Provisional {
    readonly region: TimezoneRegion;
    readonly retryAt: number;
  }

  /** The zones held provisionally (`getOpt`): answered by `getOpt` and `getLoaded` until served data replaces them. */
  const provisional = new Map<Tzname, Provisional>();

  /**
   * How long a name that did not load answers `getOpt` with null, and a zone
   * held from the platform for want of an answer is answered without asking
   * the service, before it is loaded again.
   */
  export const UNLOADABLE_RETRY_MS = 30_000;
  /** How many names that did not load are remembered at most; the oldest is forgotten first. */
  export const UNLOADABLE_MAX = 64;
  /** Names that did not load, in the order they failed, each with when it may be loaded again. */
  const unloadable = new Map<Tzname, number>();

  function rememberUnloadable(tzname: Tzname): void {
    unloadable.delete(tzname);
    unloadable.set(tzname, Epoch.currentMse() + UNLOADABLE_RETRY_MS);
    if (unloadable.size <= UNLOADABLE_MAX) return;
    const oldest = unloadable.keys().next();
    if (!oldest.done) unloadable.delete(oldest.value);
  }

  /** Bumped by `setLoader`: a load that started under an earlier loader caches and remembers nothing (`getOpt`). */
  let loaderGeneration = 0;

  /** Cache `region` under `tzname` when the load that found it started under the loader installed now (`generation`). */
  function cacheServed(tzname: Tzname, region: TimezoneRegion, generation: number): void {
    if (generation !== loaderGeneration) return;
    defaultCache.set(tzname, region);
    provisional.delete(tzname);
  }

  async function resolve(tzname: Tzname, generation: number): Promise<TimezoneRegion | null> {
    const canonical = canonicalTzname(tzname);
    if (canonical !== tzname) {
      const region = defaultCache.get(canonical) ?? await loadOpt(canonical, generation);
      if (region != null) {
        cacheServed(tzname, region, generation);
        return region;
      }
    }

    try {
      return await load(tzname, generation);
    } catch (e) {
      const links = await legacyNames();
      const current = links.get(tzname) ?? links.get(canonical);
      const target = current == null ? null : defaultCache.get(current) ?? await loadOpt(current, generation);
      const region = target == null ? null : sharedPlatformBuild(target, tzname, canonical, e instanceof Unserved ? e.reason : null);
      if (region != null) {
        cacheServed(tzname, region, generation);
        return region;
      }
      const reason = e instanceof Unserved ? e.reason : e instanceof NoAnswer ? "no-answer" : null;
      // Built from the platform's offsets under the current IANA name of a legacy spelling (`current`), so a zone is
      // named the same whichever spelling asked first: V8 reports an India host as Asia/Calcutta, and an explicit
      // Asia/Kolkata resolves through that canonical name to the region cached for it. Only when the platform treats
      // both names as one zone: TIMEZONE_LINKS also maps cities merged into another zone (Europe/Amsterdam ->
      // Europe/Brussels), which the platform keeps as zones of their own, with their own history.
      // The build is cached under the asked name only, never under `current`: the service gave no answer for
      // `current`, so a later name linked to it must not take this build as that zone's own (CET builds
      // Europe/Brussels; Europe/Amsterdam, linked to Brussels but its own zone to the platform, would take it).
      const named = current != null && canonicalTzname(current) === canonical ? current : tzname;
      const built = reason == null ? null : fromPlatform(named, reason, generation, tzname);
      if (built != null) return built;
      console.error("couldn't find tz: ", tzname, e);
      return null;
    }
  }

  /**
   * The zone a link name answers with when its link target (`target`) loaded:
   * the target itself, unless the target was built from the platform for want
   * of served data (`unserved`) and the platform keeps `tzname` as a zone of
   * its own (a merged city: Europe/Amsterdam after Europe/Brussels; a backward
   * link: Antarctica/DumontDUrville after Pacific/Port_Moresby). Then it is
   * the target's rules under the asked name (operator Q23): the same
   * transitions, no second platform build and no second report
   * (`takeRebuilt`), named as asked whichever name asked first, and
   * marked with the reason the asked name's own load gave (`ownReason`,
   * review I I-2: Europe/Amsterdam not-found, not Europe/Brussels'
   * no-transitions; the target's when the asked name's load gave none). A
   * spelling of the same zone (Asia/Calcutta and Asia/Kolkata) still takes
   * the target as it is (Q9).
   */
  function sharedPlatformBuild(
    target: TimezoneRegion,
    tzname: Tzname,
    canonical: Tzname,
    ownReason: Option<UnservedReason>,
  ): TimezoneRegion {
    if (target.unserved == null || target.fullname === tzname) return target;
    if (canonicalTzname(target.fullname) === canonical) return target;
    const region = new TimezoneRegion(tzname, target.transitions, target.mismatch, target.linkOf, ownReason ?? target.unserved);
    const source = platformSources.get(target);
    if (source != null) platformSources.set(region, source);
    return region;
  }

  /**
   * `tzname` built from the platform's offsets for want of served data
   * (`unserved`); null when the platform does not know the name. A zone the
   * service has no data for is cached and queued for its one report
   * (`takeRebuilt`); one the service gave no answer for is held
   * provisionally by `getOpt` (the region it already holds, when it does).
   */
  function fromPlatform(
    tzname: Tzname,
    reason: FromPlatformReason,
    generation: number,
    cacheAs: Tzname = tzname,
  ): TimezoneRegion | null {
    const held = reason === "no-answer" ? provisional.get(cacheAs) : null;
    if (held != null) return held.region;
    const built = reason === "no-answer" ? null : platformBuilt.get(tzname);
    if (built != null) {
      cacheServed(cacheAs, built, generation);
      return built;
    }
    const transitions = platformTransitions(tzname);
    if (transitions == null) return null;
    const region = new TimezoneRegion(tzname, transitions, null, null, reason);
    platformSources.set(region, tzname);
    if (reason === "no-answer" || generation !== loaderGeneration) return region;
    rebuiltUnreported.push(region);
    platformBuilt.set(tzname, region);
    cacheServed(cacheAs, region, generation);
    return region;
  }

  /**
   * Each zone `fromPlatform` built for want of served data under the loader
   * installed now, by the name it was built under (not the asked name it is
   * cached under): a later name that builds the same zone takes this build,
   * so the zone is built and reported (`takeRebuilt`) once whichever of its
   * names asked first (CET, then Europe/Brussels). It never answers a
   * different zone's name: a merged city builds under its own name.
   */
  const platformBuilt = new Map<Tzname, TimezoneRegion>();

  /**
   * Every tzdata `backward` link name (a legacy spelling CLDR, and so V8's
   * Intl, still reports as canonical — Asia/Calcutta; a 2022+ merge —
   * Europe/Amsterdam -> Europe/Brussels; a rename — America/Buenos_Aires)
   * mapped to the zone the zone service serves for it, its link chain
   * resolved (Pacific/Truk -> Pacific/Port_Moresby). The client fallback of
   * `getOpt` for a zone service that serves current zone names only;
   * generated from tzdata 2024b (`chrono/timezone-links.ts`, by
   * `tests/timezones/generate-links.deno.ts`), and it can go once the
   * service serves every `backward` link name. Loaded on first use (a
   * name the service did not serve), so the 241-entry table stays off every
   * entry's cold import.
   */
  export async function legacyNames(): Promise<ReadonlyMap<Tzname, Tzname>> {
    return (await import("./timezone-links.ts")).TIMEZONE_LINKS;
  }

  /** Each name's service load still in flight (`load`), shared by every caller that reaches it. */
  const loading = new Map<Tzname, Promise<TimezoneRegion>>();

  function load(tzname: Tzname, generation: number): Promise<TimezoneRegion> {
    let pending = loading.get(tzname);
    if (pending == null) {
      const started: Promise<TimezoneRegion> = loadServed(tzname, generation).finally(() => {
        if (loading.get(tzname) === started) loading.delete(tzname);
      });
      loading.set(tzname, started);
      pending = started;
    }
    return pending;
  }

  async function loadServed(tzname: Tzname, generation: number): Promise<TimezoneRegion> {
    const selectedLoader = loader;
    const transitions = await selectedLoader.load(tzname);
    if (transitions.length === 0) {
      // Every zone has an offset in force; an empty list is a zone the service has no data for.
      throw new Unserved(tzname, "no-transitions");
    }
    const served = new TimezoneRegion(tzname, transitions);
    const mismatch = offsetMismatch(served);
    const rebuilt = mismatch == null ? null : platformTransitions(tzname);
    const region = mismatch == null || rebuilt == null
      ? served
      : new TimezoneRegion(tzname, rebuilt, mismatch, served.linkOf);
    if (selectedLoader === PLATFORM_LOADER || rebuilt != null) {
      platformSources.set(region, tzname);
    }
    if (generation !== loaderGeneration) return region;
    if (region.mismatch != null) rebuiltUnreported.push(region);
    cacheServed(tzname, region, generation);
    return region;
  }

  const rebuiltUnreported: TimezoneRegion[] = [];

  /**
   * The zones loaded rebuilt from the platform's offsets (`mismatch`), or
   * built from them for want of served data (`unserved`), since the last
   * call, each answered once: for a host to report every rebuild once,
   * whichever caller loaded the zone.
   */
  export function takeRebuilt(): TimezoneRegion[] {
    return rebuiltUnreported.splice(0);
  }

  /**
   * Where a served region and the platform's offsets disagree (in whole
   * minutes, as offsets are served): the first of now, half a year either
   * side, and the region's last transition when it falls in 1970-2049.
   */
  export interface OffsetMismatch {
    readonly at: MsSinceEpoch;
    readonly servedMins: number;
    readonly platformMins: number;
  }

  const HALF_YEAR_MS = 182 * 86_400_000;

  /**
   * The last transition is checked from 1970 on only: before 1968,
   * `DateTime.fromRfc3339` puts a served transition a day early, so a check
   * there would rebuild most zones for a parse defect no 2026 viewer sees
   * (found 2026-10-07, not fixed here).
   */
  const LAST_TRANSITION_CHECKED_FROM_MS = Date.UTC(1970, 0, 1);

  function offsetMismatch(region: TimezoneRegion): Option<OffsetMismatch> {
    const platform = PlatformZone.offsets(region.fullname);
    if (platform == null) return null;
    const now = Epoch.currentMse();
    const last = region.transitions[region.transitions.length - 1].before.mse;
    const instants = [now, now - HALF_YEAR_MS, now + HALF_YEAR_MS];
    if (last >= LAST_TRANSITION_CHECKED_FROM_MS) instants.push(last);
    for (const at of instants) {
      if (at < PlatformZone.WINDOW_START_MS || at >= PlatformZone.WINDOW_END_MS) continue;
      const servedMins = Math.round(region.tzAtMse(at as MsSinceEpoch).info.offset.toHrsF * 60);
      const platformMins = Math.round(platform(at) / 60);
      if (servedMins !== platformMins) return { at: at as MsSinceEpoch, servedMins, platformMins };
    }
    return null;
  }

  async function loadOpt(tzname: Tzname, generation: number): Promise<TimezoneRegion | null> {
    try {
      return await load(tzname, generation);
    } catch {
      return null;
    }
  }

  /** `tzname` as the platform's Intl resolves it (a link to its canonical zone); `tzname` itself when Intl refuses it. */
  function canonicalTzname(tzname: Tzname): Tzname {
    try {
      return new Intl.DateTimeFormat("en-US", { timeZone: tzname }).resolvedOptions().timeZone as Tzname;
    } catch {
      return tzname;
    }
  }

  /**
   * Install `l` as the zone loader for this process; `l.restart` runs first,
   * so it decides afresh (`servedLoader`'s data version), and the names that
   * did not load and the zones held for want of an answer are forgotten (the
   * new loader may serve them). A load still in flight under the old loader
   * is not joined by a later ask, and its answer is neither cached nor
   * remembered: only the caller that started it gets it.
   */
  export function setLoader(l: Loader) {
    l.restart?.();
    unloadable.clear();
    provisional.clear();
    platformBuilt.clear();
    resolving.clear();
    loading.clear();
    loaderGeneration++;
    loader = l;
  }

  /**
   * The zone loader installed now (`setLoader`; `PLATFORM_LOADER` until one
   * is): a caller that installs its own for a while reads this first and
   * puts back the loader it found, not `PLATFORM_LOADER`. Putting it back
   * with `setLoader` restarts it.
   */
  export function getLoader(): Loader {
    return loader;
  }

  /**
   * Transitions
   */
  export interface Transition {
    before: {
      mse: MsSinceEpoch;
      time: DateTime<FixedOffset>;
      tzabbr: string;
    };
    after: {
      time: DateTime<FixedOffset>;
      tzabbr: string;
    };
    /** The file's `linkOf` (requests/tz-to-sdk-1): the canonical zone a backward name's file was copied from. */
    linkOf?: Tzname;
  }

  export namespace Transition {
    export type Serialized = {
      before: string;
      before_tz_abbr: string;
      after: string;
      after_tz_abbr: string;
      /** The standing UTC offset at the range start, seconds east of UTC (the first entry; tz-to-sdk-1). */
      baseOffsetSeconds?: number;
      /** A backward name's resolved canonical zone (tz-to-sdk-1). */
      linkOf?: string;
    };

    export function parse(
      t: Transition.Serialized,
      tzname: Tzname,
    ): Transition {
      const before = DateTime.fromRfc3339(
        t.before,
        tzname,
        t.before_tz_abbr,
      ).exp();
      const after = DateTime.fromRfc3339(
        t.after,
        tzname,
        t.after_tz_abbr,
      ).exp();
      if (t.baseOffsetSeconds !== undefined && Math.round(after.tz.info.offset.toHrsF * 3600) !== t.baseOffsetSeconds) {
        throw new Error(`zone ${tzname}: baseOffsetSeconds ${t.baseOffsetSeconds} contradicts the entry's offset (${t.after})`);
      }
      return {
        ...(t.linkOf !== undefined ? { linkOf: t.linkOf as Tzname } : {}),
        before: {
          mse: before.mse,
          time: before,
          tzabbr: t.before_tz_abbr,
        },
        after: {
          time: after,
          tzabbr: t.after_tz_abbr,
        },
      };
    }

    export function print(transition: Transition, idx?: Option<number>) {
      console.log(idx, debug(transition));
    }

    export function debug(transition: Transition): string {
      return `${
        transition.before.mse
      } ${transition.before.time.rfc3339()} ${transition.after.time.rfc3339()}`;
    }
  }
}
