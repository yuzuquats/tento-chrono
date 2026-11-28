import { DateTime } from "../datetime.ts";
import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { NaiveTime } from "../naive-time.ts";
import { err, ok, Result } from "../result.ts";
import { Time } from "../time.ts";
import { TimezoneRegion } from "../timezone-region.ts";
import { FixedOffset, Tzname, Utc } from "../timezone.ts";
import type { Duration } from "../units/duration.ts";
import type { MsSinceEpoch } from "../units/units.ts";
import { Weekday } from "../units/weekday.ts";
import { Year } from "../units/year.ts";
import { readAsciiDigitPair } from "../utils.ts";
import { Frequency } from "./frequency.ts";
import { googleUsesWrappedYearlyPeriods, googleYearlyOrdinalRewinds } from "./google-yearly-day-wrap.ts";
import { RecurrenceExpansionLimitError } from "./generation-limit.ts";
import {
  calendarContentLines,
  formatICalParameter,
  ICalAttributes,
  icalPropertyName,
  libraryRecurrenceContentLines,
  splitICalProperty,
  splitLiteralICalProperty,
  unquoteICalParameter,
} from "./ical-attributes.ts";
import { ICalendar, readCalendarLines } from "./ical.ts";
import { ICalDateLine } from "./ical-date-line.ts";
import { validateDateutilClockPhase } from "./dateutil-clock.ts";
import type { DateutilDateContext } from "./dateutil-dates.ts";
import { normalizeDateutilDigits } from "./dateutil-numbers.ts";
import type { DateutilHost, DateutilLocalZone } from "./dateutil-host.ts";
import {
  type DateutilCompatibleStart,
  type DateutilRecurrenceSet,
  createDateutilSet,
  type DateutilSetOptions,
  DateutilCandidateCache,
  type DateutilQueryTraversal,
  type DateutilSlice,
  type DateutilXAfterOptions,
  queryDateutilContains,
  queryDateutilBefore,
  queryDateutilAfter,
  queryDateutilBetween,
  queryDateutilXAfter,
  queryDateutilAt,
  queryDateutilSlice,
  dateutilGenerator,
  plainDateutilDailySpan,
  type DateutilQueryBound,
} from "./dateutil-set.ts";
import { DateutilPosixZone } from "./dateutil-posix.ts";
import { dateutilSelectors, serializeDateutilRule } from "./dateutil-serialization.ts";
import { DateutilTzif, type DateutilZone } from "./dateutil-tzif.ts";
import { RRuleInstances } from "./instances.ts";
import { IsoDate } from "./iso-date.ts";
import { resolveGoogleDateTimezone } from "./google-timezones.ts";
import {
  googleDateToGregorian,
  googleUsesJulianCalendar,
  gregorianToGoogleDateOnOrBefore,
} from "./google-julian-calendar.ts";
import {
  GoogleEventGenerator,
  maxOffsetMsNear,
  minOffsetMsNear,
  Recurrence,
  RecurrenceComposition,
  recurrenceCoverageEnd,
  requireRecurrenceCoverage,
  rfcWallOffsetBound,
} from "./recurrence.ts";
import {
  parseRuleParts,
  RULE_NUMBER_PARTS,
  ruleNumbersInRange,
  decodeRfcTzid,
  encodeRfcTzid,
  rfcDateSetGenerator,
  rfcObservance,
  filterDateLineValues,
  validateRfc5545,
} from "./rfc5545.ts";
import { dateutilEasterSelector, parseScalarRule, RRule, type RRuleLike } from "./rrule.ts";

export type ICalendarRecurrenceProfile =
  | "rfc5545"
  | "google"
  | "dateutil"
  | "rrule-js";
export type RecurrenceProfile = ICalendarRecurrenceProfile | "outlook";
export type RecurrenceStart =
  | { date: string }
  | { dateTime: string; timeZone?: string | null };

type DateutilInteger = number | bigint;
type DateutilSelector<T> = T | readonly T[] | null;

/** Overrides for a standalone dateutil rule. Null clears an optional field. */
export interface DateutilReplaceOptions {
  /** Null chooses the current clock as in dateutil’s constructor. */
  dtstart?: RecurrenceStart | null;
  cache?: boolean;
  freq?: "yearly" | "monthly" | "weekly" | "daily" | "hourly" | "minutely" | "secondly";
  interval?: DateutilInteger;
  count?: DateutilInteger | null;
  /** A dateutil UNTIL value such as 20261124T090000Z. */
  until?: string | null;
  /** Null restores the configured dateutil week start. */
  wkst?: string | null;
  bysetpos?: DateutilSelector<DateutilInteger>;
  bymonth?: DateutilSelector<DateutilInteger>;
  bymonthday?: DateutilSelector<DateutilInteger>;
  byyearday?: DateutilSelector<DateutilInteger>;
  byweekno?: DateutilSelector<DateutilInteger>;
  /** Weekday tokens such as MO, -1FR or TU(+2). */
  byweekday?: DateutilSelector<string>;
  byhour?: DateutilSelector<DateutilInteger>;
  byminute?: DateutilSelector<DateutilInteger>;
  bysecond?: DateutilSelector<DateutilInteger>;
  byeaster?: DateutilSelector<DateutilInteger>;
}

export interface ICalendarRecurrenceOptions {
  profile?: ICalendarRecurrenceProfile;
  /** An external start, as supplied by an event master. */
  dtstart?: RecurrenceStart;
  /** Validate the fractional duration of a submitted Google event when its end is available. */
  dtend?: RecurrenceStart;
  /** Keep the instant and millisecond clock of a persisted, offset-bearing Google DTSTART. */
  googleStartMode?: "submitted" | "stored";
  /** Optional fallback when a Google recurrence zone is unavailable before platform reconstruction. */
  googleTimeZoneFallback?: (timeZone: string) =>
    TimezoneRegion | null | undefined | Promise<TimezoneRegion | null | undefined>;
  /** Match explicit dates in the DTSTART frame, or preserve each written date kind. Defaults to "dtstart". */
  rfcDateMode?: "dtstart" | "written";
  /** Calendar-defined VTIMEZONE transitions for a decoded RFC TZID parameter. */
  rfcTimeZone?: (tzid: string) => TimezoneRegion | undefined | Promise<TimezoneRegion | undefined>;
  /** Timezone of the rrule.js reference process. Defaults to UTC. */
  rruleJsHostTimeZone?: string;
  /** Match rrule.js's unfold option. Omit to detect continuations automatically. */
  rruleJsUnfold?: boolean;
  /** Replay rrule.js's compatible option and forced-set external DTSTART handling. */
  rruleJsCompatible?: boolean;
  /** Select whether rrule.js always builds a set. Omit to use Chrono's default set behavior. */
  rruleJsForceSet?: boolean;
  /** Python process timezone for bare dateutil abbreviations and implicit starts. */
  dateutilHost?: DateutilHost;
  /** Python calendar.firstweekday() used by dateutil when WKST is omitted. Defaults to Monday. */
  dateutilWeekStart?: Weekday;
  /** Local year of the reference parser when it initialized its two-digit-year window. */
  dateutilParserYear?: number;
  /** Match dateutil's unfold option. Omit to detect continuations automatically. */
  dateutilUnfold?: boolean;
  /** Match dateutil's compatible option: unfold and include the original DTSTART. */
  dateutilCompatible?: boolean;
  /** Cache dateutil object queries, as in rrulestr(cache=True). */
  dateutilCache?: boolean;
  /** Resolve textual DTSTART and EXDATE TZIDs like dateutil's tzids argument. */
  dateutilTzids?: Readonly<Record<string, DateutilZone | null | undefined>> |
    ((timeZone: string) => DateutilZone | null | undefined | Promise<DateutilZone | null | undefined>);
  /** TZif bytes for a dateutil TZID. Null leaves the TZID unresolved. */
  dateutilTzif?: (timeZone: string) =>
    Uint8Array | null | undefined | Promise<Uint8Array | null | undefined>;
}

export type RecurrenceOccurrence = NaiveDate | NaiveDateTime | DateTime<Utc>;

interface GoogleFallbackScan {
  readonly explicitDays: Set<number>;
  readonly firstDay: NaiveDate;
  first?: { instant: DateTime<Utc>; alternate: boolean };
  hasPending: boolean;
}

interface DateutilTraversalOptions {
  generationLimit?: number;
  /** Use dateutil's forced-set traversal for a single RRULE. */
  forceSet?: boolean;
}

interface DateutilQueryOptions extends DateutilTraversalOptions {
  inclusive?: boolean;
}

type DateutilNeighborQuery = DateutilQueryOptions & { at: DateutilQueryBound };

interface RruleJsQueryOptions {
  inclusive?: boolean;
  generationLimit?: number;
}

interface RruleJsNeighborQuery extends RruleJsQueryOptions {
  at: DateTime;
}

interface RruleJsBetweenQuery extends RruleJsQueryOptions {
  after: DateTime;
  before: DateTime;
}

/** rrule.js distinguishes an Invalid Date result from no occurrence. */
export type RruleJsExactNeighbor = DateTime<Utc> | "Invalid Date" | null;

function compareRruleJsDates(a: DateTime<Utc> | null, b: DateTime<Utc> | null): number {
  return (a?.mse ?? NaN) - (b?.mse ?? NaN);
}

function hasGoogleInstanceOffset(value: string): boolean {
  if (typeof value !== "string") return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
  const end = value.length;
  const last = value[end - 1];
  if (last === "Z" || last === "z") return true;
  const sign = value[end - 6];
  return (sign === "+" || sign === "-") && value[end - 3] === ":" &&
    Number.isFinite(readAsciiDigitPair(value, end - 5) + readAsciiDigitPair(value, end - 2));
}

/** A recorded Google exception, keyed by the provider's originalStartTime field. */
export type GoogleCalendarInstanceEdit =
  | { originalStartTime: RecurrenceStart; status: "cancelled" }
  | {
    originalStartTime: RecurrenceStart;
    status?: "confirmed" | "tentative";
    start: RecurrenceStart;
    end: RecurrenceStart;
  };

interface GraphEditSpan<T> {
  start: T;
  end: T;
}

type GraphCalendarViewReplacement<T> = GraphEditSpan<T> & {
  /** The replacement's query instants, when Graph displays different endpoints. */
  selection?: GraphEditSpan<DateTime>;
};

/** Replace a Graph occurrence by its original slot, or omit the replacement to cancel it. */
export type GraphCalendarViewEdit =
  | {
    /** The civil rule date before any display projection. */
    originalSlot: NaiveDate;
    replacement?: GraphCalendarViewReplacement<NaiveDate>;
  }
  | {
    /** The original timed start on the provider's query clock. */
    originalSlot: DateTime;
    replacement?: GraphCalendarViewReplacement<DateTime>;
  };

type GraphTimezones = typeof import("./graph-timezones.ts");
let dateutilDatesModule: typeof import("./dateutil-dates.ts") | undefined;

/** @internal Provider-normalized recurrence anchor. */
export interface BoundStart {
  local: NaiveDateTime;
  instant: DateTime<FixedOffset>;
  zone: TimezoneRegion | null;
  kind: "date" | "floating" | "instant";
}

interface DateutilRuleContext {
  weekStart?: Weekday;
  dateContext: DateutilDateContext;
  parseUntil: typeof import("./dateutil-dates.ts").dateutilUntil;
}

interface DateutilOriginalRule {
  parts: ReadonlyMap<string, string>;
  weekStart: string;
  context: DateutilRuleContext;
  startOptions: Pick<ICalendarRecurrenceOptions, "dateutilHost" | "dateutilTzif" | "dateutilParserYear">;
  untilOffsetMs?: number;
  untilLocal?: DateutilLocalZone;
}

/** @internal Graph's reader can pass its resolved start directly within the module. */
export const readBoundGraphSeries = Symbol("readBoundGraphSeries");

const RRULE_JS_CLOCK_UNITS: Partial<Record<Frequency, number>> = {
  weekly: Time.MS_PER_WK,
  hourly: Time.MS_PER_HR,
  minutely: Time.MS_PER_MIN,
  secondly: Time.MS_PER_SEC,
};

export class RecurrenceSeries {
  private readonly dateutilQueryCaches?: Map<boolean, {
    generationLimit?: number;
    cache: DateutilCandidateCache;
  }>;

  private constructor(
    readonly profile: RecurrenceProfile,
    private readonly start: BoundStart,
    private readonly rules: readonly Recurrence[],
    private readonly exclusionRules: readonly Recurrence[],
    private readonly tzif: ReadonlyMap<string, DateutilZone>,
    private readonly graphSamoa?: TimezoneRegion,
    private readonly rruleJsHostZone?: TimezoneRegion,
    private readonly invalidRruleJsTzid?: string,
    private readonly graphResolveWallTime?: RecurrenceComposition["resolveWallTime"],
    private readonly dateutilCompatibleStart?: DateutilCompatibleStart,
    private readonly rruleJsStandalone = false,
    private readonly graphAllDayZone?: TimezoneRegion,
    private readonly rruleJsWrittenTzid?: string,
    private readonly dateutilZones?: ReadonlyMap<string, TimezoneRegion>,
    private readonly graphViewWallDurationMs?: number,
    private readonly dateutilTzidRegions?: ReadonlyMap<DateutilZone, TimezoneRegion>,
    private readonly dateutilOriginalRule?: DateutilOriginalRule,
    dateutilCache = false,
    private readonly graphTimezones?: GraphTimezones,
    private readonly preserveRfcDateForms = false,
  ) {
    if (dateutilCache) this.dateutilQueryCaches = new Map();
  }

  static dateutilSet(options: DateutilSetOptions): DateutilRecurrenceSet {
    return createDateutilSet((series) => {
      if (series.dateutilOriginalRule == null) throw new Error("dateutil set additions require a standalone dateutil rule");
      const raw = series.rules[0].inner;
      const zone = raw.dtstart?.region;
      const ref = zone == null ? undefined : series.tzif.get(zone.fullname);
      return {
        raw,
        tzif: series.tzif,
        identity: ref != null && (series.dateutilTzidRegions?.has(ref) ||
          zone?.fullname.startsWith("X-DATEUTIL-LOCAL-")) ? ref : undefined,
        cachedValues: series.dateutilQueryCaches == null ? undefined : function* (generationLimit?: number) {
          yield* series.dateutilQuery(false, generationLimit);
        },
      };
    }, options);
  }

  /**
   * Expand through a UTC date for instants, or a civil date for DATE/floating values.
   * RFC written-form mode can return a mix of all three kinds.
   * @throws {RecurrenceExpansionLimitError} When the generation budget is exhausted.
   * @throws {RangeError} When the query exceeds calendar timezone coverage or a profile rejects a comparison.
   */
  occurrences({ through, generationLimit }: {
    through: NaiveDate;
    generationLimit?: number;
  }): RecurrenceOccurrence[] {
    if (this.profile === "dateutil" && generationLimit == null && this.start.kind === "instant") {
      const daily = this.plainDateutilDailyRule();
      if (daily != null) {
        const { rrule, start } = daily;
        const span = plainDateutilDailySpan(rrule, start.date);
        if (span != null) {
          // Standalone UTC rules emit in order and do not need set merging.
          // dateutil constructs each occurrence at whole-second precision.
          const { count, step } = span;
          const first = start.time.ms === 0 ? start : start.add({ ms: -start.time.ms });
          const length = Math.min(count, Math.floor((through.dse - first.date.dse) / step) + 1);
          const dates: DateTime<Utc>[] = [];
          for (let i = 0; i < length; i++) {
            const date = i === 0
              ? NaiveDate.fromYmd1Exp(first.date.yr, first.date.mth, first.date.day)
              : first.date.addDays(i * step);
            dates.push(date.withTime(first.time).asUtc());
          }
          return dates;
        }
      }
    }
    if (this.profile !== "dateutil" && generationLimit == null) {
      const dates = this.collectUtcOccurrences(through);
      if (dates != null) return dates;
    }
    return this.generator(generationLimit).generateUpToDate(through);
  }

  private collectUtcOccurrences(through: NaiveDate, firstDay?: number): DateTime<Utc>[] | undefined {
    if (this.rules.length !== 1 || this.exclusionRules.length !== 0) return;
    const { rrule, rdate, exdate } = this.rules[0].inner.lines;
    const { zone, local, instant, kind } = this.start;
    if (rrule == null || kind !== "instant" || local.mse !== instant.mse ||
      rdate?.length || exdate?.length || this.invalidRruleJsTzid != null) return;
    if (firstDay != null &&
      (instant.tz !== Utc || Utc.info.offset.toMs !== 0 ||
        local.date.mse + local.time.toMs !== instant.mse)) {
      // A caller can retain the master returned by a previous query.
      return;
    }
    const utc = this.profile === "outlook"
      ? this.graphSamoa == null && zone != null && zone.transitions.length === 0 &&
        zone === TimezoneRegion.getLoaded(Tzname.UTC) &&
        this.graphResolveWallTime === this.graphTimezones?.resolveGraphWallTime
      : zone == null;
    if (utc) return this.collectPlainUtcRule(rrule, local, through, firstDay);
  }

  private collectPlainUtcRule(rrule: RRule, local: NaiveDateTime, through: NaiveDate, firstDay?: number): DateTime<Utc>[] | undefined {
    const { freq, options } = rrule.inner;
    if (this.profile === "rfc5545" && freq === "secondly") {
      const { count, ...selectors } = options ?? {};
      if (count == null || count <= 0 || Object.values(selectors).some((value) => value != null)) return;
      // A counted UTC rule with no selectors emits a unique, ordered stream.
      // Collect it directly for this one-shot window.
      const end = (through.dse + 1) * Time.MS_PER_DAY - 1;
      const dates: DateTime<Utc>[] = [];
      for (const wall of RRuleInstances.expand(rrule, local, false, undefined, undefined, false, end)) {
        dates.push(wall.asUtc());
      }
      return dates;
    }
    const clockUnit = this.profile === "rrule-js" ? RRULE_JS_CLOCK_UNITS[freq] : undefined;
    if (freq !== "daily" && clockUnit == null) return;
    const { count, interval, wkst: _weekStart, rruleJsClock: _clock, rruleJsHostZone: _host, ...selectors } = options ?? {};
    const step = interval ?? 1;
    if (count == null || count <= 0 || !Number.isSafeInteger(count) || step <= 0 || !Number.isSafeInteger(step) ||
      Object.values(selectors).some((value) => value != null)) return;
    const start = local.date;
    let lastDay: number = through.dse;
    if (this.profile === "rrule-js") {
      // The reference's Date.UTC fields alias low years and pre-epoch
      // fractional anchors. Its forward scan stops at the end of 9999.
      if (start.yr < 100 || start.yr > 9999 || (local.mse < 0 && local.time.ms !== 0)) return;
      // A weekly period that starts in 9999 can still emit a January slot.
      if (freq === "weekly" && through.yr > 9999) return;
      lastDay = Math.min(lastDay, Year.dseFromYear(10000) - 1);
    } else if (this.profile === "google") {
      // Late masters use Google's fallback selection in the composed cursor.
      if (local.mse > GOOGLE_LAST_RECURRENCE.mse) return;
      lastDay = Math.min(lastDay, GOOGLE_LAST_RECURRENCE.date.dse);
    }
    if (clockUnit != null) {
      // With a whole-second UTC anchor, every slot is an exact elapsed step.
      const stride = clockUnit * step;
      const first = local.mse;
      if (!Number.isSafeInteger(stride) || first % Time.MS_PER_SEC !== 0) return;
      const end = (lastDay + 1) * Time.MS_PER_DAY - 1;
      const length = Math.min(count, Math.floor((end - first) / stride) + 1);
      const dates: DateTime<Utc>[] = [];
      for (let i = 0; i < length; i++) {
        dates.push(DateTime.fromMse((first + i * stride) as MsSinceEpoch, Utc));
      }
      return dates;
    }
    const length = Math.min(count, Math.floor((lastDay - start.dse) / step) + 1);
    let first = firstDay == null ? 0 : Math.max(0, Math.ceil((firstDay - start.dse) / step));
    const dates: DateTime<Utc>[] = [];
    if (firstDay != null && first === 0 && length > 0) {
      dates.push(this.start.instant.toUtc());
      first = 1;
    }
    for (let i = first; i < length; i++) {
      const date = i === 0
        ? NaiveDate.fromYmd1Exp(start.yr, start.mth, start.day)
        : start.addDays(i * step);
      dates.push(date.withTime(local.time).asUtc());
    }
    return dates;
  }

