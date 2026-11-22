# Recurrence and iCalendar

`Recurrence.fromICalendar()` binds an input profile before validation and
expansion. Omit the profile for RFC 5545 recurrence properties.

```ts
import { NaiveDate, Recurrence } from "@tento-chrono";

const series = (await Recurrence.fromICalendar([
  "DTSTART:20260101T090000Z",
  "RRULE:FREQ=DAILY;COUNT=3",
])).exp();
const starts = series.occurrences({ through: NaiveDate.parse("2026-01-07") });
```

Supply `DTSTART` in the content lines or as an external `dtstart` value.
`occurrences()` returns civil dates for `DATE` starts, naive date-times for
floating starts, and UTC date-times for starts with a zone or offset.
`through` is an inclusive UTC day for instants and an inclusive civil day
for the other forms. Use `series.generator().generateUpToDate(day)` for
successive reads, with an optional generation limit on the generator.

## Compatibility profiles

Select the profile at the import boundary. A Google Calendar event master
supplies the recurrence lines and start separately.

```ts
const series = (await Recurrence.fromICalendar(master.recurrence, {
  profile: "google",
  dtstart: master.start,
})).exp();
```

Google uses the master’s clock time for date-level rules and rejects
subdaily frequencies. A date-only `UNTIL` includes its date for an all-day
series and excludes that date for a timed series. A date-time `UNTIL`
includes the occurrence at the exact cutoff.

Select `dateutil` or `rrule-js` to replay those libraries' rule sets. The
dateutil 2.8.2 profile rejects a `TZID` parameter on `RDATE`. The rrule.js
2.8.1 profile reads added date-time fields in the series timezone, matching
the reference captures taken with `TZ=UTC`. RFC expansion preserves the
instant of a UTC `RDATE` and resolves a `TZID` value in its named zone.

For a Microsoft Graph master, use `Recurrence.fromGraph(master)`. Supply
`resolveTimeZone` to map Graph Windows identifiers to IANA zones when
the runtime cannot resolve them.

The profile reader covers recurrence properties. Importers apply full
calendar components and detached instances to the resulting starts.

## Low-level and existing callers

`RRule.parse()` and `RRule.parseWithRecurrence()` expose rule-level parsing.
`RRule.toReadableDisplay()` provides summaries such as “Monthly on the 2nd
Tuesday, 6 times.”

`Recurrence.parse()`, `generate()`, `generateToDate()`, and
`generateGoogleEvents()` are the existing low-level expansion APIs.
Use the profile reader for new imports and fixture replay. Its named
profiles include the provider-specific validation and expansion rules.
