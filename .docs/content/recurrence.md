# Recurrence and iCalendar

`Recurrence.fromICalendar()` binds an input profile before validation and
expansion. Omit the profile for RFC 5545 recurrence properties.

```ts
import { NaiveDate, Recurrence } from "@tento/chrono";

const series = (await Recurrence.fromICalendar([
  "DTSTART:20260101T090000Z",
  "RRULE:FREQ=DAILY;COUNT=3",
])).exp();
const starts = series.occurrences({ through: NaiveDate.parse("2026-01-07") });
```

Supply `DTSTART` in the content lines or as an external `dtstart` value.
The reader accepts recurrence text in one array entry and
physical lines with or without their terminators. Splitting CRLF
text with `split("\n")` retains the same folding semantics.
The RFC profile validates each content-line header after unfolding.
Values of unrelated properties are ignored after their headers pass.
Malformed headers produce a parse error, including whitespace
between a property name and its colon or parameter list.
Extension parameters can use comma-separated bare or quoted values.
Quote a value that includes a literal comma, colon or semicolon.
`occurrences()` returns civil dates for `DATE` starts, naive date-times for
floating starts, and UTC date-times for starts with a zone or offset.
By default, the RFC profile uses the DTSTART frame for explicit dates.
A floating EXDATE in a zoned series compares in the series timezone.
EXDATE must use the same DATE or DATE-TIME value type as DTSTART, and
returned starts use the kind of DTSTART.

Pass `rfcDateMode: "written"` to retain the kind of each explicit RDATE
and EXDATE. A series can then yield `NaiveDate`, `NaiveDateTime`, and
`DateTime<Utc>` in the same query. EXDATE matches within its own kind.
UTC and TZID values share absolute instant identity, while a floating
value stays in the civil frame and cannot remove an absolute start.

With external `dtstart`, an absolute `dateTime` together with
`timeZone` can select a particular occurrence of a repeated local
time. In the initial overlap, the RFC profile selects the first
matching instant at or after that anchor. Before a supplied table's
first transition, it uses that transition's initial offset. Later
folds and textual TZID values use the first occurrence per §3.3.5.
The default timezone loader preserves historical offsets with a
seconds component when the platform's timezone data supplies one.
RFC recurrences continue to use that platform data before 1900 and
from 2050 onward. The loader fills the transition window for the
queried year on demand. Recurrences backed by a supplied transition
table use that table's timezone rules. The rrule.js profile also loads
distant platform transitions when replaying its host and target zones.
For Windows zones with matching Outlook captures, the Outlook profile
extends recurrence timezone rules past the supplied table's final
recorded calendar year when the offset agrees with platform data at
the boundary. The Google profile checks both ends of a served IANA
table independently. Outside a matching boundary, the recurrence
uses platform offsets, including historical offsets with seconds and
future seasonal transitions.

RFC COUNT and INTERVAL accept positive decimal digit strings.
An amount above JavaScript's safe-integer limit is effectively
unbounded for COUNT and prevents a second interval within the
supported millisecond calendar.

Each explicit PERIOD end must follow its start. If exactly one endpoint
is floating, the RFC profile accepts the pair when it increases at
every offset allowed by RFC 5545. If the order depends on the offset,
the reader reports that it needs the floating timezone to compare
the endpoints. A start followed by a positive duration requires no
endpoint comparison.

`through` is an inclusive UTC day for instants and an inclusive civil day
for the other forms. A mixed result orders instant UTC fields and floating
wall fields together, with civil dates at midnight for sorting. At equal
fields, rule starts precede distinct RDATEs, which keep their input order.
Calendar consumers can bind floating starts to the viewer's timezone
when displaying or comparing them as instants. Use
`series.generator().generateUpToDate(day)` for successive reads, with
an optional generation limit on the generator. An RFC rule can pause
at the end of an empty window and resume on a later read.
For recurrence candidates in a timezone gap, the RFC profile uses the
offset before the transition, as clarified by verified RFC 5545 erratum
4271. If two candidates resolve to one instant, the recurrence set
includes it once.

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
subdaily frequencies. Google accepts up to nine fractional digits in
recurring event timestamps. When replaying a submitted event, pass its
`end` as `dtend` to check that the start and end have matching
millisecond remainders after truncation to milliseconds. Google stores
accepted timestamps at whole-second precision and expands from that clock.

A timed consumer can use `series.googleTimedGenerator()` for
incremental reads and the timed EXDATE decision for the first
slot. A consumer that renders raw masters from already-loaded
timezone data can use `googleTimedStartExcluded()`. It returns
`null` when the synchronous decision needs another timezone.
Applications can provide `googleTimeZoneFallback` to keep their
zone fallback policy before the profile reconstructs missing
transition data from the platform.

A date-only `UNTIL` cuts off at midnight UTC for both inclusion and
exclusion rules. A date-time cutoff requires `Z`.
An occurrence exactly at the cutoff is included by RRULE or excluded
by EXRULE. The Google profile stops rule and explicit recurrence
starts at midnight UTC on January 1, 2100. A master dated beyond
that boundary can still appear as an instance.
Google also accepts multiple
RRULE lines and expands their union, with duplicates collapsed and EXDATE
applied across the set. Google rejects rules containing both `COUNT`
and `UNTIL`. Both COUNT and INTERVAL take signed 32-bit values.
A COUNT of zero or −2,147,483,648 leaves the rule unbounded.
For weekly rules without BYDAY, multiplying a positive interval by
seven wraps to a 32-bit day step. BYSETPOS still ranks the dates within
each week. Its legacy `EXRULE` removes matching rule instances from
the union, including matching RDATEs. A scalar time selector in an
RRULE or EXRULE overrides its clock field. A list of time values leaves
that field on the master's clock. Google ignores `BYSETPOS` for
daily rules and uses `BYWEEKNO` and `BYYEARDAY` only for yearly
rules. It evaluates ordinal weekdays in the containing year for
daily rules and in the containing month for weekly rules. The
frequency and interval still determine which dates can qualify.
Validation applies to these parts before normalization. In yearly
rules, an explicit month day or year day takes precedence over a week
number. Yearly month-day rules with no month or year-day selector use
the master's month. That default limits dates after ordinal weekdays
have been ranked in the calendar year. Very large positive yearly
intervals advance a signed 32-bit year. Its January 1 Julian or
Gregorian day ordinal can also wrap, selecting a calendar year
before the raw year returns. Selectors evaluate a projected B.C.
period on its Julian calendar. Google then writes the selected
date with its year of era, so astronomical year −1800 appears as
1801. A Julian February 29 can become March 1 when written in the
Gregorian calendar. Projections outside the four-digit year-of-era
range are skipped. Qualifying trials
refresh the 500-trial search and candidates beyond the provider's
UTC horizon can end it. These projected yearly periods
pass through the normal calendar selectors. Adjacent trials that
project to one period coalesce. Repeated periods separated by
other trials can consume COUNT before the response deduplicates
the occurrences. An instances query stops yearly trial traversal
at the first included start strictly after the upper bound. For
all-day series the bound is interpreted in the calendar timezone
and compared with the candidate's civil date. The final overlap
test excludes a start at equality. Excluding the stopping trial
or including an overlapping RDATE can expose a later trial that
projects to an earlier date.

A weekly rule with BYMONTHDAY and no BYDAY stays on the master's
weekday, subject to the wrapped day stride above. With explicit
BYDAY and any negative BYSETPOS, a week needs a later eligible
week to finalize its positions. The observed search extends
182,616 civil days from the master. A date in that search can
finalize the prior week even when it is too late to be emitted.
When there is no later eligible week inside the search, Google
omits all selected positions from the last week. COUNT counts
starts that satisfy the rule. Google also includes the master
when it falls outside the rule's selectors, subject to exclusions.

A weekly rule with only positive positions remembers the preceding
selected week's number, without its year. Week numbers follow WKST
and begin with the week containing January 1. The rule skips another
selection with the same number until the number changes. A position
before DTSTART still occupies its week number.

Daily rules with BYMONTHDAY ignore INTERVAL, including EXRULE. A
daily rule with only BYMONTH retains its day step. On weekly rules,
BYMONTH tests the date of each candidate before BYSETPOS ranks the
week.

