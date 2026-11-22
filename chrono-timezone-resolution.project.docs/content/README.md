# Resolve regional dates and daylight-saving transitions

Use the requested region's calendar for today. Carry the resolved instant into region values created from timestamps, including both endpoints of a range. Resolve local clocks against full transition timestamps so a transition crossing midnight or followed by another change on the same day uses the correct offset.

Keep the general resolver's post-transition choice for bare skipped or repeated times. Preserve the separate RFC 5545 and Google Calendar recurrence policies. Add deterministic regressions for regional midnight, a repeated-hour range and now, and transitions that cross midnight or occur twice on one date.
