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
import { ICalDateLine } from "./ical-date-line.ts";
import { ICalendar } from "./ical.ts";
import { IsoDate } from "./iso-date.ts";
import { RRuleInstances } from "./instances.ts";
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
  /**
   * Google's BYWEEKNO handling: the consecutive-weekly COUNT patterns
   * (`detectCountPattern`), the generator start date
   * (`calculateGoogleCalendarStartDate`) and the BYWEEKNO/BYDAY filter
   * composition (`RRule.toFilterProps`). This is the old
   * `useGoogleCalendarBehavior` flag.
   */
  readonly googleByweekno: boolean;
  /**
   * An EXDATE uses up a COUNT slot in every composition, on every path
   * (BYWEEKNO included). EXDATE removes instances from the set the rule and
   * its RDATEs generated; it never pulls in a later instance to refill the
   * count. This is RFC 5545's set semantics (§3.8.5.1, §3.3.10), and it is
   * what every recorded Google expansion that has both COUNT and EXDATE
   * shows: `weekly_multiple_exdates` (COUNT=8 with 3 EXDATEs gives 5) and
   * `start_date_excluded_by_exdate` (COUNT=5 with 1 EXDATE gives 4). Google
   * has no recording with BYWEEKNO and EXDATE together. The BYWEEKNO path
   * was brought into line by per-instance EXDATE (8cba6513fa), and the
   * operator accepted that on 2026-10-03. The case `byweekno_with_exdate` in
   * `tests/test_recurrence_composition.deno.test.ts` pins it.
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

// State for generating recurrence events
interface RecurrenceGenerationState {
  composition: RecurrenceComposition;
  hasRrule: boolean;
  seenInstants: Set<number>;
  generator: Generator<YearMonthDay>;
  // A rule with time parts (`RRule.hasTimeParts`): its instances as wall
  // times in the series' zone (`RRuleInstances`), in place of `generator`.
  wallGenerator: Option<Generator<NaiveDateTime>>;
  // DTSTART's wall time in the series' zone.
  startLocal: NaiveDateTime;
  startDateParsed: NaiveDate;
  startDateTime: DateTime<FixedOffset>; // Original datetime with offset to preserve local time
  timezone?: Option<TimezoneRegion>; // Timezone for handling DST shifts
  excl: Exclusions;
  startDateExcluded: boolean;
  untilDate?: NaiveDate;
  untilDt: Option<DateTime<Utc>>;
  // Upper wall-clock bound corresponding to `untilDt` (accounting for any DST
  // transition within +/-48h). No wall time strictly past this bound can
  // resolve to an instant <= `untilDt`.
  wallUntilBound: Option<NaiveDateTime>;
  // Monotonic wall-clock cursor (naive ms) of the latest rule candidate read,
  // used to stop incremental expansion only once no future candidate can fall
  // on or before the queried UTC date (even across large forward jumps).
  lastCandidateWallMse: Option<number>;
  allGeneratedEvents: DateTime<Utc>[]; // Buffer all generated events
  // RDATE instances (sorted, unique) and the
  // next one not yet merged into `allGeneratedEvents`.
  rdates: readonly DateTime<Utc>[];
  rdateNext: number;
  startHandled: boolean;
  // DTSTART's wall-clock time in `timezone`: the same for every occurrence,
  // so it is resolved once, on the first occurrence that needs it.
  startLocalTime?: NaiveDateTime["time"];
  generationComplete: boolean; // Track if we've exhausted the generator
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

function transitionsInWindow(
  timezone: TimezoneRegion,
  startMse: number,
  endMse: number,
): TimezoneRegion.Transition[] {
  const trs = timezone.transitions;
  if (trs.length === 0) return [];
  let lo = 0;
  let hi = trs.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (trs[mid]!.before.mse < startMse) lo = mid + 1;
    else hi = mid;
  }
  const out: TimezoneRegion.Transition[] = [];
  for (let i = lo; i < trs.length && trs[i]!.before.mse <= endMse; i++) {
    out.push(trs[i]!);
  }
  return out;
}

/**
 * Maximum UTC offset (ms) active in `timezone` within +/-48h of `centerMse`.
 * Any wall time `w > centerMse + maxOffsetMsNear(...)` is guaranteed to resolve
 * to an instant strictly greater than `centerMse` (even across 24-hour date-line
 * jumps or multi-hour DST overlaps).
 */
