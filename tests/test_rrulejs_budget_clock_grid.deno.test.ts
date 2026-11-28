import { assert, assertEquals, assertThrows } from "@std/assert";
import { NaiveDate, Recurrence, RecurrenceExpansionLimitError } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";

// A pair encodes a selector value and its number of repetitions.
type Selector = string | [value: number, repetitions: number] |
  { start: number; length: number };
interface Input {
  freq: string;
  hours?: Selector;
  minutes?: Selector;
  seconds?: Selector;
  count: number;
  through?: string;
  generationLimit: number;
}

type Expected = string[] | { limit: number; maxElapsedMs?: number };

Fixtures.load<Input, Expected>(
  new URL("./recurrence_fixtures/", import.meta.url).pathname,
  "rrulejs-budget",
).run(
  async ({ freq, hours, minutes, seconds, count, generationLimit, through }) => {
    const parts = [`FREQ=${freq}`, `COUNT=${count}`];
    const selectorFields = [
      ["BYHOUR", hours],
      ["BYMINUTE", minutes],
      ["BYSECOND", seconds],
    ] as const;
    for (const [field, selector] of selectorFields) {
      if (selector == null) continue;
      const values = typeof selector === "string"
        ? selector
        : Array.isArray(selector)
        ? Array<string>(selector[1]).fill(String(selector[0])).join(",")
        : Array.from({ length: selector.length }, (_, i) => selector.start + i).join(",");
      parts.push(`${field}=${values}`);
    }
    const series = (await Recurrence.fromICalendar([
      "DTSTART:20240101T000000Z",
      "RRULE:" + parts.join(";"),
    ], {
      profile: "rrule-js",
      rruleJsForceSet: false,
      rruleJsHostTimeZone: "UTC",
    })).exp();
    return () => (through == null ? series.rruleJsAll({ generationLimit })
      : series.occurrences({ through: NaiveDate.parse(through), generationLimit })).map(String);
  },
  (expand, expected) => {
    if (Array.isArray(expected)) {
      assertEquals(expand(), expected);
    } else {
      const start = performance.now();
      const error = assertThrows(
        expand,
        RecurrenceExpansionLimitError,
        "recurrence expansion limit exceeded",
      );
      const elapsed = performance.now() - start;
      assertEquals(error.limit, expected.limit);
      if (expected.maxElapsedMs != null) {
        assert(
          elapsed <= expected.maxElapsedMs,
          `budget error took ${elapsed.toFixed(1)}ms (limit ${expected.maxElapsedMs}ms)`,
        );
      }
    }
  },
);
