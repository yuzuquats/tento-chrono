# Type Model and Units

The TypeScript API is exported from `chrono/mod.ts`. It re-exports the core
date/time values, unit helpers, timezone regions, recurrence modules, and
secondary-calendar converters.

## Public Surface

Common imports come from `@tento-chrono`:

```typescript
import {
  DateTime,
  Duration,
  NaiveDate,
  NaiveDateTime,
  NaiveTime,
  PartialDate,
  TimeOfDay,
  TimezoneRegion,
  Weekday,
} from "@tento-chrono";
```

The package also exports convenience constructors:

- `naivedate(year, month1, day1)` returns a checked `NaiveDate`.
- `naivedatetime(year, month1, day1, hrs, mins, secs, ms)` builds a
  `NaiveDateTime`.
- `naivetime(hrs, mins, secs, ms)` builds a `NaiveTime`.
- `rfc3339` and `datetime` alias `DateTime.fromRfc3339`.

Prefer the explicit class constructors or checked parse methods at runtime
boundaries. The helpers are useful in tests, examples, and data fixtures.

## Value Types

`NaiveDate` is the exported name for `YearMonthDay`. It carries 1-indexed date
fields (`yr`, `month1`, `day1`), epoch-derived fields (`dse`, `mse`), ISO week
fields, and date arithmetic.

`NaiveTime` is the exported name for `TimeOfDay`. It stores milliseconds since
midnight, with helpers for parsing `HH:MM` and `HH:MM:SS`, meridiem display, and
time-of-day ranges.

`NaiveDateTime` combines a `NaiveDate` and `NaiveTime`. It still does not
identify an instant until it is paired with a timezone.

`DateTime<Tz>` combines a `NaiveDateTime` with a logical timezone. Use
`DateTime<Utc>` when the value is an instant and `DateTime<FixedOffset>` when the
offset came from a parsed string or timezone transition.

## Units

The `chrono/units` layer provides branded unit types and small value helpers:

- `DateUnit` represents calendar-scale increments such as year, month, week,
  and day.
- `Duration.Time` / `DurationTime` represents elapsed milliseconds with
  convenient hour, minute, second, and day views.
- `TimeOfDay.Range` models visible hour windows, including overnight windows.
- `Weekday`, `Month`, `Year`, `YearMonth`, and `YearMonthDay` encapsulate
  calendar math that should not be repeated in app code.
- `Ms`, `MsSinceEpoch`, `DaysSinceEpoch`, and related aliases make boundary
  units visible in function signatures.

## Design Guidance

Use branded units and chrono value types at package boundaries even when the
implementation is just a number. This prevents accidental mixing of milliseconds
since midnight, milliseconds since epoch, days since epoch, and display hours.

When a feature needs new date math, add a method to the relevant chrono value
type. Do not spread ad hoc calculations across calendar components or SDK
clients.