function maxOffsetMsNear(
  timezone: TimezoneRegion,
  centerMse: number,
  startOffsetMs?: number,
): number {
  let maxOffsetMs = timezone.tzAtMse(centerMse as MsSinceEpoch).info.offset.toMs;
  const near = transitionsInWindow(
    timezone,
    centerMse - TRANSITION_WINDOW_MS,
    centerMse + TRANSITION_WINDOW_MS,
  );
  for (const tr of near) {
    maxOffsetMs = Math.max(
      maxOffsetMs,
      tr.before.time.tz.info.offset.toMs,
      tr.after.time.tz.info.offset.toMs,
    );
  }
  if (near.length === 0 && startOffsetMs != null && timezone.transitions.length === 0) {
    maxOffsetMs = Math.max(maxOffsetMs, startOffsetMs);
  }
  return maxOffsetMs;
}

function resolveForeignWall(
  composition: RecurrenceComposition,
  region: TimezoneRegion,
  ndt: NaiveDateTime,
): DateTime<Utc> {
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
      else if (form.utc) instants.add(new DateTime(ndt, Utc).mse);
      else if (line.region != null && line.region.fullname !== timezone?.fullname) {
        instants.add(resolveForeignWall(composition, line.region, ndt).mse);
      } else if (composition.name === "rule-only" && timezone != null) {
        // RFC 5545 §3.3.5 + §3.8.5.1: resolve same-zone/floating timed EXDATEs
        // to their exact RFC instant so spring-gap EXDATEs match normalized
        // instants and fall-back overlap EXDATEs match only the first occurrence.
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
): Option<Exclusions> {
  const localDays = new Set<number>();
  const localTimes = new Set<number>();
  const instants = new Set<number>();
  for (const line of lines) {
    if (!line.startsWith("EXDATE")) continue;
    const parsed = ExDate.parse(line);
    if (parsed.isErr) continue;
    const exdate = parsed.asOk()!;
    for (const d of exdate.dates) {
      const ndt = d.extend();
      if (exdate.valueType === "DATE" || d.nt == null) localDays.add(ndt.date.dse);
      else if (d.z != null) instants.add(new DateTime(ndt, Utc).mse);
      else if (exdate.tzid != null && exdate.tzid !== seriesZone) {
        const region = regionOf(exdate.tzid);
        if (region == null) return null;
        instants.add(resolveForeignWall(composition, region, ndt).mse);
      } else if (composition.name === "rule-only" && seriesZone != null) {
        const region = regionOf(seriesZone);
        if (region == null) return null;
        instants.add(region.toRfc5545WallClock(ndt).toUtc().mse);
      } else localTimes.add(ndt.mse);
    }
  }
  return { localDays, localTimes, instants };
}

/** Whether the instance at wall time `local` (series zone) and instant `at` is excluded. */
export function isExcludedInstance(ex: Exclusions, local: NaiveDateTime, at: DateTime<Utc>): boolean {
  return isExcluded(ex, local, at);
}

function isExcluded(ex: Exclusions, local: NaiveDateTime, at: DateTime<Utc>): boolean {
  return ex.instants.has(at.mse) || ex.localTimes.has(local.mse) || ex.localDays.has(local.date.dse);
}

function resolveWallInZone(
  composition: RecurrenceComposition,
  timezone: TimezoneRegion,
  startDateTime: DateTime<FixedOffset>,
  local: NaiveDateTime,
): DateTime<Utc> {
  return composition.name === "rule-only"
    ? timezone.toRfc5545WallClock(local).toUtc()
    : timezone.googleDatetimeResolved(local, startDateTime).toUtc();
}

function appendGenerated(state: RecurrenceGenerationState, event: DateTime<Utc>): void {
  if (state.seenInstants.has(event.mse)) return;
  if (state.generationLimit != null && state.allGeneratedEvents.length >= state.generationLimit) {
    throw new RecurrenceExpansionLimitError(state.generationLimit);
  }
  state.seenInstants.add(event.mse);
  const list = state.allGeneratedEvents;
  if (list.length === 0 || list[list.length - 1]!.mse < event.mse) {
    list.push(event);
    return;
  }
  // Preserve chronological order if a DST spring-forward gap shifts an earlier
  // wall-clock candidate past a later post-gap instant.
  let idx = list.length;
  while (idx > state.lastReturnedIndex && list[idx - 1]!.mse > event.mse) {
    idx--;
  }
  list.splice(idx, 0, event);
}

function countCandidate(state: RecurrenceGenerationState): void {
  if (state.generationLimit != null && ++state.candidates >= state.generationLimit) {
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
    ? endInstantMse + maxOffsetMsNear(
      state.timezone,
      endInstantMse,
      state.startDateTime.tz.info.offset.toMs,
    )
    : endInstantMse;

  // First, include start date if it should be included (after any RDATE
  // instance before it).
  if (!state.startHandled) {
    state.startHandled = true;
    const start = state.startDateTime.toUtc();
    flushRdates(state, start.mse);
    if ((state.composition.dtstartAlwaysInstance || !state.hasRrule) && !state.startDateExcluded) {
      appendGenerated(state, start);
    }
    if (state.hasRrule) {
      state.lastCandidateWallMse = state.startLocal.mse;
    }
  }

  // Continue generating from where we left off until we have enough events or generator is exhausted
  while (!state.generationComplete) {
    // Stop only once the monotonic wall-clock cursor has passed the latest
    // wall time that could possibly resolve to an instant on or before endDate.
    if (state.lastCandidateWallMse != null && state.lastCandidateWallMse > safeStopWallMse) {
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
      countCandidate(state);
      state.lastCandidateWallMse = wall.value.mse;
      // DTSTART itself was handled above under `dtstartAlwaysInstance`.
      if (wall.value.mse === state.startLocal.mse && state.composition.dtstartAlwaysInstance) continue;
      if (placeInstance(state, wall.value)) return;
      continue;
    }

    const result = state.generator.next();
    if (result.done) {
      state.generationComplete = true;
      flushRdates(state, Infinity);
      return;
    }

    countCandidate(state);
    const dateInstance = result.value;

    // DTSTART's day: under `dtstartAlwaysInstance` DTSTART itself was
    // handled above (kept unless excluded); otherwise the rule's instance on
    // that day is DTSTART, placed and excluded as any instance is.
    if (dateInstance.dse === state.startDateParsed.dse && state.composition.dtstartAlwaysInstance) continue;

    // Create datetime with proper timezone handling
    let event: DateTime<Utc>;
    let local: NaiveDateTime;
    if (state.timezone) {
      // Convert the original start time to the proper local time in the target timezone
      // (loop-invariant: computed once per series).
      const originalLocalTime = state.startLocalTime ??= state.startDateTime
        .toUtc()
        .toTz(state.timezone.tzAtMse(state.startDateTime.mse)).ndt.time;

      // Create a naive datetime for the recurrence date at the same local time
      local = dateInstance.withTime(originalLocalTime);
      state.lastCandidateWallMse = local.mse;

      event = resolveWallInZone(
        state.composition,
        state.timezone,
        state.startDateTime,
        local,
      );
      if (state.untilDt?.isBefore(event)) {
        if (state.wallUntilBound != null && local.mse <= state.wallUntilBound.mse) continue;
        state.generationComplete = true;
        flushRdates(state, Infinity);
        return;
      }
      if (isExcluded(state.excl, local, event)) continue;
    } else {
      // No timezone, just use the same time as the original start datetime
      local = dateInstance.withTime(state.startDateTime.ndt.time);
      state.lastCandidateWallMse = local.mse;
      event = new DateTime(local, Utc);
      if (state.untilDt?.isBefore(event)) {
        state.generationComplete = true;
        flushRdates(state, Infinity);
        return;
      }
      if (isExcluded(state.excl, local, event)) continue;
    }
    flushRdates(state, event.mse);
    appendGenerated(state, event);
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
  let event: DateTime<Utc>;
  if (state.timezone) {
    event = resolveWallInZone(state.composition, state.timezone, state.startDateTime, local);
  } else {
    event = new DateTime(local, Utc);
  }
  if (state.untilDt?.isBefore(event)) {
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
  if (isExcluded(state.excl, local, event)) return false;
  flushRdates(state, event.mse);
  appendGenerated(state, event);
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
    appendGenerated(state, next);
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
    timezone ? resolveWallInZone(composition, timezone, startDateTime, wall) : new DateTime(wall, Utc);
  if (line.value === "DATE" || !form.timed) return inSeries(ndt.date.withTime(startLocal.time));
  if (form.utc) return new DateTime(ndt, Utc);
  if (line.region != null && line.region.fullname !== timezone?.fullname) {
    return resolveForeignWall(composition, line.region, ndt);
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
  const startLocal = timezone
    ? startDateTime.toUtc().toTz(timezone.tzAtMse(startDateTime.mse)).ndt
    : startDateTime.ndt;
  for (const text of lines) {
    const parsed = await ICalDateLine.parse(text);
    const colon = text.indexOf(":");
    if (parsed.isErr || colon < 0) {
      before.push(text);
      continue;
    }
    const line = parsed.asOk()!;
    const head = text.slice(0, colon);
    const values = text.slice(colon + 1).split(",");
    if (values.length !== line.dates.length) {
      before.push(text);
      continue;
    }
    const early: string[] = [];
    const late: string[] = [];
    values.forEach((value, i) => {
      (rdateInstant(line, i, startDateTime, timezone, startLocal, composition).mse < cut.mse ? early : late).push(value);
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
 * A PERIOD value moves both ends; a duration end is kept. Other lines are
 * returned unchanged. Lines that do not parse are kept as they were.
 */
export function shiftRecurrenceLines(
  lines: readonly string[],
  shift: RecurrenceShift,
  seriesZone: Option<TimezoneRegion>,
  regionOf: (tz: Tzname) => Option<TimezoneRegion>,
): string[] {
  if (shift.days === 0 && shift.wallMs === 0 && !shift.toAllDay) return [...lines];
  const out: string[] = [];
  const inSeries = (wall: NaiveDateTime): DateTime<Utc> =>
    seriesZone ? seriesZone.toWallClock(wall).toUtc() : new DateTime(wall, Utc);
  const wallOf = (at: DateTime<Utc>): NaiveDateTime =>
    seriesZone ? at.toTz(seriesZone.tzAtMse(at.mse)).ndt : at.ndt;
  for (const line of lines) {
    const tag = line.startsWith("EXDATE") ? "EXDATE" : line.startsWith("RDATE") ? "RDATE" : null;
    const colon = line.indexOf(":");
    if (tag == null || colon < 0) {
      out.push(line);
      continue;
    }
    const head = line.slice(0, colon);
    const params = head.split(";").slice(1).map((p) => p.split("="));
    const tzid = (params.find(([k]) => k?.toUpperCase() === "TZID")?.[1] ?? null) as Option<Tzname>;
    const dateLine = params.some(([k, v]) => k?.toUpperCase() === "VALUE" && v?.toUpperCase() === "DATE");
    const other = tzid != null && tzid !== seriesZone?.fullname ? regionOf(tzid) : null;
    const kept: string[] = [];
    const toDates: string[] = [];
    let broken = false;
    const moveOne = (text: string): Option<{ text: string; date: boolean }> => {
      if (text.startsWith("P") || text.startsWith("-P") || text.startsWith("+P")) return { text, date: false };
      const parsed = IsoDate.parse(text);
      if (parsed.isErr) return null;
      const d = parsed.asOk()!;
      if (dateLine || d.nt == null) return { text: d.nd.addDays(shift.days).ical(), date: true };
      const ndt = d.extend();
      let wall2: NaiveDateTime;
      let write: (w: NaiveDateTime) => string;
      if (d.z != null) {
        wall2 = wallOf(new DateTime(ndt, Utc)).add({ ms: shift.wallMs });
        write = (w) => inSeries(w).ndt.ical() + "Z";
      } else if (other != null) {
        wall2 = wallOf(other.toWallClock(ndt).toUtc()).add({ ms: shift.wallMs });
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
    for (const value of line.slice(colon + 1).split(",")) {
      const parts = value.split("/");
      const moved = parts.map(moveOne);
      if (moved.some((m) => m == null)) {
        broken = true;
        break;
      }
      // A timed value turned all-day is the DATE of its moved start: a DATE line
      // takes DATE values only, so a PERIOD's end (a duration or a time) goes.
      if (shift.toAllDay && !dateLine && moved[0]!.date && parts[0]!.includes("T")) toDates.push(moved[0]!.text);
      else kept.push(moved.map((m) => m!.text).join("/"));
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

// Function to generate events up to a specific date using buffered approach
function generateEventsUpToDate(
  state: RecurrenceGenerationState,
  endDate: NaiveDate,
): DateTime<Utc>[] {
  // Ensure we have generated enough events up to the requested date
  ensureEventsGenerated(state, endDate);

  // Find all events up to (and including) the endDate
  const eventsUpToEndDate = state.allGeneratedEvents.filter(
    (event) => event.ndt.date.dse <= endDate.dse,
  );

  // Return only the new events beyond what we've already returned
  const newEvents = eventsUpToEndDate.slice(state.lastReturnedIndex);

  // Update the index to track how many we've returned. Only forward: a call
  // for a nearer date than an earlier one returns nothing new and must not
  // lower the cursor (a later call would return those events again).
  state.lastReturnedIndex = Math.max(state.lastReturnedIndex, eventsUpToEndDate.length);

  return newEvents;
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
  ) {
    if (generationLimit != null && (!Number.isSafeInteger(generationLimit) || generationLimit < 1)) {
      throw new RangeError("recurrence generation limit must be a positive safe integer");
    }
    const startUtc = startDateTime.toUtc();
    const startLocal = timezone
      ? startUtc.toTz(timezone.tzAtMse(startDateTime.mse)).ndt
      : startDateTime.ndt;
    const startDateParsed = startLocal.date;

    // Check if RRULE has an UNTIL date
    const rrule = recurrence.inner.rrule;
    const rruleUntil = rrule?.inner.options?.until;
    const untilDate = rruleUntil?.trunc();
    const untilDt =
      untilDate && rruleUntil?.nt
        ? (rruleUntil.z != null || !timezone
          ? new DateTime(new NaiveDateTime(untilDate, rruleUntil.nt), Utc)
          : resolveWallInZone(composition, timezone, startDateTime, new NaiveDateTime(untilDate, rruleUntil.nt)))
        : null;
    const untilLocal = untilDt != null
      ? (timezone ? untilDt.toTz(timezone.tzAtMse(untilDt.mse)).ndt : untilDt.ndt)
      : null;
    // Exact upper wall-clock bound for `untilDt`: covers multi-hour fall-back
    // overlaps (e.g. Antarctica/Casey's 3-hour fall-back) and forward jumps
    // without generating extra candidates on non-transition days.
    let wallUntilBound: Option<NaiveDateTime> = null;
    if (untilDt != null && untilLocal != null) {
      if (timezone != null) {
        const untilOffsetMs = timezone.tzAtMse(untilDt.mse).info.offset.toMs;
        const maxOffsetMs = maxOffsetMsNear(
          timezone,
          untilDt.mse,
          startDateTime.tz.info.offset.toMs,
        );
        wallUntilBound = maxOffsetMs > untilOffsetMs
          ? untilLocal.add({ ms: maxOffsetMs - untilOffsetMs })
          : untilLocal;
      } else {
        wallUntilBound = untilLocal;
      }
    }
    const localUntilDateOverride = wallUntilBound != null ? wallUntilBound.date : undefined;
    const generatorUntilDate = localUntilDateOverride ?? untilDate;

    // EXDATEs match instances (RFC 5545 §3.8.5.1), DTSTART's included.
    const excl = exclusionsOf(recurrence, timezone ?? null, composition);
    const startDateExcluded = isExcluded(excl, startLocal, startUtc);
    const rdates = rdatesOf(recurrence, startDateTime, timezone ?? null, startLocal, excl, composition);

    // The rule's dates, unfiltered by EXDATE (matched per instance here).
    const generator = rrule != null
      ? generateUntilExcl(
        recurrence.inner,
        startDateParsed,
        generatorUntilDate,
        composition.googleByweekno,
        false,
        generationLimit,
        localUntilDateOverride,
      )
      : (function* () {})();

    const wallGenerator = shouldUseTimeParts(recurrence.inner)
      ? RRuleInstances.expand(
        rrule!,
        startLocal,
        composition.googleByweekno,
        generationLimit,
        wallUntilBound ?? undefined,
      )
      : null;

    this.state = {
      composition,
      hasRrule: rrule != null,
      seenInstants: new Set<number>(),
      generator,
      wallGenerator,
      startLocal,
      startDateParsed,
      startDateTime,
      timezone,
      excl,
      startDateExcluded,
      ...(untilDate !== undefined ? { untilDate } : {}),
      untilDt,
      wallUntilBound,
      lastCandidateWallMse: null,
      allGeneratedEvents: [],
      rdates,
      rdateNext: 0,
      startHandled: false,
      generationComplete: false,
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
   */
  generateUpToDate(endDate: NaiveDate): DateTime<Utc>[] {
    // UNTIL bounds the rule's instances where they are generated (the date
    // generator and `untilDt`), not this read: an RDATE past UNTIL is still
    // in the set (RFC 5545 §3.8.5.2).
    if (this.state.failure != null) throw this.state.failure;
    try {
      return generateEventsUpToDate(this.state, endDate);
    } catch (error) {
      if (error instanceof RecurrenceExpansionLimitError) this.state.failure = error;
      throw error;
    }
  }
}

export class Recurrence {
  constructor(readonly inner: ICalendar.Raw) {}

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
    const effectiveTimezone = timezone || (await this.timezone());
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
  ruleDays: Iterable<YearMonthDay>,
  inner: ICalendar.Raw,
  excl: Set<number>,
  end?: Option<NaiveDate>,
  limit?: Option<number>,
): Generator<YearMonthDay> {
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
  const ruleDays = (function* () {
    let last: Option<number> = null;
    for (const at of RRuleInstances.expand(inner.rrule!, start, google)) {
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
  );
  if (generationLimit != null) {
    props.options ??= {};
    props.options.recurLimit = generationLimit;
    props.options.onExhausted = () => { throw new RecurrenceExpansionLimitError(generationLimit); };
  }
  const rawGenerator = generatorStartDate.rangeProps(props);

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
    Boolean(useGoogleCalendarBehavior),
  );
}
