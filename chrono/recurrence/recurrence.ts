import { RecurrenceExpansionLimitError } from "./generation-limit.ts";
export { RecurrenceExpansionLimitError } from "./generation-limit.ts";
import { DateTime } from "../datetime.ts";
import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { Result, err, ok } from "../result.ts";
import { FixedOffset, Tzname, Utc } from "../timezone.ts";
import { TimezoneRegion } from "../timezone-region.ts";
import { YearMonthDay } from "../units/year-month-day.ts";
import {
  CountPattern,
  calculateGoogleCalendarStartDate,
  createExcludedDatesSet,
  detectCountPattern,
  processAllEvents,
  shouldEmitStartDateSeparately,
  startDateMatchesByday,
} from "./google-calendar-utils.ts";
import { ExDate } from "./exdate.ts";
import { GOOGLE_REFORM_GAP_DAYS } from "./google-julian-calendar.ts";
import {
  ICalAttributes,
  calendarContentLines,
  icalPropertyName,
  splitICalProperty,
  unquoteICalParameter,
} from "./ical-attributes.ts";
import {
  googleRecurrenceTimezone,
  knownGoogleDateTimezoneName,
  loadedGoogleDateTimezone,
  resolveGoogleDateTimezone,
} from "./google-timezones.ts";
import { ICalDateLine } from "./ical-date-line.ts";
import { ICalendar } from "./ical.ts";
import { IsoDate } from "./iso-date.ts";
import { RRuleInstances } from "./instances.ts";
import { RruleJsCalendar } from "./rrule-js-calendar.ts";
import type { GraphRecurrenceOptions, GraphRecurringMaster } from "./graph.ts";
import { ICalendarRecurrenceOptions, RecurrenceSeries } from "./series.ts";
export type { GraphRecurrenceOptions, GraphRecurringMaster } from "./graph.ts";
export type { DateutilHost } from "./dateutil-host.ts";
export { DateutilTzif, type DateutilZone } from "./dateutil-tzif.ts";
export { DateutilPosixZone } from "./dateutil-posix.ts";
import type { DateutilRecurrenceSet, DateutilSetOptions } from "./dateutil-set.ts";
export type { DateutilQueryBound, DateutilRecurrenceSet, DateutilSetOptions, DateutilSlice, DateutilXAfterOptions } from "./dateutil-set.ts";
export type { DateutilReplaceOptions, GoogleCalendarInstanceEdit, GraphCalendarViewEdit, ICalendarRecurrenceOptions, ICalendarRecurrenceProfile, RecurrenceOccurrence, RecurrenceProfile, RecurrenceStart, RecurrenceSeries, RruleJsExactNeighbor } from "./series.ts";
import type { MsSinceEpoch } from "../units/units.ts";
import type { Option } from "../option.ts";

/**
 * Google Calendar-specific recurrence rule implementation
 *
 * This implementation handles Google Calendar's specific behavior for recurrence
 * rules, which differs from the standard RFC 5545 iCalendar specification in
 * several key ways:
 *
 * ## DST (Daylight Saving Time) Handling
 *
 * Google Calendar preserves local time across DST transitions rather than UTC time.
 * This means:
 * - When DST begins (spring forward): Events maintain their local time, effectively
 *   shifting earlier in UTC
 * - When DST ends (fall back): Events maintain their local time, effectively
 *   shifting later in UTC
 *
 * Example:
 * - Event at 10:00 AM EST before DST → 10:00 AM EDT after DST
 * - UTC time changes from 15:00 to 14:00, but local time stays 10:00
 *
 * ## UNTIL Date Handling
 *
 * Google Calendar treats UNTIL dates differently based on whether they include
 * a time component:
 * - **Date-only UNTIL** (e.g., `20250610`): Exclusive of the entire day
 * - **DateTime UNTIL** (e.g., `20150209T043000Z`): Inclusive up to exact datetime
 *
 * This differs from RFC 5545 which specifies UNTIL as always inclusive.
 *
 * ## BYDAY Parsing
 *
 * Google Calendar supports nth-weekday patterns in BYDAY rules:
 * - `2TU` = second Tuesday of the month
 * - `-1FR` = last Friday of the month
 * - `TU` = every Tuesday (regular weekday pattern)
 *
 * The implementation detects the pattern type and uses appropriate filtering.
 *
 * ## Implementation Details
 *
 * - Uses `GoogleEventGenerator` class for Google-specific event generation
 * - Leverages `TimezoneRegion.googleDatetimeResolved()` for DST handling
 * - Implements proper date-only vs datetime UNTIL distinction in RRule parsing
 * - Handles nth-weekday patterns via `bynthday` field in RRuleLike interface
 *
 * ## Key Learnings
 *
 * During implementation, we discovered that Google Calendar's behavior differs
 * significantly from RFC 5545 in subtle but important ways:
 *
 * 1. **UNTIL Date Interpretation**: The presence or absence of a time component
 *    in the UNTIL value completely changes the semantic meaning (inclusive vs exclusive)
 *
 * 2. **DST Transition Handling**: Google Calendar prioritizes user experience
 *    (consistent local time) over strict UTC time preservation
 *
 * 3. **Test-Driven Discovery**: Many of these behaviors were discovered through
 *    systematic testing against real Google Calendar API responses rather than
 *    being documented in official specifications
 *
 * These differences highlight the importance of testing against actual API
 * behavior rather than relying solely on standards documentation.
 */

export interface QueryRange {
  start: string;
  end: string;
}

/**
 * How a recurrence set is composed where RFC 5545 leaves the choice open or
 * where a provider is known to differ. A series is generated with one
 * composition (`GoogleEventGenerator`, `Recurrence.generateEvents`); the SDK
 * picks it in one place (`recurrenceCompositionOf`), and today every series
 * uses `GOOGLE` (operator ruling 2026-10-03: "Google for everything").
 */
export interface RecurrenceComposition {
  readonly name: "rule-only" | "google";
  /**
   * DTSTART is always an instance of the series, even when it does not match
   * the rule, and COUNT then counts the rule's instances after it (one more
   * instance in all). RFC 5545 §3.3.10 says "The DTSTART property value
   * always counts as the first occurrence", and §3.8.5.3 says that a set
   * whose DTSTART is not synchronized with the rule "is undefined". Google
   * Calendar emits such a DTSTART on top of COUNT. Its recorded API output
   * in `tests/google_recurrence_test_data`, pinned through `GOOGLE` by
   * `tests/test_recurrence_composition.deno.test.ts`, shows this in
   * `start_date_different_weekday` (COUNT=3 gives 4) and eight BYWEEKNO
   * fixtures. When DTSTART matches the rule, both compositions give exactly
   * COUNT instances.
   * Off: DTSTART is an instance only when the rule produces it.
   */
  readonly dtstartAlwaysInstance: boolean;
  /** A provider's RDATE set may use DTSTART only to supply context. */
  readonly includeStartWithoutRule?: boolean;
  /** Provider ceiling for ordinary generated and explicit starts. */
  readonly lastRecurrenceInstant?: DateTime<Utc>;
  /** An instant beyond this Google query bound ends raw yearly trial traversal. */
  readonly googleQueryStopAfter?: number;
  readonly googleQueryIncludesRdate?: (mse: number) => boolean;
  /** An explicit inclusion before the ceiling in the other date-type stream. */
  readonly googleHasEarlyAlternateRdate?: boolean;
  /** Leave late-start selection to the composed Google series. */
  readonly googleSelectFallback?: boolean;
  /** Match a wrapped Google rule or explicit inclusion against generated exclusions. */
  readonly googleExcludedByRule?: (instant: DateTime<Utc>) => boolean;
  /** A wrapped Google EXRULE exposes only its forward candidates. */
  readonly googleSkipRewoundExclusions?: boolean;
  /** Scan aliased yearly trials through the provider horizon or the query's raw stop. */
  readonly scanGoogleYearlyHorizon?: boolean;
  /** dateutil compares same-zone rule candidates by their original wall time. */
  readonly useDateutilWallIdentity?: boolean;
  /** Count positions within the first weekly day set from DTSTART's date. */
  readonly clipFirstWeek?: boolean;
  /** rrule.js consumes a COUNT slot for every BYSETPOS pick before set deduplication. */
  readonly countRepeatedSetPositions?: boolean;
  /** A standalone rrule.js rule emits every selected occurrence. */
  readonly preserveRruleJsDuplicates?: boolean;
  /** rrule.js checks EXRULE with a bounded lookup at each included instant. */
  readonly rruleJsExruleWindow?: boolean;
  /** Compare timed UNTIL with the encoded wall fields before timezone conversion. */
  readonly untilUsesWallTime?: boolean;
  /**
   * Google's BYWEEKNO handling: the consecutive-weekly COUNT patterns
   * (`detectCountPattern`), the generator start date
   * (`calculateGoogleCalendarStartDate`) and the BYWEEKNO/BYDAY filter
   * composition (`RRule.toFilterProps`). This is the old
   * `useGoogleCalendarBehavior` flag.
   */
  readonly googleByweekno: boolean;
  /** Use the provider's WKST and first-year negative week selection. */
  readonly useGoogleYearlyWeeks?: boolean;
  readonly resolveWallTime?: (
    zone: TimezoneRegion,
    local: NaiveDateTime,
    start: DateTime<FixedOffset>,
  ) => DateTime<FixedOffset>;
  /** Upper bound on the offset subtracted from wall time near this instant. */
  readonly wallOffsetBound?: (zone: TimezoneRegion, centerMse: number) => number;
  /** Resolve a named EXDATE to one instant even when its TZID matches the series. */
  readonly namedExdatesMatchInstants?: boolean;
  /** Resolve a wall time written with its own TZID on RDATE or EXDATE. */
  readonly resolveNamedDate?: (
    zone: TimezoneRegion,
    local: NaiveDateTime,
  ) => DateTime<Utc>;
  /** Interpret a timed EXDATE according to a compatibility profile. Null omits it. */
  readonly resolveExdate?: (
    value: NaiveDateTime,
    region: TimezoneRegion | null,
    utc: boolean,
    seriesZone: TimezoneRegion | null,
  ) => DateTime<Utc> | null;
  /** Interpret a timed RDATE using the selected profile. */
  readonly resolveRdate?: (value: NaiveDateTime, seriesZone: TimezoneRegion | null) => DateTime<Utc>;
  /**
   * An EXDATE uses up a COUNT slot in every composition, on every path
   * (BYWEEKNO included). EXDATE removes instances from the set the rule and
   * its RDATEs generated; it never pulls in a later instance to refill the
   * count. This is RFC 5545's set semantics (§3.8.5.1, §3.3.10), and it is
   * what the Google recordings show. The live `week-count-exclude` capture
   * combines BYWEEKNO, COUNT=4, and an EXDATE. Google returns three
   * occurrences and leaves the later rule candidate outside the count.
   */
  readonly exdateCountsTowardCount: true;
}