For series starting before October 15, 1582, Google uses Julian
calendar dates. Daily rules without BYMONTHDAY and weekly rules
advance on the continuous calendar. A rule can step from October 4
directly to October 15. Plain rules can consume a Julian leap-day
COUNT slot even when the API omits that date. Month or ordinal
selectors can project a selected Julian February 29 as March 1.

Daily BYMONTHDAY and monthly and yearly calendar selectors can
select written dates in October 5–14. Google applies COUNT and
positive or negative positions to the selected dates in written
order. October 8 then appears as October 18. Two candidates can
normalize to the same occurrence, and both can count. An
ordinal weekday that crosses the reform can resolve through the
Julian or Gregorian calendar. For example, the second and third
Mondays of October 1582 both resolve to October 18. The stored
master can retain a date in October 5–14.

Historical BYYEARDAY counts the written dates of the year,
including the October dates and Julian leap days. A numbered
week whose Gregorian start falls before the reform uses the
Julian week instead. Two week numbers can select the same dates
across the reform. With BYWEEKNO, ordinal weekdays are ranked in
the year. BYMONTH then filters selected dates by their month.

If the month list contains only 13 or -13, Google searches the
master's initial January. A negative BYSETPOS leaves the last eligible
week, month or year unexpanded, including positive positions listed
alongside it. When the list also contains ordinary months, Google
uses those months for expansion.

Google resolves local RDATE and EXDATE values with an explicit TZID
in the named zone. It uses the first instant in a fold and the
pre-transition offset in a gap. Date-level rule occurrences follow
the same transition policy in the series zone. For a submitted start carrying an
offset and a named event zone, Google first projects the instant
into the event zone, then chooses the first instant of the resulting
wall clock during a fold. A UTC RDATE still contributes its exact
instant. Google recognizes case-sensitive IANA names, legacy UTC
aliases, and signed fixed-offset TZIDs through ±18:00. UTC and GMT
are case-insensitive. Short names such as AET, CST and IST use their
Google-defined IANA zones. A timed master with an unknown zone is
rejected. Google drops unknown TZIDs from RDATE and EXDATE. A floating
value then uses the
series clock. Google can write that value with a trailing Z when
returning the master, even though the expanded instant followed the
original local clock. Use the submitted recurrence text or captured
instances when exact replay of these masters matters.

Google matches explicit DATE exclusions against civil dates and
timed exclusions against timed starts. EXRULE applies to the stream
that matches the master's type. Civil dates contribute midnight UTC
to the merged expansion. An all-day series then projects the result
to dates, so distinct instants on one UTC day can produce repeated
dates. A timezone on the all-day master does not set the recurrence
clock.

`splitRdatesAt` partitions Google RDATEs by resolved instant. It keeps
the original content-line parameters on both halves and puts an exact
cut match on the following series. `shiftRecurrenceLines` keeps quoted
parameters when it rewrites the dates, including fixed-offset TZIDs.

The RFC profile accepts case-insensitive ASCII property and rule
tokens. Unicode text is valid in content-line parameter values and
does not participate in token matching.

Select `dateutil` or `rrule-js` to replay those libraries' rule sets. Both
profiles subtract instances generated by `EXRULE` and apply weekly
`BYSETPOS` to a first week beginning on the `DTSTART` date. Both libraries
intersect ordinary and ordinal `BYDAY` selectors when ordinals apply, and
use calendar-year masks for `BYWEEKNO`. The RFC default rejects `EXRULE`
and uses the RFC weekday and week-number rules. The library profiles
accept `BYWEEKDAY` as an alias for `BYDAY` and reject unknown rule parts.
The rrule.js reader scans the input for DTSTART before unfolding physical
continuation lines. The first recognized start sets the clock, including
a legacy inline DTSTART. The subsequent property scan splits at
JavaScript whitespace and can read bare RRULE values. A DTSTART clock
split across physical lines can fail the initial scan. A colon-delimited declaration with a parameter such
as `VALUE=DATE` is skipped. A colonless DTSTART token can contribute
a default yearly rule. If a rule has no recognized start, the reader
samples the implicit clock. A set of explicit dates alone does not
need DTSTART.
If DTSTART supplies no timezone, the first leading `TZID` on an RDATE
can set the timezone for the whole rrule.js set. On a timed set, an
explicit `VALUE=DATE` RDATE or EXDATE names midnight rather than a whole
day. The same matching applies on DATE-start sets. Chrono returns dates
when the inclusions contain only ordinary DATE rules and bare RDATEs.
A timed RDATE, subdaily inclusion rule or clock selector keeps the
times throughout the set, including midnight. Numeric rrule.js rules
retain sparse matches up to the reference's calendar boundary, subject
to the caller's expansion budget.

The rrule.js profile also preserves the reference's distinction between
numeric and string entries in recurrence selectors. A malformed month
selector can match nothing, and a fractional position in a BYSETPOS list
can select the host's clock time at UTC midnight.

Textual dates use the rrule.js wire grammar and JavaScript date rollover.
For example, `20260230T090000Z` becomes March 2. This applies to DTSTART,
RDATE, EXDATE, and inclusive UNTIL cutoffs. Date-only cutoffs denote
midnight. The series uses the DTSTART timezone, or the first leading
RDATE TZID when DTSTART supplies none. EXDATE's own TZID does not
select a zone. Rule and explicit-date property headers end at the first
colon and split parameters at semicolons, including inside quotes.
For an unsupported rule parameter, the diagnostic preserves the
written spelling and order. The start recognizer can include a
semicolon in a DTSTART zone name. Unknown zone names can fail when
expansion first rezones a candidate or explicit date.

Pass `rruleJsUnfold: true` to select the rrule.js 2.8.1 physical-line
reader. It trims trailing whitespace on LF-separated lines and joins
lines that start with an ASCII space. Pass `rruleJsUnfold: false` to
split the input on JavaScript whitespace. Omit the option to detect
continuations automatically. Both modes read DTSTART from the original
text before selecting properties.

Pass `rruleJsCompatible: true` or `false` to replay the rrule.js
forced-set handling of external DTSTART. The rules use the textual
start or the library's implicit clock. With `true` and an external
`dtstart` supplied, the set includes the textual start as an explicit
date. That case requires a textual DTSTART. The initial text reader
uses `rruleJsUnfold` and defaults to split mode.

Pass `rruleJsForceSet: false` to replay the standalone rule when
the text has at most one RRULE and contains no RDATE, EXDATE or
EXRULE. Standalone replay keeps repeated starts in chronological
order and uses a default annual rule for DTSTART-only text.
An inline rule start wins, followed by the external start and
then the textual DTSTART. Standalone external timestamps without an
offset are parsed in `rruleJsHostTimeZone` (UTC by default), then
passed to the recurrence as instants at millisecond precision.
Standalone external `dateTime` also accepts the runtime's ISO-style
JavaScript Date spellings, including an omitted seconds field,
an offset without a colon and end-of-day `24:00`. A date-only string
in `dateTime` uses UTC.
`rruleJsForceSet: true` forces the set
reader, as does `rruleJsCompatible: true`. With both options
omitted, callers can continue to supply Chrono's external anchor.

The dateutil reader recognizes Python's physical line boundaries.
An ASCII space starts a continuation and is removed from it. Extra
whitespace inside the resulting logical line is preserved. Other
tokens are separated using Python's whitespace rules, which include
Unicode spaces and the information separators U+001C–001F.

Pass `dateutilUnfold: true` to reproduce the physical-line mode of
`rrulestr(..., unfold=True)` for the whole input. An ASCII-space
continuation joins the previous line, and each resulting logical line
is read as a property. Pass `dateutilUnfold: false` to reproduce
`unfold=False` and split the input on Python whitespace. Omit the option
to detect continuations automatically.

Pass `dateutilCompatible: true` to use dateutil's compatible set mode.
It selects whole-input unfolding and includes the explicitly supplied
DTSTART as an additional date. COUNT still applies to occurrences from
the rule. Explicit dates and rules share duplicate handling and
exclusions. A fractional DTSTART keeps its original precision as the
additional date, while the rule uses a whole-second clock.

