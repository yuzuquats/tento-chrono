import { assertEquals, assertThrows } from "@std/assert";
import { DateTime, Recurrence, RecurrenceExpansionLimitError } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

const [fixtureDir, loader] = Deno.args;
if (loader !== "bundled") installTimezoneLoader();

type Input = {
  lines: string[];
  after: string;
  before: string;
  inclusive: boolean;
  rruleJsForceSet: boolean;
  rruleJsHostTimeZone: string;
};
type ErrorResult = { error: string };

function outcome<T>(query: () => T): T | ErrorResult {
  try {
    return query();
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { error: String(error) };
  }
}

Fixtures.load<Input, {
  between: (string | null)[] | ErrorResult;
  before: string | null | ErrorResult;
  after: string | null | ErrorResult;
}>(
  fixtureDir ?? new URL("./fixtures", import.meta.url).pathname,
  "rrule-js-invalid-bounds",
).run(
  async ({ lines, after, before, inclusive, ...mode }) => {
    const series = (await Recurrence.fromICalendar(lines, { profile: "rrule-js", ...mode })).exp();
    const lo = DateTime.fromRfc3339(after).exp();
    const hi = DateTime.fromRfc3339(before).exp();
    const options = { inclusive, generationLimit: 500_000, preserveInvalidDates: true } as const;
    return {
      between: outcome(() => series.rruleJsBetween({ ...options, after: lo, before: hi }).map((date) => date?.toString() ?? null)),
      before: outcome(() => series.rruleJsBefore({ ...options, at: hi })?.toString() ?? null),
      after: outcome(() => series.rruleJsAfter({ ...options, at: lo })?.toString() ?? null),
    };
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);


Deno.test("rrule.js exact neighbors respect a zero generation budget on explicit dates", async () => {
  const series = (await Recurrence.fromICalendar(["RDATE:20260101T090000Z"], {
    profile: "rrule-js",
    rruleJsForceSet: true,
  })).exp();
  const at = DateTime.fromRfc3339("2026-01-01T09:00:00Z").exp();
  const options = { at, inclusive: true, generationLimit: 0, preserveInvalidDates: true } as const;
  assertThrows(() => series.rruleJsAfter(options), RecurrenceExpansionLimitError);
  assertThrows(() => series.rruleJsBefore(options), RecurrenceExpansionLimitError);
});
