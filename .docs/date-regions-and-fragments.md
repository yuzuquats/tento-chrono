# Date Regions and Fragments

`DateRegion` maps a date-only value into the concrete timezone-aware spans that
represent that date in a `TimezoneRegion`.

Most dates have one fragment. A date with a timezone transition can have
multiple fragments because the same logical day is split across different
offsets.

## DateRegion

```typescript
import { TimezoneRegion, naivedate, type Tzname } from "@tento-chrono";

const tz = await TimezoneRegion.get("America/Los_Angeles" as Tzname);
const region = tz.date(naivedate(2026, 3, 8));
const fragments = region.dateFragments();
```

`DateRegion.date` returns the whole-day `DateTime.Range<FixedOffset>`.
`dateFragments()` returns the renderable pieces of that day. `shift()` reports
the time shift between adjacent fragments when a transition is present.

## DateFragment

`DateFragment` wraps a `DateTime.Range<FixedOffset>` and the parent
`TimezoneRegion`.

Important properties and methods:

- `start` and `end` are timezone-aware datetimes.
- `length` is the wall-clock duration of the fragment.
- `tzabbr` returns the display abbreviation or signed offset.
- `comparison(other)` describes the shift between two fragments.
- `clamp(window)` clips the fragment to a `TimeOfDay.Range`.

## Windowed Fragments

`DateFragment.Windowed` applies calendar-view constraints to a fragment.

It supports two independent constraints:

- `partialWindow` clips to absolute local `NaiveDateTime` boundaries, such as a
  scrolled viewport.
- `validHours` clips to a recurring time-of-day window, such as business hours
  or an overnight schedule.

`applyAll()` applies the partial window first and then valid hours. This order
matters because valid hours describe what is allowed inside the currently
visible window.

## Rendering Guidance

Calendar UI should use fragments instead of assuming every day is 24 continuous
hours. Fragment-aware rendering handles:

- days that are 23 or 25 hours long;
- repeated local hours during fall-back transitions;
- missing local hours during spring-forward transitions;
- visible-hour windows that cross midnight;
- event truncation against partial viewport windows.

If feature code needs pixel positioning, prefer
`DateFragment.Windowed.getPositioning()` over recalculating fragment heights.
