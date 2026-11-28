import { assertEquals } from "@std/assert";
import { Recurrence, type RecurrenceStart } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

const [fixtureDir, loader] = Deno.args;
if (loader !== "bundled") installTimezoneLoader();

interface Input {
  lines: string[];
  dtstart?: RecurrenceStart;
  rruleJsCompatible?: boolean;
  rruleJsForceSet?: boolean;
  rruleJsHostTimeZone?: string;
}
type Outcome = (string | null)[] | { error: string };

Fixtures.load<Input, Outcome>(
  fixtureDir ?? new URL("./fixtures/", import.meta.url).pathname,
  "rrule-js-all",
).run(
  async ({ lines, ...options }): Promise<Outcome> => {
    const parsed = await Recurrence.fromICalendar(lines, {
      profile: "rrule-js",
      ...options,
    });
    if (parsed.isErr) return { error: String(parsed.asErr()) };
    try {
      return parsed.exp().rruleJsAll({ generationLimit: 500_000 }).map(
        (value) => value?.toString() ?? null,
      );
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      return { error: String(error) };
    }
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);

Deno.test("rrule.js keeps the first exclusion for equivalent written options", async () => {
  const series = (await Recurrence.fromICalendar([
    "DTSTART:99980101T000000Z",
    "RRULE:FREQ=DAILY;COUNT=2",
    "EXRULE:FREQ=DAILY;UNTIL=99980102;BYMONTH=",
    "EXRULE:FREQ=DAILY;UNTIL=99980102",
  ], { profile: "rrule-js", rruleJsForceSet: true })).exp();
  assertEquals(series.rruleJsAll().map(String), [
    "9998-01-01T00:00:00Z",
    "9998-01-02T00:00:00Z",
  ]);
});
