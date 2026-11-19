/**
 * deno run --lock=bench/deno.lock --frozen --allow-env=CHRONO_YEARS --v8-flags=--expose-gc,--trace-gc-nvp bench/recurrence_memory.ts last-friday chrono normalized
 * Add --inspect=127.0.0.1:0 --allow-sys=inspector and pass "sample" for allocation stacks or "cpu" for a CPU profile.
 */
import { Session } from "node:inspector/promises";
import { naivedate } from "../chrono/mod.ts";
import { monthly } from "./monthly_permutations.ts";
import { workloads as article } from "./recurrence_bench.ts";

const start = naivedate(2024, 1, 31);
const end = naivedate(2123, 12, 15);
const workloads = {
  "last-friday": monthly(start, end, 1, "friday", [-1]),
  "last-day": monthly(start, end, 1, "all-days", [-1]),
  "penultimate-weekday": monthly(start, end, 1, "weekdays", [-2]),
  "all-days": monthly(start, end, 1, "all-days", undefined),
  summer: article.summer,
  quarter: article.quarter,
  lunch: article.lunch,
  daily: article.daily,
};

const [name, engine, format, profileMode] = Deno.args;
if (
  !Object.hasOwn(workloads, name) ||
  (engine !== "chrono" && engine !== "rrule") ||
  (format !== "normalized" && format !== "raw" && format !== "stream") ||
  (profileMode != null && profileMode !== "sample" && profileMode !== "cpu")
) {
  throw new Error(
    "Expected a workload, chrono or rrule, normalized/raw/stream, and optional sample/cpu",
  );
}
const workload = workloads[name as keyof typeof workloads];
let run: () => readonly unknown[] | number;
switch (format) {
  case "raw":
    if (!("raw" in workload)) {
      throw new Error("Raw results are available for monthly workloads");
    }
    run = workload.raw[engine];
    break;
  case "stream":
    if (engine !== "chrono" || !("dates" in workload)) {
      throw new Error("Streaming is available for chrono monthly workloads");
    }
    run = () => {
      let count = 0;
      for (const _date of workload.dates()) count++;
      return count;
    };
    break;
  default:
    run = workload[engine];
}
const gc = (globalThis as { gc?: () => void }).gc;
if (gc == null) throw new Error("Enable --v8-flags=--expose-gc");
const heapUsed = () => Deno.memoryUsage().heapUsed;
const warmups = profileMode === "cpu" ? 100 : 16;
const iterations = 24;
for (let i = 0; i < warmups; i++) run();

if (profileMode === "cpu") {
  const session = new Session();
  session.connect();
  try {
    await session.post("Profiler.enable");
    await session.post("Profiler.start");
    const end = performance.now() + 2400;
    while (performance.now() < end) run();
    const { profile } = await session.post("Profiler.stop");
    console.log(JSON.stringify(profile));
  } finally {
    session.disconnect();
  }
} else if (profileMode === "sample") {
  const session = new Session();
  session.connect();
  try {
    await session.post("HeapProfiler.startSampling", {
      samplingInterval: name === "daily" ? 262144 : 8192,
      includeObjectsCollectedByMajorGC: true,
      includeObjectsCollectedByMinorGC: true,
    });
    for (let i = 0; i < iterations; i++) run();
    const { profile } = await session.post("HeapProfiler.stopSampling");
    console.log(JSON.stringify(profile));
  } finally {
    session.disconnect();
  }
} else {
  gc();
  gc();
  const baseline = heapUsed();
  console.error(
    JSON.stringify({
      phase: "start",
      name,
      engine,
      format,
      iterations,
      baseline,
    }),
  );

  let observed = baseline;
  for (let i = 1; i < iterations; i++) {
    run();
    observed = Math.max(observed, heapUsed());
  }
  let result: readonly unknown[] | number = run();
  observed = Math.max(observed, heapUsed());

  gc();
  gc();
  const held = heapUsed();
  console.error(
    JSON.stringify({
      phase: "end",
      observed,
      held,
      dates: typeof result === "number" ? result : result.length,
    }),
  );
  result = 0;
  gc();
  gc();
  console.error(JSON.stringify({ phase: "released", heapUsed: heapUsed() }));
}
