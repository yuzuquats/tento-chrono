# @tento-chrono

`tento-chrono` provides date, time, timezone, recurrence, and calendar
primitives for Lona and related Tento libraries.

It is deliberately more explicit than JavaScript `Date`. Most bugs in calendar
code come from silently mixing these ideas:

- an absolute instant;
- a date-only label;
- a local wall-clock time;
- a local date and time that still needs a timezone;
- a visible calendar window that may cross a timezone transition.

The package gives each of those concepts a named type so API boundaries reveal
the intended semantics.

## Package Layout

- `chrono/` is the TypeScript API used by frontend and SDK code.
- `src/` is the Rust API used by backend services and generated API types.
- `chrono/recurrence/` parses iCalendar recurrence strings and generates
  recurrence dates.
- `chrono/secondary-calendars/` converts Gregorian dates into supported
  alternate calendar systems for display.
- `bindings/` exposes selected Rust behavior into JavaScript when generated
  bindings are needed.
- `tests/` contains cross-language, timezone, recurrence, and secondary-calendar
  fixtures.

## Main Type Groups

Use these groups as the first decision point when designing an API:

| Concern | TypeScript types | Rust types |
| --- | --- | --- |
| Instant timestamps | `DateTime<Utc>`, `DateTime<FixedOffset>` | `chrono::DateTime<Utc>` |
| Date-only values | `NaiveDate` | `chrono::NaiveDate` |
| Time-only values | `NaiveTime`, `TimeOfDay` | Chrono time values at call sites |
| Local date plus local time | `NaiveDateTime` | `chrono::NaiveDateTime` |
| Calendar buckets | `PartialDate` | `PartialDate` |
| Timezone-aware days | `TimezoneRegion`, `DateRegion`, `DateFragment` | Usually resolved before crossing the Rust boundary |
| Recurrence | `RRule`, `ICalendar.Raw`, `Recurrence` | Usually stored as strings or generated in TypeScript |

## Boundaries

Use these types instead of JavaScript `Date` when modeling application state,
wire data, or user-visible calendar logic. `Date` is an interop detail at the
edge of the app; the domain model should say whether a value is an instant, a
date-only value, a local time, or a timezone-aware region.

Timezone transition data belongs in `tento-tz`. Calendar UI and sheet plugins
consume `tento-chrono` values but should not reimplement recurrence or date
window math.

## Import Boundary

TypeScript consumers normally import through the package export:

```typescript
import {
  DateTime,
  NaiveDate,
  PartialDate,
  TimezoneRegion,
  Weekday,
} from "@tento-chrono";
```

Avoid reaching into deep files unless the package surface does not expose the
type you need. If an application needs new calendar behavior, add it to
`tento-chrono` rather than duplicating date math in app code.

## Design Rules

- Persist instants as UTC or RFC 3339 strings that parse to `DateTime<Utc>` or
  `DateTime<FixedOffset>`.
- Persist date-only user intent as `NaiveDate` or `PartialDate`, not midnight in
  an arbitrary timezone.
- Carry a `TimezoneRegion` anywhere wall-clock time must become an instant.
- Treat `DateRegion` and `DateFragment` as rendering primitives for calendar
  columns and visible windows.
- Use recurrence APIs for iCalendar and Google Calendar behavior instead of
  manually iterating dates in feature code.
