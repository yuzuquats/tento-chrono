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

## Benchmark results and reproduction

The article comparison, monthly permutation matrix and V8 memory profile
are recorded in [bench/RESULTS.md](../../bench/RESULTS.md). The benchmark
commands and suite runner are documented in [bench/README.md](../../bench/README.md).

The follow-up uses bounded ranking for a single position one or two dates
from either end. Its benchmarks use `a115343` as the baseline. The new
timing, allocation and candidate-order checks are in the
[follow-up results](../../bench/RESULTS.md#first-and-second-positions-from-either-end-november-19-follow-up).

The full filter pass compares every public date filter and its important
variants through the dedicated filter suite. The
[results and replay command](../../bench/RESULTS.md#pass-over-all-date-filters)
record the measured workloads, compatibility checks, and implementation changes.

## Select monthly weekday positions before constructing dates

A private capability on the built-in weekday filter selects positions
within a month by repeating the first week's weekday offsets and clipping
the partial final week. Only the selected days are materialized as dates.
The positional filter shares its index and ordering rules between the
shortcut and the general iterator. Composed filters and restrictions,
including the lunch closure, still select from the full candidate stream.

Against `15fd8f9`, the six monthly position workloads ran 1.73 to 4.69
times as fast on yuzuquats. Across three benchmark rounds, last day
went from 1.522 to 0.325 ms, second-to-last weekday from 1.224 to 0.333 ms,
and last Friday from 0.629 to 0.364 ms per 100-year expansion. The
benchmarks retain the original rules and check ordered results against
rrule.js 2.8.1. The regression tests compare against the iterator for all
128 weekday masks and verify that a closure on March 29 still selects
March 22. Raw runs and check logs are in
`fleet/evidence/tento-chrono-recurrence-perf/monthly-position-shortcut/`.