The reader collects timezone spellings from uppercase `TZID=` markers
in the original input. If a fold splits a TZID parameter, the resulting
identifier resolves only if the input also supplies that spelling without
the fold.
A same-line space inside a date or rule value can therefore end the
token. A bare RRULE value can use the external `dtstart` option. When the input includes a textual DTSTART,
dateutil uses the last textual start in place of that external default.
Its integer rule parts and parenthesized weekday ordinals accept Unicode
decimal digits and single underscores between digits, following Python's
integer syntax. A weekday ordinal written before the weekday still uses
ASCII digits. The decimal repertoire follows the reference Python runtime's
Unicode 15.0 table. Text rule integers and weekday ordinals also follow
the pinned CPython 3.12 default conversion limit of 4,300 decimal
digits. Signs and underscores do not count toward the limit.
Clock selectors retain their exact decimal values
for phase checks and 64-bit CPython argument conversion. An out-of-range
calendar selector stays nonmatching and still counts as an explicit
selector. Easter and ordinal weekday offsets retain their exact values
for Python's mask indexing errors. A large positive INTERVAL that jumps beyond
Python's last year keeps its exact subdaily clock residue. A large
negative COUNT still suppresses rule starts. A zero INTERVAL repeats
the current period for a counted dateutil rule. If neither COUNT nor
UNTIL stops that repetition, expansion reports the lack of progress.
For negative yearly, monthly, weekly and daily intervals, the profile
follows dateutil's raw calendar-field steps. An underflow can fail
during expansion, and a negative monthly index can select a later
month through Python's slice rules.
Negative hourly, minutely and secondly intervals use the reference’s
clock carries and day checks. A filtered date can return the clock to
the same phase indefinitely. Chrono reports that cycle as an expansion
error, or as a limit error when the caller sets a generation budget.

When dateutil rules omit DTSTART, a naive rule starts at the process's
local clock and an aware rule uses the timezone of its UNTIL cutoff.
Chrono samples the clock once per set at second precision. The chosen
start stays with each rule, including exclusion rules, across successive
reads.

The dateutil 2.8.2 profile supports `BYEASTER` offsets, checks DTSTART
and UNTIL awareness when it reads a rule, and accepts only
`VALUE=DATE-TIME` as an `RDATE` parameter. It merges all inclusion streams
and all exclusion streams using dateutil's wall-time and cross-zone
comparisons. Separate TZID lookup keys keep separate identities even
when Chrono resolves them to the same regional offset data. An excluded
candidate still advances its stream. A comparison between timezone-aware
and naive values fails during expansion. An empty stream does not
force that comparison. A DATE-start series returns datetimes for
timed RDATEs, subdaily rules, and rules with a clock selector such as
BYHOUR. This includes midnight selected by the rule. Ordinary
DATE rules still return dates. Distinct surviving wall times can
project to the same UTC instant around a gap or
fold. Chrono returns those occurrences in UTC chronological order.

Use `dateutilBefore({ at })`, `dateutilAfter({ at })`,
`dateutilBetween({ after, before })`, or the lazy
`dateutilXAfter({ at, count })` to query in Python's traversal order.
All four accept `inclusive` and `generationLimit`. A standalone rule
preserves repeated values. Set inputs use dateutil's merge rules, and
`forceSet: true` applies those rules to a standalone input.

A bound is a `DateTime` for an aware query or a `NaiveDateTime` for a
floating query. Use `{ value, timeZone }` to supply the reference's TZID
identity with an offset-bearing `DateTime`. A candidate with the same
TZID compares by wall time. A candidate with a different identity
compares by instant. The object bound can also supply
`submillisecondMicros` for the remaining three digits of a Python
datetime's fractional second. Returned aware values are UTC and returned
floating values are `NaiveDateTime`, both at millisecond precision.

For example, a New York rule starting at 01:45 on March 8, 2026 and
repeating every 30 minutes visits 06:45Z, 06:15Z, and 06:45Z in that
order. `dateutilBefore` at 06:30Z returns `null` because the first
candidate ends the search. `dateutilBetween` checks the upper bound
on every candidate and checks the lower bound until the first match.

Use `dateutilAt({ index })`, `dateutilSlice({ start, stop, step })`,
or `dateutilCount()` to consume that same sequence by position.
Indexes are zero-based, and a negative index counts from the end.
Forward slices with a finite stop can return before exhausting the
rule. A negative index, a reverse slice, and a count consume the
whole sequence. Supply `generationLimit` to bound that work and
`forceSet: true` when the reference loaded a single rule as a set.
Counting includes repeated values from standalone rules and distinct
submillisecond candidates that project to the same millisecond.

Slicing follows uncached dateutil 2.8.2. A negative step uses
Python list slicing. With a forward step, a zero stop acts as an
omitted stop and a zero step acts as one. Forward slices reject
negative bounds. An out-of-range scalar index raises `RangeError`.

Set `dateutilCache: true` when reading a dateutil series to reproduce
`rrulestr(cache=True)` for the dateutil query methods. The first read
fills up to ten candidates. An expansion error in a batch surfaces
before that batch yields any results. After exhaustion, slicing uses
Python list rules: negative bounds work, zero stop gives an empty list,
and zero step raises. Completed-cache membership checks equality across
the entire cache, including when traversal moves backwards in UTC.
Use the same generation limit across calls to reuse the cache.
`dateutilReplace()` inherits the cache setting and starts with a fresh
cache. Pass `cache: false` to make the new rule uncached.

Use `dateutilToString()` on a standalone dateutil rule to
reproduce Python's `str(rrule)` output. It uses the original rule
selectors, including BYEASTER, and the parser's effective week start.
Python's text omits timezone and fractional fields on DTSTART and
UNTIL and can omit leading zeroes from the year. Preserve the source
representation for round trips that need these fields. A recurrence
set has no corresponding standalone rule string.

Use `await rule.dateutilReplace({ bymonthday: 6 })` to build a new
standalone dateutil rule. It returns a `Result<RecurrenceSeries>`.
Overrides use dateutil's keyword names, including `byweekday` for
BYDAY. Pass a scalar or a list for a selector, or `null` to clear
it. An empty list follows the Python constructor. For example,
`bymonthday: []` suppresses the implicit day, and an empty clock
selector at its own frequency fails construction. A new `dtstart`
uses the external start format
accepted by `Recurrence.fromICalendar`. The replacement recalculates
implicit selectors from the resulting start and frequency. Explicit
selectors retained from the original follow dateutil's constructor
normalization, including its subdaily clock filtering.
Use `dtstart: null` to recalculate the anchor at the current time.
An aware UNTIL supplies the timezone for that clock. Otherwise the
anchor uses the local clock, with `dateutilHost` available for replay.
Use `wkst: null` to restore the configured `dateutilWeekStart`, which
defaults to Monday.

Use `Recurrence.dateutilSet({ cache, generationLimit })` to compose
independently anchored standalone dateutil rules. Add inclusions with
`rrule(series)` and `rdate(value)`, and exclusions with `exrule(series)`
and `exdate(value)`. The date methods accept a `NaiveDateTime`, a
`DateTime`, or an object with a value, timezone identity and
submillisecond precision. Iteration follows dateutil set traversal
order. `count()` counts candidates after deduplication and exclusions,
before converting aware results to UTC at millisecond precision.
Use `at(index)` and `slice({ start, stop, step })` for positional reads.
Use `contains(at)`, `before(at, inclusive)`, `after(at, inclusive)`,
`between(after, before, inclusive)` or `xafter(at, { inclusive, count })`
for datetime bounds. `xafter()` starts traversing on the first pull.
These methods read the set's traversal order and use Python list
semantics for membership and slices once the cache is complete.

Caching is optional. A successful insertion invalidates the set cache for
new reads. An active cached set iterator finishes the traversal it started.
A cached standalone rule retains its own cache when inserted. Set reads
warm that cache and can surface its read-ahead errors before the set
emits any occurrence. Use the same generation limit for the set and
direct rule queries to share cached candidates.
Uncached iterators can see new explicit dates while their date stream
is still active. Finish an iteration before mutating the set when the
caller needs the same behavior in both cache modes.

