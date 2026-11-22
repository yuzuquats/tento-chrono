# Preserve calendar instants in region conversion

Calendar legends convert a primary region's wall-clock time into a secondary region. `TimezoneRegion.toTz` selects the destination offset at the correct instant, then treats the source wall time as UTC and changes that instant. Calendar resize paths already normalize to UTC before building their display ranges.

Convert the original `DateTime` directly using the destination offset. Keep the explicit relabeling API available for callers that need it. Cover same-region and cross-region display, target offset selection at a DST fold, and the resize frame contract in the existing calendar regression file. The Google recurrence compatibility resolver is outside this change.

Validate the regression before and after the fix, the Chrono Deno suite, and relevant calendar legend tests.
