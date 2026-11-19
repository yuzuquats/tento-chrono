# Recurrence benchmarks

The suite compares the article's date filters with rrule 2.8.1, expands
monthly rule permutations, and measures allocation, observed peak heap,
and retained results in V8. [Results](RESULTS.md) describes the recorded
runs. [Recorded readings](recorded-results.json) contains their timings
and memory measurements in machine-readable form.

## Reproduce the runs

Use Deno 2.9.8, Python 3.10 or later, and a Git checkout containing
`baca772ccd8ea1ea012dc55ae3db2eb1743a0e2f`. That commit is the article's
baseline. From this directory, choose a new output directory.

```sh
python3 run.py /tmp/chrono-recurrence-run
```

The runner uses the pinned `deno.lock`, alternates baseline and current
timing order over three rounds, and writes `summary.json` with per-run
timings, median memory readings, and CPU and allocation sites. It captures
timings, GC traces, and `.cpuprofile` and `.heapprofile` files. To isolate
a run, pass `--suite timing`, `--suite memory`, or `--suite profiles`.
Use `--rounds 1` for a quick pass or `--cpu 8` for CPU affinity on Linux.
Pass `--deno /path/to/deno` if Deno is outside PATH.

The before/after runs use the same checkout. For the baseline, the runner
extracts the date-filter module from Git and maps that import to the
extracted file. The rest of the implementation is loaded from the
checkout. Choose another filter revision with `--baseline <git-ref>`.

## Run individual commands

Run these from the repository root. `CHRONO_YEARS=1` uses the article's
short windows. The default expands 100 years.

```sh
deno bench --lock=bench/deno.lock --frozen --allow-env=CHRONO_YEARS bench/recurrence_bench.ts
deno test --lock=bench/deno.lock --frozen bench/monthly_permutations.ts
deno bench --lock=bench/deno.lock --frozen bench/monthly_permutations.ts
```

To capture one memory probe, keep V8's GC trace and the phase markers in
separate files. The memory suite does this for all measured workloads.

```sh
deno run --lock=bench/deno.lock --frozen --allow-env=CHRONO_YEARS \
  --v8-flags=--expose-gc,--trace-gc-nvp bench/recurrence_memory.ts \
  last-friday chrono normalized > chrono-gc.log 2> chrono-phases.jsonl
```