Use `dateutilContains({ at })` for the uncached reference's
membership check. It compares each candidate for equality and
stops when a candidate is later than the bound. In the spring-gap
example, membership at 06:15Z is false because 06:45Z arrives first.
A bound for the same New York timezone identity at 02:15 compares
in wall time and matches.

For different timezone identities, datetime equality also requires
both offsets to be independent of the fold. Chrono checks this for
each recurrence candidate. Set `foldSensitive: true` on an aware
object bound when changing the reference bound's fold changes its
offset. The optional `timeZone` identifies a shared timezone
object by its written TZID lookup key, including POSIX TZIDs. Omit
it for a distinct object even when it has the same name. A plain
`DateTime` supplies a fixed offset. Membership compares any supplied
submillisecond digits. On a cross-zone comparison, dateutil can
report an invalid candidate offset before checking awareness.

If dateutil would encounter an out-of-range `BYEASTER` offset while looking
ahead past the last occurrence, Chrono reports it as a `RangeError` during
expansion. A large ordinal weekday can also exceed dateutil's weekday
mask when it rebuilds a monthly or yearly period. Chrono reports the
same expansion error if the iterator reaches that period. The dateutil
profile truncates fractional seconds in DTSTART
before expanding each rule. A fixed-offset DTSTART keeps its local date
and wall time for selectors. Numeric offsets on RDATE, EXDATE and UNTIL
are compared by instant. dateutil checks expanded clock selectors when it
builds the ordered time grid. This happens at read time for daily and
longer rules and during expansion for hourly and minutely rules.
For subdaily rules it also checks whether the interval can reach the
requested clock values. A selector can fail at construction, or fail
during expansion when no valid clock value is reachable. A dateutil
set consisting only of RDATE and EXDATE can omit DTSTART. In a set without rules, RDATE determines
whether results are floating or timezone-aware. Fractional RDATE and
EXDATE values are compared to microsecond precision. Returned starts
use Chrono's millisecond resolution, so distinct starts within the
same millisecond can appear as repeated values.

The dateutil profile uses Python's calendar years 0001–9999.
A valid local date can compare against a cutoff or exclusion even
when its UTC projection falls outside those years. Returning a
surviving start as UTC then raises `date value out of range`.
Its rule lookup can reach a sparse occurrence anywhere in that range,
subject to the caller's expansion budget. With a week start of Tuesday, Wednesday or Thursday, a year-one
`BYWEEKNO` mask raises if it needs the preceding year's week number.
An explicit `-1` supplies that number directly. A week started in 9999
can still select a date in year 10000, in which case expansion reports
the reference's out-of-range error. Selecting a valid position or
starting the next period outside the calendar can exhaust the series normally.

dateutil drops zero entries from `BYMONTHDAY` after deciding which date
selectors to take from DTSTART. A zero-only selector can therefore
leave every day eligible. On yearly rules with ordinal `BYDAY`, dateutil
uses `BYMONTH` to slice the weekday mask and reports an expansion error
when a month index cannot supply both range endpoints.

Use `dateutilWeekStart`, such as `Weekday.SUN`, to replay a process
that changed Python's `calendar.firstweekday()`. It supplies the
default for each RRULE and EXRULE that omits WKST. An explicit WKST
takes precedence, and the default is Monday.

Pass `dateutilTzids` to replay dateutil's `tzids` argument for
textual DTSTART and EXDATE properties. Supply a record keyed by the
written TZID or a callback, which may be async. A missing key or null
result leaves the text's own awareness in effect. The callback runs
in property order, including repeated names. Reuse a `DateutilZone`
object when two names should share datetime identity across folds.
`DateutilTzif.read`, `DateutilTzif.fixed` and `DateutilPosixZone.parse`
construct the corresponding reference timezone objects. External
DTSTART options use their ordinary timezone resolver. Query bounds
can pass the resolver-returned object as `timeZone` to select its
identity even when successive uses of a TZID resolve differently.

When reproducing a Python installation's timezone behavior, pass
`dateutilTzif` to `Recurrence.fromICalendar` with `profile: "dateutil"`.
The callback receives a named timezone and returns the bytes of the
TZif file used by the reference, including for private timezone names.
Returning `undefined` selects Chrono's default lookup. The dateutil
profile uses IANA tzdata 2026e TZif for bundled names and aliases.
Those names require their exact spelling. A case variant can still
resolve through dateutil's POSIX parser when its syntax permits it.
Names outside the bundled catalog use Chrono's timezone lookup. When an IANA zone cannot
be loaded, the dateutil profile also recognizes
fixed names such as `UTC+3`, `GMT+0230` and `EST5`.
Literal uppercase UTC and GMT use east-positive signs. Other prefixes
use POSIX west-positive signs. Returning `null` leaves an iCalendar
TZID unresolved, so a value without its own offset is floating.
An explicit external `timeZone` must resolve.
The dateutil fallback also recognizes recurring POSIX daylight-saving
names with supported transition fields. It uses dateutil's
first Sunday in April and last Sunday in October defaults when the
transition fields are omitted. Explicit `Mmonth.week.weekday`, `Jn`,
and zero-based day fields set the annual transition dates.
The importer also recognizes the deprecated numeric transition
lists accepted by dateutil 2.8.2, including their optional daylight
offset adjustment. As in dateutil, weekday-based transitions apply
the clock and standard-offset adjustment before selecting the weekday.
Month rules also retain dateutil's week-zero and weekday-wrap behavior,
and Julian rules accept its endpoint days `J0` and `J366`.
The fallback follows dateutil's treatment of nonalphabetic abbreviations,
empty transition suffixes and month zero as January. A fixed timezone
can carry a parsed transition suffix without applying its transitions.
A recurring zone with an out-of-range transition month raises when
its transition is needed.
When a recurring zone defines an offset at or beyond ±24 hours, the
reference can still expand dates in the other season. An invalid active
offset raises when a cross-zone comparison or UTC output requires it.
An active daylight shift at or beyond ±24 hours can raise when rule
iteration begins, even with `COUNT=0`.

The dateutil profile checks property parameters and reads DTSTART
and EXDATE during the initial scan. It then validates RRULEs,
reads RDATE values, and validates EXRULEs in that order.
This determines which error is returned when several parts are invalid.
Repeated rule parts keep the last successfully parsed value.
An invalid frequency or week start raises immediately, even if a
later value would replace it. The rule constructor checks DTSTART
and UNTIL timezone awareness before checking the final BYSETPOS range.
The reader splits property headers at literal colons and semicolons,
including those inside quotes. A token without a colon is parsed as
a bare rule. An empty date value raises at the phase that reads it.

