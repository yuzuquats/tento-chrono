# Recurrence benchmark results

Measured November 19, 2026 on yuzuquats with Deno 2.9.8. The baseline filter is from `baca772`. The optimized filter is from `a115343`.

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

Run `deno bench --lock=bench/deno.lock --frozen --allow-env=CHRONO_YEARS bench/recurrence_bench.ts`
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

Run `deno test --lock=bench/deno.lock --frozen bench/monthly_permutations.ts` for the reference
matrix and `deno bench --lock=bench/deno.lock --frozen bench/monthly_permutations.ts` for
the timed cases. The paired measurements and penultimate profile are in
`fleet/evidence/tento-chrono-recurrence-perf/`.

## Allocation churn falls, and retaining date objects remains a separate cost

Measure 100-year, cache-disabled expansions in fresh Deno processes on
yuzuquats. Each run warms up for 16 expansions, then performs 24 measured
expansions. The table reports the median of three process runs. The
allocation estimate sums heap growth between successive V8 collections
and divides by 24. Allocation sampling independently matched that estimate
on the high-churn daily rrule case (550 MiB sampled, 549 MiB estimated from
GC traces). For this V8 version, summing the trace's `allocated` field
instead gives 775 MiB on that case.

| Workload returning day numbers | Chrono before, MiB allocated | Chrono after, MiB allocated | rrule 2.8.1, MiB allocated |
| --- | ---: | ---: | ---: |
| Last Friday | 11.89 | 3.91 | 18.65 |
| Last day of month | 24.57 | 13.42 | 19.05 |
| Lunch with closure | 16.63 | 8.59 | 21.54 |
| Second-to-last weekday | 21.62 | 18.89 | 19.01 |
| All days using the monthly filter | 14.91 | 13.57 | 30.47 |
| Unfiltered daily | 28.27 | 28.31 | 549.22 |

The last-Friday path allocates 67% less after the change. Its observed peak
still sits near 16 MiB above the warmed baseline for both revisions.
The penultimate-weekday sample attributes about 42% of allocation to the
general positional-filter frame, map insertion and sorting. In the daily
rrule sample, daily-set construction and array slicing account for about
94%.

The dense monthly workload emits 36,478 dates. Peak is the largest observed
heap increase above the warmed baseline over the 24 expansions, using
pre-collection and post-expansion observations. Retained heap is the
difference between forced-GC readings with the final result held and
released.

| Result format | Chrono peak, MiB | rrule peak, MiB | Chrono retained, MiB | rrule retained, MiB |
| --- | ---: | ---: | ---: | ---: |
| Native date objects | 54.35 | 70.37 | 5.58 | 3.73 |
| Day numbers | 20.07 | 69.41 | 0.29 | 0.28 |
| Chrono iterator consumed without accumulating dates | 16.10 | — | ~0 | — |

Chrono's raw result has 50% more retained heap than the native JS Date
array. When the caller only iterates the dates, the probe returns a count
and retains no measurable date results. After release, all measured
groups returned to within 46 KiB of their warmed baselines.

The probe is `bench/recurrence_memory.ts`. It accepts a workload,
engine, and result format and prints GC trace data to stdout and phase
markers to stderr. The run driver, parser, JSON summary, and V8 allocation
profiles can be regenerated with [the suite runner](README.md).
These figures measure the V8 object heap.

## First and second positions from either end, November 19 follow-up

A single position of `1`, `2`, `-1`, or `-2` keeps at most two distinct
candidate dates. The selector preserves the final tuple for a tied date,
even when the inner filter yields dates out of order. The following paired
runs use the filter from `a115343` as the baseline and the same 100-year
windows, Deno version and CPU as the earlier monthly measurements.

| Workload | Chrono before | Chrono with bounded selection | rrule 2.8.1 |
| --- | ---: | ---: | ---: |
| First Friday | 1.160 ms | 0.578 ms | 2.945 ms |
| Second-to-last weekday | 3.785 ms | 1.280 ms | 3.126 ms |
| First and last weekend day, every other month | 0.965 ms | 0.937 ms | 1.974 ms |

The second-to-last weekday allocates 8.67 MiB per expansion, down from
18.89 MiB. The observed heap peak is near 16.1 MiB above the warmed
baseline in both revisions. It retains about 10 KiB with the final numeric
result held. The new CPU profile spends 36% of samples in bounded
selection and 28% constructing the weekday candidates.

Timed outputs match in all eleven article and monthly benchmark groups.
The differential test checks 960 monthly combinations. The added ranking
coverage checks 2,892 combinations of position and candidate order,
including missing positions, invalid dates and duplicate candidates.
The type check, 732 standard tests and two opt-in reference tests passed.
Seven standard tests were ignored.

From this directory, use
`python3 run.py /tmp/chrono-edge-ranks --baseline a115343`
to reproduce the comparison, with `--cpu 8` for the recorded Linux affinity.
