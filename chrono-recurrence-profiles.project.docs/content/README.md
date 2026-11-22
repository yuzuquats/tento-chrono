# Recurrence uses RFC 5545 unless an importer selects a compatibility profile

The audit at `d2df70b` found that a folded rule silently dropped BYHOUR and
the permissive reader accepted weekly BYWEEKNO. Google expands weekly
BYWEEKNO and disregards several accepted time selectors in captured cases.
Parsing and expansion need to agree about which input contract the caller selected.

`Recurrence.fromICalendar` binds a profile, DTSTART and the parsed rules into
one series. The default unfolds and validates RFC recurrence properties.
The Google profile uses the existing provider composition. The dateutil and
rrule.js profiles can union multiple RRULEs, which each pinned library does
in the independent captures. Low-level callers select their composition explicitly.

```review-table
| Input | Verification |
| --- | --- |
| RFC 5545 recurrence properties | Published examples and regressions through the public default. |
| Google Calendar event master | Live Calendar API starts replayed offline. |
| dateutil and rrule.js | Captured expectations from pinned versions, plus the full dateutil inventory. |
| Graph patterned recurrence | Native series and expanded calendarView rows from the tester calendar when available. |
```

Graph captures precede any claim of local Outlook parity. The scope is
occurrence starts, including civil dates and floating start values. Full
VCALENDAR parsing, custom VTIMEZONE definitions, and application of detached
events belong to the calendar import layer.

## Verified implementation

The default reader unfolds RFC content lines, validates the recurrence
properties together with DTSTART, expands timed instances before applying
BYSETPOS, and treats second 60 as second 59 at millisecond precision. It keeps
civil dates, floating times, and instants distinct. The bound cursor reads
incrementally through the same selected profile.

| Fixture source | Result through the profile API |
| --- | --- |
| RFC 5545 examples and audit regressions | 26 cases, including rejected invalid rules |
| Google Calendar API | 29 exact matches out of 32, with three tracked differences in yearly week-number selection and COUNT |
| Python dateutil 2.8.2 (`tz.gettz`) | 19 exact matches out of 20 |
| rrule.js 2.8.1 (`TZ=UTC`) | 19 exact matches out of 20 |
| Microsoft Graph v1.0 `calendarView` | 13 exact matches across all six pattern kinds and three range types |

Google time-selector controls, explicit-interval weekly and monthly rules,
and the Lord Howe gap now match through the new profile. The two library
captures retain an ambiguous event when a UTC EXDATE names its instant.
Chrono's two profiles still remove it. The JSON keeps both actual results.
The prior dateutil inventory and Google recordings still run through the
legacy entry points. Those entry points retain their established contracts.

The Graph captures include 61 occurrence starts. A first leap-day listing
returned HTTP 400. A shorter listing window yielded four starts and showed
that Graph clamps February 29 to February 28 in common years. All 14
temporary Graph masters, including the initial leap-day attempt, were
removed and verified absent. The caller supplies Windows-to-IANA mapping
where required. Graph parity is measured for starts, with moved instances
and cancellations outside this capture.

The sanitized source captures and test logs are on yuzuquats under
`~/workspace/fleet/evidence/chrono-fixture-suite` as `graph-expansion-rwc04*`,
`recurrence-profile-*`, and `profile-*.log`.

## Exact replay of the provider captures

The remaining three Google captures now match through the bound Google
profile. Thirty-six follow-up Calendar API series (169 starts) exercised
Monday and Sunday week starts, matched and unmatched DTSTART, small COUNT
values, and negative week numbers over several New Year boundaries. Google
uses the next year's week count for the first year's negative ordinals
when the series starts in its final Sunday-based week. The week is still
anchored to the candidate year. The short COUNT probes distinguish a
DTSTART that consumed a rule slot from one supplied separately.

The library controls separate two exclusion policies. dateutil retains an
ambiguous occurrence when the exclusion refers to a different timezone.
rrule.js interprets the exclusion's clock fields in the series timezone.
The RFC default uses an exact instant for a UTC EXDATE. Each pinned library
has 25 exact fixture matches, including exclusions on ordinary days and
during a fold. All 68 Google and 13 Graph series match the captured starts.

All 36 extra synthetic Calendar masters were verified absent. The
sanitized recordings are in the existing evidence directory under
`google-expansion-rwc04-{week-parity,negative-weeks,rollover}.json` and
`recurrence-profile-exdate-*.json`.
