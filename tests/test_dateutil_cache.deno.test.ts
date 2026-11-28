import { assertEquals, assertThrows } from "@std/assert";
import { DateTime, NaiveDateTime, Recurrence, RecurrenceExpansionLimitError } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

const [fixtureDir, loader] = Deno.args;
if (loader !== "bundled") installTimezoneLoader();

type Step =
  | { method: "count" }
  | { method: "at"; index: number }
  | { method: "slice"; start?: number; stop?: number; step?: number }
  | { method: "contains" | "before" | "after" | "xafter"; at: string; inclusive?: boolean; count?: number }
  | { method: "replace"; cache?: boolean };
type Outcome = number | boolean | string | string[] | null | { error: string };

function bound(text: string) {
  return text.endsWith("Z") ? DateTime.fromRfc3339(text).exp() : NaiveDateTime.parse(text)!;
}

Fixtures.load<{ lines: string[]; cache: boolean; forceSet: boolean; steps: Step[] }, Outcome[]>(
  fixtureDir ?? new URL("./fixtures", import.meta.url).pathname,
  "dateutil-cache",
).run(
  async ({ lines, cache, forceSet, steps }) => {
    let rule = (await Recurrence.fromICalendar(lines, { profile: "dateutil", dateutilCache: cache })).exp();
    const options = { forceSet, generationLimit: 50_000 };
    const results: Outcome[] = [];
    for (const step of steps) {
      try {
        switch (step.method) {
          case "replace":
            rule = (await rule.dateutilReplace({ cache: step.cache })).exp();
            results.push(null);
            break;
          case "count":
            results.push(rule.dateutilCount(options));
            break;
          case "at":
            results.push(String(rule.dateutilAt({ ...options, index: step.index })));
            break;
          case "slice":
            results.push(rule.dateutilSlice({ ...options, start: step.start, stop: step.stop, step: step.step }).map(String));
            break;
          case "contains":
            results.push(rule.dateutilContains({ ...options, at: bound(step.at) }));
            break;
          case "before":
          case "after": {
            const query = { ...options, at: bound(step.at), inclusive: step.inclusive };
            const found = step.method === "before" ? rule.dateutilBefore(query) : rule.dateutilAfter(query);
            results.push(found == null ? null : String(found));
            break;
          }
          case "xafter":
            results.push([...rule.dateutilXAfter({ ...options, at: bound(step.at), inclusive: step.inclusive, count: step.count })].map(String));
            break;
        }
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        results.push({ error: error.message });
      }
    }
    return results;
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);


Deno.test("dateutil query caches respect generation limits and force-set mode", async () => {
  const series = (await Recurrence.fromICalendar([
    "DTSTART:20260101T120000",
    "RRULE:FREQ=DAILY;INTERVAL=0;COUNT=3",
  ], { profile: "dateutil", dateutilCache: true })).exp();
  assertEquals(series.dateutilCount(), 3);
  assertEquals(series.dateutilCount({ forceSet: true }), 1);
  assertThrows(() => series.dateutilAt({ index: 0, generationLimit: 2 }), RecurrenceExpansionLimitError);
  assertEquals(String(series.dateutilAt({ index: 0 })), "2026-01-01T12:00:00");
});

Deno.test("dateutil cached index cannot read part of a failed prefetch batch", async () => {
  const series = (await Recurrence.fromICalendar([
    "DTSTART:20260101T120000Z",
    "RRULE:FREQ=DAILY;COUNT=30",
  ], { profile: "dateutil", dateutilCache: true })).exp();
  const at = (index: number) => series.dateutilAt({ index, generationLimit: 12 });

  assertEquals(String(at(9)), "2026-01-10T12:00:00Z");
  assertThrows(() => at(12), RecurrenceExpansionLimitError);
  assertThrows(() => at(10), RecurrenceExpansionLimitError);
  assertEquals(String(at(9)), "2026-01-10T12:00:00Z");
});
