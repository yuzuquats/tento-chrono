# Changelog

## Changed behavior since `789c9c1`

- `DateTime.rfc3339()`, `toString()`, and `toJSON()` now use a
  minute-precision offset (or `Z` for UTC) while preserving the instant.
  For historical offsets with seconds, the printed wall clock can differ
  from `.ndt` by up to 30 seconds. The offset seconds are lost when the
  string is parsed back. For example,
  `DateTime.fromRfc3339("1900-03-01T00:00:00-00:43:08").exp().rfc3339()`
  now returns `1900-03-01T00:00:08-00:43`. Previously it returned
  `1900-03-01T00:00:00-00:43:08`.
- Timezone regions built by the platform loader now retain historical
  offsets to the second. At `1960-06-01T12:00:00Z`, `Africa/Monrovia`
  has `.ndt` `1960-06-01T11:15:30` and an offset of −2670 seconds.
  Previously it had `.ndt` `1960-06-01T11:16:00` and an offset of
  −2640 seconds.
- `Recurrence.fromICalendar` supports `rfcDateMode: "written"` for sets
  that keep the civil, floating, or instant kind of each explicit date.
  The default retains the published DTSTART-based behavior.
- A timezone compiled from `VTIMEZONE` covers the inclusive UTC
  `through` date. Instant projections and recurrence queries beyond
  that horizon report a coverage error.
- Graph and dateutil recurrence binding use the caller's values at
  invocation on both cold and warm module loads. The iCalendar date-line
  serializer retains timed exclusions on mixed provider lists.
- The legacy `generateEvents(…, RecurrenceComposition.GOOGLE)` path includes
  the master in addition to COUNT rule matches when the master falls
  outside its own recurrence rule, subject to exclusions. With
  `DTSTART:20190315T013000Z` and
  `FREQ=WEEKLY;BYDAY=FR;BYMONTH=8,10;COUNT=3`, the starts are March 15,
  August 2, August 9, and August 16, 2019, all at 01:30 UTC. Previously,
  the master consumed a COUNT slot and August 16 was omitted.
- With the default RFC profile, each numbered week belongs wholly to its
  week-numbering period year. BYSETPOS ranks the entire filtered set for
  that year, including selected days that fall in an adjacent civil year. With
  `DTSTART:20190413T000000Z` and
  `FREQ=YEARLY;BYWEEKNO=10,20,-53;BYSETPOS=1`, the first occurrence is
  December 30, 2019 at 00:00 UTC. Previously it was January 1, 2020 at
  00:00 UTC.