/** The two compositions (`RULE_ONLY`, `GOOGLE`), and `of` for the old boolean flag. */
export namespace RecurrenceComposition {
  /**
   * The rule as written: an unsynchronised DTSTART is not an instance, and
   * BYWEEKNO follows the RFC. This is not RFC 5545 §3.3.10, which counts
   * DTSTART as the first instance (operator ruling 2026-10-03: renamed from
   * `RFC5545`).
   */
  export const RULE_ONLY: RecurrenceComposition = Object.freeze({
    name: "rule-only",
    dtstartAlwaysInstance: false,
    googleByweekno: false,
    exdateCountsTowardCount: true,
  });
  /** @deprecated Use `RULE_ONLY`. This is the same composition under its old name, kept for one round. */
  export const RFC5545: RecurrenceComposition = RULE_ONLY;
  /** Google Calendar's observed composition (see the members' docs). */
  export const GOOGLE: RecurrenceComposition = Object.freeze({
    name: "google",
    dtstartAlwaysInstance: true,
    googleByweekno: true,
    exdateCountsTowardCount: true,
  });
  /** The composition the old `useGoogleCalendarBehavior` flag meant (compatibility read). */
  export function of(useGoogleCalendarBehavior: Option<boolean> | undefined): RecurrenceComposition {
    return useGoogleCalendarBehavior ? GOOGLE : RULE_ONLY;
  }
}

interface GeneratedOccurrence {
  readonly instant: DateTime<Utc>;
  readonly key: number | string;
  readonly wall?: NaiveDateTime;
}

// State for generating recurrence events
interface RecurrenceGenerationState {
  composition: RecurrenceComposition;
  hasRrule: boolean;
  seenOccurrences: Set<number | string>;
  generator: Generator<YearMonthDay | null>;
  dateWindow: YearMonthDay.RangeWindow;
  // A rule with time parts (`RRule.hasTimeParts`): its instances as wall
  // times in the series' zone (`RRuleInstances`), in place of `generator`.
  wallGenerator: Option<Generator<NaiveDateTime | null>>;
  wallWindow?: RRuleInstances.Window;
  referenceCalendar?: RruleJsCalendar;
  // DTSTART's wall time in the series' zone.
  startLocal: NaiveDateTime;
  startDateParsed: NaiveDate;
  startDateTime: DateTime<FixedOffset>; // Original datetime with offset to preserve local time
  timezone?: Option<TimezoneRegion>; // Timezone for handling DST shifts
  coverageEnd: number;
  excl: Exclusions;
  startDateExcluded: boolean;
  untilDate?: NaiveDate;
  untilDt: Option<DateTime<Utc>>;
  // Upper wall-clock bound corresponding to `untilDt` (accounting for any DST
  // transition within +/-48h). No wall time strictly past this bound can
  // resolve to an instant <= `untilDt`.
  wallUntilBound: Option<NaiveDateTime>;
  // Wall time of the latest rule candidate read. A library can visit times
  // out of order within a day, so its cursor may need an extra day of lookahead.
  lastCandidateWallMse: Option<number>;
  rruleJsExruleLatest?: number;
  rruleJsQueryAccept?: (event: DateTime<Utc>, wall: NaiveDateTime) => boolean;
  wallLookaheadMs: number;
  allGeneratedEvents: GeneratedOccurrence[];
  preserveRuleWallTime: boolean; // Buffer all generated events
  // RDATE instances (sorted, unique) and the
  // next one not yet merged into `allGeneratedEvents`.
  rdates: readonly DateTime<Utc>[];
  rdateNext: number;
  lastMergedRdateMse?: number;
  startHandled: boolean;
  generationComplete: boolean; // Track if we've exhausted the generator
  googleQueryStopAfter?: number;
  googleYearlyOrdinalRewind: boolean;
  googleExclusionFloor?: number;
  generationLimit?: number;
  candidates: number;
  failure?: RecurrenceExpansionLimitError;
  lastReturnedIndex: number; // Track how many events we've returned so far
}

/**
 * The series' EXDATEs, matched per instance (RFC 5545 §3.8.5.1): an EXDATE
 * removes the instance at exactly that DATE-TIME, not every instance of its
 * day. A value is read in the form it was written (§3.3.5):
 * - `VALUE=DATE` or a date-only value: every instance on that local day
 *   (`localDays`, the day in the series' zone);
 * - floating (no `Z`, no TZID), or a TZID naming the series' zone: the
 *   instance at that wall-clock time in the series' zone (`localTimes`,
 *   naive ms) — compared as wall time, so it matches across DST exactly as
 *   the instance was placed;
 * - UTC (`Z`), or a TZID naming another zone (resolved there): the
 *   instance at that instant (`instants`, ms since epoch).
 */
