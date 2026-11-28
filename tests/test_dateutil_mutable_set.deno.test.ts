import { assert, assertEquals, assertThrows } from "@std/assert";
import { DateTime, type DateutilQueryBound, type DateutilSlice, DateutilTzif, NaiveDateTime, Recurrence, type RecurrenceSeries } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

type Bound = string | { value: string; timeZone: string };
type Step =
  | { action: "rrule" | "exrule"; lines: string[]; cache?: boolean }
  | { action: "memberSlice"; start: number }
  | { action: "at"; index: number }
  | ({ action: "slice" } & DateutilSlice)
  | { action: "contains" | "before" | "after" | "xafter"; at: Bound; inclusive?: boolean; count?: number }
  | { action: "between"; after: Bound; before: Bound; inclusive?: boolean }
  | { action: "rdate" | "exdate"; value: string }
  | { action: "count" | "all" }
  | { action: "prefix"; length: number };
type Outcome = number | string | boolean | string[] | null | { error: string };

function queryBound(bound: Bound): DateutilQueryBound {
  const input = typeof bound === "string" ? bound : bound.value;
  const micros = /\.(\d+)/.exec(input)?.[1]?.padEnd(6, "0");
  const clock = input.replace(/\.(\d{3})\d+/, ".$1");
  const value = /(?:Z|[+-]\d{2}:\d{2})$/.test(clock)
    ? DateTime.fromRfc3339(clock).exp()
    : NaiveDateTime.parse(clock)!;
  return { value, timeZone: typeof bound === "string" ? undefined : bound.timeZone,
    submillisecondMicros: micros == null ? undefined : Number(micros.slice(3)) };
}

const [fixtureDir, loader] = Deno.args;
if (loader === "served") installTimezoneLoader();
Fixtures.load<{ cache: boolean; steps: Step[] }, Outcome[]>(
  fixtureDir ?? new URL("./fixtures", import.meta.url).pathname,
  "dateutil-mutable-set",
).run(
  async ({ cache, steps }) => {
    const generationLimit = 50_000;
    const set = Recurrence.dateutilSet({ cache, generationLimit });
    let lastRule: RecurrenceSeries | undefined;
    const result: Outcome[] = [];
    for (const step of steps) {
      try {
        switch (step.action) {
          case "rrule":
          case "exrule": {
            lastRule = (await Recurrence.fromICalendar(step.lines, {
              profile: "dateutil",
              dateutilCache: step.cache,
            })).exp();
            set[step.action](lastRule);
            break;
          }
          case "rdate":
          case "exdate": {
            set[step.action](queryBound(step.value));
            break;
          }
          case "memberSlice":
            assert(lastRule != null);
            result.push(lastRule.dateutilSlice({ start: step.start, generationLimit }).map(String));
            break;
          case "at":
            result.push(String(set.at(step.index)));
            break;
          case "slice":
            result.push(set.slice(step).map(String));
            break;
          case "contains":
            result.push(set.contains(queryBound(step.at)));
            break;
          case "before":
          case "after": {
            const match = set[step.action](queryBound(step.at), step.inclusive);
            result.push(match == null ? null : String(match));
            break;
          }
          case "xafter":
            result.push([...set.xafter(queryBound(step.at), step)].map(String));
            break;
          case "between":
            result.push(set.between(queryBound(step.after), queryBound(step.before), step.inclusive).map(String));
            break;
          case "count":
            result.push(set.count());
            break;
          case "all":
            result.push([...set].map(String));
            break;
          case "prefix": {
            const dates = [];
            for (const date of set) {
              dates.push(String(date));
              if (dates.length === step.length) break;
            }
            result.push(dates);
          }
        }
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        result.push({ error: error.message });
      }
    }
    return result;
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);

Deno.test("dateutil mutable sets preserve resolver object identity across independent rules", async () => {
  const bytes = await Deno.readFile(new URL("./timezones/dateutil-tzif/America/New_York", import.meta.url));
  const first = DateutilTzif.read(bytes);
  const second = DateutilTzif.read(bytes);
  const parse = async (zone: DateutilTzif) =>
    (await Recurrence.fromICalendar(["DTSTART;TZID=NY:20261101T013000", "RRULE:FREQ=DAILY;COUNT=2"], {
      profile: "dateutil",
      dateutilCache: true,
      dateutilTzids: { NY: zone },
    })).exp();
  const series = await parse(first);
  const same = await parse(first);
  const distinct = await parse(second);
  const set = Recurrence.dateutilSet({ cache: true });
  set.rrule(series);
  set.rrule(same);
  set.rrule(distinct);
  assertEquals([...set].map(String), ["2026-11-01T05:30:00Z", "2026-11-01T05:30:00Z", "2026-11-02T06:30:00Z"]);
  const fold = DateTime.fromRfc3339("2026-11-01T01:30:00-04:00").exp();
  assertEquals(set.contains({ value: fold, timeZone: first }), true);
  assertEquals(set.contains({ value: fold, timeZone: DateutilTzif.read(bytes) }), false);
  assertEquals(String(set.after({ value: fold, timeZone: second }, true)), "2026-11-01T05:30:00Z");
  set.exdate({ value: fold, timeZone: first });
  assertEquals([...set].map(String), ["2026-11-01T05:30:00Z", "2026-11-02T06:30:00Z"]);
  assertEquals(set.count(), 2);
});

Deno.test("dateutil mutable sets reject non-standalone rules at insertion", async () => {
  const series = (await Recurrence.fromICalendar(
    ["DTSTART:20261101T013000", "RRULE:FREQ=DAILY;COUNT=2", "RDATE:20261130T013000"],
    { profile: "dateutil" },
  )).exp();
  const set = Recurrence.dateutilSet();
  assertThrows(() => set.rrule(series), Error, "require a standalone dateutil rule");
  assertEquals(set.count(), 0);
});

Deno.test("dateutil mutable sets handle additions during an active traversal", () => {
  const first = NaiveDateTime.parse("2026-01-01T09:00:00")!;
  const second = NaiveDateTime.parse("2026-01-02T09:00:00")!;
  const third = NaiveDateTime.parse("2026-01-03T09:00:00")!;
  for (const cache of [false, true]) {
    const set = Recurrence.dateutilSet({ cache });
    set.rdate(first);
    set.rdate(second);
    const iterator = set[Symbol.iterator]();
    assertEquals(String(iterator.next().value), String(first));
    set.rdate(third);
    assertEquals(String(iterator.next().value), String(second));
    if (!cache) assertEquals(String(iterator.next().value), String(third));
    assertEquals(iterator.next().done, true);
    assertEquals([...set].map(String), [first, second, third].map(String));
    assertEquals(set.count(), 3);
  }
});