  /** Return the standalone Python dateutil 2.8.2 rule's str(rrule) text. */
  dateutilToString(): string {
    const rule = this.dateutilOriginalRule;
    const start = this.rules[0]?.inner.dtstart?.dates[0];
    if (rule == null || start == null) throw new Error("dateutilToString requires a standalone dateutil rule");
    return serializeDateutilRule(rule.parts, start, rule.weekStart);
  }

  /** Construct a new standalone dateutil rule with the given overrides. */
  async dateutilReplace({ dtstart, cache = this.dateutilQueryCaches != null, ...overrides }: DateutilReplaceOptions = {}): Promise<Result<RecurrenceSeries>> {
    try {
      const original = this.dateutilOriginalRule;
      if (original == null) throw new Error("dateutilReplace requires a standalone dateutil rule");

      const current = this.rules[0].inner;
      const { count } = overrides;
      // With no selectors or UNTIL, COUNT can change independently of the resolved start and cadence.
      if (dtstart === undefined && Object.keys(overrides).length === 1 &&
        (count === null || (typeof count === "number" && Number.isSafeInteger(count))) &&
        [...original.parts.keys()].every((key) =>
          key === "FREQ" || key === "INTERVAL" || key === "COUNT" || key === "WKST"
        )) {
        const parts = new Map(original.parts);
        const weekStart = parts.get("WKST") ?? original.weekStart;
        parts.set("WKST", weekStart);
        if (count === null) parts.delete("COUNT");
        else parts.set("COUNT", String(count));
        const rule = current.rrule!.inner;
        const rrule = new RRule({
          freq: rule.freq,
          options: {
            ...rule.options,
            count: count === 0 ? 0 : count,
            wkst: Weekday.parseOpt(weekStart),
          },
        }, [...parts.keys()]);
        const replacement = new Recurrence(new ICalendar.Raw({ rrule, dtstart: current.dtstart }));
        return ok(this.withDateutilRule(replacement, { ...original, parts }, cache));
      }

      const { dtstart: oldDate } = current;
      const parts = new Map(original.parts);
      for (const [key, value] of dateutilSelectors(parts, oldDate!.dates[0])) parts.set(key, value);
      parts.set("WKST", parts.get("WKST") ?? original.weekStart);
      for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) continue;
        const part = key === "byweekday" ? "BYDAY" : key.toUpperCase();
        if (value === null) {
          parts.delete(part);
          continue;
        }
        const text = String(value);
        if ((text === "" && !(Array.isArray(value) && value.length === 0)) || /[;=\r\n]/.test(text)) {
          throw new Error("Invalid dateutil replacement field: " + key);
        }
        parts.set(part, text);
      }
      if (!parts.has("WKST")) parts.set("WKST", original.weekStart);
      const fields = Array.from(parts).filter(([, value]) => value !== "");
      // Retain the text parser's diagnostics for delimiter-bearing input.
      const rule = fields.some(([key, value]) => /[:;=\r\n]/.test(key) || /[:;=\r\n]/.test(value))
        ? profileRule("RRULE:" + fields.map(([key, value]) => key + "=" + value).join(";"), "dateutil", original.context)
        : resolveLibraryRule(fields, "dateutil", original.context);
      if (overrides.until === undefined) {
        rule.untilOffsetMs = original.untilOffsetMs;
        rule.untilLocal = original.untilLocal;
      }
      // Resolve a new anchor independently of the replacement selectors.
      // An omitted DTSTART retains its existing timezone object.
      const base = dtstart === undefined ? this : (await RecurrenceSeries.readLines(
        ["RRULE:FREQ=DAILY"], "dateutil", dtstart ?? undefined,
        {
          dateutilHost: original.startOptions.dateutilHost,
          dateutilParserYear: original.startOptions.dateutilParserYear,
          readTzif: original.startOptions.dateutilTzif,
          dateutilImplicitUntil: dtstart === null ? rule : undefined,
        },
      )).exp();
      const parsed = rule.raw.resolve().exp();
      const start = base.rules[0].inner.dtstart!;
      const originalParts = new Map(rule.dateutilOriginal);
      for (const [key, value] of parts) {
        if (value === "") originalParts.set(key, value);
      }
      rule.dateutilOriginal = originalParts;
      const rrule = dateutilEmptySelectors(parsed, originalParts, start.dates[0].date);
      const raw = new ICalendar.Raw({ rrule, dtstart: start });
      const replacement = profileRecurrence(raw, rule, "dateutil", undefined,
        dtstart === null || (overrides.until === undefined && dtstart === undefined &&
          this.rules[0].inner.rrule?.inner.options?.dateutilUntilUsesWall === true));
      return ok(base.withDateutilRule(replacement, {
        ...original,
        parts: originalParts,
        untilOffsetMs: rule.untilOffsetMs,
        untilLocal: rule.untilLocal,
      }, cache));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private withDateutilRule(rule: Recurrence, original: DateutilOriginalRule, cache: boolean): RecurrenceSeries {
    return new RecurrenceSeries(
      "dateutil", this.start, [rule], [], this.tzif,
      undefined, undefined, undefined, undefined, undefined, false,
      undefined, undefined, this.dateutilZones, undefined, this.dateutilTzidRegions, original, cache,
    );
  }

  /** Replay dateutil membership in the current cache state. */
  dateutilContains({ at, generationLimit, forceSet = false }:
    DateutilTraversalOptions & { at: DateutilQueryBound }): boolean {
    return queryDateutilContains(this.dateutilTraversal(forceSet, generationLimit), at);
  }

  /** Replay dateutil before() in reference traversal order. */
  dateutilBefore({ at, inclusive, generationLimit, forceSet = false }: DateutilNeighborQuery): DateTime<Utc> | NaiveDateTime | null {
    return queryDateutilBefore(this.dateutilTraversal(forceSet, generationLimit), at, inclusive);
  }

  /** Replay dateutil after() in reference traversal order. */
  dateutilAfter({ at, inclusive, generationLimit, forceSet = false }: DateutilNeighborQuery): DateTime<Utc> | NaiveDateTime | null {
    return queryDateutilAfter(this.dateutilTraversal(forceSet, generationLimit), at, inclusive);
  }

  /** Replay dateutil between(), including its first-match traversal rule. */
  dateutilBetween({ after, before, inclusive, generationLimit, forceSet = false }:
    DateutilQueryOptions & { after: DateutilQueryBound; before: DateutilQueryBound }): (DateTime<Utc> | NaiveDateTime)[] {
    return queryDateutilBetween(this.dateutilTraversal(forceSet, generationLimit), after, before, inclusive);
  }

  /** Replay dateutil xafter() as a lazy sequence of matches. */
  dateutilXAfter({ at, inclusive, generationLimit, forceSet = false, count }:
    DateutilNeighborQuery & DateutilXAfterOptions): Generator<DateTime<Utc> | NaiveDateTime> {
    return queryDateutilXAfter(this.dateutilTraversal(forceSet, generationLimit), at, { inclusive, count });
  }

  /** Get a zero-based dateutil occurrence. A negative index counts from exhaustion. */
  dateutilAt({ index, generationLimit, forceSet = false }: DateutilTraversalOptions & { index: number }): DateTime<Utc> | NaiveDateTime {
    return queryDateutilAt(this.dateutilTraversal(forceSet, generationLimit), index);
  }

  /** Slice a dateutil recurrence in its traversal order. */
  dateutilSlice(
    { start, stop, step, generationLimit, forceSet = false }: DateutilTraversalOptions & DateutilSlice = {},
  ): (DateTime<Utc> | NaiveDateTime)[] {
    return queryDateutilSlice(this.dateutilTraversal(forceSet, generationLimit), { start, stop, step });
  }

  /** Count values in the dateutil traversal, including repeated standalone values. */
  dateutilCount({ generationLimit, forceSet = false }: DateutilTraversalOptions = {}): number {
    const completed = this.dateutilQueryCache(forceSet, generationLimit)?.completed;
    if (completed != null) return completed.length;
    if (!forceSet && generationLimit == null && this.dateutilQueryCaches == null) {
      const daily = this.plainDateutilDailyRule();
      if (daily != null) {
        const span = plainDateutilDailySpan(daily.rrule, daily.start.date);
        if (span != null) return span.count;
      }
    }
    let count = 0;
    for (const _ of this.dateutilQuery(forceSet, generationLimit)) count++;
    return count;
  }

  private plainDateutilDailyRule() {
    if (this.profile !== "dateutil" || this.rules.length !== 1 ||
      this.exclusionRules.length !== 0 || this.dateutilCompatibleStart != null) return;
    const { rrule, dtstart, rdate, exdate } = this.rules[0].inner.lines;
    if (rrule == null || rdate?.length || exdate?.length ||
      dtstart?.region != null || dtstart?.forms?.[0]?.utc !== true) return;
    return { rrule, start: dtstart.dates[0] };
  }

  private dateutilTraversal(forceSet: boolean, generationLimit?: number): DateutilQueryTraversal {
    return {
      bound: (bound) => this.dateutilBound(bound),
      cache: () => this.dateutilQueryCache(forceSet, generationLimit),
      read: (canRepeat) => this.dateutilQuery(forceSet, generationLimit, canRepeat),
    };
  }

  private dateutilBound(bound: DateutilQueryBound): DateutilQueryBound {
    if ("value" in bound && bound.timeZone != null) {
      const key = bound.timeZone;
      if (typeof key !== "string") {
        if (!(bound.value instanceof DateTime)) throw new RangeError("dateutil query TZID requires an aware bound");
        return {
          ...bound,
          timeZone: this.dateutilTzidRegions?.get(key)?.fullname,
          foldSensitive: bound.foldSensitive ?? key.ambiguous(bound.value.ndt),
        };
      }
      const zone = this.dateutilZones?.get(key);
      if (zone != null && zone.fullname !== key) return { ...bound, timeZone: zone.fullname };
    }
    return bound;
  }

  private dateutilQueryCache(forceSet: boolean, generationLimit?: number) {
    const caches = this.dateutilQueryCaches;
    if (caches == null) return;
    let entry = caches.get(forceSet);
    if (entry == null || entry.generationLimit !== generationLimit) {
      const cursor = this.dateutilCursor(generationLimit);
      entry = { generationLimit, cache: new DateutilCandidateCache((canRepeat) => cursor.query(forceSet, canRepeat)) };
      caches.set(forceSet, entry);
    }
    return entry.cache;
  }

  private dateutilQuery(forceSet: boolean, generationLimit?: number, canRepeat?: () => boolean) {
    const cache = this.dateutilQueryCache(forceSet, generationLimit);
    return cache == null ? this.dateutilCursor(generationLimit).query(forceSet, canRepeat) : cache.read(canRepeat);
  }

  private dateutilCursor(generationLimit?: number) {
    if (this.profile !== "dateutil") throw new Error("dateutil query requires a dateutil series");
    return dateutilGenerator(
      this.rules.map(({ inner }) => inner),
      this.exclusionRules.map(({ inner }) => inner),
      this.tzif,
      generationLimit,
      this.dateutilCompatibleStart,
    );
  }

  /** Replay rrule.js 2.8.1 all(). A null entry represents Invalid Date. */
  rruleJsAll({ generationLimit }: { generationLimit?: number } = {}): (DateTime<Utc> | null)[] {
    const result: (DateTime<Utc> | null)[] = [];
    const collect = (event: DateTime<Utc> | null) => {
      if (generationLimit != null && result.length >= generationLimit) {
        throw new RecurrenceExpansionLimitError(generationLimit);
      }
      result.push(event);
      return true;
    };
    this.walkRruleJsQuery(collect, generationLimit, undefined, () => collect(null));
    // RRuleSet sorts with a numeric comparator. Invalid Dates compare as NaN.
    return this.rruleJsStandalone ? result
      : result.sort(compareRruleJsDates);
  }

  /** Replay rrule.js 2.8.1 between() bounds and traversal order. */
  rruleJsBetween(options: RruleJsBetweenQuery & { preserveInvalidDates: true }): (DateTime<Utc> | null)[];
  rruleJsBetween(options: RruleJsBetweenQuery & { preserveInvalidDates?: false }): DateTime<Utc>[];
  rruleJsBetween(options: RruleJsBetweenQuery & { preserveInvalidDates?: boolean }): (DateTime<Utc> | null)[];
  rruleJsBetween({
    after, before, inclusive = false, generationLimit, preserveInvalidDates = false,
  }: RruleJsBetweenQuery & { preserveInvalidDates?: boolean }): (DateTime<Utc> | null)[] {
    const min = after.mse + (inclusive ? 0 : 1);
    const max = before.mse - (inclusive ? 0 : 1);
    const result: (DateTime<Utc> | null)[] = [];
    const add = (event: DateTime<Utc> | null) => {
      if (generationLimit != null && result.length >= generationLimit) {
        throw new RecurrenceExpansionLimitError(generationLimit);
      }
      result.push(event);
      return true;
    };
    this.walkRruleJsQuery((event) => {
      if (event.mse < min) return true;
      if (event.mse > max) return false;
      return add(event);
    }, generationLimit, { after, before }, preserveInvalidDates ? () => add(null) : undefined);
    return this.rruleJsStandalone ? result : result.sort(compareRruleJsDates);
  }

  /** Replay rrule.js 2.8.1 before() for an instant. */
  rruleJsBefore(options: RruleJsNeighborQuery & { preserveInvalidDates: true }): RruleJsExactNeighbor;
  rruleJsBefore(options: RruleJsNeighborQuery & { preserveInvalidDates?: false }): DateTime<Utc> | null;
  rruleJsBefore(options: RruleJsNeighborQuery & { preserveInvalidDates?: boolean }): RruleJsExactNeighbor;
  rruleJsBefore(options: RruleJsNeighborQuery & { preserveInvalidDates?: boolean }): RruleJsExactNeighbor {
    if (options.preserveInvalidDates) return this.rruleJsExactNeighbor(options, "before");
    const { at, inclusive = false, generationLimit } = options;
    const max = at.mse - (inclusive ? 0 : 1);
    let result: DateTime<Utc> | null = null;
    this.walkRruleJsQuery((event) => {
      if (event.mse > max) return false;
      if (generationLimit === 0) throw new RecurrenceExpansionLimitError(0);
      if (this.rruleJsStandalone || result == null || event.mse > result.mse) result = event;
      return true;
    }, generationLimit);
    return result;
  }

  /** Replay rrule.js 2.8.1 after() for an instant. */
  rruleJsAfter(options: RruleJsNeighborQuery & { preserveInvalidDates: true }): RruleJsExactNeighbor;
  rruleJsAfter(options: RruleJsNeighborQuery & { preserveInvalidDates?: false }): DateTime<Utc> | null;
  rruleJsAfter(options: RruleJsNeighborQuery & { preserveInvalidDates?: boolean }): RruleJsExactNeighbor;
  rruleJsAfter(options: RruleJsNeighborQuery & { preserveInvalidDates?: boolean }): RruleJsExactNeighbor {
    if (options.preserveInvalidDates) return this.rruleJsExactNeighbor(options, "after");
    const { at, inclusive = false, generationLimit } = options;
    const min = at.mse + (inclusive ? 0 : 1);
    let result: DateTime<Utc> | null = null;
    this.walkRruleJsQuery((event) => {
      if (event.mse < min) return true;
      if (generationLimit === 0) throw new RecurrenceExpansionLimitError(0);
      if (result == null || event.mse < result.mse) result = event;
      return false;
    }, generationLimit);
    return result;
  }

  private rruleJsExactNeighbor(
    { at, inclusive = false, generationLimit }: RruleJsNeighborQuery,
    direction: "before" | "after",
  ): RruleJsExactNeighbor {
    const prior = direction === "before";
    const cutoff = at.mse + (inclusive ? 0 : prior ? -1 : 1);
    let selected: DateTime<Utc> | null | undefined;
    const results: (DateTime<Utc> | null)[] | undefined = this.rruleJsStandalone ? undefined : [];
    const add = (value: DateTime<Utc> | null) => {
      if (generationLimit === 0) throw new RecurrenceExpansionLimitError(0);
      selected = value;
      results?.push(value);
      return prior;
    };
    this.walkRruleJsQuery((event) => {
      if (prior ? event.mse > cutoff : event.mse < cutoff) return !prior;
      return add(event);
    }, generationLimit, undefined, () => add(null));
    // The numeric comparator treats comparisons with Invalid Date as equal.
    // Selecting a numeric min/max would reorder valid dates across those slots.
    if (results != null) {
      results.sort(compareRruleJsDates);
      selected = prior ? results.at(-1) : results[0];
    }
    return selected === null ? "Invalid Date" : selected ?? null;
  }

  private walkRruleJsQuery(
    accept: (event: DateTime<Utc>) => boolean,
    generationLimit?: number,
    window?: { after: DateTime; before: DateTime },
    acceptInvalid?: () => boolean,
  ): void {
    if (this.profile !== "rrule-js") throw new Error("rrule.js query requires an rrule.js series");
    if (generationLimit != null && (!Number.isSafeInteger(generationLimit) || generationLimit < 0)) {
      throw new RangeError("recurrence generation limit must be a nonnegative safe integer");
    }
    const invalidZone = this.invalidRruleJsTzid == null ? undefined
      : new RangeError("Invalid time zone specified: " + this.invalidRruleJsTzid);
    const libraryEnd = NaiveDate.fromYmd1Exp(10000, 12, 31);
    // An invalid TZID fails when rezoning a candidate, even before the query
    // predicate can discard it as outside the window.
    // Invalid dates survive bounds comparisons even outside the window's UTC days.
    const through = invalidZone == null && window != null && acceptInvalid == null
      ? window.before.toUtc().ndt.date : libraryEnd;
    const { zone, local, instant } = this.start;
    const composition = compositionFor("rrule-js", this.rruleJsHostZone, invalidZone);
    const cursorFor = (rule: Recurrence) => {
      const lines = { ...rule.inner.lines, rdate: undefined, exdate: undefined };
      return new GoogleEventGenerator(
        new Recurrence(new ICalendar.Raw(lines, rule.inner.order)),
        instant,
        zone,
        composition,
        generationLimit,
        local,
      );
    };
    const invalidDate = acceptInvalid != null && zone != null &&
        this.rruleJsWrittenTzid != null && this.rruleJsWrittenTzid.toUpperCase() !== "UTC"
      ? (wall: NaiveDateTime) => !rruleJsCanRezone(wall, zone, this.rruleJsHostZone)
      : () => false;
    if (this.rruleJsStandalone) {
      cursorFor(this.rules[0]).scanRruleJsCandidates(through, (event, wall) =>
        invalidDate(wall) ? acceptInvalid!() : accept(event)
      );
      return;
    }

    const { rdate, exdate } = this.rules[0].inner.lines;
    if (invalidZone && (rdate?.length || exdate?.length)) throw invalidZone;
    const project = (date: NaiveDateTime) => rruleJsDate(date, zone, this.rruleJsHostZone);
    const seen = new Set<number>((exdate ?? []).flatMap((line) =>
      line.dates.flatMap((date) => {
        if (invalidDate(date)) return window == null ? [] : [NaN];
        return [project(date).mse];
      })
    ));
    const narrowExclusions: ((event: DateTime<Utc>) => void)[] = [];
    for (const rule of this.exclusionRules) {
      const cursor = cursorFor(rule);
      if (window != null) {
        // between() scans EXRULE with the original inclusive bounds.
        cursor.scanRruleJsCandidates(through, (event, wall) => {
          if (invalidDate(wall)) {
            seen.add(NaN);
            return true;
          }
          if (event.mse < window.after.mse) return true;
          if (event.mse > window.before.mse) return false;
          seen.add(event.mse);
          return true;
        });
      } else {
        // before() and after() instead run EXRULE.between(at-1ms, at+1ms)
        // for each unseen positive candidate. A projected value is reachable
        // only when the largest value visited on the way to it fits the window.
        const requiredUpper = new Map<number, number>();
        let largest = -Infinity;
        let covered = -Infinity;
        narrowExclusions.push((at) => {
          const end = at.add({ ms: 1 });
          const day = invalidZone == null ? end.ndt.date : libraryEnd;
          if (day.dse > covered) {
            cursor.scanRruleJsCandidates(day, (event, wall) => {
              if (invalidDate(wall)) return true;
              largest = Math.max(largest, event.mse);
              if (!requiredUpper.has(event.mse)) requiredUpper.set(event.mse, largest);
              return true;
            });
            covered = day.dse;
          }
          for (let candidate = at.mse - 1; candidate <= end.mse; ++candidate) {
            if ((requiredUpper.get(candidate) ?? Infinity) <= end.mse) seen.add(candidate);
          }
        });
      }
    }
    const acceptSet = (event: DateTime<Utc>, wall: NaiveDateTime) => {
      if (invalidDate(wall)) {
        // between() puts NaN in the exclusion/dedup hash. The other
        // query kinds pass every invalid slot directly to IterResult.
        if (window != null) {
          if (seen.has(NaN)) return true;
          seen.add(NaN);
        }
        return acceptInvalid!();
      }
      if (seen.has(event.mse)) return true;
      for (const exclude of narrowExclusions) exclude(event);
      if (seen.has(event.mse)) return true;
      seen.add(event.mse);
      return accept(event);
    };
    const dates = (rdate ?? []).flatMap((line) => line.dates);
    dates.sort((a, b) => a.mse - b.mse);
    for (const [index, date] of dates.entries()) {
      // RRuleSet deduplicates encoded RDATEs before their zone conversion.
      if (index > 0 && dates[index - 1].mse === date.mse) continue;
      if (!acceptSet(project(date), date)) break;
    }
    for (const rule of this.rules) {
      if (rule.inner.rrule != null) cursorFor(rule).scanRruleJsCandidates(through, acceptSet);
    }
  }