export interface Exclusions {
  readonly localDays: ReadonlySet<number>;
  readonly localTimes: ReadonlySet<number>;
  readonly instants: ReadonlySet<number>;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TRANSITION_WINDOW_MS = 48 * 60 * 60 * 1000;

/** @internal Exclusive UTC coverage limit of any calendar-defined zone used by the recurrence. */
export function recurrenceCoverageEnd(lines: ICalendar.Lines, timezone: Option<TimezoneRegion>): number {
  let end = Math.min(timezone?.calendarCoverageEnd ?? Infinity, lines.dtstart?.region?.calendarCoverageEnd ?? Infinity);
  for (const dates of [lines.rdate, lines.exdate]) {
    for (const line of dates ?? []) end = Math.min(end, line.region?.calendarCoverageEnd ?? Infinity);
  }
  return end;
}

/** @internal Require coverage of the entire inclusive UTC query day. */
export function requireRecurrenceCoverage(through: NaiveDate, coverageEnd: number): void {
  if (through.mse + MS_PER_DAY > coverageEnd) {
    throw new RangeError("VTIMEZONE table does not cover the full UTC date " + through);
  }
}

/**
 * Maximum UTC offset (ms) active in `timezone` within +/-48h of `centerMse`.
 * Any wall time `w > centerMse + maxOffsetMsNear(...)` is guaranteed to resolve
 * to an instant strictly greater than `centerMse` (even across 24-hour date-line
 * jumps or multi-hour DST overlaps).
 */
/** @internal Upper regional offset near an instant, for wall-clock lookahead. */
export function maxOffsetMsNear(
  timezone: TimezoneRegion,
  centerMse: number,
  startOffsetMs?: number,
): number {
  const bound = offsetBoundNear(timezone, centerMse, Math.max);
  return startOffsetMs == null ? bound : Math.max(bound, startOffsetMs);
}

/** @internal Lower regional offset near an instant, for wall-clock lookahead. */
export function minOffsetMsNear(timezone: TimezoneRegion, centerMse: number): number {
  return offsetBoundNear(timezone, centerMse, Math.min);
}

/** @internal Upper wall-clock lookahead for a calendar-defined RFC zone. */
export function rfcWallOffsetBound(timezone: TimezoneRegion, centerMse: number): number {
  const instant = DateTime.fromMse(centerMse as MsSinceEpoch, Utc);
  return offsetBoundNear(timezone, centerMse, Math.max,
    timezone.toRfc5545LocalTime(instant).tz.info.offset.toMs);
}

function offsetBoundNear(
  timezone: TimezoneRegion,
  centerMse: number,
  bound: typeof Math.max,
  initialOffsetMs?: number,
): number {
  let result = initialOffsetMs ?? timezone.tzAtMse(centerMse as MsSinceEpoch).info.offset.toMs;
  const near = timezone.recurrenceTransitions(
    centerMse - TRANSITION_WINDOW_MS,
    centerMse + TRANSITION_WINDOW_MS,
  );
  for (const tr of near) {
    result = bound(result, tr.before.time.tz.info.offset.toMs, tr.after.time.tz.info.offset.toMs);
  }
  return result;
}

function resolveNamedWall(
  composition: RecurrenceComposition,
  region: TimezoneRegion,
  ndt: NaiveDateTime,
): DateTime<Utc> {
  if (composition.resolveNamedDate != null) return composition.resolveNamedDate(region, ndt);
  return composition.name === "rule-only"
    ? region.toRfc5545WallClock(ndt).toUtc()
    : region.toWallClock(ndt).toUtc();
}

/** `recurrence`'s EXDATEs for a series whose wall clock is `timezone` (null: the DTSTART offset / UTC frame). */
export function exclusionsOf(
  recurrence: Recurrence,
  timezone: Option<TimezoneRegion>,
  composition: RecurrenceComposition = RecurrenceComposition.GOOGLE,
): Exclusions {
  const localDays = new Set<number>();
  const localTimes = new Set<number>();
  const instants = new Set<number>();
  for (const line of recurrence.inner.lines.exdate ?? []) {
    line.dates.forEach((ndt, i) => {
      const form = line.forms?.[i] ?? { timed: true, utc: false };
      if (line.value === "DATE" || !form.timed) localDays.add(ndt.date.dse);
      else if (
        composition.useDateutilWallIdentity && !form.utc &&
        line.region != null && line.region.fullname === timezone?.fullname
      ) localTimes.add(ndt.mse);
      else if (composition.resolveExdate != null) {
        const instant = composition.resolveExdate(ndt, line.region ?? null, form.utc, timezone ?? null);
        if (instant != null) instants.add(instant.mse);
      } else if (form.utc) instants.add(new DateTime(ndt, Utc).mse);
      else if (
        composition.namedExdatesMatchInstants && line.region != null &&
        line.region.fullname === timezone?.fullname
      ) {
        instants.add(line.region.toRfc5545WallClock(ndt).mse);
      } else if (
        line.region != null &&
        (composition.resolveNamedDate != null || composition.name === "rule-only" ||
          line.region.fullname !== timezone?.fullname)
      ) {
        // Calendar-defined TZIDs can share a region name but supply different transitions.
        instants.add(resolveNamedWall(composition, line.region, ndt).mse);
      } else if (composition.name === "rule-only" && timezone != null) {
        // The legacy rule-only reader resolves a floating exclusion in the series zone.
        instants.add(timezone.toRfc5545WallClock(ndt).toUtc().mse);
      } else localTimes.add(ndt.mse);
    });
  }
  return { localDays, localTimes, instants };
}

/**
 * `exclusionsOf` for callers that hold the raw recurrence lines and must
 * decide synchronously (no zone load): the `EXDATE` lines of `lines`, the
 * series' zone `seriesZone` (null: the DTSTART offset / UTC frame), and
 * `regionOf` answering an already-loaded zone. Null when a TZID names
 * another zone that `regionOf` cannot answer yet (the caller defers).
 */
export function exclusionsOfLines(
  lines: readonly string[],
  seriesZone: Option<Tzname>,
  regionOf: (tz: Tzname) => Option<TimezoneRegion>,
  composition: RecurrenceComposition = RecurrenceComposition.GOOGLE,
  { ignoreDates = false }: { ignoreDates?: boolean } = {},
): Option<Exclusions> {
  const localDays = new Set<number>();
  const localTimes = new Set<number>();
  const instants = new Set<number>();
  const google = composition.name === "google";
  const loadedZone = google
    ? (name: Tzname) => loadedGoogleDateTimezone(name, regionOf)
    : regionOf;
  for (const line of lines) {
    if (icalPropertyName(line) !== "EXDATE") continue;
    const parsed = ExDate.parse(line);
    if (parsed.isErr) continue;
    const exdate = parsed.asOk()!;
    for (const d of exdate.dates) {
      if (ignoreDates && d.nt == null) continue;
      const ndt = d.extend();
      if (d.nt == null) localDays.add(ndt.date.dse);
      else if (
        composition.useDateutilWallIdentity && d.z == null &&
        exdate.tzid != null && exdate.tzid === seriesZone
      ) localTimes.add(ndt.mse);
      else if (composition.resolveExdate != null) {
        const region = exdate.tzid == null ? null : loadedZone(exdate.tzid);
        const zone = seriesZone == null ? null : loadedZone(seriesZone);
        if ((exdate.tzid != null && region == null) || (seriesZone != null && zone == null)) return null;
        const instant = composition.resolveExdate(ndt, region ?? null, d.z != null, zone ?? null);
        if (instant != null) instants.add(instant.mse);
      } else if (d.z != null) instants.add(new DateTime(ndt, Utc).mse);
      else if (
        exdate.tzid != null &&
        (google || composition.namedExdatesMatchInstants || composition.resolveNamedDate != null || exdate.tzid !== seriesZone)
      ) {
        const region = loadedZone(exdate.tzid);
        if (region == null) return null;
        const instant = google && composition.resolveNamedDate == null
          ? region.toRfc5545WallClock(ndt)
          : resolveNamedWall(composition, region, ndt);
        instants.add(instant.mse);
      } else if (composition.name === "rule-only" && seriesZone != null) {
        const region = loadedZone(seriesZone);
        if (region == null) return null;
        instants.add(region.toRfc5545WallClock(ndt).toUtc().mse);
      } else localTimes.add(ndt.mse);
    }
  }
  return { localDays, localTimes, instants };
}

/** Check a timed Google master slot using only timezones the caller has loaded. */
export function googleTimedStartExcluded(
  lines: readonly string[],
  start: DateTime<Utc>,
  timeZone: string | undefined,
  regionOf: (tz: Tzname) => Option<TimezoneRegion>,
): boolean | null {
  const unfolded = calendarContentLines(lines);
  if (!unfolded.some((line) => icalPropertyName(line) === "EXDATE")) return false;
  const knownRegion = (name: Tzname) => {
    const validated = knownGoogleDateTimezoneName(name);
    return validated == null ? null : regionOf(validated);
  };
  const zone = timeZone == null ? TimezoneRegion.UTC : loadedGoogleDateTimezone(timeZone, knownRegion);
  if (zone == null) return null;
  const exclusions = exclusionsOfLines(unfolded, zone.fullname, knownRegion, RecurrenceComposition.GOOGLE, {
    ignoreDates: true,
  });
  return exclusions == null ? null : isExcludedInstance(exclusions, zone.toTz(start).ndt, start);
}

/** Whether the instance at wall time `local` (series zone) and instant `at` is excluded. */
export function isExcludedInstance(ex: Exclusions, local: NaiveDateTime, at: DateTime<Utc>): boolean {
  return isExcluded(ex, local, at);
}

function isExcluded(ex: Exclusions, local: NaiveDateTime, at: DateTime<Utc>): boolean {
  return ex.instants.has(at.mse) || ex.localTimes.has(local.mse) || ex.localDays.has(local.date.dse);
}

function resolveSeriesWall(
  composition: RecurrenceComposition,
  timezone: Option<TimezoneRegion>,
  startDateTime: DateTime<FixedOffset>,
  local: NaiveDateTime,
): DateTime<Utc> {
  if (timezone == null) return local.withTz(startDateTime.tz).toUtc();
  if (composition.resolveWallTime != null) return composition.resolveWallTime(timezone, local, startDateTime).toUtc();
  return composition.name === "rule-only"
    ? timezone.toRfc5545WallClock(local).toUtc()
    : timezone.googleDatetimeResolved(local, startDateTime).toUtc();
}

function appendGenerated(
  state: RecurrenceGenerationState,
  event: DateTime<Utc>,
  key: number | string = event.mse,
  wall?: NaiveDateTime,
): void {
  const unique = !state.composition.preserveRruleJsDuplicates;
  if (unique && state.seenOccurrences.has(key)) return;
  if (state.generationLimit != null && state.allGeneratedEvents.length >= state.generationLimit) {
    throw new RecurrenceExpansionLimitError(state.generationLimit);
  }
  if (unique) state.seenOccurrences.add(key);
  const occurrence = state.preserveRuleWallTime && wall != null
    ? { instant: event, key, wall }
    : { instant: event, key };
  const list = state.allGeneratedEvents;
  if (list.length === 0 || list[list.length - 1]!.instant.mse <= event.mse) {
    list.push(occurrence);
    return;
  }
  // Preserve chronological order if a DST spring-forward gap shifts an earlier
  // wall-clock candidate past a later post-gap instant.
  let idx = list.length;
  while (idx > state.lastReturnedIndex && list[idx - 1]!.instant.mse > event.mse) {
    idx--;
  }
  list.splice(idx, 0, occurrence);
}

function countCandidate(state: RecurrenceGenerationState): void {
  if (state.generationLimit != null && ++state.candidates > state.generationLimit) {
    throw new RecurrenceExpansionLimitError(state.generationLimit);
  }
}

// Function to ensure all events are generated and buffered
function ensureEventsGenerated(
  state: RecurrenceGenerationState,
  endDate: NaiveDate,
): void {
  const endInstantMse = (endDate.dse + 1) * MS_PER_DAY - 1;
  const safeStopWallMse = state.timezone != null
    ? endInstantMse + (state.composition.wallOffsetBound?.(state.timezone, endInstantMse) ??
      maxOffsetMsNear(
        state.timezone,
        endInstantMse,
        state.composition.name === "rule-only" ? undefined : state.startDateTime.tz.info.offset.toMs,
      ))
    : endInstantMse + state.startDateTime.tz.info.offset.toMs;
  if (state.wallWindow != null) {
    state.wallWindow.endMse = safeStopWallMse + state.wallLookaheadMs;
  }
  state.dateWindow.endDse = Math.floor((safeStopWallMse - state.startLocal.time.toMs) / MS_PER_DAY);

  // First, include start date if it should be included (after any RDATE
  // instance before it).
  if (!state.startHandled) {
    state.startHandled = true;
    const start = state.startDateTime.toUtc();
    flushRdates(state, start.mse);
    const includeStart = state.composition.dtstartAlwaysInstance ||
      (!state.hasRrule && state.composition.includeStartWithoutRule !== false);
    // The composed series selects a late fallback after the capped scan.
    // A rewinding rule can retain a late master along with earlier trials.
    const ceiling = state.composition.lastRecurrenceInstant;
    const suppressLateMaster = state.composition.name === "google" && ceiling?.isBefore(start) &&
      (state.googleYearlyOrdinalRewind
        ? state.allGeneratedEvents.length > 0 || state.composition.googleHasEarlyAlternateRdate
        : state.composition.googleSelectFallback || state.rdates.length > 0);
    if (includeStart && !state.startDateExcluded && !suppressLateMaster) {
      state.startDateExcluded = state.composition.googleExcludedByRule?.(start) ?? false;
      if (!state.startDateExcluded) appendGenerated(state, start, start.mse, state.startLocal);
    }
    if (state.hasRrule) {
      state.lastCandidateWallMse = state.startLocal.mse;
    }
  }

  // The first literal post-cutover year can precede all encoded 1900s
  // starts. Keep the encoded starts buffered while the early counter runs.
  if (state.referenceCalendar?.counterIsEarly && safeStopWallMse < state.referenceCalendar.firstLiteralMse) {
    flushRdates(state, endInstantMse);
    return;
  }

  // Continue generating from where we left off until we have enough events or generator is exhausted
  while (!state.generationComplete) {
    // Leave room for later clock positions that the reference visits out of
    // order within the day before returning the buffered UTC window.
    if (!state.googleYearlyOrdinalRewind && !state.referenceCalendar?.counterIsEarly && state.lastCandidateWallMse != null &&
      state.lastCandidateWallMse > safeStopWallMse + state.wallLookaheadMs) {
      flushRdates(state, endInstantMse);
      return;
    }

    if (state.wallGenerator != null) {
      const wall = state.wallGenerator.next();
      if (wall.done) {
        state.generationComplete = true;
        flushRdates(state, Infinity);
        return;
      }
      if (wall.value == null) {
        flushRdates(state, endInstantMse);
        return;
      }
      countCandidate(state);
      state.lastCandidateWallMse = wall.value.mse;
      // A rewinding rule must still visit its DTSTART trial for query stopping.
      if (!state.googleYearlyOrdinalRewind && wall.value.mse === state.startLocal.mse &&
        state.composition.dtstartAlwaysInstance) continue;
      if (placeInstance(state, wall.value)) return;
      continue;
    }

    const result = state.generator.next();
    if (result.done) {
      state.generationComplete = true;
      flushRdates(state, Infinity);
      return;
    }

    const dateInstance = result.value;
    if (dateInstance == null) {
      flushRdates(state, endInstantMse);
      return;
    }
    countCandidate(state);

    // A rewinding rule must still visit its DTSTART trial for query stopping.
    if (!state.googleYearlyOrdinalRewind && dateInstance.dse === state.startDateParsed.dse &&
      state.composition.dtstartAlwaysInstance) continue;

    const local = dateInstance.withTime(state.startLocal.time);
    state.lastCandidateWallMse = local.mse;
    if (placeInstance(state, local)) return;
  }
}

/**
 * Place the rule instance at wall time `local` (a rule with time parts:
 * `wallGenerator`) as a date instance at DTSTART's time is placed: resolved
 * in the series' zone (or read in the DTSTART frame without one), cut at
 * UNTIL, matched against the EXDATEs, merged with the RDATEs. True when
 * UNTIL ended the series.
 */
function placeInstance(state: RecurrenceGenerationState, local: NaiveDateTime): boolean {
  const event = resolveSeriesWall(state.composition, state.timezone, state.startDateTime, local);
  // Google advances the wrapped rule's exclusion stream as each
  // candidate is visited. A later rewind cannot revisit exclusions
  // before the stream's current position.
  const floor = state.googleExclusionFloor;
  const rewound = floor != null && event.mse < floor;
  const excluded = !rewound &&
    (isExcluded(state.excl, local, event) || state.composition.googleExcludedByRule?.(event));
  if (floor != null) state.googleExclusionFloor = Math.max(floor, event.mse);
  if (rewound && state.composition.googleSkipRewoundExclusions) return false;
  const queryStop = state.googleQueryStopAfter;
  if (queryStop != null && event.mse > queryStop && !excluded) {
    state.generationComplete = true;
    flushRdates(state, queryStop);
    return true;
  }
  const pastWallUntil = state.composition.untilUsesWallTime &&
    state.wallUntilBound != null && local.mse > state.wallUntilBound.mse;
  const pastUntil = pastWallUntil || state.untilDt?.isBefore(event);
  if (pastUntil) {
    // A spring-forward gap candidate can shift past UNTIL while a later
    // post-gap wall time resolves <= UNTIL. Only end the series once wall
    // time itself passes `wallUntilBound`.
    if (state.wallUntilBound != null && local.mse <= state.wallUntilBound.mse) {
      return false;
    }
    state.generationComplete = true;
    flushRdates(state, Infinity);
    return true;
  }
  if (state.rruleJsQueryAccept != null) {
    if (state.rruleJsQueryAccept(event, local)) return false;
    state.generationComplete = true;
    return true;
  }
  if (state.rruleJsExruleLatest != null) {
    // RRuleSet.all() calls EXRULE.between(candidate - 1ms, candidate + 1ms).
    // That scan stops at the first projected instant above its upper bound.
    // Keep COUNT, but skip a backwards projection hidden by that earlier instant.
    if (event.mse + 1 < state.rruleJsExruleLatest) return false;
    state.rruleJsExruleLatest = Math.max(state.rruleJsExruleLatest, event.mse);
  }
  if (excluded) return false;
  const ceiling = state.composition.lastRecurrenceInstant;
  if (state.googleYearlyOrdinalRewind && ceiling?.isBefore(event)) {
    // A first surviving start can be past the ceiling. A distinct late
    // trial stops the stream once a rule or explicit start has survived.
    const first = state.allGeneratedEvents[0];
    if (state.composition.googleHasEarlyAlternateRdate || (first != null && first.instant.mse !== event.mse)) {
      state.generationComplete = true;
      flushRdates(state, Infinity);
      return true;
    }
  }
  flushRdates(state, event.mse);
  let key: number | string = event.mse;
  if (state.composition.useDateutilWallIdentity && state.timezone != null) {
    const imaginary = state.timezone.toTz(event).ndt.mse !== local.mse;
    const repeated = !imaginary && state.timezone.toWallClock(local).mse > event.mse;
    // UTC RDATE can compare equal to an adjacent gap candidate. In a fold
    // Python's cross-zone equality keeps a UTC RDATE and a rule's wall time distinct.
    if (state.lastMergedRdateMse !== event.mse) state.lastMergedRdateMse = undefined;
    if (repeated || (imaginary && state.lastMergedRdateMse == null)) {
      key = "wall:" + local.mse;
    }
  }
  appendGenerated(state, event, key, local);
  return false;
}

/**
 * Merge the RDATE instances before `beforeMse` into the buffer, in order. An
 * RDATE at exactly `beforeMse` is merged too: the rule instance at that
 * instant then dedupes against it.
 */
function flushRdates(state: RecurrenceGenerationState, beforeMse: number): void {
  while (state.rdateNext < state.rdates.length) {
    const next = state.rdates[state.rdateNext]!;
    if (next.mse > beforeMse) return;
    state.rdateNext++;
    if (state.composition.useDateutilWallIdentity) {
      state.lastMergedRdateMse = next.mse;
    }
    if (!state.composition.googleExcludedByRule?.(next)) appendGenerated(state, next);
  }
}

/**
 * The RDATE instances of `recurrence` (RFC 5545 §3.8.5.2), each read in the
 * form it was written: UTC as that instant; a TZID of another zone as that
 * zone's wall time; floating, or a TZID of the series' zone, as a wall time
 * in the series' zone (placed as rule instances are); a DATE as that day at
 * DTSTART's wall time; a PERIOD as its start (parsed so). EXDATEs remove one
 * as they remove any instance. Sorted and unique; a DTSTART-valued RDATE stays
 * an explicit instance even when the composition does not add DTSTART itself.
 * They are not bounded by UNTIL and do not count toward COUNT (§3.3.10).
 */
function rdatesOf(
  recurrence: Recurrence,
  startDateTime: DateTime<FixedOffset>,
  timezone: Option<TimezoneRegion>,
  startLocal: NaiveDateTime,
  excl: Exclusions,
  composition: RecurrenceComposition = RecurrenceComposition.GOOGLE,
): DateTime<Utc>[] {
  const byMse = new Map<number, DateTime<Utc>>();
  for (const line of recurrence.inner.lines.rdate ?? []) {
    line.dates.forEach((ndt, i) => {
      const form = line.forms?.[i] ?? { timed: true, utc: false };
      const at = rdateInstant(line, i, startDateTime, timezone, startLocal, composition);
      if (composition.lastRecurrenceInstant?.isBefore(at)) return;
      const local = timezone ? at.toTz(timezone.tzAtMse(at.mse)).ndt : at.ndt;
      let writtenLocal: Option<NaiveDateTime> = null;
      if (line.value === "DATE" || !form.timed) {
        writtenLocal = ndt.date.withTime(startLocal.time);
      } else if (!form.utc && (line.region == null || line.region.fullname === timezone?.fullname)) {
        writtenLocal = ndt;
      }
      if (isExcluded(excl, local, at) || (writtenLocal != null && isExcluded(excl, writtenLocal, at))) {
        return;
      }
      byMse.set(at.mse, at);
    });
  }
  return [...byMse.values()].sort((a, b) => a.mse - b.mse);
}

/** The instant RDATE value `i` of `line` adds, read in the form it was written (see `rdatesOf`). */
function rdateInstant(
  line: ICalDateLine,
  i: number,
  startDateTime: DateTime<FixedOffset>,
  timezone: Option<TimezoneRegion>,
  startLocal: NaiveDateTime,
  composition: RecurrenceComposition = RecurrenceComposition.GOOGLE,
): DateTime<Utc> {
  const ndt = line.dates[i]!;
  const form = line.forms?.[i] ?? { timed: true, utc: false };
  const inSeries = (wall: NaiveDateTime): DateTime<Utc> =>
    resolveSeriesWall(composition, timezone, startDateTime, wall);
  if (line.value === "DATE" || !form.timed) return inSeries(ndt.date.withTime(startLocal.time));
  if (composition.resolveRdate != null) return composition.resolveRdate(ndt, timezone ?? null);
  if (form.utc) return new DateTime(ndt, Utc);
  if (
    line.region != null &&
    (composition.resolveNamedDate != null || line.region.fullname !== timezone?.fullname)
  ) {
    return resolveNamedWall(composition, line.region, ndt);
  }
  return inSeries(ndt);
}

/**
 * Split RDATE lines at the instant `cut` (a "this and following" edit): the
 * values whose instance is before `cut` stay with the series that ends
 * there (`before`), the rest go with the series that starts there (`from`),
 * each line keeping its parameters and its values' text. Values are read as
 * the generator reads them, for a series starting `startDateTime` whose wall
 * clock is `timezone`. A line that does not parse goes to `before` whole.
 */
export async function splitRdatesAt(
  lines: readonly string[],
  cut: DateTime<Utc>,
  startDateTime: DateTime<FixedOffset>,
  timezone: Option<TimezoneRegion>,
  composition: RecurrenceComposition = RecurrenceComposition.GOOGLE,
): Promise<{ before: string[]; from: string[] }> {
  const before: string[] = [];
  const from: string[] = [];
  const google = composition.name === "google";
  const seriesZone = google && timezone != null ? googleRecurrenceTimezone(timezone) : timezone;
  const startLocal = seriesZone
    ? startDateTime.toUtc().toTz(seriesZone.tzAtMse(startDateTime.mse)).ndt
    : startDateTime.ndt;
  for (const text of lines) {
    const property = splitICalProperty(text);
    const parsed = ICalDateLine.Raw.parse(text);
    if (parsed.isErr || property == null) {
      before.push(text);
      continue;
    }
    const raw = parsed.exp();
    const values = property.value.split(",");
    if (values.length !== raw.nd.length) {
      before.push(text);
      continue;
    }
    const head = property.attributes.join(";");
    const line = google ? null : await raw.resolve();
    const tzid = raw.attributes.get("TZID");
    const region = google && tzid != null
      ? await resolveGoogleDateTimezone(unquoteICalParameter(tzid))
      : null;
    const early: string[] = [];
    const late: string[] = [];
    values.forEach((value, i) => {
      const date = raw.nd[i];
      const wall = date.extend();
      const instant = line != null
        ? rdateInstant(line, i, startDateTime, seriesZone, startLocal, composition)
        : date.nt == null
        ? wall.asUtc()
        : composition.resolveRdate != null
        ? composition.resolveRdate(wall, seriesZone ?? null)
        : date.z != null
        ? wall.asUtc()
        : region != null
        ? composition.resolveNamedDate?.(region, wall) ?? region.toRfc5545WallClock(wall).toUtc()
        : seriesZone != null
        ? composition.resolveWallTime?.(seriesZone, wall, startDateTime) ?? seriesZone.toRfc5545WallClock(wall)
        : wall.withTz(startDateTime.tz);
      (instant.mse < cut.mse ? early : late).push(value);
    });
    if (early.length > 0) before.push(`${head}:${early.join(",")}`);
    if (late.length > 0) from.push(`${head}:${late.join(",")}`);
  }
  return { before, from };
}

/**
 * How a recurring master moved, for `shiftRecurrenceLines`. `days` is how many
 * local days its start moved in the series' zone. `wallMs` is how far its
 * wall-clock start moved (`days` whole days for an all-day master).
 * `toAllDay` is set when the master turns from timed into all-day.
 */
export interface RecurrenceShift {
  readonly days: number;
  readonly wallMs: number;
  readonly toAllDay: boolean;
}

/**
 * `lines` (a master's recurrence) with every EXDATE and RDATE value moved as
 * the master moved, so each still names the same occurrence of the moved
 * series. EXDATE is matched per instance (RFC 5545 §3.8.5.1), so a value
 * left behind would bring a deleted occurrence back and show a moved one
 * twice. Each value keeps the form it was written in:
 * - A DATE value moves by `days`.
 * - A floating value, or one whose TZID names the series' zone, moves by
 *   `wallMs` of wall-clock time.
 * - A UTC value, or one whose TZID names another zone, is read as an
 *   instance of the series, moved by `wallMs` in the series' wall clock, and
 *   written back in its own form. A TZID zone `regionOf` cannot answer is
 *   moved as wall time.
 * - When the master becomes all-day (`toAllDay`), a timed value becomes
 *   the DATE of its moved instance, on a `;VALUE=DATE` line of its own (a
 *   PERIOD becomes the DATE of its start: a DATE line holds no period).
 * A PERIOD value moves its start and any DATE-TIME end. A duration or an
 * opaque suffix is kept. Other lines and values with invalid starts are unchanged.
 */
export function shiftRecurrenceLines(
  lines: readonly string[],
  shift: RecurrenceShift,
  timezone: Option<TimezoneRegion>,
  regionOf: (tz: Tzname) => Option<TimezoneRegion>,
): string[] {
  if (shift.days === 0 && shift.wallMs === 0 && !shift.toAllDay) return [...lines];
  const seriesZone = timezone == null ? null : googleRecurrenceTimezone(timezone);
  const out: string[] = [];
  const inSeries = (wall: NaiveDateTime): DateTime<Utc> =>
    seriesZone ? seriesZone.toRfc5545WallClock(wall).toUtc() : new DateTime(wall, Utc);
  const wallOf = (at: DateTime<Utc>): NaiveDateTime =>
    seriesZone ? at.toTz(seriesZone.tzAtMse(at.mse)).ndt : at.ndt;
  for (const line of lines) {
    const property = splitICalProperty(line);
    const tag = property?.attributes[0].toUpperCase();
    if (property == null || (tag !== "EXDATE" && tag !== "RDATE")) {
      out.push(line);
      continue;
    }
    const head = property.attributes.join(";");
    const parameters = ICalAttributes.fromRawAttributes(property.attributes);
    const tzid = parameters.get("TZID");
    const name = tzid == null ? null : unquoteICalParameter(tzid);
    const other = name == null || name === seriesZone?.fullname ? null
      : loadedGoogleDateTimezone(name, regionOf);
    const kept: string[] = [];
    const toDates: string[] = [];
    let broken = false;
    const moveOne = (text: string): Option<{ text: string; date: boolean }> => {
      if (text.startsWith("P") || text.startsWith("-P") || text.startsWith("+P")) return { text, date: false };
      const parsed = IsoDate.parse(text);
      if (parsed.isErr) return null;
      const d = parsed.asOk()!;
      if (d.nt == null) return { text: d.nd.addDays(shift.days).ical(), date: true };
      const ndt = d.extend();
      let wall2: NaiveDateTime;
      let write: (w: NaiveDateTime) => string;
      if (d.z != null) {
        wall2 = wallOf(new DateTime(ndt, Utc)).add({ ms: shift.wallMs });
        write = (w) => inSeries(w).ndt.ical() + "Z";
      } else if (other != null) {
        wall2 = wallOf(other.toRfc5545WallClock(ndt).toUtc()).add({ ms: shift.wallMs });
        write = (w) => {
          const at = inSeries(w);
          return at.toTz(other.tzAtMse(at.mse)).ndt.ical();
        };
      } else {
        wall2 = ndt.add({ ms: shift.wallMs });
        write = (w) => w.ical();
      }
      if (shift.toAllDay) return { text: wall2.date.ical(), date: true };
      return { text: write(wall2), date: false };
    };
    for (const value of property.value.split(",")) {
      const slash = value.indexOf("/");
      const start = slash < 0 ? value : value.slice(0, slash);
      const moved = moveOne(start);
      if (moved == null) {
        broken = true;
        break;
      }
      // A timed value converted to all-day keeps its moved date.
      if (shift.toAllDay && moved.date && /T/i.test(start)) {
        toDates.push(moved.text);
      } else if (slash < 0) {
        kept.push(moved.text);
      } else {
        const suffix = value.slice(slash + 1);
        // Google expands the start even when it cannot read the suffix.
        kept.push(moved.text + "/" + (moveOne(suffix)?.text ?? suffix));
      }
    }
    if (broken) {
      out.push(line);
      continue;
    }
    if (kept.length > 0) out.push(`${head}:${kept.join(",")}`);
    if (toDates.length > 0) out.push(`${tag};VALUE=DATE:${toDates.join(",")}`);
  }
  return out;
}

// Return the unread part of the UTC-ordered buffer through the inclusive end day.
function generateEventsUpToDate(
  state: RecurrenceGenerationState,
  endDate: NaiveDate,
): GeneratedOccurrence[] {
  // A later raw trial can reach an earlier year. Finish the finite Google
  // rule horizon before releasing starts from any chronological window.
  const horizon = state.composition.scanGoogleYearlyHorizon
    ? state.composition.lastRecurrenceInstant?.ndt.date
    : undefined;
  let scanThrough = horizon != null && horizon.dse > endDate.dse ? horizon : endDate;
  if (state.googleYearlyOrdinalRewind && scanThrough.dse <= state.startLocal.date.dse) {
    scanThrough = state.startLocal.date.addDays(1);
  }
  ensureEventsGenerated(state, scanThrough);
  const { allGeneratedEvents: events, lastReturnedIndex: start } = state;
  const through = endDate.dse;
  let end = start;
  while (end < events.length && events[end]!.instant.ndt.date.dse <= through) end++;
  // An earlier or repeated end leaves the cursor at its current position.
  state.lastReturnedIndex = end;
  return events.slice(start, end);
}

/**
 * Google Calendar-specific event generator that handles recurrence rules
 * with Google Calendar's specific behavior for DST and UNTIL dates.
 *
 * Key differences from standard RFC 5545 behavior:
 *
 * 1. **DST Handling**: Preserves local time across DST transitions using
 *    `TimezoneRegion.googleDatetimeResolved()` method
 *
 * 2. **UNTIL Date Processing**: Handles date-only UNTIL values as exclusive
 *    of the entire day (vs. RFC 5545's inclusive behavior)
 *
 * 3. **Timezone Context**: Maintains original timezone context for proper
 *    DST transition handling throughout the recurrence sequence
 *
 * Usage (via `Recurrence.generateGoogleEvents`):
 * ```ts
 * import { assertEquals } from "@std/assert";
 * import { naivedate, Recurrence, TimezoneRegion, Utc } from "@tento/chrono";
 *
 * const recurrence = (await Recurrence.parse(["RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4"])).exp();
 * const tz = TimezoneRegion.UTC;
 * const start = tz.toTz(Utc.parse("2026-01-05T09:00:00Z")!);
 * const generator = await recurrence.generateGoogleEvents(start, tz);
 * const events = generator.generateUpToDate(naivedate(2026, 1, 31));
 * assertEquals(events.map(String), [
 *   "2026-01-05T09:00:00Z",
 *   "2026-01-07T09:00:00Z",
 *   "2026-01-12T09:00:00Z",
 *   "2026-01-14T09:00:00Z",
 * ]);
 * ```
 */
export class GoogleEventGenerator {
  private state: RecurrenceGenerationState;

