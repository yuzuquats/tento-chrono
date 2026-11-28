import { assert, assertEquals } from "@std/assert";
import { type DateutilHost, type DateutilReplaceOptions, Recurrence, type RecurrenceSeries, Weekday } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

const [fixtureDir, loader] = Deno.args;
if (loader !== "bundled") installTimezoneLoader();

type Input = {
  lines: string[];
  steps: DateutilReplaceOptions[];
  wkst?: string;
  stepClocks?: (string | null)[];
  host?: Omit<DateutilHost, "localTime"> & { transitions: readonly (readonly [number, boolean, number])[] };
};
type Snapshot = { text: string; starts: string[] };

function snapshot(rule: RecurrenceSeries): Snapshot {
  return {
    text: rule.dateutilToString(),
    starts: rule.dateutilSlice({ generationLimit: 50_000 }).map(String),
  };
}

Fixtures.load<Input, { original: Snapshot; changes: (Snapshot | { error: string })[] }>(
  fixtureDir ?? new URL("./fixtures/", import.meta.url).pathname,
  "dateutil-replacements",
).run(
  async ({ lines, steps, wkst, stepClocks, host }) => {
    const dateutilHost: DateutilHost | undefined = host == null ? undefined : {
      ...host,
      localTime(at) {
        const state = host.transitions.findLast(([start]) => start <= at);
        assert(state != null, "missing reference offset at " + at);
        const [, isDaylight, offsetSeconds] = state;
        return { isDaylight, offsetSeconds };
      },
    };
    const dateutilWeekStart = wkst == null ? undefined : Weekday.parseOpt(wkst) ?? undefined;
    let rule = (await Recurrence.fromICalendar(lines, { profile: "dateutil", dateutilWeekStart, dateutilHost })).exp();
    const original = snapshot(rule);
    let previous = original;
    const changes = [];
    for (const [i, step] of steps.entries()) {
      const clock = stepClocks?.[i];
      const now = Date.now;
      if (clock != null) {
        const instant = Date.parse(clock);
        assert(Number.isFinite(instant), clock);
        Date.now = () => instant;
      }
      const result = await rule.dateutilReplace(step).finally(() => Date.now = now);
      assertEquals(snapshot(rule), previous);
      const error = result.asErr();
      if (error != null) {
        changes.push({ error: error.message });
        continue;
      }
      const replacement = result.exp();
      try {
        const next = snapshot(replacement);
        previous = next;
        changes.push(next);
        rule = replacement;
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        changes.push({ error: error.message });
      }
    }
    return { original, changes };
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);

Deno.test("count replacement preserves the configured week start in later edits", async () => {
  const original = (await Recurrence.fromICalendar([
    "DTSTART:20240227T091001Z",
    "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=5",
  ], {
    profile: "dateutil",
    dateutilWeekStart: Weekday.SUN,
    dateutilCache: true,
  })).exp();
  const first = (await original.dateutilReplace({ count: 1, cache: false })).exp();
  const second = (await first.dateutilReplace({ freq: "daily", count: 2 })).exp();

  assertEquals(original.dateutilCount(), 5);
  assertEquals(first.dateutilToString(), "DTSTART:20240227T091001\nRRULE:FREQ=WEEKLY;INTERVAL=2;WKST=SU;COUNT=1");
  assertEquals(first.dateutilSlice().map(String), ["2024-02-27T09:10:01Z"]);
  assertEquals(second.dateutilToString(), "DTSTART:20240227T091001\nRRULE:FREQ=DAILY;INTERVAL=2;WKST=SU;COUNT=2");
  assertEquals(second.dateutilSlice().map(String), ["2024-02-27T09:10:01Z", "2024-02-29T09:10:01Z"]);
});
