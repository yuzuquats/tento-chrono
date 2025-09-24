import { DateTime } from "../datetime";
import { NaiveDate } from "../naive-date";
import { NaiveDateTime } from "../naive-datetime";
import { Result, err, ok } from "../result";
import { FixedOffset, Utc } from "../timezone";
import { TimezoneRegion } from "../timezone-region";
import { YearMonthDay } from "../units/year-month-day";
import {
  CountPattern,
  calculateGoogleCalendarStartDate,
  createExcludedDatesSet,
  detectCountPattern,
  processAllEvents,
  shouldEmitStartDateSeparately,
  startDateMatchesByday,
} from "./google-calendar-utils";
import { ICalendar } from "./ical";

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

// State for generating recurrence events
interface RecurrenceGenerationState {
  generator: Generator<YearMonthDay>;
  startDateParsed: NaiveDate;
  startDateTime: DateTime<FixedOffset>; // Original datetime with offset to preserve local time
  timezone?: Option<TimezoneRegion>; // Timezone for handling DST shifts
  excl: Set<number>;
  startDateExcluded: boolean;
  untilDate?: NaiveDate;
  untilDt: Option<DateTime<Utc>>;
  allGeneratedEvents: DateTime<Utc>[]; // Buffer all generated events
  generationComplete: boolean; // Track if we've exhausted the generator
  lastReturnedIndex: number; // Track how many events we've returned so far
}