  constructor(
    recurrence: Recurrence,
    startDateTime: DateTime<FixedOffset>,
    timezone?: Option<TimezoneRegion>,
    readonly composition: RecurrenceComposition = RecurrenceComposition.GOOGLE,
    generationLimit?: number,
    startWall?: NaiveDateTime,
    preserveRuleWallTime = false,
  ) {
    if (generationLimit != null && (!Number.isSafeInteger(generationLimit) || generationLimit < 0)) {
      throw new RangeError("recurrence generation limit must be a nonnegative safe integer");
    }
    timezone ??= recurrence.inner.dtstart?.region;
    const startUtc = startDateTime.toUtc();
    const startLocal = startWall ?? (timezone
      ? startUtc.toTz(timezone.tzAtMse(startDateTime.mse)).ndt
      : startDateTime.ndt);
    const startDateParsed = startLocal.date;

    // Check if RRULE has an UNTIL date
    const rrule = recurrence.inner.rrule;
    const rruleUntil = rrule?.inner.options?.until;
    const untilDate = rruleUntil?.trunc();
    const untilWall = untilDate && rruleUntil?.nt ? untilDate.withTime(rruleUntil.nt) : null;
    const writtenUntil = untilWall == null || composition.untilUsesWallTime ? null : rruleUntil?.z != null
      ? untilWall.asUtc()
      : resolveSeriesWall(composition, timezone, startDateTime, untilWall);
    const googleYearlyOrdinalRewind = rrule?.inner.options?.googleYearlyOrdinalRewind === true;
    // Rewinding trials need to visit the initial period even after the
    // provider ceiling. Apply that cutoff during the merge instead.
    const ceiling = googleYearlyOrdinalRewind ? undefined : composition.lastRecurrenceInstant;
    const untilDt = ceiling != null && (writtenUntil == null || ceiling.isBefore(writtenUntil))
      ? ceiling
      : writtenUntil;
    // Use the query window's offset bound for UNTIL as well. An admissible
    // wall time can fall after the displayed time at the UTC cutoff in a fold.
    let wallUntilBound = composition.untilUsesWallTime ? untilWall : null;
    if (untilDt != null) {
      // One day bounds the wall clock at the provider ceiling or at an
      // UNTIL beyond a compiled zone. Covered queries still use their own
      // offset bounds, and each occurrence is compared to the exact UNTIL.
      const coverageEnd = timezone?.calendarCoverageEnd;
      const beyondCoverage = coverageEnd != null && untilDt.mse >= coverageEnd;
      const offsetMs = untilDt === ceiling || beyondCoverage ? MS_PER_DAY
        : timezone == null ? startDateTime.tz.info.offset.toMs
        : composition.wallOffsetBound?.(timezone, untilDt.mse) ?? maxOffsetMsNear(
          timezone,
          untilDt.mse,
          composition.name === "rule-only" ? undefined : startDateTime.tz.info.offset.toMs,
        );
      const absoluteWallBound = NaiveDateTime.fromMse((untilDt.mse + offsetMs) as MsSinceEpoch);
      if (wallUntilBound == null || absoluteWallBound.mse < wallUntilBound.mse) {
        wallUntilBound = absoluteWallBound;
      }
    }
    const localUntilDateOverride = wallUntilBound != null ? wallUntilBound.date : undefined;
    const generatorUntilDate = localUntilDateOverride ?? untilDate;

    // EXDATEs match instances (RFC 5545 §3.8.5.1), DTSTART's included.
    const excl = exclusionsOf(recurrence, timezone ?? null, composition);
    const startDateExcluded = isExcluded(excl, startLocal, startUtc);
    // dateutil's zoned rules have UTC RDATEs. Compare their EXDATEs in the
    // UTC frame so fold-sensitive wall exclusions apply only to rule instances.
    const rdateExcl = composition.useDateutilWallIdentity && timezone != null &&
        recurrence.inner.lines.rdate?.length
      ? exclusionsOf(recurrence, null, composition)
      : excl;
    const rdates = rdatesOf(recurrence, startDateTime, timezone ?? null, startLocal, rdateExcl, composition);

    // The rule's dates, unfiltered by EXDATE (matched per instance here).
    const dateWindow = { endDse: -Infinity };
    const generator = rrule != null
      ? generateUntilExcl(
        recurrence.inner,
        startDateParsed,
        generatorUntilDate,
        composition.googleByweekno,
        false,
        generationLimit,
        localUntilDateOverride,
        dateWindow,
        composition.useGoogleYearlyWeeks,
        false, // This generator handles the master separately from rule COUNT.
      )
      : (function* () {})();

    const setPositionCount = rrule?.inner.options?.bysetpos?.length ?? 0;
    const clipFirstWeek = composition.clipFirstWeek === true && rrule?.inner.freq === "weekly" && setPositionCount > 0;
    const countRepeatedSetPositions = composition.countRepeatedSetPositions === true && setPositionCount > 1;
    const interval = rrule?.inner.options?.interval ?? 1;
    const referenceCalendar = rrule?.inner.options?.rruleJsClock &&
        (rrule.inner.freq === "weekly" || rrule.inner.options.rruleJsWeekNumbers != null ||
          rrule.inner.options.rruleJsIntervalText != null || interval < 0 ||
          !Number.isSafeInteger(interval) || startLocal.date.yr < 100 ||
          (startLocal.mse < 0 && startLocal.time.ms !== 0))
      ? new RruleJsCalendar(rrule, startLocal)
      : undefined;
    const ignoreTimeParts = !rrule?.inner.options?.rruleJsClock && isDateOnlyDtstart(recurrence.inner);
    // The library clock can traverse its axis out of order.
    const wallWindow = rrule?.inner.options?.rruleJsClock ? undefined : { endMse: -Infinity };
    const wallGenerator = rrule?.inner.options?.rfcWeekYear || rrule?.inner.options?.rruleJsClock ||
        rrule?.inner.options?.googleJulianCalendar || rrule?.inner.options?.googlePositiveWeeklyPositions ||
        clipFirstWeek || countRepeatedSetPositions ||
        shouldUseTimeParts(recurrence.inner)
      ? RRuleInstances.scan(
        wallWindow,
        rrule!,
        startLocal,
        composition.googleByweekno,
        generationLimit,
        wallUntilBound ?? undefined,
        ignoreTimeParts,
        undefined,
        composition.useGoogleYearlyWeeks,
        clipFirstWeek,
        countRepeatedSetPositions,
        referenceCalendar,
      )
      : null;

    // Only an RDATE that survives exclusion can make Google expand the
    // rules before applying the query window to the merged set.
    const includesRdate = composition.googleQueryIncludesRdate;
    const hasIncludedRdate = includesRdate != null && rdates.some((date) =>
      includesRdate(date.mse) && !composition.googleExcludedByRule?.(date)
    );
    const googleQueryStopAfter = hasIncludedRdate ? undefined : composition.googleQueryStopAfter;
    const clock = rrule?.inner.options;
    const dayLevel = rrule?.inner.freq !== "hourly" && rrule?.inner.freq !== "minutely" &&
      rrule?.inner.freq !== "secondly";
    const unorderedClock = clock?.rruleJsClock && (clock.rruleJsClockText != null ||
      (dayLevel && [clock.byhour, clock.byminute, clock.bysecond].some((values) =>
        values?.some((value, i) => i > 0 && value <= values[i - 1])
      )));

    const couldUseHostClock = !dayLevel && clock?.rruleJsHostZone != null &&
      clock.bysetpos?.some((position) => position < 0);

    const carriesBack = referenceCalendar != null && startLocal.mse < 0 && startLocal.time.ms !== 0;
    // A signed remainder can start the next weekly period on Tuesday of
    // the same Monday-based week. Its BYSETPOS may select an earlier day
    // than the prior period emitted.
    const overlapsWeek = carriesBack && rrule?.inner.freq === "weekly" &&
      startLocal.time.toMs === startLocal.time.ms;
    const clockCarry = rrule != null
      ? RRuleInstances.rruleJsClockLookahead(rrule, startLocal, ignoreTimeParts)
      : 0;
    const wallLookaheadMs = clock?.googleJulianCalendar === "nominal" ? GOOGLE_REFORM_GAP_DAYS * MS_PER_DAY
      : overlapsWeek ? 7 * MS_PER_DAY + clockCarry
      : Math.max(clockCarry, unorderedClock || couldUseHostClock || carriesBack ? MS_PER_DAY : 0);

    this.state = {
      composition,
      hasRrule: rrule != null,
      seenOccurrences: new Set(),
      generator,
      dateWindow,
      wallGenerator,
      wallWindow: wallGenerator == null ? undefined : wallWindow,
      referenceCalendar,
      startLocal,
      startDateParsed,
      startDateTime,
      timezone,
      coverageEnd: recurrenceCoverageEnd(recurrence.inner.lines, timezone),
      excl,
      startDateExcluded,
      ...(untilDate !== undefined ? { untilDate } : {}),
      untilDt,
      wallUntilBound,
      lastCandidateWallMse: null,
      rruleJsExruleLatest: composition.rruleJsExruleWindow ? -Infinity : undefined,
      wallLookaheadMs,
      allGeneratedEvents: [],
      preserveRuleWallTime,
      rdates,
      rdateNext: 0,
      // COUNT=0 suppresses the rule's DTSTART too; explicit RDATEs remain independent.
      startHandled: rrule?.inner.options?.count === 0,
      generationComplete: false,
      googleQueryStopAfter,
      googleYearlyOrdinalRewind,
      googleExclusionFloor: composition.scanGoogleYearlyHorizon &&
        (composition.googleExcludedByRule != null || composition.googleSkipRewoundExclusions ||
          excl.localDays.size || excl.localTimes.size || excl.instants.size) ? -Infinity : undefined,
      lastReturnedIndex: 0,
      generationLimit,
      candidates: 0,
    };
  }

