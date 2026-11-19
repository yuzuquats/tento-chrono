#!/usr/bin/env python3
"""Run the chrono recurrence benchmarks and summarize their captures."""
import argparse
from collections import Counter, defaultdict
import json
import os
from pathlib import Path
import platform
import re
from statistics import median
import subprocess

ROOT = Path(__file__).resolve().parent.parent
FILTER = ROOT / "chrono/units/year-month-day-filter.ts"
ARTICLE_BASELINE = "baca772ccd8ea1ea012dc55ae3db2eb1743a0e2f"
MEMORY_CASES = [
    ("last-friday", "normalized"),
    ("last-day", "normalized"),
    ("lunch", "normalized"),
    ("penultimate-weekday", "normalized"),
    ("all-days", "normalized"),
    ("all-days", "raw"),
    ("all-days", "stream"),
    ("daily", "normalized"),
]


def git(*arguments):
    return subprocess.check_output(["git", "-C", ROOT, *arguments], text=True).strip()


def baseline_map(revision, output):
    source = git("show", f"{revision}:{FILTER.relative_to(ROOT)}")
    # Preserve the module's relative imports when staging Git's blob in output.
    source = re.sub(
        r'(?<=from ")\.{1,2}/[^"]+',
        lambda match: (FILTER.parent / match[0]).resolve().as_uri(),
        source,
    )
    baseline = output / "baseline-filter.ts"
    baseline.write_text(source + "\n")
    imports = json.loads((ROOT / "deno.json").read_text())["imports"]
    imports[FILTER.as_uri()] = baseline.as_uri()
    path = output / "baseline-import-map.json"
    path.write_text(json.dumps({"imports": imports}, indent=2) + "\n")
    return f"--import-map={path}"


def variants(round_number):
    return ("before", "after") if round_number % 2 else ("after", "before")


def medians(samples):
    return {
        key: median(row[key] for row in samples)
        for key in samples[0]
    }


def memory_summary(trace, phases):
    start, held, released = map(json.loads, phases.read_text().splitlines())
    if [row["phase"] for row in (start, held, released)] != ["start", "end", "released"]:
        raise ValueError(f"Unexpected phase markers in {phases}")
    rows = [json.loads(row) for row in re.findall(r"GC: (\{[^\n]*\})", trace.read_text())]
    _, baseline, held_gc, _, _, _ = [i for i, row in enumerate(rows) if row["reason"] == "testing"]
    window = rows[baseline + 1:held_gc + 1]
    allocated = sum(
        max(0, current["start_object_size"] - previous["end_object_size"])
        for previous, current in zip(rows[baseline:held_gc], window)
    )
    peak = max(held["observed"], *(row["start_object_size"] for row in window))
    return {
        "dates": held["dates"],
        "allocatedBytesPerExpansion": allocated / start["iterations"],
        "observedPeakBytesAboveBaseline": peak - start["baseline"],
        "retainedResultBytes": held["held"] - released["heapUsed"],
        "releasedBytesAboveBaseline": released["heapUsed"] - start["baseline"],
    }


def sites(profile_path):
    profile = json.loads(profile_path.read_text())
    sizes = Counter()
    pending = [profile["head"]]
    while pending:
        node = pending.pop()
        frame = node["callFrame"]
        name = frame["functionName"] or "(anonymous)"
        file = frame["url"].rsplit("/", 1)[-1]
        sizes[name, file, frame["lineNumber"] + 1] += node["selfSize"]
        pending.extend(node["children"])
    total = sizes.total()
    return [
        {"function": name, "file": file, "line": line, "fraction": size / total}
        for (name, file, line), size in sizes.most_common(10)
        if size
    ]


