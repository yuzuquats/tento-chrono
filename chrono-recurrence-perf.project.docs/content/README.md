# Date filters can spend less time on candidates they discard

The deployed recurrence article shows first summer Fridays, the last Tuesday
or Thursday of a quarter, and a Friday lunch that moves earlier when the
office closes. Compare ordered day counts on the article's dates and a
100-year expansion against rrule 2.8.1. The comparison uses fresh expansions
and implements the lunch fallback by ranking eligible Fridays per month.

The profile of the article's pinned commit, `baca772`, attributes about 40%
of quarter samples to weekday generation and weekday lookup, with another
29% in positional selection. Monthly weekday selection constructs a date
and checks its weekday for every day of the month. The positional filter
builds a map and sorts its keys to choose the last date.

Calculate the first weekday of a month once and advance it using day
arithmetic before constructing matching dates. For a single last position,
keep the latest valid candidate as the inner filter runs. Unordered
candidates and duplicates still need to pick the same date and unit that
the general positional filter selects.

Check the article's examples and run the chrono suite. Compare fresh
before-and-after benchmark runs on yuzuquats using the same dates, runtime
and reference rules. Record results and link the benchmark and profiles.

## Monthly weekday and last-position filters cut quarter-end time by 58%

The 100-year benchmark starts in 2024 and turns each result into a day count.
Before timing, it asserts that each library produces the same ordered dates.
Both libraries reuse prepared rules. The rrule comparison uses a yearly rule
for summer, a monthly interval of three for quarter-end, and an rrule set of
eligible Fridays followed by selection per month for the lunch fallback.
Its occurrence caching is disabled.

| Workload | Dates | Chrono before | Chrono after | rrule 2.8.1 |
| --- | ---: | ---: | ---: | ---: |
| First summer Fridays | 300 | 0.273 ms | 0.274 ms | 0.839 ms |
| Quarter-end reviews | 400 | 1.190 ms | 0.501 ms | 1.900 ms |
| Lunch with closure | 1,200 | 4.100 ms | 2.330 ms | 7.483 ms |
| Daily | 36,524 | 5.816 ms | 5.713 ms | 72.554 ms |

Times are medians of three run means per revision with alternating run order
on logical CPU 8 of yuzuquats (i7-12700K, Deno 2.9.8, V8 15.0.245.2). The
baseline uses the filter module from `baca772`, redirected by a Deno import
map. The right column uses the rrule values measured alongside the patched
chrono runs. The lunch case is 43% lower than the original chrono run. The
summer and daily controls were within 2%; the daily case sets an explicit
output budget above the requested number of days. The measurements cover
date-only expansion and result materialization.

Run `deno bench --no-lock --allow-env=CHRONO_YEARS benchmarks/recurrence_bench.ts`
from the chrono checkout. Set `CHRONO_YEARS=1` for the article's windows, with
lunch ending March 31. That run verified date equality and measured chrono at
8.6 µs for summer, 15.3 µs for quarter-end, and 10.6 µs for lunch.

The type check and full Deno suite passed (96 doc tests, 634 tests, 7 ignored).
The new tests exercise leap-year weekday order and last-position precedence
for unsorted candidates, invalid dates and duplicates. Baseline CPU profiles
and paired run receipts are in `fleet/evidence/tento-chrono-recurrence-perf/`
on the workspace hosts. After this change, filter composition and the
article's closure-date string conversion are the largest remaining named
costs in the lunch profile.

## Monthly permutations expose the remaining positional-selection cost

The standard suite now checks all 128 weekday masks across 120 months
against UTC Date, including non-leap century years, leap centuries and
dates on both sides of the Unix epoch. A second test checks all 120 orders
of a candidate list containing an invalid date and a tied latest date,
plus empty and invalid-only input.

The opt-in rrule comparison covers 960 monthly rule combinations across
six start dates, four intervals, five weekday sets and eight positional
selections. Chrono matches the ordered, distinct reference dates in every
case. The separate February 1900 fixture records a difference in raw
output: positions 2 and -3 both name February 9, which rrule 2.8.1 emits
twice. Chrono emits it once.

| Workload | Chrono before | Chrono after | rrule 2.8.1 |
| --- | ---: | ---: | ---: |
| Last Friday, monthly | 2.270 ms | 0.635 ms | 2.932 ms |
| Last Tuesday or Thursday, every three months | 0.858 ms | 0.277 ms | 0.998 ms |
| Last day, monthly | 4.661 ms | 1.658 ms | 2.998 ms |
| First Friday, monthly | 2.123 ms | 1.114 ms | 2.885 ms |
| First and last weekend day, every other month | 1.349 ms | 0.871 ms | 1.815 ms |
| Second-to-last weekday, monthly | 4.157 ms | 3.454 ms | 2.959 ms |
| All days, monthly | 2.991 ms | 2.560 ms | 16.600 ms |

The timed runs use the same host, runtime, core and three-pair method as
the article benchmark. Each timing expands January 31, 2024 through
December 15, 2123. All seven cases compare the raw ordered outputs before
timing. The second-to-last weekday is the one case where rrule was faster.
Its V8 profile attributed 59% of samples to the general positional filter,
which builds a map and sorts all monthly candidates. This follow-up added
coverage and measurements. Production source is the implementation in
`a115343`.

Run `deno test --no-lock benchmarks/monthly_permutations.ts` for the reference
matrix and `deno bench --no-lock benchmarks/monthly_permutations.ts` for
the timed cases. The paired measurements and penultimate profile are in
`fleet/evidence/tento-chrono-recurrence-perf/`.