  /**
   * Whether the series' DTSTART occurrence is itself excluded by an EXDATE
   * (computed once in the constructor, matched as every occurrence is:
   * `exclusionsOf`). A recurring master renders its OWN
   * DTSTART slot directly — the expander skips re-generating that occurrence —
   * so when DTSTART is EXDATE'd, nothing else suppresses that slot. The index
   * reads this to drop such a master from its renderable buckets.
   */
  get startDateExcluded(): boolean {
    return this.state.startDateExcluded;
  }

  /**
   * Generate recurrence events up to a specified end date.
   *
   * This method respects Google Calendar's specific behavior:
   * - Uses the earlier of the query end date or UNTIL date
   * - Handles DST transitions by preserving local time
   * - Applies proper EXDATE exclusions
   * - Buffers events for efficient incremental generation
   *
   * @param endDate - The last date to generate events for, inclusive: an occurrence dated `endDate` is returned
   * @returns Array of generated events in UTC timezone
   * @throws {RangeError} When the full UTC day exceeds calendar timezone coverage.
   */
  generateUpToDate(endDate: NaiveDate): DateTime<Utc>[] {
    return this.generateOccurrencesUpToDate(endDate).map(({ instant }) => instant);
  }

  /** @internal Whether a future read can still return occurrences. */
  get hasPendingOccurrences(): boolean {
    const state = this.state;
    return !state.generationComplete || state.lastReturnedIndex < state.allGeneratedEvents.length ||
      state.rdateNext < state.rdates.length;
  }