def cpu_sites(profile_path):
    profile = json.loads(profile_path.read_text())
    nodes = {node["id"]: node["callFrame"] for node in profile["nodes"]}
    counts = Counter()
    for sample in profile["samples"]:
        frame = nodes[sample]
        name = frame["functionName"] or "(anonymous)"
        file = frame["url"].rsplit("/", 1)[-1]
        counts[name, file, frame["lineNumber"] + 1] += 1
    total = counts.total()
    return [
        {"function": name, "file": file, "line": line, "fraction": count / total}
        for (name, file, line), count in counts.most_common(10)
    ]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="new directory for captures and summary.json")
    parser.add_argument("--suite", choices=("all", "timing", "memory", "profiles"), default="all")
    parser.add_argument("--rounds", type=int, default=3)
    parser.add_argument("--baseline", default=ARTICLE_BASELINE, help="Git revision containing the baseline filter")
    parser.add_argument("--deno", default="deno", help="Deno executable")
    parser.add_argument("--cpu", type=int, help="pin Deno to a logical CPU with Linux taskset")
    args = parser.parse_args()
    if args.rounds < 1:
        parser.error("--rounds must be positive")

    output = args.output.resolve()
    revision = git("rev-parse", "--verify", f"{args.baseline}^{{commit}}")
    version = subprocess.check_output([args.deno, "--version"], text=True).splitlines()
    output.mkdir(parents=True, exist_ok=False)
    original = baseline_map(revision, output)
    command = ([] if args.cpu is None else ["taskset", "-c", str(args.cpu)]) + [args.deno]
    common = ["--lock=bench/deno.lock", "--frozen", "--allow-env=CHRONO_YEARS"]
    env = dict(os.environ, NO_COLOR="1", CHRONO_YEARS="100")

    def capture(arguments, path, stderr=None, years="100"):
        print(path.name, flush=True)
        with path.open("xb") as out:
            subprocess.run(
                command + arguments, cwd=ROOT, env=dict(env, CHRONO_YEARS=years),
                stdout=out, stderr=stderr, check=True,
            )

    report = {
        "revision": git("rev-parse", "HEAD"), "baselineFilterRevision": revision,
        "deno": version, "platform": platform.platform(), "logicalCpu": args.cpu,
        "rounds": args.rounds,
    }
    if args.suite in ("all", "timing"):
        for suite, entry in (("article", "recurrence_bench.ts"), ("monthly", "monthly_permutations.ts")):
            timings = defaultdict(list)
            for round_number in range(1, args.rounds + 1):
                for variant in variants(round_number):
                    path = output / f"{suite}-{variant}-{round_number}.json"
                    flags = [original] if variant == "before" else []
                    capture(["bench", *common, *flags, "--json", f"bench/{entry}"], path)
                    for bench in json.loads(path.read_text())["benches"]:
                        timings[bench["group"], variant, bench["name"]].append(
                            bench["results"][0]["ok"]["avg"]
                        )
            report[suite] = [
                {"group": group, "variant": variant, "engine": engine,
                 "meanNanosecondsByRun": runs, "medianNanoseconds": median(runs)}
                for (group, variant, engine), runs in sorted(timings.items())
            ]
        capture(
            ["bench", *common, "bench/recurrence_bench.ts"], output / "article-dates.txt", years="1",
        )

    if args.suite in ("all", "memory"):
        memory = defaultdict(list)
        for name, result_format in MEMORY_CASES:
            for round_number in range(1, args.rounds + 1):
                for variant in (*variants(round_number), "rrule"):
                    if result_format == "stream" and variant == "rrule":
                        continue
                    engine = "rrule" if variant == "rrule" else "chrono"
                    flags = [original] if variant == "before" else []
                    stem = f"{name}-{result_format}-{variant}-{round_number}"
                    trace = output / f"{stem}.gc.log"
                    phases = output / f"{stem}.jsonl"
                    with phases.open("xb") as stderr:
                        capture(
                            ["run", "--quiet", *common, *flags, "--v8-flags=--expose-gc,--trace-gc-nvp",
                             "bench/recurrence_memory.ts", name, engine, result_format],
                            trace, stderr,
                        )
                    memory[name, result_format, variant].append(memory_summary(trace, phases))
        report["memory"] = [
            {"workload": name, "format": result_format, "variant": variant, **medians(samples)}
            for (name, result_format, variant), samples in sorted(memory.items())
        ]

    if args.suite in ("all", "profiles"):
        profiles = []
        for name in ("last-friday", "penultimate-weekday", "all-days", "daily"):
            for variant in ("before", "after", "rrule"):
                if name == "daily" and variant == "before":
                    continue
                engine = "rrule" if variant == "rrule" else "chrono"
                flags = [original] if variant == "before" else []
                path = output / f"{name}-{variant}.heapprofile"
                capture(
                    ["run", *common, *flags, "--allow-sys=inspector", "--inspect=127.0.0.1:0",
                     "--v8-flags=--expose-gc", "bench/recurrence_memory.ts", name, engine,
                     "normalized", "sample"], path,
                )
                profiles.append({"workload": name, "variant": variant, "allocationSites": sites(path)})
        report["allocationProfiles"] = profiles

        profiles = []
        for name, variant in (
            ("summer", "before"), ("quarter", "before"), ("lunch", "before"),
            ("daily", "before"), ("quarter", "after"), ("lunch", "after"),
            ("penultimate-weekday", "after"),
        ):
            flags = [original] if variant == "before" else []
            path = output / f"{name}-{variant}.cpuprofile"
            capture(
                ["run", *common, *flags, "--allow-sys=inspector", "--inspect=127.0.0.1:0",
                 "--v8-flags=--expose-gc", "bench/recurrence_memory.ts", name, "chrono",
                 "normalized", "cpu"], path,
            )
            profiles.append({"workload": name, "variant": variant, "cpuSites": cpu_sites(path)})
        report["cpuProfiles"] = profiles

    (output / "summary.json").write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
