# Timezone Regions

`TimezoneRegion` is the named-timezone layer. It knows transition history for a
timezone such as `America/Los_Angeles`, which fixed offsets alone cannot model.

## Loading Regions

```typescript
import { TimezoneRegion, Tzname } from "@tento-chrono";

const name = "America/Los_Angeles" as Tzname;
const tz = await TimezoneRegion.get(name);
const maybeTz = await TimezoneRegion.getOpt(name);
const tzOrUtc = await TimezoneRegion.get(name, Tzname.UTC);
```

`get(name)` throws a `RangeError` if the name cannot be resolved.
`getOpt(name)` returns `null` in that case. The optional second argument to
`get()` names an explicit fallback. If neither zone loads, `get()` throws and
names both zones.

The default dynamic loader fetches timezone transition JSON from the application
server's static host. Tests and isolated hosts can replace it with
`TimezoneRegion.setLoader()`.

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
