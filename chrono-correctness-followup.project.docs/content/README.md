# Fix verified Chrono correctness gaps

Claude and Gemini Neon confirmed five findings against dc64ff8. Correct civil-date membership with exact fragments, reject out-of-range iCalendar clock fields, charge yearly lookbehind only where needed, close composed iterators, and round RFC 3339 decimals without binary floating-point ties.

## Decisions and validation

`DateRegion.dateFragments()` partitions the UTC timeline by region offset and intersects each piece with the civil date. `containsInstant()` tests those half-open pieces. `date` retains a contiguous day-column range for disjoint dates, uses the true endpoints for continuous dates and is empty for a skipped date. Calendar pending events now test exact fragment overlap.

The iCalendar parser validates clock fields, retains compatibility with abbreviated times and interprets leap second 60 as 59 per RFC 5545 when leap seconds are unsupported. Malformed clock fields follow the existing parse-error path. RFC 3339 rounds decimal strings exactly, with normal midnight carry. An otherwise out-of-range carry after 9999-12-31 stays at the last representable millisecond.

All six focused regressions, the full Deno suite (680 tests, 202 steps, seven existing ignores, and 96 doc tests), type checks and two rrule.js permutation tests passed. Independent Temporal checks confirmed exact civil-date membership in 7,970 samples across 10 zones. Calendar passed 25 Sheets UI and 14 app tests. Three additional pending-event tests passed at runtime with type checking disabled. Their four type errors also reproduce against the published Chrono baseline. Logs use the `chrono-correctness-followup-` prefix in owner-host fleet evidence.

## Exact partial-column bounds

Flight timeline callers can pass resolved UTC bounds to `DateFragment.Windowed`. Each supplied instant takes precedence over its corresponding civil bound. Clipping retains the first occurrence of a repeated wall time and continues to resolve existing civil-only inputs in the fragment's zone.

The Los Angeles fall-back case verifies partial clipping, valid-hours intersection and positioning. The 14 targeted Deno tests passed at runtime, including 20 data-driven window cases. Type checking the full test import graph encounters existing recurrence work in the shared checkout.

## Bound Rust month padding and rounding

Month normalization uses Euclidean arithmetic in a wider integer type.
Range padding checks negation before calculating the lower bound. Both
operations return `None` for extreme padding that leaves the supported date
range. Normal padding and month intervals retain their established rounding.

All 47 Rust tests and doctests passed, with eight existing ignores. The focused
month tests passed after the final cleanup. Logs are under
`~/workspace/fleet/evidence/chrono-followup-edge-cases/`.

## Validate civil date inputs and extreme month deltas

Checked TypeScript dates require integer year, month and day components. The
flexible date parser tries day first for slash input whose month-first reading
is invalid. If both readings are valid, the existing month-first interpretation
wins. The date input fixtures pin both cases.

Rust civil month arithmetic normalizes in a wider integer type and retains the
day for recurrence candidates. Checked addition returns None if the resulting
year cannot fit in the civil date representation. The regression exercises both
extreme deltas and years, and keeps the February 31 recurrence candidate.

The scoped source passed type checking, 7,930 Deno tests with 319 steps, and
98 documentation and co-located tests. The owner build passed all 49 Rust
tests and doctests with all features enabled. A run in the shared working tree
also picked up eight uncommitted Graph DST fixtures that required in-progress
series duration support. The committed corpus passed in the scoped source run.
