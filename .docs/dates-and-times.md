# Dates and Times

Tento Chrono separates instant timestamps, date-only values, local times, and
timezone-aware regions.

## Core Distinctions

- `DateTime<Utc>` is an instant. Use it for persisted event timestamps and
  ordering.
- `NaiveDate` is a date without a timezone. Use it for day-level concepts such
  as habits, all-day labels, and calendar headers.
- `NaiveTime` is a local wall-clock time. It is not enough to identify an
  instant.
- `NaiveDateTime` is a local date plus local time. Pair it with a timezone
  before comparing it to UTC instants.
- `DateRegion` and `DateTimeRegion` represent windows.
- `Timezone` and `TimezoneRegion` model where a local value is interpreted.

## Picking A Type

| Domain question | Use |
| --- | --- |
| "When did this happen?" | `DateTime<Utc>` |
| "What date did the user choose?" | `NaiveDate` |
| "What time of day did the user choose?" | `NaiveTime` / `TimeOfDay` |
| "What local wall-clock datetime did the user choose?" | `NaiveDateTime` plus a `TimezoneRegion` |
| "What visible calendar bucket is this in?" | `PartialDate` |
| "What part of a timezone-aware day is visible?" | `DateRegion` / `DateFragment.Windowed` |

## Construction

Use checked constructors at user, network, and file boundaries. The package also
exports small helpers for test and fixture-style code.

```typescript
import {
  DateTime,
  NaiveDate,
  TimezoneRegion,
  naivedate,
  type MsSinceEpoch,
  type Tzname,
} from "@tento-chrono";

const date = NaiveDate.fromYmd1(2026, 4, 29).exp();
const fixtureDate = naivedate(2026, 4, 29);
const parsedInstant = DateTime.fromRfc3339("2026-04-29T18:30:00Z").exp();
const tz = await TimezoneRegion.get("America/Los_Angeles" as Tzname);
```

`DateTime.fromRfc3339()` returns a `Result<DateTime<FixedOffset>>`, because the
offset in the string is known but the full timezone region is not. Convert to
UTC when the value becomes an instant in storage or comparison code.

```typescript
const stored = DateTime.fromRfc3339(rawTimestamp).exp().toUtc();
```

## Timezone Conversion

Choose the narrowest type that matches the domain. If the code cares about a
day, use a date-only type. If the code cares about a real instant, use a UTC
timestamp. If the code crosses a user's locale, carry timezone context
explicitly.

This keeps row identity, sync windows, and calendar rendering from accidentally
depending on the runtime browser timezone.

The distinction between `asTz()` and `toTz()` is intentional:

- `asTz(tz)` keeps the same local wall-clock fields and changes the timezone
  label. It usually represents a different instant.
- `toTz(tz)` keeps the same instant and changes the local wall-clock fields.

```typescript
const utcNoon = DateTime.fromRfc3339("2026-01-01T12:00:00Z").exp();
const losAngeles = await TimezoneRegion.get("America/Los_Angeles" as Tzname);
const sameWallClockDifferentInstant = utcNoon.asTz(losAngeles.tzAtMse(utcNoon.mse));
const sameInstantInUtc = utcNoon.toUtc();
```

For named timezones and daylight-saving transitions, prefer
`TimezoneRegion.toWallClock()` and `TimezoneRegion.toTz()`. Fixed offsets alone
cannot answer questions like "which offset applied in Los Angeles on this
date?"

## Comparison And Equality

`DateTime.compare()` and `DateTime.eq()` compare instants through milliseconds
since epoch. `compareSame()` compares local fields and is only correct when both
values are already known to use the same timezone.

For date-like values, use `.equals()` rather than object identity. Many chrono
types are value objects that may be reconstructed after parsing, syncing, or
testing.

## JavaScript Date Interop

`Date` is only for browser or library edges. Convert explicitly:

```typescript
const jsDate = new Date(dateTime.mse);
const chronoDateTime = DateTime.fromMse(jsDate.getTime() as MsSinceEpoch, DateTime.utc);
```

Do not pass `Date` through application state or API models. It hides whether the
caller meant a local date, local time, or instant.
