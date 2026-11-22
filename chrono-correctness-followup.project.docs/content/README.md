# Fix verified Chrono correctness gaps

Claude and Gemini Neon confirmed five findings against dc64ff8. Correct civil-date membership with exact fragments, reject out-of-range iCalendar clock fields, charge yearly lookbehind only where needed, close composed iterators, and round RFC 3339 decimals without binary floating-point ties.

## Decisions and validation

`DateRegion.dateFragments()` partitions the UTC timeline by region offset and intersects each piece with the civil date. `containsInstant()` tests those half-open pieces. `date` retains a contiguous day-column range for disjoint dates, uses the true endpoints for continuous dates and is empty for a skipped date. Calendar pending events now test exact fragment overlap.

The iCalendar parser validates clock fields, retains compatibility with abbreviated times and interprets leap second 60 as 59 per RFC 5545 when leap seconds are unsupported. Malformed clock fields follow the existing parse-error path. RFC 3339 rounds decimal strings exactly, with normal midnight carry. An otherwise out-of-range carry after 9999-12-31 stays at the last representable millisecond.

All six focused regressions, the full Deno suite (680 tests, 202 steps, seven existing ignores, and 96 doc tests), type checks and two rrule.js permutation tests passed. Independent Temporal checks confirmed exact civil-date membership in 7,970 samples across 10 zones. Calendar passed 25 Sheets UI and 14 app tests. Three additional pending-event tests passed at runtime with type checking disabled. Their four type errors also reproduce against the published Chrono baseline. Logs use the `chrono-correctness-followup-` prefix in owner-host fleet evidence.
