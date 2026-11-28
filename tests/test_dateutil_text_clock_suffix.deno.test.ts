import { assertEquals } from "@std/assert";
import { NaiveDate, Recurrence } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";

Fixtures.load<{ lines: string[]; through: string }, string[]>(
  new URL("./recurrence_fixtures/", import.meta.url).pathname,
  "dateutil-text",
).run(
  async ({ lines, through }) => {
    const series = (await Recurrence.fromICalendar(lines, {
      profile: "dateutil",
      dateutilUnfold: true,
    })).exp();
    return series.occurrences({ through: NaiveDate.parse(through) }).map(String);
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);
