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

## Frequency, civil-date, and RDATE controls

The follow-up added 72 provider outcomes. Google supplied 29 expansions
(151 starts) and rejected 11 subdaily submissions with HTTP 400. The
latter include controls with longer event durations. For every supported
date-level frequency, independent probes now show that Google keeps the
master's clock time in the presence of BYHOUR, BYMINUTE or BYSECOND.
Six all-day series across a Los Angeles offset change confirm inclusive
DATE UNTIL, DATE EXDATE, duplicate RDATE handling, and RDATE after UNTIL.
Saturday and Sunday controls across two year ends matched the existing
Google negative-week filter, including BYWEEKNO=-2.

Eight further Outlook Graph series (29 starts) verify third, fourth and
last relative multi-weekday patterns on alternate months and years, plus
local inclusive end dates for late-evening events across a DST change.
Every Google and Graph master created for the follow-up was verified absent.

Twelve RDATE gap and fold probes were captured per pinned library.
dateutil accepts the five UTC-only probes and rejects seven containing
TZID on RDATE. rrule.js accepts all twelve and rezones added date fields
in the series timezone, even if a value has Z or a different TZID. These
results apply through the named profiles. The RFC default uses the original
form of each RDATE value.

The fixture suite now covers 185 captured expansions and 18 captured
rejections, plus 27 RFC cases. Source captures are under the existing
evidence directory as `google-expansion-rwc04-{coverage,frequency-confirm}.json`,
`graph-expansion-rwc04-coverage.json`, and `recurrence-profile-rdate-*.json`.

## Public usage and RFC controls

The recurrence guide and runnable example now use the profile-bound reader
for RFC and Google inputs. Three additional default-profile fixtures verify
hourly recurrence, both explicit UTC RDATE instants in a DST fold, and
foreign-TZID RDATE resolution. These exercise the same inputs that require
different behavior in the compatibility profiles. The corpus now contains
203 captured outcomes and 30 RFC cases.

## Multiple-rule and transition captures

A further 16 Google Calendar series yielded 70 starts. Google accepts two
RRULE lines in either submitted order, unifies overlaps, and applies EXDATE
to that set. This holds for the timed and all-day captures. The Google
profile now permits the union. The default RFC reader still rejects
multiple RRULE lines.

The Lord Howe fold, the Los Angeles gap and fold starts, and the Apia skipped
date match exactly. Google returned the earlier fold instant for both
submitted offsets at the Los Angeles master start. The Apia series had
COUNT=6 and five distinct starts. Its offline fixture uses the production
2024b transition data.

Eight additional Graph series yielded 40 starts and matched Chrono. They
cover Pacific gap and fold times, two-month cadence on the 30th or 31st,
and a UTC master expanded in the Pacific recurrence timezone. All 24
temporary provider masters were removed and verified absent.

The sanitized responses are `google-expansion-rwc04-edge-cases.json` and
`graph-expansion-rwc04-edge-cases.json` in the evidence directory. The
profile suite now replays 209 captured expansions, 18 captured rejections,
and 30 RFC fixtures.


## Exclusion rules, Easter, and post-transition times

The default reader accepts RRULE extension parameters, including delimiters
inside quotes, and checks RDATE PERIOD durations against the RFC grammar.
It rejects zero and negative durations and checks that comparable explicit
endpoints are in chronological order.

The pinned library profiles expand EXRULE separately with its own COUNT and
subtract matching instances from the rule set. The exclusion cursor reads
through the last day with an inclusion in each batch. The dateutil profile
also expands BYEASTER, including multiple offsets and BYSETPOS. The rrule.js
profile applies its encoded-time timezone conversion to generated dates.
For a daily 03:30 New York rule on March 8, 2026, rrule.js 2.8.1 under
`TZ=UTC` returns 08:30Z and the RFC profile returns 07:30Z.

The profile suite adds 21 pinned-library cases and ten RFC controls.
The vendored Python suite now runs 21 additional Easter expansions and five
EXRULE tests. The reference exports are
`recurrence-profile-rule-set-dateutil-2.8.2.json`,
`recurrence-profile-rule-set-rrule-js-2.8.1.json`, and
`recurrence-profile-easter-dateutil-2.8.2.json` under
`fleet/evidence/chrono-fixture-suite/`.

The dateutil profile now retains the 01:30 and 02:30 New York wall
candidates that both resolve to 06:30Z on March 8, 2026. The original
reference row and ten additional dateutil 2.8.2 captures run in
`tests/fixtures/recurrence-profile.dateutil.json`. They cover same-zone
and UTC exclusions, overlapping rules, UTC additions, candidate order,
and reads split across UTC days. The fixture compares results in
Chrono's UTC chronological order, including equal instants.

Deno type checking passed for `chrono`, `tests`, `tests.e2e`, and
`examples`. The complete run passed 96 documentation tests and 1,249
suite tests with 319 steps and seven existing ignores.

The gap identity follow-up passed Deno type checking, 96 documentation
tests, and 1,260 suite tests with 319 steps and seven existing ignores.

The publication review found that dateutil uses the week’s starting year
for BYEASTER, including the extra mask slots for early January. The
first partial week starts at DTSTART. The weekly filter selects the mask
before BYDAY narrows the week. Seven reference fixtures cover those
boundaries and a daily control. Chrono builds each
year’s mask on demand, so it can satisfy COUNT before dateutil’s
lookahead would raise an out-of-range offset error.


## Partial weeks, encoded UNTIL, and fold equality

Both pinned libraries limit the first weekly date set to days on or after
DTSTART before selecting BYSETPOS. They still let earlier times on the
start date affect the selection. The bound profiles now apply that ordering
to both date-level and timed rules.

rrule.js 2.8.1 compares zoned candidates to UNTIL before timezone
conversion. The captured New York rule includes a March 8 start whose
resolved UTC instant is after the literal cutoff. The Tokyo control omits
a start that resolves exactly to the literal cutoff. EXRULE uses the same
comparison, and RDATE remains independent of a rule's cutoff.

dateutil 2.8.2 keeps an ambiguous rule start and a UTC RDATE at the same
instant as separate occurrences. The fold fixtures also verify each
exclusion form, including EXRULE. The bound reader applies dateutil's
timezone-awareness checks to rule sets at read time, including mismatches
Python reports during iteration, and accepts its supported RDATE
parameter. The RFC reader checks the explicit RRULE value type.

The profile fixtures add 15 dateutil captures, nine rrule.js captures
under `TZ=UTC`, and two RFC validation controls. The validation logs are
`profile-partial-week-*.log` in the existing evidence directory.

The publication cutoff check also found that both pinned libraries read
bare UNTIL dates as midnight on timed rules. Seven captures cover that
interpretation, exact midnight inclusivity, and DATE series. Six dateutil
captures verify that RDATE and EXDATE agree on timezone awareness with
EXRULE or each other, including sets without an RRULE.

The publication export passed Deno type checking, 96 doc tests, and
1,306 suite tests with 319 steps and seven existing ignores.