  /** Replay live starts in a Google events.instances query. */
  async googleCalendarInstances({
    timeMin,
    timeMax,
    duration,
    calendarTimeZone,
    edits = [],
    generationLimit,
  }: {
    timeMin: string;
    timeMax: string;
    duration: Duration.Time;
    calendarTimeZone?: string;
    edits?: readonly GoogleCalendarInstanceEdit[];
    generationLimit?: number;
  }): Promise<(NaiveDate | DateTime<Utc>)[]> {
    if (this.profile !== "google") throw new Error("googleCalendarInstances requires a Google series");
    if (this.start.kind === "floating") {
      throw new Error("Google instances query requires a timezone for timed occurrences");
    }
    const readTimestamp = (value: string) => {
      if (!hasGoogleInstanceOffset(value)) {
        throw new RangeError("Google instances timestamps require an RFC 3339 offset");
      }
      return DateTime.fromRfc3339(value).exp().toUtc();
    };
    const readBound = (value: string) => {
      const whole = value.replace(/\.\d+(?=Z$|[+-]\d{2}:\d{2}$)/i, "");
      if (whole !== value) DateTime.epochFromRfc3339(value).exp();
      return readTimestamp(whole);
    };
    const lower = readBound(timeMin);
    const upper = readBound(timeMax);
    if (lower.mse >= upper.mse) return [];
    if (!Number.isFinite(duration.toMs) || duration.toMs < 0) {
      throw new RangeError("Google instances query requires a nonnegative event duration");
    }

    const allDay = this.start.kind === "date";
    const days = duration.toMs / Time.MS_PER_DAY;
    if (allDay && (!Number.isInteger(days) || days < 1)) {
      throw new RangeError("Google instances query requires a whole-day duration for all-day events");
    }
    const zone = allDay && calendarTimeZone != null ? await resolveGoogleDateTimezone(calendarTimeZone) : null;
    if (allDay && zone == null) {
      throw new Error("Google instances query requires the calendar timezone for all-day events");
    }
    const midnight = (date: NaiveDate) => zone!.toRfc5545WallClock(date.withTime()).mse;
    // Google includes a timed point at the lower bound, including a moved point.
    const overlaps = (startMse: number, endMse: number) =>
      startMse < upper.mse &&
      (!allDay && startMse === endMse ? startMse >= lower.mse : endMse > lower.mse);
    const readInstance = (value: RecurrenceStart) => {
      if ("date" in value && allDay) return NaiveDate.parse(value.date);
      if ("dateTime" in value && !allDay) return readTimestamp(value.dateTime);
      throw new Error("Google instance edit must match the series date or time form");
    };
    const slots = new Set<number>();
    const replacements: { slot: number; start: NaiveDate | DateTime<Utc> }[] = [];
    for (const edit of edits) {
      const original = readInstance(edit.originalStartTime);
      const slot = original instanceof DateTime ? original.mse : original.dse;
      if (slots.has(slot)) throw new Error("Duplicate Google instance edit slot");
      slots.add(slot);
      if (edit.status === "cancelled") continue;
      const start = readInstance(edit.start);
      const end = readInstance(edit.end);
      const startMse = start instanceof DateTime ? start.mse : midnight(start);
      const endMse = end instanceof DateTime ? end.mse : midnight(end);
      if (endMse < startMse) throw new RangeError("Google instance edit end precedes start");
      if (overlaps(startMse, endMse)) replacements.push({ slot, start });
    }

    const through = upper.ndt.date.addDays(allDay ? 1 : 0);
    let occurrences: RecurrenceOccurrence[] | undefined;
    if (!allDay && generationLimit == null && upper.mse <= GOOGLE_LAST_RECURRENCE.mse) {
      // Plain UTC daily rules can jump to the first possible overlap day.
      const firstDay = Math.floor((lower.mse - duration.toMs) / Time.MS_PER_DAY);
      occurrences = this.collectUtcOccurrences(through, firstDay);
    }
    if (occurrences == null) {
      // Google stops its query as it encounters the upper bound in trial order.
      // All-day candidates traverse in the calendar's wall-time frame.
      const stopAfter = zone == null ? upper.mse : zone.toTz(upper).ndt.mse;
      const wallLower = zone == null ? lower.mse : zone.toTz(lower).ndt.mse;
      const cursor = this.createGenerator(generationLimit, {
        stopAfter,
        includesRdate: (start, keepClock = false) => {
          if (zone == null) return overlaps(start, start + duration.toMs);
          // All-day occurrences enter the query on the calendar's wall-time
          // axis. Timed RDATEs retain their clock here, before display uses midnight.
          const wallStart = keepClock ? start : NaiveDateTime.fromMse(start as MsSinceEpoch).date.mse;
          return wallStart < stopAfter && wallStart + duration.toMs > wallLower;
        },
      });
      occurrences = cursor.generateUpToDate(through);
    }
    const starts: (NaiveDate | DateTime<Utc>)[] = [];
    if (allDay) {
      let lastDate: NaiveDate | undefined;
      let lastStart = Infinity;
      let followingStart = Infinity;
      for (let index = occurrences.length - 1; index >= 0; index--) {
        const date = occurrences[index];
        if (!("addDays" in date)) continue;
        if (date.dse !== lastDate?.dse) {
          followingStart = lastStart;
          lastStart = midnight(date);
          lastDate = date;
        }
        if (slots.has(date.dse)) continue;
        const elapsedEnd = lastStart + duration.toMs;
        const civilEnd = midnight(date.addDays(days));
        // If the next expanded slot overlaps the nominal span, Google
        // uses the elapsed cutoff. Instance edits do not change that neighbor.
        const endMse = followingStart < elapsedEnd ? elapsedEnd : Math.min(civilEnd, elapsedEnd);
        if (overlaps(lastStart, endMse)) starts.push(date);
      }
      starts.reverse();
    } else {
      for (const date of occurrences) {
        if (date instanceof DateTime && !slots.has(date.mse) && overlaps(date.mse, date.mse + duration.toMs)) {
          starts.push(date);
        }
      }
    }
    // The endpoint appends exceptions in original-slot order.
    replacements.sort((a, b) => a.slot - b.slot);
    for (const { start } of replacements) starts.push(start);
    return starts;
  }

