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
