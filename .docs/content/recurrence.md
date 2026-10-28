# Recurrence and iCalendar

The recurrence layer parses iCalendar recurrence strings, preserves exclusion
dates, generates matching dates, and models Google Calendar compatibility where
Google behavior differs from plain RFC 5545.

## Public Types

- `RRule` parses and serializes `RRULE:` lines.
- `ExDate` parses `EXDATE` lines and stores excluded dates.
- `ICalendar.Raw` parses recurrence arrays into structured lines.
- `Recurrence` wraps parsed iCalendar data and generates dates.
- `GoogleEventGenerator` emits `DateTime<Utc>` events with Google Calendar's
  timezone behavior.

## Parsing

```typescript
import { Recurrence, naivedate } from "@tento-chrono";

const recurrence = await Recurrence.parse([
  "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=10",
  "EXDATE:20260429",
]);

const parsed = recurrence.exp();
```

`RRule.parseWithRecurrence()` is useful when only the rule and exclusion dates
are needed. `Recurrence.parse()` is the higher-level entry point for generation.

## Generation

`generate()` yields matching `YearMonthDay` values with an optional start date
and limit.

`generateToDate()` yields until an exclusive end date and can enable Google
Calendar behavior.

```typescript
const dates = parsed.generateToDate(
  naivedate(2026, 4, 1),
  naivedate(2026, 5, 1),
);
```

When a recurrence has a `TZID`, `recurrence.timezone()` resolves the matching
`TimezoneRegion`.

## Google Calendar Compatibility

Google Calendar preserves local wall-clock time across DST transitions. That
means a weekly 10:00 event remains 10:00 local time even when its UTC timestamp
changes after a DST boundary.

Google also treats `UNTIL` differently based on shape:

- date-only `UNTIL` values are exclusive of that whole date;
- datetime `UNTIL` values are inclusive up to the exact instant.

Use `GoogleEventGenerator` when comparing against Google Calendar API results or
generating events imported from Google. The tests under
`tests/google_recurrence_test_data/` document edge cases for BYDAY, BYMONTHDAY,
BYWEEKNO, EXDATE, DST transitions, and timezone mismatches.

## Readable Display

`RRule.toReadableDisplay()` produces human-facing summaries for common rules,
such as:

- `Daily, 5 times`
- `Weekly on Monday, Wednesday and Friday`
- `Monthly on the 2nd Tuesday, 6 times`

Use it for lightweight labels, not as a replacement for the structured rule.
