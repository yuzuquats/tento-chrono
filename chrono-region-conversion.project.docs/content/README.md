# Preserve calendar instants in region conversion

Calendar legends convert a primary region's wall-clock time into a secondary region. `TimezoneRegion.toTz` selects the destination offset at the correct instant, then treats the source wall time as UTC and changes that instant. Calendar resize paths already normalize to UTC before building their display ranges.

Convert the original `DateTime` directly using the destination offset. Keep the explicit relabeling API available for callers that need it. Cover same-region and cross-region display, target offset selection at a DST fold, and the resize frame contract in the existing calendar regression file. The Google recurrence compatibility resolver is outside this change.

Validate the regression before and after the fix, the Chrono Deno suite, and relevant calendar legend tests.

## Validation

The two conversion regressions failed on the old implementation and passed after the fix. The resize test also passed. Chrono type checks and the full Deno suite passed (669 tests, 202 steps, 7 existing ignores, and 96 documentation tests). The Lona consumer's timeline legend, column timezone and calendar span viewer-zone tests passed (8 tests). The owner logs are `~/workspace/fleet/evidence/chrono-region-conversion-{before,after,check,test,calendar}.log`.