  /** Replay the displayed UTC starts in a Graph calendarView window. */
  graphCalendarView({ start, end, duration, allDaySelection, edits = [], generationLimit }: {
    start: DateTime | string;
    end: DateTime | string;
    duration?: Duration.Time;
    /** Local selection clocks on the start and end dates of regular all-day slots. */
    allDaySelection?: { startTime: NaiveTime; endTime: NaiveTime };
    edits?: readonly GraphCalendarViewEdit[];
    generationLimit?: number;
  }): DateTime<Utc>[] {
    if (this.graphTimezones == null) throw new Error("graphCalendarView requires an Outlook series");
    const { graphSamoaGenerator, graphSamoaSelectionMse, graphViewBounds, graphViewOverlaps, resolveGraphWallTime } = this.graphTimezones;
    const { endDay, ...bounds } = graphViewBounds(start, end);
    const durationMs = duration?.toMs ?? this.graphViewWallDurationMs;
    if (durationMs == null) throw new Error("Graph calendarView requires a series duration");
    const allDay = this.start.kind === "date";
    if (allDaySelection != null && !allDay) {
      throw new RangeError("Graph calendarView allDaySelection requires an all-day series");
    }
    const days = durationMs / Time.MS_PER_DAY;
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      throw new RangeError("Graph calendarView requires a nonnegative event duration");
    }
    if (allDay && (!Number.isInteger(days) || days < 1)) {
      throw new RangeError("Graph calendarView requires a whole-day duration for all-day events");
    }
    const zone = this.graphAllDayZone;
    if (allDay && zone == null) throw new Error("Graph calendarView requires an all-day recurrence timezone");
    const selectionMse = (date: NaiveDate, time?: NaiveTime) => {
      const wall = date.withTime(time);
      return this.graphSamoa != null
        ? graphSamoaSelectionMse(this.graphSamoa, wall)
        : resolveGraphWallTime(zone!, wall).mse;
    };
    const allDaySpan = (date: NaiveDate) => [
      selectionMse(date, allDaySelection?.startTime),
      selectionMse(date.addDays(days), allDaySelection?.endTime),
    ] as const;
    const excludedSlots = new Set<number>();
    const view = {
      ...bounds,
      durationMs,
      excludedSlots,
      allDaySelection: allDaySelection == null ? undefined : allDaySpan,
    };
    const starts: DateTime<Utc>[] = [];
    for (const { originalSlot, replacement } of edits) {
      if ((originalSlot instanceof DateTime) === allDay) {
        throw new Error("Graph edit slot must match the series date or time form");
      }
      const key = originalSlot instanceof DateTime ? originalSlot.mse : originalSlot.dse;
      if (excludedSlots.has(key)) throw new Error("Duplicate Graph edit slot");
      excludedSlots.add(key);
      if (replacement == null) continue;

      const { start: first, end: last, selection } = replacement;
      if (last.mse < first.mse || (selection != null && selection.end.mse < selection.start.mse)) {
        throw new RangeError("Graph edit end precedes start");
      }
      if (allDay && !(first instanceof DateTime) && !(last instanceof DateTime)) {
        if (graphViewOverlaps(view, selection?.start.mse ?? selectionMse(first), selection?.end.mse ?? selectionMse(last))) {
          starts.push(first.withTime().asUtc());
        }
      } else if (!allDay && first instanceof DateTime && last instanceof DateTime) {
        if (graphViewOverlaps(view, selection?.start.mse ?? first.mse, selection?.end.mse ?? last.mse)) {
          starts.push(first.toUtc());
        }
      } else {
        throw new Error("Graph edit replacement must match the series date or time form");
      }
    }
    const hasReplacements = starts.length > 0;
    // The latest all-day candidate can be tomorrow in a positive-offset zone.
    const through = endDay.addDays(allDay ? 1 : 0);
    // UTC wall-clock and elapsed arithmetic agree when both additions are exact.
    const utcDates = duration == null && generationLimit == null &&
        Number.isSafeInteger(durationMs) &&
        Number.isSafeInteger(this.start.local.time.toMs + durationMs) &&
        Number.isSafeInteger(this.start.instant.mse) &&
        Number.isSafeInteger(through.mse + Time.MS_PER_DAY + durationMs)
      ? this.collectUtcOccurrences(through)
      : undefined;
    if (utcDates != null) {
      // The canonical UTC clock gives the same end from wall or elapsed arithmetic.
      for (const date of utcDates) {
        if (!excludedSlots.has(date.mse) && graphViewOverlaps(view, date.mse)) starts.push(date);
      }
    } else if (this.graphSamoa != null) {
      const dates = graphSamoaGenerator(
        this.rules[0].inner.rrule!,
        this.start.local,
        this.graphSamoa,
        allDay,
        generationLimit,
        view,
      ).generateUpToDate(through);
      for (const date of dates) {
        starts.push(date instanceof DateTime ? date : date.withTime().asUtc());
      }
    } else if (duration == null && this.start.zone != null) {
      // A shifted start still uses the rule's original local clock to place its end.
      const policy = compositionFor("outlook", undefined, undefined, this.graphResolveWallTime);
      const cursor = this.buildGenerator(this.rules[0], policy, generationLimit, true);
      const resolve = this.graphResolveWallTime ?? resolveGraphWallTime;
      for (const { instant, wall } of cursor.generateOccurrencesUpToDate(through)) {
        if (wall == null || excludedSlots.has(instant.mse)) continue;
        const last = resolve(this.start.zone, wall.add({ ms: durationMs }), this.start.instant);
        if (graphViewOverlaps(view, instant.mse, Math.max(instant.mse, last.mse))) starts.push(instant);
      }
    } else {
      for (const date of this.occurrences({ through, generationLimit })) {
        if (date instanceof DateTime) {
          if (!excludedSlots.has(date.mse) && graphViewOverlaps(view, date.mse)) starts.push(date);
        } else if ("addDays" in date && !excludedSlots.has(date.dse)) {
          const [selectedStart, selectedEnd] = allDaySpan(date);
          if (graphViewOverlaps(view, selectedStart, selectedEnd)) {
            starts.push(date.withTime().asUtc());
          }
        }
      }
    }
    return hasReplacements ? starts.sort((a, b) => a.mse - b.mse) : starts;
  }

  /** Incrementally expand a timed Google series and expose its timed master-slot decision. */
  googleTimedGenerator(generationLimit?: number): {
    readonly startDateExcluded: boolean;
    generateUpToDate(through: NaiveDate): DateTime<Utc>[];
  } {
    if (this.profile !== "google" || this.start.kind !== "instant") {
      throw new Error("googleTimedGenerator requires a timed Google series");
    }
    const cursor = this.generator(generationLimit);
    return {
      get startDateExcluded() {
        return "startDateExcluded" in cursor && cursor.startDateExcluded === true;
      },
      generateUpToDate: (through: NaiveDate): DateTime<Utc>[] =>
        cursor.generateUpToDate(through) as DateTime<Utc>[],
    };
  }

  /** Read successive inclusive date windows without restarting expansion. */
  generator(generationLimit?: number): {
    readonly startDateExcluded?: boolean;
    generateUpToDate(through: NaiveDate): RecurrenceOccurrence[];
  } {
    const cursor = this.createGenerator(generationLimit);
    if (this.profile !== "rfc5545") return cursor;
    const coverageEnd = recurrenceCoverageEnd(this.rules[0].inner.lines, this.start.zone);
    if (coverageEnd === Infinity) return cursor;
    return {
      generateUpToDate(through: NaiveDate): RecurrenceOccurrence[] {
        requireRecurrenceCoverage(through, coverageEnd);
        return cursor.generateUpToDate(through);
      },
    };
  }

  private createGenerator(generationLimit?: number, googleQuery?: {
    stopAfter: number;
    includesRdate: (mse: number, keepClock?: boolean) => boolean;
  }, googleFallback?: GoogleFallbackScan): {
    readonly startDateExcluded?: boolean;
    generateUpToDate(through: NaiveDate): RecurrenceOccurrence[];
  } {
    if (this.graphSamoa != null) {
      return this.graphTimezones!.graphSamoaGenerator(
        this.rules[0].inner.rrule!,
        this.start.local,
        this.graphSamoa,
        this.start.kind === "date",
        generationLimit,
      );
    }
    const toOccurrence = (instance: DateTime<Utc>): RecurrenceOccurrence =>
      this.start.kind === "date" ? instance.ndt.date
        : this.start.kind === "floating" ? instance.ndt
        : instance;
    if (this.profile === "dateutil") {
      const useDateKind = this.start.kind === "date" &&
        (this.rules[0].inner.rrule != null || this.exclusionRules.length !== 0 ||
          this.dateutilCompatibleStart != null);
      const startIsAware = dateutilStartIsAware(this.rules[0].inner);
      const cursor = this.dateutilCursor(generationLimit);
      return {
        generateUpToDate: (through: NaiveDate) =>
          cursor.generateUpToDate(through).map(({ instant, aware, hasTime }) => {
            if (useDateKind && !hasTime && aware === startIsAware) return instant.ndt.date;
            return aware ? instant : instant.ndt;
          }),
      };
    }
    const invalidZone = this.invalidRruleJsTzid == null ? undefined
      : new RangeError("Invalid time zone specified: " + this.invalidRruleJsTzid);
    const dates = this.rules[0].inner.lines;
    if (invalidZone && (dates.rdate?.length || dates.exdate?.length)) {
      // rrule.js rezones the explicit date lists before walking the rules.
      return { generateUpToDate: (_through: NaiveDate): RecurrenceOccurrence[] => {
        throw invalidZone;
      } };
    }
    let composition = compositionFor(
      this.profile,
      this.rruleJsHostZone,
      invalidZone,
      this.graphResolveWallTime,
    );
    const { zone, local, instant } = this.start;
    if (googleFallback) composition = { ...composition, lastRecurrenceInstant: undefined };
    if (this.profile === "rfc5545" && zone != null &&
      zone.toRfc5545WallClock(local).mse < instant.mse) {
      // An explicit external offset can select the later occurrence in a fold.
      // Keep that side of the initial overlap while the RFC instant is earlier
      // than the bound start. Later transitions use ordinary RFC resolution.
      composition = {
        ...composition,
        resolveWallTime: (zone, wall, start) => zone.toRfc5545WallClock(wall, start.mse),
      };
    }
    const wrappedGoogle = (rule: Recurrence) =>
      this.profile === "google" && rule.inner.rrule?.inner.options?.googleYearlyDayWrap === true;
    const build = (rule: Recurrence, policy: RecurrenceComposition) =>
      this.buildGenerator(rule, wrappedGoogle(rule) ? { ...policy, scanGoogleYearlyHorizon: true } : policy, generationLimit);
    if (this.profile === "rfc5545") {
      const raw = this.rules[0].inner;
      const { rdate, exdate, ...ruleLines } = raw.lines;
      if (this.preserveRfcDateForms && (rdate?.length || exdate?.length)) {
        const exclusions = filterDateLineValues(exdate ?? [], (kind) => kind === this.start.kind);
        const rule = build(
          new Recurrence(new ICalendar.Raw({ ...ruleLines, exdate: exclusions }, raw.order)),
          composition,
        );
        return rfcDateSetGenerator(
          rdate ?? [],
          exdate ?? [],
          (through) => rule.generateUpToDate(through).map(toOccurrence),
          generationLimit,
        );
      }
      if (
        this.start.kind === "instant" && zone == null && local.mse === instant.mse &&
        generationLimit == null && this.rules.length === 1 &&
        this.exclusionRules.length === 0 && raw.rrule != null && !rdate?.length && !exdate?.length
      ) {
        // The generator already returns this UTC rule in instant order with unique keys.
        const cursor = build(this.rules[0], composition);
        return { generateUpToDate: (through: NaiveDate) => cursor.generateUpToDate(through) };
      }
    }
    if (this.rruleJsStandalone) {
      const cursor = build(this.rules[0], { ...composition, preserveRruleJsDuplicates: true });
      return {
        generateUpToDate: (through: NaiveDate) => cursor.generateUpToDate(through).map(toOccurrence),
      };
    }
    const google = this.profile === "google";
    const allDay = this.start.kind === "date";
    const mainKind = (kind: string) => (kind === "date") === allDay;
    // Google EXRULE selects matching rule instances at their own wall times.
    const exclusionComposition = google
      ? {
        ...RecurrenceComposition.RULE_ONLY,
        googleSkipRewoundExclusions: true,
        lastRecurrenceInstant: composition.lastRecurrenceInstant,
        resolveWallTime: composition.resolveWallTime,
      }
      : this.profile === "rrule-js"
      ? { ...composition, rruleJsExruleWindow: true }
      : composition;
    // Google matches exclusions within each value type before merging
    // equal instants. Explicit civil dates in a timed series use UTC midnight.
    const alternateKind = (kind: string) => !mainKind(kind);
    const alternateRdates = google ? filterDateLineValues(dates.rdate ?? [], alternateKind) : [];
    const midnight = new NaiveDateTime(local.date);
    const alternate = alternateRdates.length === 0 ? null : new GoogleEventGenerator(
      new Recurrence(new ICalendar.Raw({
        rdate: alternateRdates,
        exdate: filterDateLineValues(dates.exdate ?? [], alternateKind),
      }, this.rules[0].inner.order)),
      allDay ? instant : midnight.asUtc(),
      allDay ? zone : null,
      { ...composition, dtstartAlwaysInstance: false, includeStartWithoutRule: false },
      generationLimit,
      allDay ? local : midnight,
    );
    const hasWrappedRule = this.rules.some(wrappedGoogle);
    const fallbackAfter = google ? composition.lastRecurrenceInstant : undefined;
    const alternateOverlaps = (allDay || hasWrappedRule) && googleQuery != null &&
      alternate?.hasRdate(start => googleQuery.includesRdate(start, true));
    const hasOrdinalRewind = this.rules.some(rule => rule.inner.rrule?.inner.options?.googleYearlyOrdinalRewind);
    // EXRULE must be able to reject the initial late trial before it stops a query.
    const wrappedExclusionPolicy = hasOrdinalRewind
      ? { ...exclusionComposition, lastRecurrenceInstant: undefined }
      : exclusionComposition;
    const wrappedExclusions = hasWrappedRule ? this.exclusionRules.map(rule => build(rule, wrappedExclusionPolicy)) : [];
    const excludedStarts = new Set<number>();
    let exclusionsThrough: NaiveDate | undefined;
    const googleExcludedByRule = wrappedExclusions.length === 0 ? undefined : (instant: DateTime<Utc>) => {
      const day = instant.ndt.date;
      if (exclusionsThrough == null || day.dse > exclusionsThrough.dse) {
        for (const exclusion of wrappedExclusions) {
          for (const match of exclusion.generateUpToDate(day)) excludedStarts.add(match.mse);
        }
        exclusionsThrough = day;
      }
      return excludedStarts.has(instant.mse);
    };
    const inclusionComposition = fallbackAfter == null ? composition : {
      ...composition,
      googleSelectFallback: true,
      googleHasEarlyAlternateRdate: hasOrdinalRewind &&
        alternate?.hasRdate(mse =>
          mse <= fallbackAfter.mse && !googleExcludedByRule?.(NaiveDateTime.fromMse(mse as MsSinceEpoch).asUtc())
        ),
    };
    const generators = this.rules.map((rule) => {
      const inTrialOrder = wrappedGoogle(rule);
      if (!google) return { cursor: build(rule, composition), inTrialOrder };
      const raw = rule.inner;
      const rdate = filterDateLineValues(raw.lines.rdate ?? [], mainKind);
      const exdate = filterDateLineValues(raw.lines.exdate ?? [], mainKind);
      const policy = inTrialOrder
        ? {
          ...inclusionComposition,
          googleQueryStopAfter: alternateOverlaps ? undefined : googleQuery?.stopAfter,
          googleQueryIncludesRdate: alternateOverlaps ? undefined : googleQuery?.includesRdate,
          googleExcludedByRule,
        }
        : inclusionComposition;
      const recurring = new Recurrence(new ICalendar.Raw({ ...raw.lines, rdate, exdate }, raw.order));
      return { cursor: build(recurring, policy), inTrialOrder };
    });
    if (googleFallback != null) {
      const record = (mse: number) => {
        googleFallback.explicitDays.add(Math.floor(mse / Time.MS_PER_DAY));
        return false;
      };
      alternate?.hasRdate(record);
      for (const { cursor } of generators) cursor.hasRdate(record);
    }
    const exclusions = generators.some(({ inTrialOrder }) => !inTrialOrder)
      ? this.exclusionRules.map(rule => build(rule, exclusionComposition))
      : [];
    const dedupCivilDays = allDay && this.profile !== "rrule-js" && !google;
    let total = 0;
    let failure: Error | undefined;
    let startDateExcluded = google && generators[0].cursor.startDateExcluded;
    let hasCappedOccurrence = false;
    let fallback: ReturnType<RecurrenceSeries["googleFallbackGenerator"]> | undefined;
    return {
      get startDateExcluded() {
        return startDateExcluded;
      },
      generateUpToDate: (through: NaiveDate): RecurrenceOccurrence[] => {
        if (failure != null) throw failure;
        if (fallback != null) {
          const occurrences = fallback.generateUpToDate(through);
          startDateExcluded ||= fallback.startDateExcluded === true;
          return occurrences;
        }
        const instances = new Map<number | string, DateTime<Utc>>();
        const alternateStarts = googleFallback == null ? undefined : new Set<number>();
        try {
          let lastPositiveDay: NaiveDate | undefined;
          // Wrapped rules already applied EXRULE in trial order. Keep those
          // results out of the ordinary streams' chronological subtraction.
          const wrapped = exclusions.length > 0 && googleExcludedByRule != null
            ? new Map<number | string, DateTime<Utc>>()
            : undefined;
          for (const { cursor, inTrialOrder } of generators) {
            for (const { instant: instance, key } of cursor.generateOccurrencesUpToDate(through)) {
              if (inTrialOrder && wrapped != null) {
                wrapped.set(key, instance);
                continue;
              }
              instances.set(dedupCivilDays ? instance.ndt.date.dse : key, instance);
              const day = instance.ndt.date;
              if (lastPositiveDay == null || day.dse > lastPositiveDay.dse) {
                lastPositiveDay = day;
              }
              if (
                generationLimit != null &&
                total + instances.size > generationLimit
              ) {
                throw new RecurrenceExpansionLimitError(generationLimit);
              }
            }
          }
          if (lastPositiveDay != null) {
            for (const exclusion of exclusions) {
              for (const { instant, key } of exclusion.generateOccurrencesUpToDate(lastPositiveDay)) {
                const removed = instances.delete(dedupCivilDays ? instant.ndt.date.dse : key);
                if (google && removed && key === this.start.instant.mse) startDateExcluded = true;
              }
            }
          }
          if (google && generators[0].cursor.startDateExcluded) startDateExcluded = true;
          for (const [key, instance] of wrapped ?? []) {
            instances.set(key, instance);
            if (generationLimit != null && total + instances.size > generationLimit) {
              throw new RecurrenceExpansionLimitError(generationLimit);
            }
          }
          if (alternate != null) {
            // Once any occurrence enters an all-day query, Google considers
            // the other timed RDATEs by their displayed dates.
            let includeAlternate = !allDay || googleQuery == null || alternateOverlaps === true;
            if (!includeAlternate && googleQuery != null) {
              for (const instance of instances.values()) {
                if (googleQuery.includesRdate(instance.mse)) {
                  includeAlternate = true;
                  break;
                }
              }
            }
            const explicit = alternate.generateUpToDate(through);
            hasCappedOccurrence ||= fallbackAfter != null && explicit.length > 0;
            if (includeAlternate) {
              for (const instance of explicit) {
                if (!instances.has(instance.mse)) alternateStarts?.add(instance.mse);
                instances.set(instance.mse, instance);
              }
            }
            if (generationLimit != null && total + instances.size > generationLimit) {
              throw new RecurrenceExpansionLimitError(generationLimit);
            }
          }
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          throw failure;
        }
        if (!hasCappedOccurrence && fallbackAfter != null) {
          for (const instance of instances.values()) {
            if (fallbackAfter.isBefore(instance)) continue;
            hasCappedOccurrence = true;
            break;
          }
        }
        if (!hasCappedOccurrence && fallbackAfter != null && through.dse > fallbackAfter.ndt.date.dse) {
          fallback = this.googleFallbackGenerator(fallbackAfter.ndt.date.addDays(1), generationLimit, googleQuery);
          const occurrences = fallback.generateUpToDate(through);
          startDateExcluded ||= fallback.startDateExcluded === true;
          return occurrences;
        }
        total += instances.size;
        const ordered = [...instances.values()].sort((a, b) => a.mse - b.mse);
        if (googleFallback != null) {
          const first = ordered.find(instance => instance.ndt.date.dse >= googleFallback.firstDay.dse);
          googleFallback.hasPending = generators.some(({ cursor }) => cursor.hasPendingOccurrences) ||
            alternate?.hasPendingOccurrences === true;
          googleFallback.first = first == null ? undefined
            : { instant: first, alternate: alternateStarts!.has(first.mse) };
          return first == null ? [] : [toOccurrence(first)];
        }
        return ordered.map(toOccurrence);
      },
    };
  }

  private googleFallbackGenerator(
    firstDay: NaiveDate,
    generationLimit: number | undefined,
    query: { includesRdate: (mse: number, keepClock?: boolean) => boolean } | undefined,
  ) {
    // Select the earliest surviving slot before applying the query window.
    const masterDay = this.start.instant.ndt.date;
    const scan: GoogleFallbackScan = { explicitDays: new Set([masterDay.dse]), firstDay, hasPending: true };
    const cursor = this.createGenerator(generationLimit, undefined, scan);
    const explicitDays = [...scan.explicitDays].filter(day => day >= firstDay.dse).sort((a, b) => a - b);
    const hasRule = this.rules.some(rule => rule.inner.rrule != null);
    const rewinds = (rule: Recurrence) => rule.inner.rrule?.inner.options?.googleYearlyOrdinalRewind === true;
    const onlyRewindingRules = this.rules.every(rewinds);
    const firstRuleDay = this.rules.some(rewinds) ? firstDay.dse : Math.max(firstDay.dse, masterDay.dse);
    let explicitIndex = 0;
    let next = Math.min(explicitDays[0] ?? Infinity, hasRule ? firstRuleDay : Infinity);
    return {
      get startDateExcluded() {
        return cursor.startDateExcluded;
      },
      generateUpToDate: (through: NaiveDate): RecurrenceOccurrence[] => {
        while (scan.hasPending && next <= through.dse) {
          // Wrapped yearly streams buffer their finite trials in UTC order.
          // Read the window once when there is no ordinary rule to scan by day.
          const day = onlyRewindingRules ? through : firstDay.addDays(next - firstDay.dse);
          const [first] = cursor.generateUpToDate(day);
          if (first != null) {
            next = Infinity;
            if (this.start.kind === "date" && scan.first?.alternate &&
              query != null && !query.includesRdate(scan.first.instant.mse, true)) {
              return [];
            }
            return [first];
          }
          if (onlyRewindingRules) return [];
          if (hasRule && next >= firstRuleDay) {
            next++;
          } else {
            next = Math.min(explicitDays[++explicitIndex] ?? Infinity, hasRule ? firstRuleDay : Infinity);
          }
        }
        return [];
      },
    };
  }

  private buildGenerator(
    rule: Recurrence,
    policy: RecurrenceComposition,
    generationLimit?: number,
    preserveRuleWallTime = false,
  ) {
    return new GoogleEventGenerator(
      rule,
      this.start.instant,
      this.start.zone,
      policy,
      generationLimit,
      this.start.local,
      preserveRuleWallTime,
    );
  }

  static async read(
    source: readonly string[],
    options: ICalendarRecurrenceOptions = {},
  ): Promise<Result<RecurrenceSeries>> {
    try {
      const {
        profile = "rfc5545",
        dtstart: inputStart,
        dtend,
        googleStartMode,
        googleTimeZoneFallback,
        rfcDateMode,
        rfcTimeZone,
        dateutilTzif,
        dateutilTzids,
        dateutilHost,
        dateutilWeekStart,
        dateutilParserYear,
        dateutilUnfold,
        dateutilCompatible,
        dateutilCache,
        rruleJsHostTimeZone,
        rruleJsUnfold,
        rruleJsCompatible,
        rruleJsForceSet,
      } = options;
      let dtstart: RecurrenceStart | undefined;
      if (inputStart != null) {
        dtstart = "date" in inputStart ? { date: inputStart.date }
          : { dateTime: inputStart.dateTime, timeZone: inputStart.timeZone };
      }
      if (profile === "google" && googleStartMode !== "stored" && dtstart != null && "dateTime" in dtstart) {
        const fraction = /(T\d{2}:\d{2}:\d{2})\.(\d+)(?=Z|[+-]|$)/i;
        const fractionOf = (value: string) => fraction.exec(value)?.[2] ?? "";
        const startFraction = fractionOf(dtstart.dateTime);
        const endFraction = dtend != null && "dateTime" in dtend
          ? fractionOf(dtend.dateTime)
          : undefined;
        if (startFraction.length > 9 || (endFraction?.length ?? 0) > 9) {
          return err(new Error("Google recurring event timestamps allow at most nine fractional digits"));
        }
        if (endFraction != null) {
          const millis = (value: string) => value.slice(0, 3).padEnd(3, "0");
          if (millis(startFraction) !== millis(endFraction)) {
            return err(new Error("Google recurring event duration must be a whole number of seconds"));
          }
        }
        // The Calendar API stores accepted recurring start clocks at whole seconds.
        dtstart = { ...dtstart, dateTime: dtstart.dateTime.replace(fraction, "$1") };
      }
      return await RecurrenceSeries.readLines(
        source,
        profile,
        dtstart,
        {
          googleStartMode: profile === "google" ? googleStartMode : undefined,
          googleTimeZoneFallback: profile === "google" ? googleTimeZoneFallback : undefined,
          rfcTimeZone: profile === "rfc5545" ? rfcTimeZone : undefined,
          preserveRfcDateForms: profile === "rfc5545" && rfcDateMode === "written",
          readTzif: profile === "dateutil" ? dateutilTzif : undefined,
          dateutilTzids: profile === "dateutil" ? dateutilTzids : undefined,
          dateutilHost: profile === "dateutil" ? dateutilHost : undefined,
          dateutilWeekStart: profile === "dateutil" ? dateutilWeekStart : undefined,
          dateutilParserYear: profile === "dateutil" ? dateutilParserYear : undefined,
          dateutilUnfold: profile === "dateutil" ? dateutilCompatible || dateutilUnfold : undefined,
          dateutilCompatible: profile === "dateutil" && dateutilCompatible === true,
          dateutilCache: profile === "dateutil" && dateutilCache === true,
          rruleJsHostTimeZone: profile === "rrule-js" ? rruleJsHostTimeZone : undefined,
          rruleJsUnfold: profile === "rrule-js"
            ? rruleJsUnfold ?? (rruleJsCompatible == null && rruleJsForceSet == null ? undefined : false)
            : undefined,
          rruleJsCompatible: profile === "rrule-js" ? rruleJsCompatible : undefined,
          rruleJsForceSet: profile === "rrule-js" ? rruleJsForceSet : undefined,
        },
      );
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /** Native Graph patterns are normalized before reaching the shared generator. */
  static async readGraph(
    rule: string,
    start: RecurrenceStart,
    graphSamoa?: TimezoneRegion,
    graphRecurrenceZone?: TimezoneRegion,
    graphResolveWallTime?: RecurrenceComposition["resolveWallTime"],
    graphViewWallDurationMs?: number,
  ): Promise<Result<RecurrenceSeries>> {
    const graphTimezones = await import("./graph-timezones.ts");
    return await RecurrenceSeries.readLines([rule], "outlook", start, {
      graphSamoa,
      graphRecurrenceZone,
      graphResolveWallTime: graphResolveWallTime ?? graphTimezones.resolveGraphWallTime,
      graphViewWallDurationMs,
      graphTimezones,
    });
  }

  static [readBoundGraphSeries](
    rule: string,
    start: BoundStart,
    graphTimezones: GraphTimezones,
    graphSamoa?: TimezoneRegion,
    graphRecurrenceZone?: TimezoneRegion,
    graphResolveWallTime?: RecurrenceComposition["resolveWallTime"],
    graphViewWallDurationMs?: number,
  ): Result<RecurrenceSeries> {
    const parsed = profileRule(rule, "outlook").raw.resolve();
    if (parsed.isErr) return err(Error("failed to parse rrule", parsed.expe()));
    const date = start.kind === "date";
    const dtstart = new ICalDateLine(
      "DTSTART", [start.local], start.zone ?? undefined, date ? "DATE" : undefined,
      null, [{ timed: !date, utc: false }],
    );
    const recurrence = new Recurrence(new ICalendar.Raw({ rrule: parsed.exp(), dtstart }));
    return ok(new RecurrenceSeries(
      "outlook", start, [recurrence], [], new Map(), graphSamoa,
      undefined, undefined, graphResolveWallTime ?? graphTimezones.resolveGraphWallTime, undefined,
      false, date ? graphRecurrenceZone : undefined, undefined, undefined, graphViewWallDurationMs,
      undefined, undefined, false, graphTimezones,
    ));
  }

  /** Bind an unparameterized UTC start and an independent scalar rule. */
  private static readScalarRruleJs(source: readonly string[]): RecurrenceSeries | undefined {
    const first = source[0];
    const second = source[1];
    if (typeof first !== "string" || typeof second !== "string") return;
    const startFirst = first.startsWith("DTSTART:");
    const start = startFirst ? first : second;
    const line = startFirst ? second : first;
    if (start.length !== 24 || !line.startsWith("RRULE:")) return;
    const parts = /^DTSTART:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)$/.exec(start);
    if (parts == null) return;
    // rrule.js can coerce invalid or fractional scalars. Use its general reader for those.
    const rrule = parseScalarRule(line, true);
    if (rrule == null) return;
    const options = rrule.inner.options!;
    options.rruleJsClock = true;
    options.rruleJsHostZone = undefined;
    const local = decodeRruleJsWall(parts);
    const dtstart = new ICalDateLine(
      "DTSTART", [local], undefined, undefined, null, [{ timed: true, utc: true }],
    );
    const recurrence = new Recurrence(new ICalendar.Raw({ dtstart, rrule }));
    return new RecurrenceSeries("rrule-js", { local, instant: local.asUtc(), zone: null, kind: "instant" },
      [recurrence], [], new Map());
  }

  private static async readLines(
    inputLines: readonly string[],
    profile: RecurrenceProfile,
    external: RecurrenceStart | undefined,
    {
      readTzif,
      dateutilTzids,
      rfcTimeZone,
      preserveRfcDateForms = false,
      googleStartMode,
      googleTimeZoneFallback,
      dateutilHost,
      dateutilImplicitUntil,
      dateutilWeekStart,
      dateutilParserYear,
      dateutilUnfold,
      dateutilCompatible,
      dateutilCache,
      graphSamoa,
      graphRecurrenceZone,
      graphResolveWallTime,
      graphViewWallDurationMs,
      graphTimezones,
      rruleJsHostTimeZone,
      rruleJsUnfold,
      rruleJsCompatible,
      rruleJsForceSet,
    }: {
      dateutilHost?: DateutilHost;
      dateutilImplicitUntil?: Pick<NormalizedRule, "untilOffsetMs" | "untilLocal">;
      dateutilWeekStart?: Weekday;
      dateutilParserYear?: number;
      dateutilUnfold?: boolean;
      dateutilCompatible?: boolean;
      dateutilCache?: boolean;
      readTzif?: ICalendarRecurrenceOptions["dateutilTzif"];
      dateutilTzids?: ICalendarRecurrenceOptions["dateutilTzids"];
      rfcTimeZone?: ICalendarRecurrenceOptions["rfcTimeZone"];
      preserveRfcDateForms?: boolean;
      googleStartMode?: ICalendarRecurrenceOptions["googleStartMode"];
      googleTimeZoneFallback?: ICalendarRecurrenceOptions["googleTimeZoneFallback"];
      graphSamoa?: TimezoneRegion;
      graphRecurrenceZone?: TimezoneRegion;
      graphResolveWallTime?: RecurrenceComposition["resolveWallTime"];
      graphViewWallDurationMs?: number;
      graphTimezones?: GraphTimezones;
      rruleJsHostTimeZone?: string;
      rruleJsUnfold?: boolean;
      rruleJsCompatible?: boolean;
      rruleJsForceSet?: boolean;
    },
  ): Promise<Result<RecurrenceSeries>> {
    try {
      if (profile === "rrule-js" && external == null && rruleJsHostTimeZone == null &&
        rruleJsCompatible == null && rruleJsForceSet == null && inputLines.length === 2) {
        const simple = RecurrenceSeries.readScalarRruleJs(inputLines);
        if (simple != null) return ok(simple);
      }
      // Library profiles inspect the original spelling after asynchronous zone
      // reads. Capture it before normalization and the first suspension.
      const source = profile === "dateutil" || profile === "rrule-js" ? inputLines.slice() : inputLines;
      let lines = profile === "dateutil" || profile === "rrule-js"
        ? libraryRecurrenceContentLines(source, profile, profile === "dateutil" ? dateutilUnfold : rruleJsUnfold)
        : calendarContentLines(source);
      let dateutilTzidInput = dateutilTzids;
      if (dateutilTzids != null && typeof dateutilTzids !== "function") {
        // The dateutil reader takes the last spelling of each TZID before unfolding.
        const writtenNames = new Map(
          Array.from(source.join("\r\n").matchAll(/TZID=([^:]+):/g), ([, name]) => [name.toUpperCase(), name]),
        );
        dateutilTzidInput = Object.fromEntries(
          Array.from(writtenNames.values())
            .filter((name) => Object.hasOwn(dateutilTzids, name))
            .map((name) => [name, dateutilTzids[name]]),
        );
      }
      const dateutilDates = profile === "dateutil"
        ? (dateutilDatesModule ??= await import("./dateutil-dates.ts"))
        : undefined;
      const tzif = new Map<string, DateutilZone>();
      const regions = new Map<string, TimezoneRegion>();
      if (graphRecurrenceZone != null) {
        regions.set(graphRecurrenceZone.fullname, graphRecurrenceZone);
      }
      const missingRegions = new Set<string>();
      const findProfileZone = async (name: string) => {
        const existing = regions.get(name);
        if (existing != null) return existing;
        if (missingRegions.has(name)) return null;
        const calendarZone = await rfcTimeZone?.(name);
        if (calendarZone != null) {
          regions.set(name, calendarZone);
          return calendarZone;
        }
        const supplied = await readTzif?.(name);
        const bundle = supplied === undefined && profile === "dateutil"
          ? await import("./dateutil-tzif-data.ts")
          : undefined;
        const bytes = bundle?.bundledDateutilTzif(name) ?? supplied;
        // A supplied or bundled TZif can represent a zone unavailable in Intl.
        let zone: TimezoneRegion | null = null;
        if (bytes != null) {
          zone = new TimezoneRegion(name as Tzname, []);
          tzif.set(zone.fullname, DateutilTzif.read(bytes));
        } else if (bytes === undefined) {
          // The reference TZif lookup requires an exact name. A case variant
          // can still be interpreted by the dateutil POSIX fallback below.
          const iana = bundle?.isBundledDateutilNameIgnoringCase(name)
            ? null
            : Tzname.parseOpt(name);
          if (iana != null) {
            zone = profile === "rrule-js"
              ? TimezoneRegion.platformRecurrenceZone(iana)
              : await TimezoneRegion.getOpt(iana);
          }
          if (zone != null && profile === "rfc5545") {
            zone = TimezoneRegion.forPlatformRecurrence(zone);
          }
          if (profile === "dateutil" && iana != null && zone != null && zone.fullname !== name) {
            // Independent tz.gettz keys compare as distinct zones at a fold.
            zone = new TimezoneRegion(
              iana,
              [...zone.transitions],
              zone.mismatch,
              zone.linkOf,
              zone.unserved,
            );
          }
          if (profile === "dateutil" && zone == null) {
            const fallback = DateutilPosixZone.parse(name);
            if (fallback != null) {
              // The wire-safe key preserves the written TZID's identity.
              zone = new TimezoneRegion(
                ("X-DATEUTIL-TZSTR-" + encodeURIComponent(name)) as Tzname,
                [],
              );
              tzif.set(zone.fullname, fallback);
            }
          }
        }
        if (zone == null) {
          missingRegions.add(name);
        } else {
          regions.set(name, zone);
          // An IANA alias must not mask a calendar definition under a
          // different written TZID. RFC parsing keeps each requested key.
          if (profile !== "rfc5545") regions.set(zone.fullname, zone);
        }
        return zone;
      };
      const findGoogleZone = async (name: string) => {
        const existing = regions.get(name);
        if (existing != null) return existing;
        const zone = await resolveGoogleDateTimezone(name, googleTimeZoneFallback);
        if (zone != null) {
          regions.set(name, zone);
          regions.set(zone.fullname, zone);
        }
        return zone;
      };
      const loadProfileZone = async (name: string) => {
        const zone = await (profile === "google" ? findGoogleZone(name) : findProfileZone(name));
        if (zone == null) throw new Error("Unknown recurrence timezone: " + name);
        return zone;
      };
      let invalidRruleJsTzid: string | undefined;
      const loadRruleJsZone = async (name: string): Promise<TimezoneRegion> => {
        const zone = await findProfileZone(name);
        if (zone != null) return zone;
        // Keep the encoded wall clock until expansion reaches a rezone.
        invalidRruleJsTzid = name;
        return TimezoneRegion.UTC;
      };
      const referenceHost = rruleJsHostTimeZone == null
        ? undefined
        : await loadProfileZone(rruleJsHostTimeZone);
      let rruleJsHostZone = referenceHost;
      const fixedRegion = (offsetMs: number) => {
        const name = ("X-DATEUTIL-OFFSET-" + offsetMs) as Tzname;
        const zone = new TimezoneRegion(name, []);
        regions.set(name, zone);
        tzif.set(name, DateutilTzif.fixed(offsetMs));
        return zone;
      };
      let localRegionCount = 0;
      const localRegion = (reference: DateutilLocalZone) => {
        // Every parsed tzlocal() is a distinct tzinfo object. Rules that
        // share DTSTART share the same key, but explicit dates do not.
        const name = ("X-DATEUTIL-LOCAL-" + localRegionCount++) as Tzname;
        const zone = new TimezoneRegion(name, []);
        regions.set(name, zone);
        tzif.set(name, reference);
        return zone;
      };
      const observance = profile === "rfc5545" ? rfcObservance(lines) : null;
      if (observance != null) {
        lines = observance.lines;
        regions.set(observance.zone.fullname, observance.zone);
      }
      const dateutilZoneOverrides = dateutilTzidInput == null ? undefined : {
        input: dateutilTzidInput,
        written: new Map<string, TimezoneRegion>(),
        byIdentity: new Map<DateutilZone, TimezoneRegion>(),
      };
      const findDateutilTzid = dateutilZoneOverrides == null ? findProfileZone :
        async (name: string): Promise<TimezoneRegion | null> => {
          const { input, written, byIdentity } = dateutilZoneOverrides;
          const supplied = typeof input === "function" ? await input(name)
            : Object.hasOwn(input, name) ? input[name] : undefined;
          if (supplied == null) {
            written.delete(name);
            return null;
          }
          let zone = byIdentity.get(supplied);
          if (zone == null) {
            const key = ("X-DATEUTIL-TZIDS-" + byIdentity.size) as Tzname;
            zone = new TimezoneRegion(key, []);
            byIdentity.set(supplied, zone);
            tzif.set(key, supplied);
            regions.set(key, zone);
          }
          written.set(name, zone);
          return zone;
        };
      const dateutilRule = dateutilDates == null ? undefined : {
        dateContext: dateutilDates.createDateutilDateContext(dateutilHost, dateutilParserYear),
        parseUntil: dateutilDates.dateutilUntil,
        weekStart: dateutilWeekStart,
      };
      const dateutilProperties = dateutilDates != null && dateutilRule != null
        ? await dateutilDates.scanDateutilProperties(
          source, lines, findDateutilTzid, fixedRegion, localRegion, dateutilRule.dateContext, dateutilCompatible,
        )
        : undefined;
      if (dateutilProperties != null) {
        lines = dateutilProperties.lines;
        if (lines.length === 0) throw new Error("empty string");
      }
      let startLines = profile === "rrule-js" ? [] : lines.filter((line) =>
        icalPropertyName(line) === "DTSTART"
      );
      // dateutil uses the last textual DTSTART in place of its external default.
      // Exact rrule.js set replay uses the start found in the original text.
      const exactRruleJsSetMode = rruleJsCompatible != null || rruleJsForceSet != null;
      let externalStart = (profile === "dateutil" && startLines.length > 0) ||
          exactRruleJsSetMode
        ? undefined
        : external;
      let rruleJsTextStart: ReturnType<typeof rruleJsStart>;
      let rruleJsStandalone = false;
      let deduplicateRruleJsRules = false;
      let deduplicateRruleJsExrules = false;
      let rruleJsStartZoneName: string | undefined;
      let hasRruleJsStartProperty = false;
      if (profile === "rrule-js") {
        const remaining: string[] = [];
        let firstRule: string | undefined;
        let ruleCount = 0;
        let exclusionCount = 0;
        let hasExplicitDates = false;
        for (let line of lines) {
          let name = icalPropertyName(line);
          if (name === "DTSTART") {
            hasRruleJsStartProperty = true;
            if (externalStart != null) startLines.push(line);
            if (line.includes(":")) continue;
            // A colonless DTSTART is parsed as a rule with the default frequency.
            line = "RRULE:FREQ=YEARLY";
            name = "RRULE";
          }
          remaining.push(line);
          if (name === "RRULE") {
            firstRule ??= line;
            ruleCount++;
          } else if (name === "EXRULE") exclusionCount++;
          else if (name === "RDATE" || name === "EXDATE") hasExplicitDates = true;
        }
        // The reference scans the original input before splitting or unfolding it.
        rruleJsTextStart = rruleJsStart((externalStart == null ? source : startLines).join("\r\n"));
        if (exactRruleJsSetMode && rruleJsTextStart != null) {
          rruleJsDateParts(rruleJsTextStart.value);
        }
        rruleJsStartZoneName = rruleJsTextStart?.zone;
        startLines = rruleJsTextStart == null ? [] : ["DTSTART:" + rruleJsTextStart.value];
        if (rruleJsForceSet === false && rruleJsCompatible !== true && lines.length > 0) {
          rruleJsStandalone = ruleCount <= 1 && exclusionCount === 0 && !hasExplicitDates;
          if (rruleJsStandalone) {
            const inline = rruleJsStart(firstRule ?? "");
            if (inline != null) rruleJsDateParts(inline.value);
            externalStart = inline == null ? external : undefined;
            const selected = inline ?? (externalStart == null ? rruleJsTextStart : undefined);
            rruleJsStartZoneName = inline?.zone ||
              (external != null && "timeZone" in external ? external.timeZone : undefined) ||
              rruleJsTextStart?.zone;
            startLines = selected == null ? [] : ["DTSTART:" + selected.value];
            if (ruleCount === 0) remaining.push("RRULE:FREQ=YEARLY");
          }
        }
        deduplicateRruleJsRules = ruleCount > 1;
        deduplicateRruleJsExrules = exclusionCount > 1;
        if (startLines.length > 0) remaining.unshift(startLines[0]);
        lines = remaining;
      } else if (profile === "dateutil" && startLines.length > 1) {
        // dateutil validates each declaration and keeps the last one.
        for (const earlier of startLines.slice(0, -1)) {
          if (ICalDateLine.Raw.parse(earlier).exp().nd.length !== 1) {
            throw new Error("Expected one DTSTART value");
          }
        }
        startLines = [startLines.at(-1)!];
        lines = [...startLines, ...lines.filter((line) => icalPropertyName(line) !== "DTSTART")];
      }
      let bound: BoundStart | undefined;
      if (externalStart != null) {
        if (startLines.length > 0) throw new Error("DTSTART supplied twice");
        if (!rruleJsStandalone) {
          rruleJsStartZoneName = "timeZone" in externalStart ? externalStart.timeZone ?? undefined : undefined;
        }
        const encoded = rruleJsStandalone && "dateTime" in externalStart
          ? { dateTime: rruleJsExternalDateTime(externalStart.dateTime, referenceHost) }
          : externalStart;
        const parsed = await bindExternalStart(
          encoded, profile, profile === "rrule-js" ? loadRruleJsZone : loadProfileZone, tzif, fixedRegion,
          rruleJsStartZoneName?.toUpperCase() === "UTC" ? undefined : rruleJsHostZone,
          dateutilCompatible,
          googleStartMode === "stored",
        );
        bound = parsed.start;
        if (rruleJsStandalone && rruleJsStartZoneName != null) {
          const zone = await loadRruleJsZone(rruleJsStartZoneName);
          const host = rruleJsStartZoneName.toUpperCase() === "UTC" ? undefined : rruleJsHostZone;
          bound = {
            ...bound,
            zone,
            instant: resolveStart(bound.local, zone, profile, host),
            kind: bound.kind === "date" ? "date" : "instant",
          };
        }
        startLines = [parsed.line];
        lines.unshift(parsed.line);
      }
      if (profile === "rrule-js" && startLines.length === 0) {
        if (lines.length === 0 && !hasRruleJsStartProperty) throw new Error("Invalid empty string");
        if (lines.length === 0 || lines.some((line) => ["RRULE", "EXRULE"].includes(icalPropertyName(line)))) {
          // rrule.js takes the encoded UTC clock at construction time,
          // discarding milliseconds before applying any series timezone.
          const mse = Math.floor(Date.now() / Time.MS_PER_SEC) * Time.MS_PER_SEC;
          const now = NaiveDateTime.fromMse(mse as NaiveDateTime["mse"]);
          const startLine = "DTSTART:" + now.ical() + "Z";
          startLines = [startLine];
          lines.unshift(startLine);
        }
      }
      const implicitDateutilStart = profile === "dateutil" && startLines.length === 0 &&
        lines.some((line) => ["RRULE", "EXRULE"].includes(icalPropertyName(line)));
      const datesWithoutStart = (profile === "dateutil" || profile === "rrule-js") &&
        startLines.length === 0 &&
        lines.some((line) => ["RDATE", "EXDATE"].includes(icalPropertyName(line))) &&
        !lines.some((line) => ["RRULE", "EXRULE"].includes(icalPropertyName(line)));
      if (profile !== "rrule-js" && startLines.length !== 1 && !datesWithoutStart && !implicitDateutilStart) {
        throw new Error("Expected one DTSTART");
      }
      const validatedRfc = profile === "rfc5545"
        ? await validateRfc5545(lines, startLines[0], loadProfileZone, preserveRfcDateForms)
        : undefined;
      const dateStart = bound?.kind === "date" || /:\d{8}$/.test(startLines[0] ?? "");

      const shared: string[] = [];
      let resolvedStart = validatedRfc?.dtstart;
      // Keep the wire spelling separate from decoded resolver keys.
      const parsedRegions = profile === "rfc5545" ? new Map<string, TimezoneRegion>() : regions;
      let rruleJsHasTimedRdate = false;
      let rruleJsRdate: { zone: TimezoneRegion; name: string } | undefined;
      const ruleLines: (NormalizedRule | string)[] = [];
      const exclusionLines: (NormalizedRule | string)[] = [];
      for (const line of lines) {
        const name = icalPropertyName(line);
        if (name === "RRULE") {
          ruleLines.push(profile === "dateutil" ? line : profileRule(
            line, profile, undefined, false, validatedRfc?.rule, deduplicateRruleJsRules,
          ));
        } else if (name === "EXRULE") {
          if (profile !== "google" && profile !== "dateutil" && profile !== "rrule-js") {
            throw new Error("Unsupported EXRULE in " + profile + " recurrence");
          }
          exclusionLines.push(profile === "dateutil" ? line : profileRule(
            line, profile, undefined, rruleJsUnfold != null, undefined, deduplicateRruleJsExrules,
          ));
        } else {
          if (profile === "dateutil" && name === "RDATE") continue;
          if (name === "DTSTART" && validatedRfc?.dtstart != null) continue;
          if (name === "DTSTART" || name === "RDATE" || name === "EXDATE") {
            const property = profile === "rrule-js"
              ? splitLiteralICalProperty(line)
              : splitICalProperty(line);
            const tzidIndex = property?.attributes.findIndex((attribute) =>
              /^TZID=/i.test(attribute)
            ) ?? -1;
            if (profile === "rrule-js" && property != null) {
              const isStart = name === "DTSTART";
              if (isStart && rruleJsStartZoneName == null && property.attributes.length === 1 &&
                !property.value.includes(",")) {
                const parts = rruleJsDateParts(property.value);
                resolvedStart = new ICalDateLine(
                  "DTSTART", [decodeRruleJsWall(parts)], undefined, undefined, null,
                  [{ timed: parts[4] != null, utc: parts[7] === "Z" }],
                );
                continue;
              }
              if (!isStart) {
                for (const parameter of property.attributes.slice(1)) {
                  if (!/VALUE=DATE(?:-TIME)?|TZID=/.test(parameter)) {
                    throw new Error("unsupported RDATE/EXDATE parm: " + parameter);
                  }
                }
              }
              // Validate before the next rule property. This also prevents
              // the shared parser from accepting only the start of a PERIOD.
              for (const value of property.value.split(",")) rruleJsDateParts(value);
              if (!isStart || externalStart == null) {
                const writtenZone = isStart
                  ? rruleJsStartZoneName
                  : name === "RDATE" && rruleJsStartZoneName == null && rruleJsRdate == null
                  ? /^RDATE(?:;TZID=([^:=]+))?/i.exec(line)?.[1]
                  : undefined;
                // rrule.js chooses a single series zone. Other date
                // parameters do not participate in timezone resolution.
                for (let i = property.attributes.length - 1; i > 0; i--) {
                  if (/^TZID=/i.test(property.attributes[i])) property.attributes.splice(i, 1);
                }
                if (writtenZone != null) {
                  const zone = await loadRruleJsZone(writtenZone);
                  property.attributes.push("TZID=" + zone.fullname);
                  if (isStart) rruleJsStartZoneName = writtenZone;
                  else rruleJsRdate = { zone, name: writtenZone };
                }
              }
            } else if (property != null && profile === "google") {
              if (name !== "DTSTART") validateGoogleDateParameters(property.attributes);
              if (tzidIndex >= 0) {
                const written = unquoteICalParameter(property.attributes[tzidIndex].slice(5));
                const zone = await (name === "DTSTART" ? loadProfileZone(written) : findGoogleZone(written));
                // A date-list value with an unknown TZID retains its
                // written floating or UTC form.
                if (zone == null) property.attributes.splice(tzidIndex, 1);
                else property.attributes[tzidIndex] = "TZID=" + formatICalParameter(zone.fullname);
              }
            } else if (property != null && tzidIndex >= 0) {
              const written = property.attributes[tzidIndex].slice(5);
              if (profile === "rfc5545") {
                const zone = await loadProfileZone(decodeRfcTzid(written));
                parsedRegions.set(written, zone);
              } else {
                const zone = await loadProfileZone(unquoteICalParameter(written));
                property.attributes[tzidIndex] = "TZID=" + zone.fullname;
              }
            }
            if (property != null) {
              const rruleJsExplicitDate = profile === "rrule-js" && name !== "DTSTART";
              if (rruleJsExplicitDate && name === "RDATE" && /T/.test(property.value)) {
                rruleJsHasTimedRdate = true;
              }
              const bareAsMidnight = rruleJsExplicitDate || (!dateStart && name !== "DTSTART" && profile === "dateutil");
              const value = bareAsMidnight
                ? property.value.split(",").map((date) => /^\d{8}$/.test(date) ? date + "T000000" : date).join(",")
                : property.value;
              // rrule.js matches explicit values at an encoded time, including midnight.
              // Google reads the individual forms on a mixed list,
              // including timed values on a line tagged VALUE=DATE.
              const mixedGoogleDateList = profile === "google" &&
                name !== "DTSTART" && /T/i.test(value);
              const attributes = rruleJsExplicitDate || mixedGoogleDateList
                ? property.attributes.filter((attribute) => !/^VALUE=DATE$/i.test(attribute))
                : property.attributes;
              shared.push(attributes.join(";") + ":" + value);
              continue;
            }
          }
          if (profile === "dateutil" || profile === "rrule-js") {
            throw new Error("unsupported property: " + name);
          }
          shared.push(line);
        }
      }
      // rrule.js skips rezoning for literal UTC but still rezones aliases such as Etc/UTC.
      if (invalidRruleJsTzid != null || (rruleJsStartZoneName ?? rruleJsRdate?.name)?.toUpperCase() === "UTC") {
        rruleJsHostZone = undefined;
      }
      const rruleJsRdateZone = rruleJsRdate?.zone;
      const parseDate = dateutilDates?.readDateutilDate ??
        (profile === "rrule-js" ? readRruleJsDate : undefined);
      const parseUntil = profile === "rrule-js"
        ? (value: string) => readRruleJsDate(value, true)
        : undefined;
      const now = implicitDateutilStart ? new Date(Date.now()) : null;
      const utcMse = now == null ? 0 : Math.floor(now.getTime() / Time.MS_PER_SEC) * Time.MS_PER_SEC;
      const localOffset = now == null ? 0 : dateutilHost != null
        ? dateutilHost.localTime(utcMse / Time.MS_PER_SEC).offsetSeconds * Time.MS_PER_SEC
        : -now.getTimezoneOffset() * Time.MS_PER_MIN;
      const readRule = (rule: NormalizedRule | null, properties: readonly string[]) => {
        if (rule == null) return readCalendarLines(properties, false, parsedRegions, parseDate, parseUntil, resolvedStart);
        const lines = [...properties, rule.raw];
        if (now != null) {
          // dateutil uses the local clock for a naive rule and UNTIL's
          // original timezone when that cutoff is aware.
          const anchorUntil = dateutilImplicitUntil ?? rule;
          const offset = anchorUntil.untilOffsetMs;
          const start = anchorUntil.untilLocal?.wall(utcMse) ?? NaiveDateTime.fromMse(
            (utcMse + (offset ?? localOffset)) as NaiveDateTime["mse"],
          );
          const region = anchorUntil.untilLocal != null ? localRegion(anchorUntil.untilLocal) : offset ? fixedRegion(offset) : null;
          const tzid = region == null ? "" : ";TZID=" + region.fullname;
          lines.unshift("DTSTART" + tzid + ":" + start.ical() + (region == null && offset === 0 ? "Z" : ""));
        }
        return readCalendarLines(lines, false, parsedRegions, parseDate, parseUntil, resolvedStart);
      };
      const rules: Recurrence[] = [];
      const seenRruleJsRules = deduplicateRruleJsRules ? new Set<string>() : undefined;
      let dateutilOriginal: NormalizedRule | undefined;
      for (const input of ruleLines.length ? ruleLines : [null]) {
        const rule = typeof input === "string" ? profileRule(input, profile, dateutilRule) : input;
        const raw = await readRule(rule, shared);
        if (raw.isErr) return err(raw.asErr()!);
        const recurrence = profileRecurrence(raw.exp(), rule, profile, referenceHost, now != null);
        if (ruleLines.length === 1 && exclusionLines.length === 0 && !dateutilCompatible) {
          if (rule?.dateutilOriginal != null) dateutilOriginal = rule;
        }
        const key = rule?.rruleJsSetKey;
        if (seenRruleJsRules != null && key != null) {
          if (seenRruleJsRules.has(key)) continue;
          seenRruleJsRules.add(key);
        }
        rules.push(recurrence);
      }
      if (dateutilProperties != null) {
        const lines = await dateutilProperties.readRdates(!dateStart);
        if (lines.length > 0) {
          const raw = await readRule(null, lines);
          if (raw.isErr) return err(raw.asErr()!);
          const rdate = raw.exp().lines.rdate;
          for (const [i, { inner }] of rules.entries()) {
            rules[i] = new Recurrence(new ICalendar.Raw({ ...inner.lines, rdate }, inner.order));
          }
        }
      }
      const exclusionRules: Recurrence[] = [];
      const seenRruleJsExrules = deduplicateRruleJsExrules ? new Set<string>() : undefined;
      const startOnly = shared.filter((line) => icalPropertyName(line) === "DTSTART");
      for (const input of exclusionLines) {
        const rule = typeof input === "string" ? profileRule(input, profile, dateutilRule) : input;
        const raw = await readRule(rule, startOnly);
        if (raw.isErr) return err(raw.asErr()!);
        const recurrence = profileRecurrence(raw.exp(), rule, profile, referenceHost, now != null);
        const key = rule?.rruleJsSetKey;
        if (seenRruleJsExrules != null && key != null) {
          if (seenRruleJsExrules.has(key)) continue;
          seenRruleJsExrules.add(key);
        }
        exclusionRules.push(recurrence);
      }
      if (rruleJsCompatible === true && external != null) {
        const parsed = rules[0].inner.dtstart;
        if (rruleJsTextStart == null || parsed == null) {
          throw new Error("undefined is not Date instance");
        }
        // The library adds the parsed clock, including midnight for a
        // date-only DTSTART, as a normal explicit inclusion.
        const inclusion = new ICalDateLine(
          "RDATE",
          parsed.dates,
          parsed.region,
          "DATE-TIME",
          undefined,
          [{ timed: true, utc: parsed.forms?.[0]?.utc ?? false }],
        );
        for (const [i, { inner }] of rules.entries()) {
          const rdate = [...(inner.lines.rdate ?? []), inclusion];
          rules[i] = new Recurrence(new ICalendar.Raw({ ...inner.lines, rdate }, inner.order));
        }
      }
      if (bound == null) {
        const { lines: dates } = rules[0].inner;
        const parsed = dates.dtstart ?? dates.rdate?.[0] ?? dates.exdate?.[0] ??
          exclusionRules[0]?.inner.dtstart;
        if (parsed == null) throw new Error("Expected one DTSTART");
        const form = parsed.forms?.[0];
        const local = parsed.dates[0];
        if (local == null || (!datesWithoutStart && !implicitDateutilStart && parsed.dates.length !== 1)) {
          throw new Error("Expected one DTSTART value");
        }
        const rruleJsDatesOnly = profile === "rrule-js" && datesWithoutStart;
        const zone = (rruleJsDatesOnly ? rruleJsRdateZone : parsed.region ?? rruleJsRdateZone) ?? null;
        const kind = rruleJsDatesOnly ? "instant" : form?.timed === false
          ? "date"
          : zone == null && !form?.utc
          ? "floating"
          : "instant";
        const referenceZone = zone == null ? undefined : tzif.get(zone.fullname);
        bound = {
          local,
          instant: referenceZone?.instant(local) ?? resolveStart(local, zone, profile, rruleJsHostZone),
          zone,
          kind,
        };
      } else if (bound.zone == null && rruleJsRdateZone != null) {
        bound = {
          local: bound.local,
          instant: resolveStart(bound.local, rruleJsRdateZone, profile, rruleJsHostZone),
          zone: rruleJsRdateZone,
          kind: bound.kind === "date" ? "date" : "instant",
        };
      }
      if (
        profile === "rrule-js" && bound.kind === "date" &&
        (rruleJsHasTimedRdate || rules.some(({ inner }) =>
          inner.rrule?.hasTimeParts() || inner.rrule?.inner.options?.rruleJsClockText != null
        ))
      ) {
        bound = { ...bound, kind: bound.zone == null ? "floating" : "instant" };
      }
      const startCoverageEnd = bound.zone?.calendarCoverageEnd;
      if (profile === "rfc5545" && startCoverageEnd != null && bound.instant.mse >= startCoverageEnd) {
        return err(new RangeError("VTIMEZONE table does not cover DTSTART"));
      }
      const compatibleLine = dateutilCompatible && startLines.length > 0
        ? rules[0].inner.dtstart
        : null;
      return ok(new RecurrenceSeries(
        profile,
        bound,
        rules,
        exclusionRules,
        tzif,
        graphSamoa,
        rruleJsHostZone,
        invalidRruleJsTzid,
        graphResolveWallTime,
        compatibleLine == null ? undefined : {
          line: compatibleLine,
          instant: externalStart == null ? undefined : bound.instant.toUtc(),
        },
        rruleJsStandalone,
        profile === "outlook" && bound.kind === "date" ? graphRecurrenceZone : undefined,
        rruleJsStartZoneName ?? rruleJsRdate?.name,
        profile === "dateutil"
          ? dateutilZoneOverrides?.written.size ? new Map([...dateutilZoneOverrides.written, ...regions]) : regions
          : undefined,
        graphViewWallDurationMs,
        dateutilZoneOverrides?.byIdentity.size ? dateutilZoneOverrides.byIdentity : undefined,
        dateutilOriginal != null && !rules[0].inner.lines.rdate?.length && !rules[0].inner.lines.exdate?.length
          ? {
            parts: dateutilOriginal.dateutilOriginal!,
            weekStart: Weekday.toString2cap(dateutilWeekStart ?? Weekday.MON),
            context: dateutilRule!,
            startOptions: { dateutilHost, dateutilTzif: readTzif, dateutilParserYear },
            untilOffsetMs: dateutilOriginal.untilOffsetMs,
            untilLocal: dateutilOriginal.untilLocal,
          }
          : undefined,
        dateutilCache,
        graphTimezones,
        preserveRfcDateForms,
      ));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

const GOOGLE_LAST_RECURRENCE = DateTime.fromRfc3339("2099-12-31T23:59:59.999Z").exp().toUtc();

function compositionFor(
  profile: RecurrenceProfile,
  rruleJsHostZone?: TimezoneRegion,
  invalidRruleJsZone?: RangeError,
  graphResolveWallTime?: RecurrenceComposition["resolveWallTime"],
): RecurrenceComposition {
  if (profile === "google") {
    return {
      ...RecurrenceComposition.GOOGLE,
      lastRecurrenceInstant: GOOGLE_LAST_RECURRENCE,
      useGoogleYearlyWeeks: true,
      resolveNamedDate: (zone, local) => zone.toRfc5545WallClock(local).toUtc(),
      resolveWallTime: (zone, local) => zone.toRfc5545WallClock(local),
    };
  }
  if (profile === "outlook") {
    return {
      ...RecurrenceComposition.RULE_ONLY,
      resolveWallTime: graphResolveWallTime,
    };
  }
  if (profile === "rrule-js") {
    const rezone = (value: NaiveDateTime, zone: TimezoneRegion | null) =>
      rruleJsDate(value, zone, rruleJsHostZone);
    return {
      ...RecurrenceComposition.RULE_ONLY,
      includeStartWithoutRule: false,
      clipFirstWeek: true,
      untilUsesWallTime: true,
      countRepeatedSetPositions: true,
      resolveWallTime: (zone, local) => {
        if (invalidRruleJsZone) throw invalidRruleJsZone;
        return rezone(local, zone);
      },
      resolveExdate: (value, _region, _utc, seriesZone) => rezone(value, seriesZone),
      resolveRdate: rezone,
      wallOffsetBound: rruleJsHostZone == null ? undefined : (zone, endMse) =>
        maxOffsetMsNear(zone, endMse) - minOffsetMsNear(rruleJsHostZone, endMse),
    };
  }
  return { ...RecurrenceComposition.RULE_ONLY, wallOffsetBound: rfcWallOffsetBound };
}

function rruleJsCanRezone(
  wall: NaiveDateTime,
  target: TimezoneRegion,
  host?: TimezoneRegion,
): boolean {
  const year = wall.date.yr;
  if (year > 1000 && year < 9999) return true;
  // rrule.js parses Intl's sv-SE clock as ISO. The formatted year must
  // have four digits in both the target and host clocks.
  const parses = (zone?: TimezoneRegion) => {
    const offset = zone?.tzAtMse(wall.mse).info.offset.toMs ?? 0;
    const year = wall.add({ ms: offset }).date.yr;
    const displayed = year > 0 ? year : 1 - year;
    return displayed >= 1000 && displayed <= 9999;
  };
  return parses(target) && parses(host);
}

function rruleJsDate(
  value: NaiveDateTime,
  seriesZone: TimezoneRegion | null,
  hostZone?: TimezoneRegion,
): DateTime<Utc> {
  if (seriesZone == null) return value.asUtc();
  // rrule.js subtracts the target's offset relative to the host at the encoded instant.
  const target = seriesZone.tzAtMse(value.mse);
  const host = hostZone?.tzAtMse(value.mse).info.offset.toMs ?? 0;
  return value.add({ ms: host }).withTz(target).toUtc();
}

function resolveStart(
  local: NaiveDateTime,
  zone: TimezoneRegion | null,
  profile: RecurrenceProfile,
  rruleJsHostZone?: TimezoneRegion,
) {
  if (zone != null && profile === "rrule-js") {
    return rruleJsDate(local, zone, rruleJsHostZone);
  }
  return zone == null
    ? local.asUtc()
    : profile === "dateutil"
    ? zone.toDateutilWallClock(local)
    : zone.toRfc5545WallClock(local);
}

function rruleJsExternalDateTime(dateTime: string, host?: TimezoneRegion): string {
  const fields = /^(?:\d{4}|[+-]\d{6})(?:-\d{2}){0,2}(?:([Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?([Zz]|[+-]\d{2}:?\d{2})?$/
    .exec(dateTime);
  if (fields == null) throw new Error("Invalid options: dtstart");

  // Parse an unzoned clock in UTC first so the actual process timezone
  // cannot affect replay. A date-only JavaScript Date already uses UTC.
  const localClock = fields[1] != null && fields[2] == null;
  const mse = Date.parse(localClock ? dateTime + "Z" : dateTime);
  if (!Number.isFinite(mse)) throw new Error("Invalid options: dtstart");

  if (localClock && host != null) {
    // Native Date chooses the earlier instant of a fold and advances gaps.
    const local = NaiveDateTime.fromMse(mse as NaiveDateTime["mse"]);
    return new Date(host.toRfc5545WallClock(local).mse).toISOString();
  }
  return new Date(mse).toISOString();
}

async function bindExternalStart(
  external: RecurrenceStart,
  profile: RecurrenceProfile,
  loadProfileZone: (name: string) => Promise<TimezoneRegion>,
  tzif: ReadonlyMap<string, DateutilZone>,
  fixedRegion: (offsetMs: number) => TimezoneRegion,
  rruleJsHostZone?: TimezoneRegion,
  dateutilCompatible = false,
  keepGoogleStartInstant = false,
): Promise<{
  line: string;
  start: BoundStart;
}> {
  if (profile === "dateutil") {
    const value = "date" in external ? external.date : external.dateTime;
    if (value.startsWith("0000-")) throw new RangeError("year 0 is out of range: " + value);
  }
  if ("date" in external) {
    const date = NaiveDate.parse(external.date);
    const local = new NaiveDateTime(date);
    return {
      line: "DTSTART;VALUE=DATE:" + date.ical(),
      start: { local, instant: local.asUtc(), zone: null, kind: "date" },
    };
  }

  const dateTime = profile === "dateutil"
    ? external.dateTime.replace(/(T\d{2}:\d{2}:\d{2})\.\d+(?=Z|[+-]|$)/i, "$1")
    : external.dateTime;
  const fraction = dateutilCompatible
    ? /(T\d{2}:\d{2}:\d{2})(\.\d+)(?=Z|[+-]|$)/i.exec(external.dateTime)?.[2] ?? ""
    : "";
  // Google accepts second-resolution offsets on historical event starts.
  const hasOffset = (profile === "dateutil" || profile === "google"
    ? /(?:Z|[+-]\d{2}:\d{2}(?::\d{2})?)$/i
    : /(?:Z|[+-]\d{2}:\d{2})$/i).test(dateTime);
  const explicit = hasOffset
    ? DateTime.fromRfc3339(dateTime).exp()
    : null;
  const offsetMs = explicit == null ? 0 : explicit.ndt.mse - explicit.mse;
  // RFC 6868 represents a formatted line break with a single ^n.
  const timeZone = profile === "rfc5545"
    ? external.timeZone?.replace(/\r\n?/g, "\n")
    : external.timeZone;
  const zone = timeZone != null
    ? await loadProfileZone(timeZone)
    : profile === "dateutil" && offsetMs !== 0
    ? fixedRegion(offsetMs)
    : null;
  const referenceZone = zone == null ? undefined : tzif.get(zone.fullname);
  const zoned = explicit == null || zone == null ? undefined
    : profile === "rfc5545" ? zone.toRfc5545LocalTime(explicit)
    : zone.toTz(explicit);
  const local = explicit != null
    ? referenceZone?.wall(explicit.mse) ?? (zoned ?? explicit.toUtc()).ndt
    : NaiveDateTime.parse(dateTime);
  if (local == null) throw new Error("Invalid DTSTART dateTime");
  // Google first projects the submitted instant into the event zone,
  // then uses the first occurrence of that wall time for its master.
  const instant = explicit == null
    ? referenceZone?.instant(local) ?? resolveStart(local, zone, profile, rruleJsHostZone)
    : referenceZone != null
    ? explicit.toUtc()
    : profile === "google" && !keepGoogleStartInstant && zone != null && zoned != null
    ? zone.toRfc5545WallClock(zoned.ndt)
    : zoned ?? explicit.toUtc();
  const kind = zone != null || explicit != null ? "instant" : "floating";
  const line = zone != null
    ? "DTSTART;TZID=" +
      (profile === "rfc5545" ? encodeRfcTzid(timeZone!) : formatICalParameter(zone.fullname)) +
      ":" + local.ical() + fraction
    : "DTSTART:" + local.ical() + fraction + (explicit != null ? "Z" : "");
  const compatibleMs = Number(fraction.slice(1, 4).padEnd(3, "0"));
  const exact = compatibleMs === 0 ? instant : instant.add({ ms: compatibleMs });
  return { line, start: { local, instant: exact, zone, kind } };
}

/**
 * Google finalizes negative positions once a later eligible week has started.
 * Find the last week with an eligible date inside the search budget. Earlier
 * weeks can emit their selections. That last week cannot.
 */
function googleWeeklyRankingEnd(rule: RRule, start: NaiveDate, julianCalendar: boolean): NaiveDate | undefined {
  // Allow local dates one day ahead of the UTC emission ceiling.
  const lastLocalDay = GOOGLE_LAST_RECURRENCE.ndt.date.addDays(1);
  if (start.dse > lastLocalDay.dse) return undefined;

  const axisStart = julianCalendar ? googleDateToGregorian(start) : start;
  const searchEnd = axisStart.addDays(182_616);
  const props = rule.toFilterProps(null, searchEnd, true, null, false, undefined, true);
  const weekStart = props.options?.weekStart ?? axisStart.dayOfWeek;
  const firstWeek = axisStart.addDays(-((axisStart.dayOfWeek.dow - weekStart.dow + 7) % 7));
  const stepDays = props.step.value * 7;

  // The search ignores COUNT and UNTIL. Those bound emitted starts, and a
  // later eligible week can still finalize a position within those bounds.
  const periods = Math.floor((searchEnd.dse - firstWeek.dse) / stepDays);
  for (let i = periods; i > 0; --i) {
    const week = firstWeek.addDays(i * stepDays);
    const end = week.addDays(Math.min(6, searchEnd.dse - week.dse));
    for (const _ of week.range(props.step, { ...props.options, end, limit: 1 })) {
      if (week.dse > lastLocalDay.dse) return undefined;
      const through = week.addDays(-1);
      return julianCalendar ? gregorianToGoogleDateOnOrBefore(through) : through;
    }
  }
  return start.addDays(-1);
}

function boundGoogleRuleEnd(
  options: NonNullable<RRuleLike["options"]>,
  raw: ICalendar.Raw,
  end: NaiveDate | null,
): NonNullable<RRuleLike["options"]> {
  // A negative count suppresses rule candidates while retaining the master.
  if (end == null) return { ...options, count: -1 };
  const wallEnd = end.withTime(new NaiveTime(Time.MS_PER_DAY - 1));
  const cutoff = options.until?.extend().asUtc();
  const localCutoff = cutoff == null ? null : raw.dtstart?.region?.toTz(cutoff).ndt ?? cutoff.ndt;
  return localCutoff == null || localCutoff.mse > wallEnd.mse
    ? { ...options, until: new IsoDate(end, wallEnd.time, null) }
    : options;
}

/** Bound Google’s month-13 search within the master’s January. */
function googleMonthThirteenEnd(rule: RRule, start: NaiveDate): NaiveDate | null {
  const januaryEnd = NaiveDate.fromYmd1Exp(start.yr, 1, 31);
  if (!rule.inner.options?.bysetpos?.some((position) => position < 0)) return januaryEnd;

  // A negative position makes Google wait for another eligible period
  // before emitting any selected starts, including positive positions.
  if (rule.inner.freq !== "weekly") return null;
  const unranked = new RRule({
    ...rule.inner,
    options: {
      ...rule.inner.options,
      bymonth: [1],
      count: undefined,
      until: undefined,
    },
  });
  const props = unranked.toFilterProps(null, januaryEnd, true, null, false, undefined, true);
  let last: NaiveDate | undefined;
  for (const day of start.rangeProps(props)) last = day;
  if (last == null) return null;
  const weekStart = props.options?.weekStart ?? start.dayOfWeek;
  const daysIntoWeek = props.step.type === "week"
    ? (last.dayOfWeek.dow - weekStart.dow + 7) % 7
    : 0;
  const end = last.addDays(-daysIntoWeek - 1);
  return end.dse >= start.dse ? end : null;
}

function profileRecurrence(
  raw: ICalendar.Raw,
  normalized: NormalizedRule | null,
  profile: RecurrenceProfile,
  referenceHost?: TimezoneRegion,
  implicitStart = false,
): Recurrence {
  let rule = raw.rrule;
  if (profile === "google" && rule?.inner.options?.bynthday?.length) {
    const frequency = rule.inner.freq;
    if (frequency === "daily" || frequency === "weekly") {
      const ordinalWeekdayPeriod: "year" | "month" = frequency === "daily" ? "year" : "month";
      const options = { ...rule.inner.options, ordinalWeekdayPeriod };
      rule = new RRule({ ...rule.inner, options }, rule.parameterOrder);
      raw = new ICalendar.Raw({ ...raw.lines, rrule: rule }, raw.order);
    }
  }
  if (profile === "dateutil" && rule != null && normalized != null) {
    const options = { ...rule.inner.options };
    const exact: NonNullable<typeof options.dateutilClockIntegers> = {};
    for (const field of ["byhour", "byminute", "bysecond"] as const) {
      const text = normalized.raw.attributes.get(field);
      if (!text) continue;
      const entries = text.split(",");
      const values = entries.map(Number);
      if (values.some((value) => !Number.isSafeInteger(value))) {
        exact[field] = entries;
        options[field] = values;
      }
    }
    if (Object.keys(exact).length !== 0) options.dateutilClockIntegers = exact;
    if (options.bynthday?.some(({ n }) => !Number.isSafeInteger(n))) {
      const days = normalized.raw.attributes.get("BYDAY")?.split(",") ?? [];
      options.dateutilOrdinalIntegers = days.flatMap((day) => {
        const match = /^([+-]?\d+)([A-Z]{2})$/.exec(day);
        const weekday = match == null ? undefined : Weekday.parseOpt(match[2]);
        return match != null && weekday != null ? [{ weekday, value: match[1] }] : [];
      });
    }
    if (options.dateutilClockIntegers != null || options.dateutilOrdinalIntegers != null) {
      rule = new RRule({ ...rule.inner, options }, rule.parameterOrder);
      raw = new ICalendar.Raw({ ...raw.lines, rrule: rule }, raw.order);
    }
  }
  const dateutilInterval = profile === "dateutil" ? normalized?.raw.attributes.get("INTERVAL") : undefined;
  const negativeInterval = dateutilInterval?.startsWith("-") ? dateutilInterval : undefined;
  const backwardStep = negativeInterval == null ? 0n : BigInt(negativeInterval);
  if (profile === "dateutil") {
    validateDateutilUntil(raw);
    if (normalized?.invalidDateutilSetPosition) {
      throw new Error("bysetpos must be between 1 and 366, or between -366 and -1");
    }
    const start = raw.dtstart?.dates[0];
    if (rule != null && start != null) {
      // All subdaily component bases divide the number of seconds in a day.
      const residue = backwardStep < 0n ? Number(backwardStep % 86_400n) : undefined;
      if (rule.inner.options?.dateutilEmptyClockPhase) {
        throw new RangeError("Invalid rrule byxxx generates an empty set.");
      }
      validateDateutilClockPhase(rule.inner, start.time, residue);
    }
  }
  if (profile === "google" && (rule?.inner.freq === "daily" || rule?.inner.freq === "weekly")) {
    const options = rule.inner.options;
    const start = raw.dtstart?.dates[0]?.date;
    if (start != null && options != null) {
      const julianCalendar = googleUsesJulianCalendar(start) && options.bymonth?.[0] !== 13;
      const calendar = rule.inner.freq === "daily" && options.bymonthday?.length ? "nominal" : "continuous";
      let adjusted: typeof options = julianCalendar ? { ...options, googleJulianCalendar: calendar } : options;
      if (rule.inner.freq === "weekly") {
        const interval = options.interval ?? 1;
        const positions = options.bysetpos;
        const positivePositions = positions != null && positions.length > 0 && positions.every((position) => position > 0);
        if (positivePositions) adjusted = { ...adjusted, googlePositiveWeeklyPositions: true };

        if (!options.byday?.length && !options.bynthday?.length) {
          // The implicit weekday path steps by an integer number of days.
          const days = interval * 7;
          const wrappedDays = days >>> 0;
          if (wrappedDays !== days) {
            const anchor = julianCalendar ? googleDateToGregorian(start) : start;
            adjusted = { ...adjusted, googleWeeklyCadence: { start: anchor, days: wrappedDays } };
          } else if (options.bymonthday?.length) {
            const weekday = (julianCalendar ? googleDateToGregorian(start) : start).dayOfWeek;
            adjusted = { ...adjusted, byday: [weekday] };
          }
        } else if (!positivePositions && positions?.length && options.bymonth?.[0] !== 13) {
          const rankedRule = julianCalendar ? new RRule({ ...rule.inner, options: adjusted }, rule.parameterOrder) : rule;
          const end = googleWeeklyRankingEnd(rankedRule, start, julianCalendar);
          if (end != null) {
            adjusted = boundGoogleRuleEnd(adjusted, raw, end.dse < start.dse ? null : end);
          }
        }
      }
      if (adjusted !== options) {
        rule = new RRule({ ...rule.inner, options: adjusted }, rule.parameterOrder);
        raw = new ICalendar.Raw({ ...raw.lines, rrule: rule }, raw.order);
      }
    }
  }
  if (profile === "google" && (rule?.inner.freq === "monthly" || rule?.inner.freq === "yearly")) {
    const start = raw.dtstart?.dates[0]?.date;
    const options = rule.inner.options;
    if (start != null && options != null && googleUsesJulianCalendar(start) &&
      options.bymonth?.[0] !== 13) {
      rule = new RRule({ ...rule.inner, options: { ...options, googleJulianCalendar: "nominal" } }, rule.parameterOrder);
      raw = new ICalendar.Raw({ ...raw.lines, rrule: rule }, raw.order);
    }
  }
  if (profile === "google" && rule?.inner.freq === "yearly") {
    const options = rule.inner.options;
    const start = raw.dtstart?.dates[0]?.date;
    if (start != null && options != null) {
      let adjusted = options;
      if (options.interval != null) {
        const rewind = googleYearlyOrdinalRewinds(start.yr, options.interval);
        if (rewind || googleUsesWrappedYearlyPeriods(start.yr, options.interval)) {
          adjusted = { ...adjusted, googleYearlyDayWrap: true, googleYearlyOrdinalRewind: rewind };
        }
      }
      if (options.bymonthday?.length && !options.bymonth?.length && !options.byyearday?.length) {
        adjusted = { ...adjusted, implicitYearlyMonth: start.month1 };
      }
      if (adjusted !== options) {
        rule = new RRule({ ...rule.inner, options: adjusted }, rule.parameterOrder);
        raw = new ICalendar.Raw({ ...raw.lines, rrule: rule }, raw.order);
      }
    }
  }
  if (profile === "google" && rule != null && rule.inner.options?.bymonth?.[0] === 13) {
    const start = raw.dtstart?.dates[0]?.date;
    const end = start?.month1 === 1
      ? googleMonthThirteenEnd(rule, start)
      : null;
    const options = boundGoogleRuleEnd({ ...rule.inner.options, bymonth: [1] }, raw, end);
    const rrule = new RRule({ ...rule.inner, options }, rule.parameterOrder);
    return new Recurrence(new ICalendar.Raw({ ...raw.lines, rrule }, raw.order));
  }
  if (profile === "rfc5545" && rule?.inner.options?.byweekno?.length) {
    const options = { ...rule.inner.options, rfcWeekYear: true };
    const rrule = new RRule({ ...rule.inner, options }, rule.parameterOrder);
    return new Recurrence(new ICalendar.Raw({ ...raw.lines, rrule }, raw.order));
  }
  if (normalized == null || rule == null || (profile !== "dateutil" && profile !== "rrule-js")) {
    return new Recurrence(raw);
  }

  const attributes = normalized.raw.attributes;
  const untilOffset = normalized.untilOffsetMs;
  // Each imported rrule.js rule was just constructed by resolve().
  // Its options belong to this import and can receive the profile fields directly.
  const options = profile === "rrule-js" && rule.inner.options != null
    ? rule.inner.options : { ...rule.inner.options };
  if (backwardStep < 0n) {
    options.dateutilNegativeInterval = negativeInterval;
    options.interval = 1;
  }
  if (profile === "dateutil" && untilOffset != null && untilOffset !== 0) {
    options.dateutilUntilOffsetMs = untilOffset;
  }
  if (implicitStart && normalized?.untilLocal != null) options.dateutilUntilUsesWall = true;
  const ordinalFrequency = rule.inner.freq === "monthly" || rule.inner.freq === "yearly";
  if (ordinalFrequency && options.bynthday?.length && options.byday?.length) {
    options.intersectWeekdaySelectors = true;
  }
  if (options.byweekno?.length) {
    options.libraryWeekNumberStart = raw.dtstart?.dates[0]?.date;
  }
  if (profile === "rrule-js") {
    if (!ordinalFrequency && options.bynthday?.length) {
      options.byday = [...(options.byday ?? []), ...options.bynthday.map(({ weekday }) => weekday)];
      options.bynthday = undefined;
    }
    const interval = attributes.get("INTERVAL");
    if (interval != null) {
      const value = rruleJsNumber(interval);
      if (typeof value === "string") {
        options.rruleJsIntervalText = interval;
        options.interval = 1;
      } else options.interval = value;
    }
    const positions = attributes.get("BYSETPOS");
    if (positions) options.bysetpos = positions.split(",").map(Number);
    const weeks = attributes.get("BYWEEKNO");
    if (weeks != null) {
      const numbers = weeks.split(",").map(rruleJsNumber);
      if (numbers.some((week) => typeof week === "string")) {
        options.rruleJsWeekNumbers = numbers;
      }
    }
    const clockText: NonNullable<typeof options.rruleJsClockText> = {};
    for (const field of ["byhour", "byminute", "bysecond"] as const) {
      const value = attributes.get(field);
      if (value == null) continue;
      const values = value.split(",").map(rruleJsNumber);
      if (values.some((part) => typeof part === "string")) {
        clockText[field] = values.length === 1 ? value : values;
      } else if (values.some((part) => !Number.isFinite(part))) {
        // Keep the reference's invalid clock slots for BYSETPOS. The
        // generic parser drops infinities before the reference sees them.
        options[field] = values as number[];
      }
    }
    if (Object.keys(clockText).length !== 0) options.rruleJsClockText = clockText;
    options.rruleJsClock = true;
    options.rruleJsHostZone = referenceHost;
  }
  const easter = attributes.get("BYEASTER");
  if (easter != null && profile === "rrule-js") {
    const offset = Number(easter);
    options.rruleJsEasterOffset = offset;
    if (!Number.isFinite(offset)) options.count = 0;
  } else if (easter != null) {
    const parts = easter.split(",");
    if (!parts.every((part) => /^[+-]?\d+$/.test(part))) {
      throw new Error("Invalid BYEASTER");
    }
    const offsets = parts.map(BigInt).sort((a, b) => a < b ? -1 : a > b ? 1 : 0).map(String);
    options.byeaster = dateutilEasterSelector(offsets, raw.dtstart?.dates[0]?.date);
  }
  if (options === rule.inner.options) return new Recurrence(raw);
  if (
    !options.intersectWeekdaySelectors && options.libraryWeekNumberStart == null &&
    options.byeaster == null && options.rruleJsEasterOffset == null && !options.rruleJsClock &&
    options.dateutilUntilOffsetMs == null && !options.dateutilUntilUsesWall && options.dateutilNegativeInterval == null
  ) return new Recurrence(raw);
  const rrule = new RRule({ ...rule.inner, options }, rule.parameterOrder);
  return new Recurrence(new ICalendar.Raw({ ...raw.lines, rrule }, raw.order));
}

function dateutilStartIsAware(raw: ICalendar.Raw): boolean {
  return raw.dtstart?.region != null || raw.dtstart?.forms?.[0]?.utc === true;
}

function dateutilEmptySelectors(
  rule: RRule, parts: ReadonlyMap<string, string>, start: NaiveDate,
): RRule {
  if (![...parts.values()].includes("")) return rule;
  const options = { ...rule.inner.options };
  const dateSelectors = ["BYMONTHDAY", "BYYEARDAY", "BYWEEKNO", "BYDAY", "BYEASTER"];
  if (dateSelectors.some((key) => parts.get(key) === "") &&
      !dateSelectors.some((key) => Boolean(parts.get(key)))) {
    // dateutil suppresses all DTSTART-derived day selectors. A zero-only
    // month-day list takes that same path and contributes every civil day.
    options.bymonthday = [0];
  } else if (rule.inner.freq === "yearly" && parts.get("BYMONTH") === "" &&
      !dateSelectors.some((key) => parts.has(key))) {
    // An explicit empty month list suppresses the implicit month alone.
    options.bymonthday = [start.day];
  }

  const clockFrequency = ["hourly", "minutely", "secondly"];
  const clockFields = ["byhour", "byminute", "bysecond"] as const;
  const frequencyRank = clockFrequency.indexOf(rule.inner.freq);
  for (const [rank, field] of clockFields.entries()) {
    if (parts.get(field.toUpperCase()) !== "") continue;
    if (rank === frequencyRank) options.dateutilEmptyClockPhase = true;
    if (rank > frequencyRank) {
      options.dateutilEmptyClock = true;
      options[field] = [];
    }
  }
  return new RRule({ ...rule.inner, options }, rule.parameterOrder);
}

function validateDateutilUntil(raw: ICalendar.Raw): void {
  const until = raw.rrule?.inner.options?.until;
  if (until != null && (until.z != null) !== dateutilStartIsAware(raw)) {
    throw new Error("RRULE UNTIL values must be specified in UTC when DTSTART is timezone-aware");
  }
}

function rruleJsStart(
  text: string,
): { zone?: string; value: string } | undefined {
  const match = /DTSTART(?:;TZID=([^:=]+?))?[:=]([^;\s]+)/i.exec(text);
  if (match != null) {
    const [, zone, value] = match;
    return { zone, value };
  }
}

function rruleJsDateParts(value: string): RegExpExecArray {
  const parts = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(value);
  if (parts == null) throw new Error("Invalid UNTIL value: " + value);
  return parts;
}

function readRruleJsDate(value: string, midnight = false): Result<IsoDate> {
  return ok(decodeRruleJsDate(rruleJsDateParts(value), midnight));
}

function decodeRruleJsDate(parts: RegExpExecArray, midnight = false): IsoDate {
  const { date, time } = decodeRruleJsWall(parts);
  return new IsoDate(date, parts[4] != null || midnight ? time : null, parts[7] === "Z" ? "Z" : null);
}

function decodeRruleJsWall(parts: RegExpExecArray): NaiveDateTime {
  const [, year, month, day, hour, minute, second] = parts;
  // Date.UTC rolls out-of-range fields and encodes years 0–99 as 1900–1999.
  const mse = Date.UTC(
    Number(year), Number(month) - 1, Number(day),
    Number(hour ?? 0), Number(minute ?? 0), Number(second ?? 0),
  );
  return NaiveDateTime.fromMse(mse as NaiveDateTime["mse"]);
}

const LIBRARY_RULE_PARTS = new Set([
  "FREQ", "UNTIL", "COUNT", "INTERVAL", "BYSECOND", "BYMINUTE", "BYHOUR",
  "BYDAY", "BYWEEKDAY", "BYMONTHDAY", "BYYEARDAY", "BYWEEKNO", "BYMONTH",
  "BYSETPOS", "WKST", "BYEASTER",
]);

const DATEUTIL_INTEGER_PARTS = new Set([
  "COUNT", "INTERVAL", "BYSECOND", "BYMINUTE", "BYHOUR", "BYMONTHDAY",
  "BYYEARDAY", "BYWEEKNO", "BYMONTH", "BYSETPOS", "BYEASTER",
]);

// The pinned CPython 3.12 runtime's default decimal int conversion limit.
const DATEUTIL_MAX_INTEGER_DIGITS = 4300;

function normalizeDateutilInteger(value: string): string | undefined {
  const normalized = normalizeDateutilDigits(value).replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "");
  const digits = /^[+-]?(\d(?:_?\d)*)$/.exec(normalized)?.[1];
  if (digits != null && digits.replaceAll("_", "").length <= DATEUTIL_MAX_INTEGER_DIGITS) {
    return normalized.replaceAll("_", "");
  }
}

function boundDateutilInterval(interval: string, frequency: string): string {
  const unitsPerDay = frequency === "SECONDLY" ? 86_400
    : frequency === "MINUTELY" ? 1_440
    : frequency === "HOURLY" ? 24
    : 1;
  // A step over four million days leaves Python's 0001–9999 calendar.
  // Retain the exact residue to preserve dateutil's subdaily clock tests.
  const beyondCalendar = 4_000_000 * unitsPerDay;
  if (Number(interval) <= beyondCalendar) return interval;
  const residue = Number(BigInt(interval) % BigInt(unitsPerDay));
  return String(beyondCalendar + residue);
}

function rruleJsNumber(value: string): number | string {
  return /^[+-]?\d+$/.test(value) ? Number(value) : value;
}

function normalizeRruleJsParts(parts: Map<string, string>, invalidWeekday: boolean) {
  const freq = parts.get("FREQ");
  if (parts.has("BYEASTER") || freq == null) parts.set("FREQ", "YEARLY");
  else if (Frequency.parse(freq) == null) {
    throw new Error("Invalid frequency: undefined undefined");
  }

  const setpos = parts.get("BYSETPOS");
  if (setpos != null) {
    const scalar = rruleJsNumber(setpos);
    const positions = typeof scalar === "number" ? [scalar]
      : setpos.includes(",") ? setpos.split(",").map(rruleJsNumber) : setpos.split("");
    if (positions.some((pos) => pos === 0 || !(Number(pos) >= -366 && Number(pos) <= 366))) {
      throw new Error("bysetpos must be between 1 and 366, or between -366 and -1");
    }
    parts.set("BYSETPOS", positions.map(Number).join(","));
  }
  if (invalidWeekday) throw new Error("Cannot read properties of undefined (reading 'n')");

  const count = parts.get("COUNT");
  if (count != null && rruleJsNumber(count) !== 0) {
    // The reference decrements a truthy count after accepting an occurrence.
    // NaN ends the rule after that occurrence; negative and fractional
    // counts never decrement to zero.
    const numeric = Number(count);
    if (Number.isNaN(numeric)) parts.set("COUNT", "1");
    else if (Number.isSafeInteger(numeric) && numeric > 0) parts.set("COUNT", String(numeric));
    else parts.delete("COUNT");
  }

  const monthday = parts.get("BYMONTHDAY");
  const defaults = !parts.has("BYWEEKNO") && !parts.has("BYDAY") &&
    !parts.has("BYEASTER") && !parts.get("BYYEARDAY") && !monthday;
  const month = parts.get("BYMONTH");
  if (month != null) {
    if (defaults && parts.get("FREQ") === "YEARLY" &&
        (month === "" || rruleJsNumber(month) === 0)) {
      parts.delete("BYMONTH");
    } else {
      // The reference compares month values by strict equality.
      const months = month.split(",").map(rruleJsNumber).filter((v) => typeof v === "number");
      if (!months.some((value) => value >= 1 && value <= 12)) {
        parts.set("COUNT", "0");
      }
      parts.set("BYMONTH", months.join(","));
    }
  }
  const yearDay = parts.get("BYYEARDAY");
  if (yearDay != null && yearDay !== "") {
    const days = yearDay.split(",").map(rruleJsNumber);
    const value = days[0];
    const numericDays = days.filter((day) => typeof day === "number");
    if (days.length === 1 && typeof value === "string") {
      // A scalar string is searched with String.indexOf; array entries are strict.
      for (let day = -366; day <= 366; day++) {
        if (day !== 0 && value.includes(String(day))) numericDays.push(day);
      }
    }
    const frequency = parts.get("FREQ");
    const interval = rruleJsNumber(parts.get("INTERVAL") ?? "1");
    const negativeDayIndex = typeof interval === "number" && interval < 0 &&
      frequency !== "YEARLY" && frequency !== "MONTHLY";
    if (!numericDays.some((value) =>
      (value !== 0 && Math.abs(value) <= 366) ||
      (negativeDayIndex && Number.isFinite(value) && value <= 0)
    )) {
      parts.set("COUNT", "0");
    }
    parts.set("BYYEARDAY", numericDays.join(","));
  }
  const weeks = parts.get("BYWEEKNO");
  if (weeks != null && !weeks.split(",").map(rruleJsNumber).some((week) =>
    typeof week === "number" ? week !== 0 && Math.abs(week) <= 53
      : Number(week) > 0 && Number(week) <= 53
  )) {
    parts.set("COUNT", "0");
  }
  if (/^[+-]?0+$/.test(parts.get("INTERVAL") ?? "")) parts.set("COUNT", "0");
  if (monthday != null) {
    const scalar = rruleJsNumber(monthday);
    if (monthday.includes(",")) {
      const selected = monthday.split(",").map(rruleJsNumber)
        .filter((day) => Number(day) > 0 || Number(day) < 0);
      // An explicit list suppresses DTSTART defaults even if its filters
      // disappear. The reference drops zero and nonnumeric list entries.
      const days = selected.length === 0 ? Array.from({ length: 31 }, (_, i) => i + 1)
        : selected.filter((day) => typeof day === "number");
      if (!days.some((day) => Math.abs(day) <= 31)) parts.set("COUNT", "0");
      parts.set("BYMONTHDAY", days.join(","));
    } else if (typeof scalar === "number" && !Number.isFinite(scalar)) {
      // Infinity cannot equal a month-day mask entry.
      parts.set("COUNT", "0");
    } else if (typeof scalar === "string") {
      const freq = parts.get("FREQ");
      if (monthday === "" && defaults && (freq === "YEARLY" || freq === "MONTHLY")) {
        parts.delete("BYMONTHDAY");
      } else {
        parts.set("COUNT", "0");
      }
    }
  }
}

// RRuleSet compares the library's serialized original options, retaining
// option order and explicit defaults while normalizing parsed values.
function rruleJsRuleIdentity(parts: ReadonlyMap<string, string>): string {
  const observed: [string, string][] = [];
  for (const [key, raw] of parts) {
    let value: string;
    switch (key) {
      case "FREQ":
        value = raw.toUpperCase();
        break;
      case "WKST":
        value = /^(MO|TU|WE|TH|FR|SA|SU)$/i.test(raw) ? raw.toUpperCase() : "";
        break;
      case "UNTIL":
        value = String(readRruleJsDate(raw, true).exp().extend().mse);
        break;
      case "BYDAY":
        value = raw.split(",").map((day) =>
          day.replace(/^[+-]?\d+/, (ordinal) => String(Number(ordinal)))
        ).join(",");
        break;
      case "BYEASTER":
        value = String(Number(raw));
        break;
      default:
        value = raw.split(",").map(rruleJsNumber).join(",");
    }
    if (value !== "") observed.push([key, value]);
  }
  return JSON.stringify(observed);
}

interface NormalizedRule {
  raw: RRule.Raw;
  rruleJsSetKey?: string;
  dateutilOriginal?: ReadonlyMap<string, string>;
  invalidDateutilSetPosition?: boolean;
  untilOffsetMs?: number;
  untilLocal?: DateutilLocalZone;
}

function libraryRule(
  property: NonNullable<ReturnType<typeof splitICalProperty>>,
  profile: "dateutil" | "rrule-js",
  dateutil?: DateutilRuleContext,
  separateExrule = false,
  rruleJsSetIdentity = true,
): NormalizedRule {
  const [name, ...parameters] = property.attributes;
  if (parameters.length > 0) {
    throw new Error("unsupported " + name.toUpperCase() + " parm: " +
      (profile === "dateutil" ? parameters[0].toUpperCase() : parameters.join(",")));
  }
  if (profile === "dateutil" && property.value.includes(":")) {
    throw new Error(property.value.indexOf(":") !== property.value.lastIndexOf(":")
      ? "too many values to unpack (expected 2)"
      : "unknown parameter name");
  }
  let ruleValue = property.value;
  if (separateExrule) {
    // rrulestr runs parseString on the exclusion value before it supplies
    // the set's DTSTART and TZID to the parsed rule.
    const input = ruleValue.trim();
    const header = /^([A-Z]+?)[:;]/i.exec(input)?.[1].toUpperCase();
    if (header === "DTSTART") {
      const start = rruleJsStart(input);
      if (start != null) rruleJsDateParts(start.value);
      ruleValue = "FREQ=YEARLY";
    } else if (header === "RRULE" || header === "EXRULE") {
      ruleValue = input.replace(/^(?:RRULE|EXRULE):/i, "");
    } else if (header != null) {
      throw new Error("Unsupported RFC prop " + header + " in " + input);
    } else {
      ruleValue = input === "" ? "FREQ=YEARLY" : input;
    }
  }
  return resolveLibraryRule(libraryRuleFields(ruleValue, profile), profile, dateutil, rruleJsSetIdentity);
}

function* libraryRuleFields(
  rule: string,
  profile: "dateutil" | "rrule-js",
): IterableIterator<[string, string | undefined]> {
  for (const part of rule.split(";")) {
    const separator = part.indexOf("=");
    if (profile === "dateutil") {
      if (separator === -1) throw new Error("not enough values to unpack (expected 2, got 1)");
      if (separator !== part.lastIndexOf("=")) throw new Error("too many values to unpack (expected 2)");
    }
    const rawKey = separator < 0 ? part : part.slice(0, separator);
    const rawValue = separator < 0 ? undefined : profile === "rrule-js"
      ? part.split("=", 2)[1] : part.slice(separator + 1);
    yield [rawKey, rawValue];
  }
}

function resolveLibraryRule(
  fields: Iterable<readonly [string, string | undefined]>,
  profile: "dateutil" | "rrule-js",
  dateutil?: DateutilRuleContext,
  rruleJsSetIdentity = true,
): NormalizedRule {
  const parts = new Map<string, string>();
  const rruleJsOriginal = profile === "rrule-js" && rruleJsSetIdentity ? new Map<string, string>() : undefined;
  let untilOffsetMs: number | undefined;
  let untilLocal: DateutilLocalZone | undefined;
  let invalidRruleJsWeekday = false;
  for (const [rawKey, rawValue] of fields) {
    const key = rawKey.toUpperCase();
    if (profile === "rrule-js" && (key === "DTSTART" || key === "TZID")) continue;
    if (!LIBRARY_RULE_PARTS.has(key)) {
      throw new Error(profile === "dateutil"
        ? "unknown parameter '" + key + "'"
        : "Unknown RRULE property '" + rawKey + "'");
    }
    if (rawValue == null) throw new Error("Invalid RRULE part: " + key);
    let value = profile === "rrule-js" &&
        (key === "COUNT" || key === "BYMONTHDAY" || key === "INTERVAL" ||
          key === "BYHOUR" || key === "BYMINUTE" || key === "BYSECOND" || key === "UNTIL")
      ? rawValue
      : rawValue.toUpperCase();
    if (profile === "dateutil" && (
      (key === "FREQ" && Frequency.parse(value) == null) ||
      (key === "WKST" && !/^(MO|TU|WE|TH|FR|SA|SU)$/.test(value))
    )) {
      throw new Error("invalid '" + key + "': " + value);
    }
    if (profile === "dateutil" && DATEUTIL_INTEGER_PARTS.has(key)) {
      const items = key === "COUNT" || key === "INTERVAL" ? [value] : value.split(",");
      const integers = items.map(normalizeDateutilInteger);
      if (integers.some((integer) => integer == null)) {
        throw new Error("invalid '" + key + "': " + value);
      }
      value = integers.join(",");
    }
    const canonicalKey = key === "BYWEEKDAY" ? "BYDAY" : key;
    if (canonicalKey === "BYDAY") {
      if (profile === "dateutil") {
        value = value.split(",").map((day) => {
          const [weekday, suffix] = day.split("(");
          if (suffix == null) return day;
          // dateutil drops the last character in the first parenthesized field.
          const ordinal = normalizeDateutilInteger(suffix.replace(/.$/su, ""));
          return ordinal == null ? day : ordinal + weekday;
        }).join(",");
      }
      const weekday = profile === "dateutil"
        ? /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/
        : /^([+-]?\d{1,2})?([A-Z]{2})$/;
      invalidRruleJsWeekday = false;
      for (const token of (profile === "dateutil" ? value : rawValue).split(",")) {
        const match = weekday.exec(token);
        if (profile === "rrule-js") {
          const known = /^(MO|TU|WE|TH|FR|SA|SU)$/.test(match?.[2] ?? "");
          if (token.length === 2 && !known) {
            invalidRruleJsWeekday = true;
            continue;
          }
          if (match?.[1] != null && !known) {
            throw new Error("Cannot read properties of undefined (reading 'weekday')");
          }
        }
        const ordinal = match?.[1];
        const zero = ordinal != null && Number(ordinal) === 0;
        const invalidDateutilOrdinal = profile === "dateutil" && ordinal != null &&
          normalizeDateutilInteger(ordinal) == null;
        if (match == null || zero || invalidDateutilOrdinal) {
          throw new Error(profile === "dateutil" ? "invalid '" + key + "': " + rawValue.toUpperCase()
            : zero ? "Can't create weekday with n == 0" : "Invalid weekday string: " + token);
        }
      }
    }
    if (key === "UNTIL") {
      if (profile === "dateutil") {
        try {
          const { parseUntil, dateContext } = dateutil!;
          const until = parseUntil(value, dateContext);
          value = until.text;
          untilOffsetMs = until.offsetMs;
          untilLocal = until.local;
        } catch {
          throw new Error("invalid 'UNTIL': " + value);
        }
      } else {
        rruleJsDateParts(value);
      }
    }
    parts.set(canonicalKey, value);
    rruleJsOriginal?.set(canonicalKey, rawValue);
  }
  let dateutilOriginal: ReadonlyMap<string, string> | undefined;
  if (profile === "dateutil") {
    const frequency = parts.get("FREQ");
    if (frequency == null) {
      throw new Error("rrule.__init__() missing 1 required positional argument: 'freq'");
    }
    dateutilOriginal = new Map(parts);
    // Impossible values still suppress the corresponding DTSTART defaults.
    for (const key of ["BYMONTH", "BYWEEKNO", "BYMONTHDAY", "BYYEARDAY"]) {
      const selector = parts.get(key);
      if (selector == null) continue;
      parts.set(key, selector.split(",").map((value) =>
        Number.isFinite(Number(value)) ? value : String(Math.sign(Number(value)) * Number.MAX_SAFE_INTEGER)
      ).join(","));
    }
    const interval = parts.get("INTERVAL");
    if (interval != null) parts.set("INTERVAL", boundDateutilInterval(interval, frequency));
    const count = parts.get("COUNT");
    if (count != null && !Number.isSafeInteger(Number(count))) {
      // An overflowing negative count must still stop the rule immediately.
      parts.set("COUNT", String(Math.sign(Number(count)) * Number.MAX_SAFE_INTEGER));
    }
  } else {
    normalizeRruleJsParts(parts, invalidRruleJsWeekday);
  }
  // RRule.parse discards zero positions. Remember the written value so
  // dateutil can check its range after validating DTSTART/UNTIL awareness.
  const invalidDateutilSetPosition = profile === "dateutil" &&
    parts.get("BYSETPOS")?.split(",").some((value) =>
      Number(value) === 0 || Math.abs(Number(value)) > 366
    );
  if (profile === "dateutil" && dateutil?.weekStart != null && !parts.has("WKST")) {
    parts.set("WKST", Weekday.toString2cap(dateutil.weekStart));
  }
  const raw = ruleFromParts(parts);
  if (profile === "rrule-js" && rruleJsOriginal == null) {
    // Keep validation of the last UNTIL at the same point as the set key.
    const until = parts.get("UNTIL");
    if (until != null) void readRruleJsDate(until, true).exp().extend().mse;
  }
  return {
    raw,
    rruleJsSetKey: rruleJsOriginal == null ? undefined : rruleJsRuleIdentity(rruleJsOriginal),
    dateutilOriginal,
    invalidDateutilSetPosition,
    untilOffsetMs,
    untilLocal,
  };
}

function validateGoogleDateParameters(attributes: string[]): void {
  const seen = new Set<string>();
  for (let i = 1; i < attributes.length; i++) {
    const attribute = attributes[i];
    const separator = attribute.indexOf("=");
    const key = attribute.slice(0, separator).toUpperCase();
    if (separator < 1 || (key !== "TZID" && key !== "VALUE" && !key.startsWith("X-"))) {
      throw new Error("Unsupported Google recurrence date parameter: " + attribute);
    }
    if (seen.has(key)) throw new Error("Duplicate Google recurrence date parameter: " + key);
    seen.add(key);
    if (key === "VALUE") {
      const value = unquoteICalParameter(attribute.slice(separator + 1)).toUpperCase();
      if (value !== "DATE" && value !== "DATE-TIME" && value !== "PERIOD") {
        throw new Error("Unsupported Google recurrence date VALUE: " + value);
      }
      attributes[i] = "VALUE=" + value;
    }
  }
}

function googleRuleParts(value: string): Map<string, string> {
  const minInteger = -2_147_483_648;
  const maxInteger = 2_147_483_647;
  const parts = parseRuleParts(value.split(";").filter(Boolean).join(";"));
  for (const [key, part] of parts) {
    if (!LIBRARY_RULE_PARTS.has(key)) throw new Error("Unknown RRULE part: " + key);
    if (key === "COUNT" || key === "INTERVAL") {
      const number = Number(part);
      if (!/^[+-]?\d+$/.test(part) || number < minInteger || number > maxInteger) {
        throw new Error("Invalid " + key);
      }
    } else if (key === "BYDAY") {
      if (!part.split(",").every((token) => {
        const match = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(token);
        return match != null &&
          (match[1] == null || (Number(match[1]) !== 0 && Math.abs(Number(match[1])) <= 53));
      })) throw new Error("Invalid BYDAY");
    } else if (key === "WKST") {
      if (!/^(MO|TU|WE|TH|FR|SA|SU)$/.test(part)) throw new Error("Invalid WKST");
    } else if (key === "BYMONTH") {
      if (!ruleNumbersInRange(part, -13, 13, true)) throw new Error("Invalid BYMONTH");
      const months = part.split(",").map(Number)
        .filter((month) => Math.abs(month) !== 13)
        .map((month) => month > 0 ? month : month + 13);
      parts.set("BYMONTH", months.length > 0 ? [...new Set(months)].join(",") : "13");
    } else if (Object.hasOwn(RULE_NUMBER_PARTS, key)) {
      const [min, max, nonzero] = RULE_NUMBER_PARTS[key];
      const signed = min < 0 ? part : part.replace(/(^|,)\+(?=\d)/g, "$1");
      if (!ruleNumbersInRange(signed, min, key === "BYSECOND" ? 59 : max, nonzero)) {
        throw new Error("Invalid " + key);
      }
    }
  }
  if (parts.has("COUNT") && parts.has("UNTIL")) {
    throw new Error("COUNT and UNTIL are mutually exclusive");
  }
  const count = Number(parts.get("COUNT"));
  // Google expands both 0 and the minimum signed integer as unbounded rules.
  if (count === 0 || count === minInteger) parts.delete("COUNT");
  if (parts.has("INTERVAL") && Number(parts.get("INTERVAL")) <= 0) {
    parts.delete("INTERVAL");
  }
  return parts;
}

function ruleFromParts(parts: Map<string, string>): RRule.Raw {
  return new RRule.Raw(new ICalAttributes(parts, [...parts.keys()]));
}

function profileRule(
  line: string,
  profile: RecurrenceProfile,
  dateutil?: DateutilRuleContext,
  separateExrule = false,
  validatedRfcRule?: Map<string, string>,
  rruleJsSetIdentity = true,
): NormalizedRule {
  if (validatedRfcRule != null) {
    const seconds = validatedRfcRule.get("BYSECOND");
    if (seconds != null) {
      validatedRfcRule.set("BYSECOND", seconds.split(",").map((second) => Number(second) === 60 ? "59" : second).join(","));
    }
    // A safe integer exceeds the number of periods in the supported calendar.
    for (const key of ["COUNT", "INTERVAL"]) {
      const value = validatedRfcRule.get(key);
      if (value != null) validatedRfcRule.set(key, String(Math.min(Number(value), Number.MAX_SAFE_INTEGER)));
    }
    return { raw: ruleFromParts(validatedRfcRule) };
  }
  const property = profile === "rrule-js" || profile === "dateutil"
    ? splitLiteralICalProperty(line)
    : splitICalProperty(line);
  if (property == null) throw new Error("Invalid recurrence rule property");
  if (profile === "dateutil" || profile === "rrule-js") {
    return libraryRule(property, profile, dateutil, separateExrule, rruleJsSetIdentity);
  }
  const rule = "RRULE:" + property.value.toUpperCase();
  if (/(?:^RRULE:|;)BY(?:WEEKDAY|EASTER)=/.test(rule)) {
    throw new Error("Unsupported recurrence selector");
  }
  if (profile !== "google") return { raw: RRule.Raw.parse(rule) };
  if (property.attributes.length > 1) {
    throw new Error("Unsupported Google recurrence property parameter: " + property.attributes[1]);
  }
  const parsed = googleRuleParts(property.value);
  const frequency = parsed.get("FREQ");
  if (
    frequency === "HOURLY" || frequency === "MINUTELY" ||
    frequency === "SECONDLY"
  ) {
    throw new Error("Unsupported Google recurrence frequency: " + frequency);
  }
  const name = property.attributes[0].toUpperCase();
  const until = parsed.get("UNTIL");
  if (until?.includes("T")) {
    if (!until.endsWith("Z")) throw new Error("Google " + name + " UNTIL date-time must be UTC");
    if (!/^\d{8}T\d{6}Z$/.test(until)) throw new Error("Invalid Google " + name + " UNTIL date-time");
  } else if (until != null) {
    // Both rule forms use an inclusive cutoff at midnight UTC.
    parsed.set("UNTIL", until.replace(/^(\d{8})$/, "$1T000000Z"));
  }
  for (const key of ["BYHOUR", "BYMINUTE", "BYSECOND"]) {
    // A scalar overrides the clock field. A list uses the master's field.
    if (parsed.get(key)?.includes(",")) parsed.delete(key);
  }
  if (frequency === "DAILY") {
    parsed.delete("BYSETPOS");
    if (parsed.has("BYMONTHDAY")) parsed.delete("INTERVAL");
  }
  if (frequency !== "YEARLY") {
    parsed.delete("BYWEEKNO");
    parsed.delete("BYYEARDAY");
  } else if (parsed.has("BYMONTHDAY") || parsed.has("BYYEARDAY")) {
    parsed.delete("BYWEEKNO");
  }
  return { raw: ruleFromParts(parsed) };
}