  /** @internal Check explicit RDATEs after EXDATE filtering without advancing the cursor. */
  hasRdate(matches: (mse: number) => boolean): boolean {
    return this.state.rdates.some(date => matches(date.mse));
  }

  /** @internal Visit candidates in library order on a fresh rule-only cursor. */
  scanRruleJsCandidates(through: NaiveDate, accept: (event: DateTime<Utc>, wall: NaiveDateTime) => boolean): void {
    this.state.rruleJsQueryAccept = accept;
    this.generateOccurrencesUpToDate(through);
  }

  /** @internal Keep occurrence identity when composing a bound recurrence set. */
  generateOccurrencesUpToDate(endDate: NaiveDate): GeneratedOccurrence[] {
    // UNTIL bounds the rule's instances where they are generated (the date
    // generator and `untilDt`), not this read: an RDATE past UNTIL is still
    // in the set (RFC 5545 §3.8.5.2).
    requireRecurrenceCoverage(endDate, this.state.coverageEnd);
    if (this.state.failure != null) throw this.state.failure;
    try {
      return generateEventsUpToDate(this.state, endDate);
    } catch (error) {
      if (error instanceof RecurrenceExpansionLimitError) this.state.failure = error;
      throw error;
    }
  }
}

let graphModule: typeof import("./graph.ts") | undefined;

export class Recurrence {
  constructor(readonly inner: ICalendar.Raw) {}