// Function to ensure all events are generated and buffered
function ensureEventsGenerated(
  state: RecurrenceGenerationState,
  endDate: NaiveDate,
): void {
  // First, include start date if it should be included
  if (!state.startDateExcluded && state.allGeneratedEvents.length === 0) {
    state.allGeneratedEvents.push(state.startDateTime.toUtc());
  }

  // Continue generating from where we left off until we have enough events or generator is exhausted
  while (!state.generationComplete) {
    // Check if we already have events past the endDate - if so, we can stop for now
    const lastGeneratedEvent =
      state.allGeneratedEvents[state.allGeneratedEvents.length - 1];
    if (lastGeneratedEvent && lastGeneratedEvent.ndt.date.dse > endDate.dse) {
      return;
    }

    const result = state.generator.next();
    if (result.done) {
      state.generationComplete = true;
      return;
    }

    const dateInstance = result.value;

    // Skip if this is the start date and we already included it
    if (
      dateInstance.dse === state.startDateParsed.dse &&
      !state.startDateExcluded
    ) {
      continue;
    }

    // Create datetime with proper timezone handling
    let event: DateTime<Utc>;
    if (state.timezone) {
      // Convert the original start time to the proper local time in the target timezone
      const startInTargetTimezone = state.startDateTime
        .toUtc()
        .toTz(state.timezone.tzAtMse(state.startDateTime.mse));
      const originalLocalTime = startInTargetTimezone.ndt.time;

      // Create a naive datetime for the recurrence date at the same local time
      const localRecurrenceNaiveDateTime =
        dateInstance.withTime(originalLocalTime);

      // Google Calendar always preserves local time across DST transitions
      // Use Google-specific datetime resolution that preserves original timezone context
      // This ensures that:
      // - Spring forward (DST begins): Local time is preserved, UTC shifts earlier
      // - Fall back (DST ends): Local time is preserved, UTC shifts later
      const localRecurrenceDateTime = state.timezone.googleDatetimeResolved(
        localRecurrenceNaiveDateTime,
        state.startDateTime,
      );
      event = localRecurrenceDateTime.toUtc();
      if (state.untilDt?.isBefore(event)) {
        state.generationComplete = true;
        return;
      }
    } else {
      // No timezone, just use the same time as the original start datetime
      event = new DateTime(
        dateInstance.withTime(state.startDateTime.ndt.time),
        Utc,
      );
    }
    state.allGeneratedEvents.push(event);
  }
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

  // Update the index to track how many we've returned
  state.lastReturnedIndex = eventsUpToEndDate.length;

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
 * Usage:
 * ```typescript
 * const generator = new GoogleEventGenerator(recurrence, startDateTime, timezone);
 * const events = generator.generateUpToDate(endDate);
 * ```
 */
export class GoogleEventGenerator {
  private state: RecurrenceGenerationState;

  constructor(
    recurrence: Recurrence,
    startDateTime: DateTime<FixedOffset>,
    timezone?: Option<TimezoneRegion>,
  ) {
    const startDateParsed = startDateTime.ndt.date;

    // Check if RRULE has an UNTIL date
    const rruleUntil = recurrence.inner.rrule?.inner.options?.until;
    const untilDate = rruleUntil?.trunc();
    const untilDt =
      untilDate && rruleUntil?.nt
        ? new DateTime(new NaiveDateTime(untilDate, rruleUntil.nt), Utc)
        : null;

    // Check if start date is excluded by EXDATE rules
    const excl = new Set(
      recurrence.inner.lines.exdate?.flatMap(
        (exdate) => exdate.dates?.map((d) => d.dse) ?? [],
      ) ?? [],
    );
    const startDateExcluded = excl.has(startDateParsed.dse);

    const generator = recurrence.generateToDate(
      startDateParsed,
      untilDate, // Use UNTIL date if present, otherwise will generate indefinitely
      true, // Use Google Calendar behavior
    );

    this.state = {
      generator,
      startDateParsed,
      startDateTime,
      timezone,
      excl,
      startDateExcluded,
      untilDate,
      untilDt,
      allGeneratedEvents: [],
      generationComplete: false,
      lastReturnedIndex: 0,
    };
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
   * @param endDate - The end date for event generation (exclusive)
   * @returns Array of generated events in UTC timezone
   */
  generateUpToDate(endDate: NaiveDate): DateTime<Utc>[] {
    // Use the effective end date (respect UNTIL date if it's earlier)
    const effectiveEndDate =
      this.state.untilDate && this.state.untilDate.dse < endDate.dse
        ? this.state.untilDate
        : endDate;

    return generateEventsUpToDate(this.state, effectiveEndDate);
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
    return await TimezoneRegion.get(tzid);
  }

  generateToDate(
    date?: Option<NaiveDate>,
    end?: Option<NaiveDate>,
    useGoogleCalendarBehavior?: boolean,
  ): Generator<YearMonthDay> {
    return generateUntilExcl(this.inner, date, end, useGoogleCalendarBehavior);
  }

  generate(date?: Option<NaiveDate>, limit?: number): Generator<YearMonthDay> {
    return generateExcl(this.inner, date, limit);
  }

  async generateGoogleEvents(
    startDateTime: DateTime<FixedOffset>,
    timezone: Option<TimezoneRegion>,
  ): Promise<GoogleEventGenerator> {
    const effectiveTimezone = timezone || (await this.timezone());
    return new GoogleEventGenerator(this, startDateTime, effectiveTimezone);
  }
}

function* generateExcl(
  inner: ICalendar.Raw,
  date?: Option<NaiveDate>,
  limit?: Option<number>,
) {
  const generator = (date ?? inner.dtstart!.dates[0]!.date).rangeProps(
    inner.rrule!.toFilterProps(limit),
  );
  const excl = new Set(
    inner.lines.exdate?.flatMap(
      (exdate) => exdate.dates?.map((d) => d.dse) ?? [],
    ) ?? [],
  );
  for (const nd of generator) {
    if (excl.has(nd.dse)) continue;
    yield nd;
  }
}

// Pattern detection and utilities now imported from google-calendar-utils.ts

// Post-processing logic now extracted to google-calendar-utils.ts

function* generateUntilExcl(
  inner: ICalendar.Raw,
  date?: Option<NaiveDate>,
  end?: Option<NaiveDate>,
  useGoogleCalendarBehavior?: boolean,
) {
  const originalStartDate = date ?? inner.dtstart!.dates[0]!.date;

  // Use the stateless function to calculate the generator start date
  const generatorStartDate = calculateGoogleCalendarStartDate(
    originalStartDate,
    inner,
    useGoogleCalendarBehavior,
  );

  // Create raw event generator
  const rawGenerator = generatorStartDate.rangeProps(
    inner.rrule!.toFilterProps(null, end, useGoogleCalendarBehavior),
  );

  // Create excluded dates set using utility function
  const excl = createExcludedDatesSet(inner);

  // Detect COUNT pattern and use comprehensive post-processor
  const pattern = detectCountPattern(inner, useGoogleCalendarBehavior);
  const countLimit = inner.rrule?.inner.options?.count ?? undefined;

  // Use comprehensive post-processor that handles ALL event emission logic
  yield* processAllEvents(
    rawGenerator,
    pattern,
    countLimit,
    originalStartDate,
    excl,
    inner,
  );
}