The dateutil profile accepts year-first dates with hyphen or slash
separators, or with a pair of dots, in DTSTART, RDATE, EXDATE and
UNTIL. Calendar and clock ranges follow dateutil's diagnostics for
these forms. Bare unknown timezone abbreviations on a timed value
leave it floating. Pass `dateutilHost` to replay abbreviations from a
specific Python process. Supply `time.tzname`, seconds east of UTC
for standard and daylight time, and a `localTime(epochSeconds)`
callback returning `{ isDaylight, offsetSeconds }` from that process's
`time.localtime` data. For example, an abbreviation matching the
host's standard name can select the second side of a fold on RDATE.
An implicit floating start also uses the supplied process clock. When a timezone abbreviation precedes a numeric
offset directly, dateutil reverses the written offset's sign. A dot
between the abbreviation and the offset keeps the written sign.
The `AM` and `PM` tokens adjust the clock, including common dotted
spellings such as `P.M.`. The same Unicode 15.0 decimal digits are
accepted in date values, offsets and numeric rule parts.
The dateutil reader also accepts English month names and abbreviations
in dates such as `30-MAR-2026`, `30MAR`, and `01MAR2026`. A clock
can follow the month directly, as in `30MAR09:30`. After a packed
clock, a second clock can replace some or all of its fields.
For example, `MAR012026T9H` keeps the minutes and seconds from
01:20:26 and changes the hour to 09. The same rules apply to
numeric dates such as `20260331T012026T9H`. A numeric UTC
offset carries through the update unless a later offset replaces it.
Multiple updates apply in written order. A dot can separate a clock
unit or meridiem from the next T. Minutes and seconds can appear
before the first hour, as in `20260331T15M.T45S.T09+0330`,
which resolves to 05:45:45 UTC. A second dot can split a decimal
into two numeric tokens. Those digits can fill a missing calendar
field or supply a clock, depending on the preceding fields. Numeric
calendar fields can appear before the first hour or after a clock
when calendar fields are still missing. Numeric dates such as `03/01/2026`
default to month first when the year is last. A leading value from
13 through 31 selects day first. These rules also apply to short dates
such as `01/02/26` and six-digit dates such as `760102`.
Two-digit years resolve from 50 years before through 49 years after
the parser year. Set `dateutilParserYear` to replay the year in which
the reference parser was initialized. Without it, Chrono uses the
current local year, taking the supplied `dateutilHost` clock into
account when present. Partial dates such as `2025-02` and `03/01`
inherit missing calendar fields from the process-local date. An
inherited day clips to the last day of the resolved month. A
written day must exist in the resolved month. The parser-year
option affects two-digit years only. The profile also reads ordinal
suffixes in separator-delimited dates such as `3rd-MAR-2026`.
A weekday name moves an inherited day forward to the same or next
named weekday. An explicit day takes precedence over the weekday.
A clock such as `09:15` or `9.5H` can omit the date entirely.
Dateutil fills the calendar date from the reference process before
applying a numeric offset or timezone. The calendar fields written
in the input affect whether an hour next to AM or PM is read as a
single numeric hour or a compact clock. A six-digit token with a
fraction, such as `091530.5`, is a clock with fractional seconds.
Dateutil compares explicit additions and exclusions at microsecond
precision before projecting occurrence starts to milliseconds. The
profile follows the CPython 3.12 list sort used by the reference.
That ordering can affect exclusions when wall and instant comparisons
disagree around a spring gap.
A rule checks UNTIL before discarding a candidate earlier than DTSTART.
Across a spring gap, that candidate can project after the UTC cutoff
even when a later wall time would project before it.
For letter-unit clocks, an adjacent run of letters forms one token.
For example, `09H30MZ` has a floating time, while `09H30M.Z`
has a UTC time.
Colon clocks accept padded numeric fields such as `009:005:003`.
Fractional minutes supply whole seconds unless a separate seconds
field is present. These conversions follow Python's default
28-significant-digit Decimal context.

dateutil 2.8.2 reads the TZif 32-bit block and uses the last standard
offset at the final transition and after it. The transition date
depends on the timezone and the source file.

The rrule.js 2.8.1 profile treats `BYEASTER` as a single numeric offset
and uses yearly periods whenever it is present. A comma-separated list
produces no rule occurrences. The profile compares `UNTIL` to the encoded
wall fields before resolving rule candidates in the series timezone.
In its subdaily rules, a carry across filtered hours or minutes preserves
the lower clock fields from that carry. The first subdaily period retains
the external DTSTART's millisecond remainder. Before 1970, rrule.js
uses a signed remainder. It can move the clock to the previous second
and change the weekday used to advance a midnight weekly rule. Later
subdaily periods use whole seconds. Both library
profiles read a bare `UNTIL` date as midnight. For a timed series they
also read bare `RDATE` and `EXDATE` values at midnight. In rrule.js, each
`BYSETPOS` pick consumes a count slot even when picks coincide. The profile
returns the deduplicated result of an rrule.js rule set. Added rrule.js
date-time fields use the same timezone conversion as rule candidates.
The profile defaults to the results from a reference process running
with `TZ=UTC`. Pass `rruleJsHostTimeZone` to reproduce a different
reference process timezone. The engine subtracts the target zone's
offset relative to the host at the encoded instant. A series with no
TZID or with a literal `TZID=UTC` keeps its encoded instants. Target
and host offsets come from the runtime's `Intl` timezone data, even
when Chrono has a custom timezone loader. Replay depends on the
reference and Chrono runtimes using matching timezone data.
rrule.js checks each included instant against an EXRULE window that
extends one millisecond on either side. The lookup stops at the first
projected exclusion beyond that window. An earlier projected instant
can therefore survive when the rule visits it later, as it does
across a forward offset change or with unordered clock selectors.
The rrule.js profile keeps those results in full and incremental
reads. Explicit EXDATE values still exclude matching instants.

Use `rruleJsBetween` to replay rrule.js 2.8.1 with instant bounds.
Set `rruleJsForceSet: false` to match `rrulestr` when it returns a
standalone rule. Set it to `true` when the reference forces an
`RRuleSet`.

```ts
const series = (await Recurrence.fromICalendar([
  "DTSTART:20260101T000000Z",
  "RRULE:FREQ=DAILY;BYHOUR=18,9;COUNT=6",
], { profile: "rrule-js", rruleJsForceSet: false })).exp();
const starts = series.rruleJsBetween({
  after: DateTime.fromRfc3339("2026-01-01T00:00:00Z").exp(),
  before: DateTime.fromRfc3339("2026-01-01T12:00:00Z").exp(),
  inclusive: true,
});
```

The example returns no starts. The standalone rule visits 18:00
first and stops before visiting 09:00. Standalone results retain
traversal order and multiplicity. Sets use inclusive `EXRULE` scans
over the supplied bounds, skip excluded or already seen instants,
and sort the resulting starts. Sets coalesce rules that serialize
to the same original options. Reordering the options can make the
rules distinct. The regular date cursor remains chronological.

Use `rruleJsBefore({ at, inclusive })` or
`rruleJsAfter({ at, inclusive })` for a single reference neighbor.
Both return a UTC start or `null`. The bound is exclusive by default.
A standalone rule's `after()` accepts its first visited candidate
at or past the eligible bound. Its `before()` returns the last
visited candidate accepted before the scan stops. With the 18:00,
09:00 selector order above, an inclusive query at midnight returns
18:00 from `rruleJsAfter`.

A set evaluates each explicit-date or rule stream independently and
chooses the earliest returned `after()` or the latest returned
`before()`. For these two methods, rrule.js checks each unseen
candidate against EXRULE in a one-millisecond window on either side.
That scan order matters when timezone projection or unordered
selectors put an EXRULE candidate past the window before a later
candidate projects back into it.

Pass `preserveInvalidDates: true` to a bounded query to retain rrule.js
2.8.1's Invalid Date results from timezone projection at calendar
extremes. `rruleJsBetween()` represents each retained slot with
`null`. The neighbor methods return `"Invalid Date"` for that
result and `null` when the reference finds no occurrence. Sets
apply their reference-specific deduplication and exclusion rules
before selecting or sorting these slots.

Use `rruleJsAll({ generationLimit })` to replay the entire library
sequence. Standalone rules retain traversal order and repeated
values. Sets use the same one-millisecond EXRULE windows as
`before()` and `after()`, skip repeated instants and sort their
results. For the standalone example above, the first two entries
are 18:00Z and 09:00Z. Each reference Invalid Date is represented
by a `null` entry and keeps its place in the sequence. An invalid
TZID still raises when rrule.js attempts to use it. Large or
nonadvancing rules can exhaust the optional generation budget.

