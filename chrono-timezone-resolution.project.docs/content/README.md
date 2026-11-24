# Resolve regional dates and daylight-saving transitions

Use the requested region's calendar for today. Carry the resolved instant into region values created from timestamps, including both endpoints of a range. Resolve local clocks against full transition timestamps so a transition crossing midnight or followed by another change on the same day uses the correct offset.

Keep the general resolver's post-transition choice for bare skipped or repeated times. Preserve the separate RFC 5545 and Google Calendar recurrence policies. Add deterministic regressions for regional midnight, a repeated-hour range and now, and transitions that cross midnight or occur twice on one date.

## Validation

All five regression tests failed against the old implementation and pass with the fix. The focused wall-clock, conversion and timezone tests passed (19 tests), as did the full Deno suite (674 tests, 202 steps, seven existing ignores, plus 96 documentation tests), type checks and 31 targeted Calendar consumer tests. Existing UTC wall-clock fixtures continue to use the established fixed-offset representation.

Owner logs use the `chrono-timezone-resolution-` prefix under `~/workspace/fleet/evidence`. Deploying the dependency and running the authenticated dev grid were outside this change.

## Require an explicit fallback for unavailable timezone names

`TimezoneRegion.get(name)` now throws `RangeError` when the named zone cannot
be resolved. Callers can use `getOpt(name)` for a nullable lookup. An explicit
fallback name loads through the usual resolver on the first request and is
reported only after it succeeds. When both names fail, the error identifies
both. The iCalendar and RRULE readers continue to request UTC explicitly.

The focused timezone suite passed 156 tests. The full Deno suite passed 7,903
tests and 319 steps with seven existing ignores. All 98 documentation tests
passed. Logs are under `~/workspace/fleet/evidence/chrono-timezone-explicit-fallback/`.
