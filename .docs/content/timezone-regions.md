# Timezone Regions

`TimezoneRegion` is the named-timezone layer. It knows transition history for a
timezone such as `America/Los_Angeles`, which fixed offsets alone cannot model.

## Loading Regions

```typescript
import { TimezoneRegion, type Tzname } from "@tento-chrono";

const tz = await TimezoneRegion.get("America/Los_Angeles" as Tzname);
const maybeTz = await TimezoneRegion.getOpt("America/Los_Angeles" as Tzname);
```

`get()` falls back to a default timezone if loading fails. `getOpt()` returns
`null` for invalid or unavailable zones.

The default dynamic loader fetches timezone transition JSON from the static Lona
host. Tests and isolated hosts can replace it with `TimezoneRegion.setLoader()`.

## Core Conversions

`toWallClock(ndt)` interprets a local `NaiveDateTime` inside the region and
returns a `DateTime<FixedOffset>`.

`toTz(dt)` keeps an existing instant and represents it in the region's offset at
that instant.

```typescript
import {
  TimezoneRegion,
  naivedatetime,
  type Tzname,
} from "@tento-chrono";

const tz = await TimezoneRegion.get("Europe/London" as Tzname);
const local = tz.toWallClock(naivedatetime(2026, 10, 25, 1, 30));
const utcInstant = local.toUtc();
const londonAgain = tz.toTz(utcInstant);
```

Use `toWallClock()` for user-entered local times. Use `toTz()` for displaying an
already-known instant in a user's timezone.

## DST Gaps And Overlaps

Named timezones can have local times that do not exist or occur twice:

- spring-forward gaps are resolved using the post-transition offset;
- fall-back overlaps are resolved using the post-transition offset;
- normal days use the active offset for that date.

This policy keeps wall-clock resolution deterministic. Code that needs to show
the transition itself should use `DateRegion` and `DateFragment`, which expose
multiple fragments for a day that changes offset.

## Google Calendar Behavior

`googleDatetimeResolved()` exists because Google Calendar recurrence behavior is
not a pure RFC 5545 implementation. For recurring events, Google preserves local
time across daylight-saving transitions. The implementation also models Google's
spring-forward boundary behavior, including the 60-minute rule used by the test
fixtures.

Use this path through `Recurrence` / `GoogleEventGenerator`; application code
should not call it unless it is intentionally matching Google Calendar event
generation.

## DateTimeRegion

`DateTimeRegion` pairs a `NaiveDateTime` with a `TimezoneRegion`.
`asWallClock()` is the normal resolution method. `asUtcTp()` is deprecated
because it treats the naive fields as if they were UTC before converting.