A rule with `INTERVAL=0` contributes zero instances in rrule.js.
Explicit dates and other rules in the set still participate.
Negative hourly, minutely and secondly intervals use the rrule.js
backward clock and the original calendar-year mask. Expanded clock
fields can bring a backward period's candidate back to or past DTSTART.
Chrono stops a repeating filtered clock when the reference would cycle.
Negative calendar intervals use the raw year, month, or day step.
A monthly counter that leaves the year's month table contributes no
further starts. Earlier periods can still contribute when an expanded
clock carries back into the query window.
A written integer interval uses JavaScript's numeric value, including
signed infinity when the decimal overflows. An unsafe positive
interval can still produce occurrences in its first period.
An overflowing month-day selector matches no month day. Overflowing
clock values retain their positions in the reference grid. A negative
daily, weekly or subdaily interval can apply BYYEARDAY to an index
before the start of the retained year mask.
Expanding second 60 carries into the next minute in rrule.js. If
two clock selectors carry to the same instant, both consume COUNT
before the set collapses duplicate starts. Repeated selector values
also consume separate positions. Daily and longer rules build their
clock grids in the order of the input lists. BYSETPOS addresses that
grid, then the chosen positions are visited chronologically.
A negative position that reaches before the first day selects the
first day and retains its position in that day's clock grid. An invalid
positive position can affect the order in which valid picks are visited.
An initially filtered subdaily period has an empty clock grid. A
negative position can then use the reference host's clock at UTC
midnight.
In textual recurrence dates rrule.js interprets years 0000–0099 as
1900–1999. Chrono applies that encoding to text read by the rrule.js
profile, including UNTIL and date-list values. For a literal external
start before 0100, the rrule.js profile follows the reference's
literal counter and encoded output dates. COUNT follows the reference's
iteration order, and Chrono serves the resulting starts chronologically.
Some ancient results with a named timezone are Invalid Date in the
reference and have no corresponding occurrence instant.

The rrule.js calendar counter stops after year 9999. A weekly
period in 9999 or a clock carry from that year can still produce
a year-10000 occurrence. A query can reach it with a date built
using `NaiveDate.fromYmd1Exp`.

RFC expansion preserves the instant of a UTC `RDATE` and resolves a
`TZID` value in its named zone.

For a default-profile YEARLY rule with BYWEEKNO, the numbered week
can contribute dates from December or January of an adjacent calendar
year. INTERVAL advances from DTSTART's week-numbering year, using the
rule's WKST. BYSETPOS ranks the entire filtered set for each selected
year before COUNT or UNTIL is applied.

The default reader accepts a single `BEGIN:STANDARD` or
`BEGIN:DAYLIGHT` block. It uses `TZOFFSETFROM` to convert local onsets
to UTC and applies the rule's `UNTIL` in UTC. The declared `DTSTART`
is also an explicit onset. An equivalent rule occurrence and that
onset share the same instant.

To import a calendar-defined zone, pass one complete `VTIMEZONE`
component to `readVTimeZone`, then supply its result to the default
recurrence reader.

```ts
const through = NaiveDate.parse("2027-12-31");
const zone = (await readVTimeZone(vtimezoneLines, { through })).exp();
const series = await Recurrence.fromICalendar(recurrenceLines, {
  rfcTimeZone: (tzid) => tzid === zone.fullname ? zone : undefined,
});
```

