import { assertEquals } from "@std/assert";
import { type GraphRecurringMaster, NaiveDate, Recurrence } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

interface Input {
  graph: GraphRecurringMaster;
  resolveTimeZone?: Record<string, string>;
  through: string;
}

const dir = new URL("./fixtures/", import.meta.url).pathname;
Fixtures.load<Input, string[] | { error: string }>(dir, "test_graph_master").run(
  async ({ graph, resolveTimeZone, through }) => {
    const parsed = await Recurrence.fromGraph(graph, {
      resolveTimeZone: resolveTimeZone == null ? undefined : (name) => resolveTimeZone[name],
    });
    if (parsed.isErr) return { error: parsed.asErr()!.message };
    return parsed.exp().occurrences({ through: NaiveDate.parse(through) }).map(String);
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);
