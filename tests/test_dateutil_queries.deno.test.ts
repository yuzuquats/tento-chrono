import { assertEquals } from "@std/assert";
import {
  DateTime,
  type DateutilQueryBound,
  NaiveDateTime,
  Recurrence,
} from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

const [fixtureDir, loader] = Deno.args;
if (loader !== "bundled") installTimezoneLoader();

type Bound = string | {
  value: string;
  timeZone?: string;
  foldSensitive?: boolean;
};
interface CommonInput {
  lines: string[];
  forceSet?: boolean;
  compatible?: boolean;
}

type Input =
  & CommonInput
  & ({
    after: Bound;
    before: Bound;
    inclusive: boolean;
    count: number | null;
  } | { contains: Bound[] });

type Outcome = boolean | string | string[] | null | { error: string };

function queryBound(bound: Bound): DateutilQueryBound {
  const text = typeof bound === "string" ? bound : bound.value;
  const fraction = /\.(\d+)/.exec(text)?.[1]?.padEnd(6, "0");
  const clock = text.replace(/\.(\d{3})\d+/, ".$1");
  const value = /(?:Z|[+-]\d\d:\d\d)$/.test(clock)
    ? DateTime.fromRfc3339(clock).exp()
    : NaiveDateTime.parse(clock)!;
  return {
    value,
    submillisecondMicros: fraction == null
      ? undefined
      : Number(fraction.slice(3)),
    timeZone: typeof bound === "string" ? undefined : bound.timeZone,
    foldSensitive: typeof bound === "string" ? undefined : bound.foldSensitive,
  };
}

function outcome(query: () => Outcome): Outcome {
  try {
    return query();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { error: error.message };
  }
}

Fixtures.load<Input, Record<string, Outcome> | Outcome[]>(
  fixtureDir ?? new URL("./fixtures/", import.meta.url).pathname,
  "dateutil-queries",
).run(
  async ({ lines, forceSet, compatible, ...input }) => {
    const series = (await Recurrence.fromICalendar(lines, {
      profile: "dateutil",
      dateutilCompatible: compatible,
    })).exp();
    if ("contains" in input) {
      return input.contains.map((at) =>
        outcome(() =>
          series.dateutilContains({
            at: queryBound(at),
            forceSet,
            generationLimit: 50_000,
          })
        )
      );
    }
    const { after, before, inclusive, count } = input;
    const lo = queryBound(after);
    const hi = queryBound(before);
    const options = { inclusive, forceSet, generationLimit: 50_000 };
    return {
      before: outcome(() =>
        series.dateutilBefore({ ...options, at: hi })?.toString() ?? null
      ),
      after: outcome(() =>
        series.dateutilAfter({ ...options, at: lo })?.toString() ?? null
      ),
      between: outcome(() =>
        series.dateutilBetween({ ...options, after: lo, before: hi }).map(
          String,
        )
      ),
      xafter: outcome(() =>
        Array.from(
          series.dateutilXAfter({
            ...options,
            at: lo,
            count: count ?? undefined,
          }),
          String,
        )
      ),
    };
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);