The component must have at least one onset by the inclusive UTC
`through` date. Choose a horizon that covers the dates you plan to
expand. The optional generation limit applies to each observance.
The reader combines onsets in UTC order and uses each onset's
`TZOFFSETTO` until the next onset. The reader validates each declared
timezone property type and every `TZNAME`, including observances
after `through`. When an observance supplies multiple names, the
transition uses the first one.
`LAST-MODIFIED` and `TZURL` are optional and each can occur once.
`LAST-MODIFIED` uses UTC DATE-TIME. `TZURL` is validated as an
absolute URI and remains metadata for the local definition.
A definition with the RFC 7808 `TZUNTIL` property must cover the full
requested UTC date. `TZUNTIL` is an exclusive UTC instant, so a midnight
cutoff permits compiling through the preceding day. When the cutoff
falls within a UTC day, use an earlier `through` date for complete
coverage. When `DTSTART`, `RDATE`, or `EXDATE` uses a compiled
table, recurrence queries beyond its `through` date throw `RangeError`.
Projection via `TimezoneRegion.toTz()` also rejects an instant after coverage.
Compile through a later date and bind again to extend coverage. [RFC 7808 §7.1](https://www.rfc-editor.org/rfc/rfc7808#section-7.1)

The callback is scoped to this recurrence read and applies to
`DTSTART`, `RDATE` and `EXDATE`, including PERIOD endpoints. A returned
calendar definition takes precedence over IANA for that identifier.
Returning `undefined` uses normal IANA lookup. The callback receives
the unquoted identifier with RFC 6868 caret escapes decoded. External
DTSTART identifiers normalize CRLF and CR to LF. Each identifier uses
its returned transitions even when definitions share a region name.

For an already persisted timed master, pass
`googleStartMode: "stored"` with an offset-bearing `dtstart`. Chrono
keeps the supplied instant, including its milliseconds and its side
of a fold, and uses the event timezone for later recurrence slots.
The default `"submitted"` mode applies Google’s submission rules.

A timed incremental consumer can use `googleTimedGenerator()`.
After a cursor advance that reaches DTSTART, `startDateExcluded`
also reports removal by EXRULE. A DATE RDATE on the same instant
can still appear in the generated starts as a replacement.

To replay a bounded Google `events.instances` query, pass the original
timestamp strings and the master duration:

```ts
const series = (await Recurrence.fromICalendar(master.recurrence, {
  profile: "google",
  dtstart: master.start,
  dtend: master.end,
})).exp();
const starts = await series.googleCalendarInstances({
  timeMin: "2026-03-03T09:25:00Z",
  timeMax: "2026-03-03T09:30:00Z",
  duration: Duration.Time.mins(20),
});
```

The captured endpoint ignores fractional seconds in query bounds. Equal
or reversed whole-second bounds return an empty result. A positive-duration
occurrence qualifies when its start precedes `timeMax` and its end follows
`timeMin`. A zero-duration timed occurrence, including a moved one, qualifies
from `timeMin` inclusive to `timeMax` exclusive.
Timed events use elapsed duration. For an all-day series, use a duration
in civil days and supply the calendar's timezone as `calendarTimeZone`.
Google selects a regular all-day instance from local midnight. If the
next expanded date begins before the nominal end of 24 elapsed hours
per day, Google uses the nominal end. Otherwise it uses the earlier of
the ending local midnight and the nominal end. The neighbor comes from
the recurrence set before moved and cancelled instance edits.
For a moved all-day instance, Google uses the recorded start and end
as civil midnights. The result keeps all-day starts as dates. [Google Calendar timezone contract](https://developers.google.com/workspace/calendar/api/concepts/events-calendars#calendar_time_zone)

Supply `edits` to replay moved or cancelled Google occurrences.
Moved occurrences use Google's `originalStartTime`, `start` and
`end` fields. For a cancellation, pass `originalStartTime` and
`status: "cancelled"`. Timed slots match by instant when the timezone
label changes. The query returns live occurrences with regular starts
first and moved starts appended in original-slot order. Distinct
occurrences can share a displayed start.

```ts
const starts = await series.googleCalendarInstances({
  timeMin: "2026-03-02T00:00:00Z",
  timeMax: "2026-03-07T00:00:00Z",
  duration: Duration.Time.mins(20),
  edits: [
    {
      originalStartTime: { dateTime: "2026-03-03T09:17:00Z" },
      start: { dateTime: "2026-03-05T12:17:00Z" },
      end: { dateTime: "2026-03-05T12:52:00Z" },
    },
    {
      originalStartTime: { dateTime: "2026-03-05T09:17:00Z" },
      status: "cancelled",
    },
  ],
});
```

For a Microsoft Graph master, use `Recurrence.fromGraph(master)`.
Chrono maps Windows timezone names to the default IANA zones in Unicode
CLDR 47. Supply `resolveTimeZone` to override a mapping or resolve an
additional identifier. A callback that returns `undefined` uses the
built-in lookup for that name.
Graph expands timed starts at minute precision. When the range timezone
is blank, the reader uses the original timezone if it maps the stored
start to the range's civil start date. The Outlook profile applies the
captured Windows behavior for Egypt, Fiji, Israel, Line Islands,
Mexico, Morocco, Newfoundland, São Paulo, and legacy Samoa.
Windows Israel uses the 2004 daylight saving pattern for historical
starts from 1900 through 2003. The captured changes occur at 01:00
local time on April's first Wednesday and September's fourth Wednesday.
The captured future Windows Israel rule starts daylight saving on
March's fourth Friday and ends it on October's last Sunday from the
first observed difference in 2041. Windows West Bank uses March's and
October's last Saturdays from 2035. These rules are applied only by
the Outlook profile.
For starts before 2004, the Outlook profile applies the captured
Russian Windows season to Altai, Tomsk, N. Central Asia, North Asia,
North Asia East, Kaliningrad, Russian, Ekaterinburg, Omsk, Yakutsk,
Vladivostok and Magadan. It advances the clock from 02:00 to 03:00
on March's last Sunday and sets it back from 03:00 to 02:00 on
October's last Sunday. The historical table starts in the master's
year. The earliest captured starts are in 1899.
The Outlook profile uses the captured fixed offsets for Windows
Afghanistan, India, Myanmar, Nepal, Sri Lanka and Line Islands. A fixed
Windows range still uses its captured offset when the stored original
start zone is an IANA identifier. RFC recurrences keep their IANA
timezone history.
Windows China, Taipei and Singapore use UTC+08 in the captured
history, and Windows Korea uses UTC+09. Windows North Korea uses
UTC+09 before the IANA half-hour changes in 2015 and 2018. Series
starting before 2014 use UTC+09:30 for occurrence dates from
August 10 through December 31, 2013. For some 2014 starts Graph
stores identical master fields for different original clocks and
expands them differently. By default, `fromGraph` uses the stored
clock. If you have an unmodified timed occurrence on the range's
first civil day, pass its start as an RFC 3339 instant. For a Graph
response with `start.timeZone: "UTC"`, append `Z` if the returned
`start.dateTime` omits the offset.

```ts
const series = await Recurrence.fromGraph(master, {
  resolveTimeZone,
  rangeStartOccurrence: "2014-08-10T14:30:00Z",
});
```

The supplied occurrence's wall time in the recurrence zone becomes
the recurrence clock. Use a regular occurrence whose clock Graph
did not shift across a timezone gap. Graph instances are still
needed when the master loses information and no suitable occurrence
on the range start date is available.

To replay a Graph `calendarView` query,
pass the exact query instants and the series duration. Use the
original ISO date-time strings to preserve Graph's 100-nanosecond
precision. Longer fractions round to the nearest tick and an
omitted offset means UTC. Equal bounds after rounding select
occurrences active at that instant, including either endpoint.
Existing `DateTime` inputs use their stored precision.

```ts
const series = (await Recurrence.fromGraph(master)).exp();
const occurrences = series.graphCalendarView({
  start: DateTime.fromRfc3339("2012-01-09T00:00:00Z").exp(),
  end: DateTime.fromRfc3339("2012-01-10T00:00:00Z").exp(),
  duration: Duration.Time.mins(10),
});
```

A timed master with UTC wire endpoints can supply `end` in the
same Graph format as `start`. When the stored clocks can be
recovered, Chrono truncates each endpoint independently to a whole
minute and takes the difference in the recurrence timezone. Graph
uses this clock even when the original endpoint timezones differ.
Each occurrence resolves its end separately. Across a transition, its elapsed duration can
therefore change. If the resolved end precedes the start, Graph
treats the occurrence as zero-length.

Supply an explicit duration to select by elapsed time, for an
all-day series, or when the stored endpoints cannot be used.
`rangeStartOccurrence` also requires an explicit duration for
`calendarView`.

For an all-day series, supply the duration in civil days, such as
`Duration.Time.dys(2)`. The method tests overlap between midnight
boundaries in the recurrence zone and returns the displayed starts at
UTC midnight. Duplicate starts retain their multiplicity. When a
master has a blank range timezone and Graph stored the original
timezone as UTC, supply the original zone via `allDayTimeZone` if
you retained it. São Paulo and Samoa captures have identical stored
master fields and different query results.

Graph includes an occurrence ending at the query start and excludes
one starting at the query end. Timed legacy Samoa masters with a blank
range zone select occurrences on a clock distinct from the displayed
clock after the January 1, 2012 transition. For example, the captured
09:00 daily master returns `2012-01-08T19:00:00Z` in the above
window. Use `occurrences({ through })` for expansion by the displayed
UTC date.

When the regular all-day slots share captured local selection clocks,
supply `allDaySelection: { startTime, endTime }` with `NaiveTime` values.
For example, the midnight-gap series captured in Cuba and the Azores
use `NaiveTime.fromHms({ hrs: 1 })` at the slot date and
`NaiveTime.midnight()` at the ending date. Set `duration` to the
civil-day difference between those dates. The method resolves the
clocks in the recurrence zone for each slot and keeps the displayed
dates. Use `replacement.selection` for individual slots with
different selection times.

Pass recorded occurrence edits when the series has moved or cancelled
instances. Each edit identifies the original slot. Omit the replacement
to cancel that slot. Use `NaiveDate` for all-day slots and replacement
dates. Use an absolute `DateTime` for timed slots and replacements.

```ts
const instant = (value: string) => DateTime.fromRfc3339(value).exp();
const starts = series.graphCalendarView({
  start: instant("2026-03-08T00:00:00Z"),
  end: instant("2026-03-18T00:00:00Z"),
  duration: Duration.Time.mins(20),
  edits: [
    {
      originalSlot: instant("2026-03-09T09:17:00Z"),
      replacement: {
        start: instant("2026-03-11T12:17:00Z"),
        end: instant("2026-03-11T12:52:00Z"),
      },
    },
    { originalSlot: instant("2026-03-16T09:17:00Z") },
  ],
});
```

The original slot is the civil rule date before projection for all-day
series, or the query clock instant before the edit for timed series.
Graph can display two all-day slots on the same date, as it does for
January 1 and January 2 in historical Samoa. When Graph uses different
instants for selection and display, pass the selection instants as
`replacement.selection`. For an all-day slot whose display dates are
unchanged, use the original slot with those same dates as the
replacement. Midnight-gap writes in Cuba and the Azores can return
the same stored master and displayed dates as aligned writes while
selecting the first occurrence an hour later. Keep the original slot
and selection bounds from the edit or from capture evidence when Graph
omits them.

Captured Windows Southeast Asia, Tokyo and West Pacific series use
UTC+07, UTC+09 and UTC+10 respectively. Windows Ulaanbaatar keeps
UTC+08 before its 2015–16 daylight saving period and follows the IANA
transitions during that period. The RFC profile keeps the earlier
IANA transitions in all four regions.

The captured Windows zones for Eucla, Darwin and Brisbane use
fixed offsets of UTC+08:45, UTC+09:30 and UTC+10:00. Windows Perth
keeps UTC+08 before its 2006–09 daylight-saving trial and follows IANA
during that trial. Before 2004, Tasmania, Sydney, Adelaide and Lord
Howe follow recurring Windows seasons. The early rules end daylight
saving on the last Sunday in March and restart it in October.
Tasmania restarts on October's first Sunday and the other three use
its last Sunday. Lord Howe uses UTC+10:30 in winter and UTC+11 in
summer throughout the captured early years, including during IANA's
one-hour daylight-saving trial. In 2006, Graph ended daylight saving
on March 26 in Tasmania, Sydney and Adelaide. Lord Howe follows its
April IANA boundary. The profile extends recurring transitions for
these four zones beyond the served timezone table. The latest
captures check both boundaries in 2075.
Graph's early Windows Eastern, Central, Mountain, Pacific and Atlantic
rules use the first Sunday in April and the last Sunday in October,
including during the historical wartime and emergency daylight periods.
Chrono reuses aligned IANA transitions from 1987 for those zones.
For the captured Canada Central and US Mountain Windows zones, Graph
keeps UTC−06 and UTC−07 year-round.

The early Windows London, Berlin, Paris, Warsaw, Budapest and Bucharest
rules use the last Sundays in March and October, with changes at
01:00 UTC. Chrono reuses aligned IANA transitions from 1996 for the
first five and from 1997 for Bucharest, where IANA still has midnight
changes in 1996. The captures extend from 1899 to 2076. The RFC
profile retains IANA's original history.

The early Windows Kyiv and Chișinău rules use UTC+02 in winter and
UTC+03 in summer, with changes on the same March and October Sundays.
Kyiv changes at 01:00 UTC and Chișinău at 00:00 UTC. Chrono reuses
aligned IANA transitions from 1997. The captured Azores rule uses
UTC−01 and UTC+00, with changes at 01:00 UTC and aligned IANA history
from 1996. Windows Greenwich uses UTC throughout the Iceland captures.

The early Windows New Zealand and Chatham Islands seasons end
daylight saving on March's third Sunday and restart it on October's
first Sunday. Auckland changes at 03:00 in autumn and 02:00 in
spring. Chatham’s corresponding local times are 03:45 and 02:45.
These rules use the current standard offsets of UTC+12 and UTC+12:45
in the historical captures back to 1899. The profile uses the aligned
IANA transitions from 1990 onward.
The African Graph captures use fixed UTC+03, UTC+02 and UTC+01
for Windows East Africa, South Africa and West Central Africa.
Windows Libya stays at UTC+02 before the aligned 2012–13 clock
changes. Before 1995, Windows Windhoek moves from UTC+02 to
UTC+01 on the first Sunday in April and back on the first Sunday
in September. The clocks change at 02:00 local time. The profile
uses the aligned IANA transitions from 1995 through the end of the
seasonal rule in 2017.

Windows Baghdad keeps UTC+03 before its April 3, 2003 change
and returns to UTC+03 on October 3. Later seasons use the aligned
IANA history. Captured Windows Dhaka, Karachi and Mauritius use
their modern standard offsets before the 2009 Dhaka and 2008
Karachi and Mauritius daylight saving seasons. Early Windows
Minsk uses the last Sundays in March and October, with changes
at 01:00 UTC and aligned IANA rules from 1996. Windows Cape Verde,
Riyadh and Dubai retain fixed UTC−01, UTC+03 and UTC+04 respectively.

In the captured Pacific and South American history, Windows
Venezuela keeps UTC−04 before its 2007 change, Bougainville
keeps UTC+10 before its 2014 change, and Norfolk keeps UTC+11:30
before its 2015 change. Norfolk follows the aligned recurring
seasons beyond the served timezone table. Early Windows Tonga
stores the UTC+13 clock and projects occurrences one hour later
from 02:00 on November's first Sunday to the first Friday in
January. That projection ends at the start of 2015. Its 2016–17
season follows IANA. Windows La Paz, Cayenne, Marquesas and
Guadalcanal use fixed UTC−04, UTC−03, UTC−09:30 and UTC+11.

Earlier Windows Baku and Yerevan use UTC+04 in winter and UTC+05
in summer, changing on the last Sundays in March and October.
Baku's spring transition is at 04:00 local time and Yerevan's is
at 02:00 local time. Both use their aligned IANA history from 1997.
Windows Tbilisi maintains UTC+04 in the captured history. Seven
further Russian zones use the captured pre-2004 recurring seasons
with their own standard offsets. Windows Hovd's early seasons
change at 02:00 on the last Saturdays in March and September, with
aligned IANA history from 2007.

Windows Anchorage, Adak and Tijuana use the first Sunday in April
and the last Sunday in October before 1987. Indianapolis stays on
UTC−05 before its 2006 season. These zones extend their aligned
later rules through the sampled 2075 dates. Windows Guatemala,
Honolulu and the fixed Dateline and UTC-offset names keep their
captured fixed offsets. Windows Cancún follows the central Mexico
season through the temporary 1997–98 IANA Eastern Time rules and
adopts the 2015 UTC−05 reform.

Graph may retain an IANA name on the master and return a Windows
name on the range. Chrono applies the Windows stored-clock repair
when both names resolve to the same IANA region. Captures confirm
this path for São Paulo, Cuiabá, Volgograd and Pyongyang. The
Windows range name still determines its historical recurrence rules.

Windows Grand Turk uses the modern March–November season in
earlier years, switches to permanent UTC−04 in 2015, and resumes
seasonal offsets in 2018. Timed masters with an omitted recurrence
timezone during the UTC−04 period keep a fixed recurrence clock.
For masters after the November 2017 fold boundary, Graph advances
that fixed clock by an hour when expanding. Named-range masters
captured with the displaced near-midnight clock use the named zone
and its 2018 transitions.

Early Windows Havana and Port-au-Prince use April–October
seasons with midnight spring gaps. The October fold starts at
01:00 in Havana and midnight in Port-au-Prince. Later captures
retain the Cuban 2004–06 extended daylight season and the
Haitian years without DST. Earlier Windows Beirut uses the last
Sundays in March and October with midnight changes, as it does
from the aligned 1999 IANA season. Early Windows Easter Island
uses UTC−06 in winter and UTC−05 in summer, changing at 22:00
on the second Saturdays in March and October before 2008.
All four match the sampled later seasons through 2075.

Windows Egypt stayed on daylight time
through the 2010 and 2014 Ramadan suspensions in IANA's Cairo data.
Windows Fiji uses UTC+12 in sampled dates before the November 2009
DST restart. Sampled Windows Mexico City and Mazatlán series use the
regular April–October daylight saving season before 1996 and in 2001.
Early Windows Newfoundland and Saint Pierre use the first Sunday in
April and last Sunday in October. Newfoundland changes at 00:01 local
time, so its autumn fold returns to 23:01 on the previous date.
Saint Pierre changes at 02:00. The profile uses aligned IANA
transitions from 1987 and keeps Newfoundland's captured one-hour
daylight saving shift in 1988. Both zones extend past the served table.
In the sampled South American Graph history, Windows Bogotá uses
UTC−05 and Buenos Aires uses UTC−03 before the 2007–09 daylight
saving seasons. Some early-2008 Buenos Aires masters store a
clock one hour away from the expanded start. Windows Montevideo
uses the first Sunday in October and second Sunday in March before
2006, changing at 02:00 local time. Windows Cuiabá uses a first
Tuesday in November to first Thursday in January season before
the IANA-aligned rules in 2004. It shares the late-2018 stored-clock
adjustment with São Paulo. Bahia and Tocantins use a one-hour
projection shift in the captured early October–January seasons,
then follow their IANA-aligned one-off daylight saving seasons.

Windows São Paulo repeats a legacy daylight saving schedule in the
sampled years before 2004. For masters with a range starting November 5
through December 31, 2018, Graph expands timed starts an hour away from
their stored UTC clock. A named range zone shifts the clock forward and
a blank range shifts it back.
Graph also moves timed recurrence starts from 00:00 through 00:59
local on January 1, 2019 one hour later. The Outlook reader applies
that adjustment when the effective range uses the Windows São Paulo
identifier.
For some late-2025 Morocco masters,
the stored UTC start and the first expanded start differ. The reader
recovers the recurrence clock from the stored master and its range
metadata. Morocco offsets match sampled live windows through July 2035.

Some historical all-day masters return a blank range zone and say
their original zone is UTC. Supply `allDayTimeZone` when the original
all-day zone is available from the source event.

The profile reader covers recurrence properties and the supplied Graph
query edits. Importers process full calendar components and reconcile
detached instances with their original slots.

## Bind errors and query errors

The `fromICalendar()` and `fromGraph()` results report errors detected
during binding. A successful binding captures the recurrence lines and
start fields supplied for that call. Timezone resolver callbacks run
during binding and can provide calendar-specific definitions.

`occurrences()` and cursor reads can throw
`RecurrenceExpansionLimitError` when a budget is exhausted or
`RangeError` when a compiled timezone does not cover the window.
Provider queries can additionally reproduce validation deferred by the
provider, such as a dateutil comparison between aware and naive values
or rrule.js encountering an unresolved TZID during rezoning.

## Low-level and existing callers

`ICalendar.Raw` exposes one editable rule and its date lines. When
editing provider wire data, retain other lines from the source. For
example, `shiftRecurrenceLines()` updates explicit dates while carrying
other properties through the edit. The legacy raw reader reports an
unknown TZID via the timezone fallback channel and uses UTC. Use
`Recurrence.fromICalendar()` for RFC binding that returns an error for
an unknown TZID.

`RRule.parse()` and `RRule.parseWithRecurrence()` expose rule-level parsing.
`RRule.toReadableDisplay()` provides summaries such as “Monthly on the 2nd
Tuesday, 6 times.”

`Recurrence.parse()`, `generate()`, `generateToDate()`, and
`generateGoogleEvents()` are the existing low-level expansion APIs.
Use the profile reader for new imports and fixture replay. Its named
profiles include the provider-specific validation and expansion rules.
