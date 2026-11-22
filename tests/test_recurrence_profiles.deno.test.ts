import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  GraphRecurringMaster,
  ICalendarRecurrenceProfile,
  NaiveDate,
  Recurrence,
} from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

type Input =
  | { lines: string[]; profile?: ICalendarRecurrenceProfile; through: string }
  | { graph: GraphRecurringMaster; through: string };

type Expected = string[] | { error: string };

const dir = new URL("./fixtures/", import.meta.url).pathname;
Fixtures.load<Input, Expected>(dir, "recurrence-profile").run(
  async (input) => {
    const parsed = "graph" in input
      ? await Recurrence.fromGraph(input.graph, {
        resolveTimeZone: (name) =>
          name === "Pacific Standard Time" ? "America/Los_Angeles" : undefined,
      })
      : await Recurrence.fromICalendar(
        input.lines,
        input.profile == null ? undefined : { profile: input.profile },
      );
    if (parsed.isErr) return { error: parsed.asErr()!.message };

    const series = parsed.exp();
    const through = NaiveDate.parse(input.through);
    const actual = series.occurrences({ through, generationLimit: 500_000 })
      .map(String);
    if (actual.length > 0) {
      const firstDay = NaiveDate.parse(actual[0].slice(0, 10));
      const cursor = series.generator(500_000);
      assertEquals(
        [
          ...cursor.generateUpToDate(firstDay),
          ...cursor.generateUpToDate(through),
        ].map(String),
        actual,
        "profile cursor must match a single read",
      );
    }
    return actual;
  },
  (actual, expected, name) => {
    if (Array.isArray(expected)) {
      assertEquals(actual, expected, name);
    } else {
      assert(!Array.isArray(actual), name);
      assertStringIncludes(actual.error, expected.error, name);
    }
  },
);