  /** Bind the recurrence lines and start as supplied when the read begins. */
  static fromICalendar(lines: readonly string[], options?: ICalendarRecurrenceOptions): Promise<Result<RecurrenceSeries>> {
    return RecurrenceSeries.read(lines, options);
  }

  /** Build a mutable set of independently anchored dateutil rules and datetimes. */
  static dateutilSet(options: DateutilSetOptions = {}): DateutilRecurrenceSet {
    return RecurrenceSeries.dateutilSet(options);
  }

  static async fromGraph(master: GraphRecurringMaster, options?: GraphRecurrenceOptions): Promise<Result<RecurrenceSeries>> {
    try {
      // Bind the same wire snapshot on the first and subsequent imports.
      const { start, end, recurrence: { pattern, range } } = master;
      const input: GraphRecurringMaster = {
        start: { dateTime: start.dateTime, timeZone: start.timeZone },
        end: end == null ? undefined : { dateTime: end.dateTime, timeZone: end.timeZone },
        originalStartTimeZone: master.originalStartTimeZone,
        originalEndTimeZone: master.originalEndTimeZone,
        isAllDay: master.isAllDay,
        recurrence: {
          pattern: {
            type: pattern.type,
            interval: pattern.interval,
            daysOfWeek: pattern.daysOfWeek?.slice(),
            firstDayOfWeek: pattern.firstDayOfWeek,
            index: pattern.index,
            dayOfMonth: pattern.dayOfMonth,
            month: pattern.month,
          },
          range: {
            type: range.type,
            startDate: range.startDate,
            endDate: range.endDate,
            numberOfOccurrences: range.numberOfOccurrences,
            recurrenceTimeZone: range.recurrenceTimeZone,
          },
        },
      };
      const settings: GraphRecurrenceOptions | undefined = options == null ? undefined : {
        resolveTimeZone: options.resolveTimeZone?.bind(options),
        allDayTimeZone: options.allDayTimeZone,
        rangeStartOccurrence: options.rangeStartOccurrence,
      };
      const { readGraphRecurrence } = graphModule ??= await import("./graph.ts");
      return await readGraphRecurrence(input, settings);
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  static async parse(
    ss: string[],
    determinstic: boolean = false,
  ): Promise<Result<Recurrence>> {
    const rawres = await ICalendar.Raw.parse(ss, determinstic);
    if (rawres.asErr() != null) return err(rawres.asErr()!);
    const raw = rawres.asOk()!;
    // todo: verify that the rrule is sound and exists
    return ok(new Recurrence(raw));
  }

  async timezone(): Promise<Option<TimezoneRegion>> {
    const startRegion = this.inner.dtstart?.region;
    if (startRegion != null) return startRegion;

    const tzid = this.inner.rrule?.inner.options?.tzid;
    if (!tzid) return null;
    return await TimezoneRegion.get(tzid, Tzname.UTC, "rrule");
  }

  generateToDate(
    date?: Option<NaiveDate>,
    end?: Option<NaiveDate>,
    useGoogleCalendarBehavior?: boolean,
  ): Generator<YearMonthDay> {
    if (shouldUseTimeParts(this.inner)) {
      return timedDays(this.inner, date, end, null, useGoogleCalendarBehavior ?? false, !useGoogleCalendarBehavior);
    }
    const excludeDates = !useGoogleCalendarBehavior;
    const excl = excludeDates ? createExcludedDatesSet(this.inner) : new Set<number>();
    const ruleDays = generateUntilExcl(this.inner, date, end, useGoogleCalendarBehavior, excludeDates);
    return mergeSortedDaysWithRdates(ruleDays, this.inner, excl, end, null);
  }

  generate(date?: Option<NaiveDate>, limit?: number): Generator<YearMonthDay> {
    if (shouldUseTimeParts(this.inner)) return timedDays(this.inner, date, null, limit ?? null, false, true);
    return generateExcl(this.inner, date, limit);
  }

  async generateGoogleEvents(
    startDateTime: DateTime<FixedOffset>,
    timezone: Option<TimezoneRegion>,
    generationLimit?: number,
  ): Promise<GoogleEventGenerator> {
    return await this.generateEvents(startDateTime, timezone, RecurrenceComposition.GOOGLE, generationLimit);
  }

  /** The series' instances from `startDateTime`, composed as `composition` says. */
  async generateEvents(
    startDateTime: DateTime<FixedOffset>,
    timezone: Option<TimezoneRegion>,
    composition: RecurrenceComposition,
    generationLimit?: number,
  ): Promise<GoogleEventGenerator> {
    const effectiveTimezone = timezone ?? (await this.timezone());
    return new GoogleEventGenerator(this, startDateTime, effectiveTimezone, composition, generationLimit);
  }
}

function isDateOnlyDtstart(inner: ICalendar.Raw): boolean {
  const dtstart = inner.dtstart;
  return dtstart != null && (dtstart.value === "DATE" || dtstart.forms?.[0]?.timed === false);
}

function shouldUseTimeParts(inner: ICalendar.Raw): boolean {
  const rrule = inner.rrule;
  if (rrule == null || !rrule.hasTimeParts()) return false;
  // RFC 5545 §3.3.10: BYHOUR/BYMINUTE/BYSECOND MUST be ignored when DTSTART
  // has a DATE value type (for date-level frequencies).
  if (isDateOnlyDtstart(inner)) {
    const freq = rrule.inner.freq;
    if (freq === "yearly" || freq === "monthly" || freq === "weekly" || freq === "daily") {
      return false;
    }
  }
  return true;
}

function sortedRdateDays(inner: ICalendar.Raw, excl: Set<number>): YearMonthDay[] {
  const byDse = new Map<number, YearMonthDay>();
  for (const line of inner.lines.rdate ?? []) {
    for (const dt of line.dates ?? []) {
      const day = dt.date;
      if (!excl.has(day.dse)) byDse.set(day.dse, day);
    }
  }
  return [...byDse.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d);
}

function* mergeSortedDaysWithRdates(
  ruleDays: Iterable<YearMonthDay | null>,
  inner: ICalendar.Raw,
  excl: Set<number>,
  end?: Option<NaiveDate>,
  limit?: Option<number>,
): Generator<YearMonthDay> {
  if (limit != null && limit <= 0) return;
  const rdates = sortedRdateDays(inner, excl);
  const seen = new Set<number>();
  let emitted = 0;
  let rdateIdx = 0;

  const emitRdatesUpTo = function* (maxDse: number): Generator<YearMonthDay> {
    while (rdateIdx < rdates.length && rdates[rdateIdx]!.dse <= maxDse) {
      const rd = rdates[rdateIdx++]!;
      if (end != null && rd.dse > end.dse) {
        rdateIdx = rdates.length;
        return;
      }
      if (seen.has(rd.dse)) continue;
      if (limit != null && emitted >= limit) return;
      seen.add(rd.dse);
      emitted++;
      yield rd;
    }
  };

  for (const nd of ruleDays) {
    if (nd == null) continue;
    if (end != null && nd.dse > end.dse) break;
    yield* emitRdatesUpTo(nd.dse);
    if (limit != null && emitted >= limit) return;
    if (excl.has(nd.dse) || seen.has(nd.dse)) continue;
    seen.add(nd.dse);
    emitted++;
    yield nd;
    if (limit != null && emitted >= limit) return;
  }

  if (limit == null || emitted < limit) {
    yield* emitRdatesUpTo(end != null ? end.dse : Infinity);
  }
}

function* generateExcl(
  inner: ICalendar.Raw,
  date?: Option<NaiveDate>,
  limit?: Option<number>,
) {
  const start = date ?? inner.dtstart?.dates[0]?.date;
  const excl = createExcludedDatesSet(inner);

  if (inner.rrule == null) {
    const startDays = start != null ? [start] : [];
    yield* mergeSortedDaysWithRdates(startDays, inner, excl, null, limit);
    return;
  }

  const ignoreTimeParts = isDateOnlyDtstart(inner);
  const generator = start!.rangeProps(
    inner.rrule.toFilterProps(limit != null ? limit + excl.size : null, null, false, null, ignoreTimeParts),
  );
  yield* mergeSortedDaysWithRdates(generator, inner, excl, null, limit);
}

/**
 * The days of a rule with time parts (`RRule.hasTimeParts`): each day that
 * holds an instance, once, from `date` (DTSTART's day by default) at
 * DTSTART's time, through `end`, at most `limit` days; without the EXDATE
 * days when `excludeDates`, merged with any RDATE days.
 */
function* timedDays(
  inner: ICalendar.Raw,
  date: Option<NaiveDate> | undefined,
  end: Option<NaiveDate> | undefined,
  limit: Option<number>,
  google: boolean,
  excludeDates: boolean,
): Generator<YearMonthDay> {
  const dtstart = inner.dtstart?.dates[0];
  const day = date ?? dtstart?.date;
  if (day == null) return;
  const start = dtstart != null ? new NaiveDateTime(day, dtstart.time) : new NaiveDateTime(day);
  const excl = excludeDates ? createExcludedDatesSet(inner) : new Set<number>();
  const ignoreTimeParts = isDateOnlyDtstart(inner);
  const ruleDays = (function* () {
    let last: Option<number> = null;
    for (const at of RRuleInstances.expand(inner.rrule!, start, google, undefined, undefined, ignoreTimeParts,
      end != null ? (end.dse + 1) * 86400000 - 1 : Infinity)) {
      const dse = at.date.dse;
      if (end != null && dse > end.dse) return;
      if (dse === last) continue;
      last = dse;
      yield at.date;
    }
  })();
  yield* mergeSortedDaysWithRdates(ruleDays, inner, excl, end, limit);
}

// Pattern detection and utilities now imported from google-calendar-utils.ts

// Post-processing logic now extracted to google-calendar-utils.ts

function* generateUntilExcl(
  inner: ICalendar.Raw,
  date?: Option<NaiveDate>,
  end?: Option<NaiveDate>,
  useGoogleCalendarBehavior?: boolean,
  excludeDates: boolean = !useGoogleCalendarBehavior,
  generationLimit?: number,
  untilDateOverride?: Option<NaiveDate>,
  window?: YearMonthDay.RangeWindow,
  useGoogleYearlyWeeks: boolean = false,
  useLegacyStartDate: boolean = true,
) {
  const originalStartDate = date ?? inner.dtstart?.dates[0]?.date;
  const excl = excludeDates ? createExcludedDatesSet(inner) : new Set<number>();

  if (inner.rrule == null) {
    const all = new Map<number, YearMonthDay>();
    if (originalStartDate != null && !excl.has(originalStartDate.dse)) {
      all.set(originalStartDate.dse, originalStartDate);
    }
    for (const rd of sortedRdateDays(inner, excl)) all.set(rd.dse, rd);
    for (const [, day] of [...all.entries()].sort((a, b) => a[0] - b[0])) {
      if (end != null && day.dse > end.dse) return;
      yield day;
    }
    return;
  }

  // Use the stateless function to calculate the generator start date
  const generatorStartDate = calculateGoogleCalendarStartDate(
    originalStartDate!,
    inner,
    useGoogleCalendarBehavior,
  );

  // Create raw event generator
  const ignoreTimeParts = isDateOnlyDtstart(inner);
  const props = inner.rrule.toFilterProps(
    null,
    end,
    useGoogleCalendarBehavior,
    untilDateOverride,
    ignoreTimeParts,
    useGoogleYearlyWeeks ? originalStartDate : undefined,
  );
  if (window != null) {
    props.options ??= {};
    // The moving window bounds the scan without the legacy range output cap.
    props.options.recurLimit = Number.POSITIVE_INFINITY;
  }
  if (generationLimit != null) {
    props.options ??= {};
    props.options.recurLimit = generationLimit;
    props.options.onExhausted = () => { throw new RecurrenceExpansionLimitError(generationLimit); };
  }
  const rawGenerator = window == null
    ? generatorStartDate.rangeProps(props)
    : generatorStartDate.scanRangeProps(props, window);

  // Detect COUNT pattern and use comprehensive post-processor
  const pattern = detectCountPattern(inner, useGoogleCalendarBehavior);
  const countLimit = inner.rrule?.inner.options?.count ?? undefined;

  // Use comprehensive post-processor that handles ALL event emission logic
  yield* processAllEvents(
    rawGenerator,
    pattern,
    countLimit,
    originalStartDate!,
    excl,
    inner,
    Boolean(useGoogleCalendarBehavior) && useLegacyStartDate,
  );
}
