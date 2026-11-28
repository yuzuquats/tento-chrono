import { assertEquals, assertThrows } from "@std/assert";
import { DateTime, NaiveDate, Recurrence } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

const [fixtureDir, loader] = Deno.args;
if (loader !== "bundled") installTimezoneLoader();

type Query =
  | { method: "count" }
  | { method: "at"; index: number }
  | {
    method: "slice";
    start?: number | null;
    stop?: number | null;
    step?: number | null;
  };
type Outcome = number | string | string[] | { error: string };

Fixtures.load<
  { lines: string[]; forceSet?: boolean; queries: Query[] },
  Outcome[]
>(
  fixtureDir ?? new URL("./fixtures/", import.meta.url).pathname,
  "dateutil-sequence",
).run(
  async ({ lines, forceSet, queries }) => {
    const series =
      (await Recurrence.fromICalendar(lines, { profile: "dateutil" })).exp();
    const options = { forceSet, generationLimit: 50_000 };
    return queries.map((query): Outcome => {
      try {
        switch (query.method) {
          case "count":
            return series.dateutilCount(options);
          case "at":
            return String(
              series.dateutilAt({ ...options, index: query.index }),
            );
          case "slice":
            return series.dateutilSlice({
              ...options,
              start: query.start ?? undefined,
              stop: query.stop ?? undefined,
              step: query.step ?? undefined,
            }).map(String);
        }
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        return { error: error.message };
      }
    });
  },
  (actual, expected, name) => assertEquals(actual, expected, name),
);


Deno.test("dateutil count for plain UTC daily rules stops at the end of year 9999", async () => {
  for (const [parts, expected] of [
    ["COUNT=0", 0],
    ["COUNT=-3", 0],
    ["COUNT=1", 1],
    ["COUNT=100", 11],
    ["COUNT=100;INTERVAL=3;WKST=SU", 4],
    ["COUNT=100;INTERVAL=9999999999999", 1],
    ["COUNT=2;BYMONTHDAY=30", 1],
  ] as const) {
    const series = (await Recurrence.fromICalendar([
      "DTSTART:99991221T120000Z",
      `RRULE:FREQ=DAILY;${parts}`,
    ], { profile: "dateutil" })).exp();
    assertEquals(series.dateutilCount(), expected, parts);
    assertEquals(series.dateutilCount({ generationLimit: 100 }), expected, parts);
    if (expected > 0) assertThrows(() => series.dateutilCount({ generationLimit: 0 }));
  }
});

Deno.test("unbudgeted plain UTC daily traversal preserves wall time, count and the calendar bound", async () => {
  for (const [count, days] of [[2, [21, 24]], [100, [21, 24, 27, 30]]] as const) {
    const series = (await Recurrence.fromICalendar([
      "DTSTART:99991221T120000Z",
      `RRULE:FREQ=DAILY;COUNT=${count};INTERVAL=3;WKST=SU`,
    ], { profile: "dateutil" })).exp();
    const expected = days.map((day) => `9999-12-${day}T12:00:00Z`);
    for (const forceSet of [false, true]) {
      const values = series.dateutilSlice({ forceSet });
      assertEquals(values.map(String), expected);
      assertEquals(values.every((value) => value instanceof DateTime), true);
      assertEquals(series.dateutilSlice({ forceSet, generationLimit: 100 }).map(String), expected);
      assertEquals(String(series.dateutilAt({ forceSet, index: -1 })), expected.at(-1));
    }
  }
});


Deno.test("dateutil one-shot UTC daily expansion clips to the window and calendar", async () => {
  const read = async (rule: string) => (await Recurrence.fromICalendar(
    ["DTSTART:99991227T235959Z", "RRULE:FREQ=DAILY;" + rule],
    { profile: "dateutil" },
  )).exp();
  const series = await read("COUNT=100;INTERVAL=2;WKST=SU");
  assertEquals(series.occurrences({ through: NaiveDate.parse("9999-12-26") }), []);
  assertEquals(series.occurrences({ through: NaiveDate.parse("9999-12-30") }).map(String), [
    "9999-12-27T23:59:59Z", "9999-12-29T23:59:59Z",
  ]);
  const through = NaiveDate.fromYmd1Exp(10000, 1, 1);
  const days = series.occurrences({ through }).map(String);
  assertEquals(days, [
    "9999-12-27T23:59:59Z", "9999-12-29T23:59:59Z", "9999-12-31T23:59:59Z",
  ]);
  assertEquals(days, series.generator().generateUpToDate(through).map(String));
  assertThrows(() => series.occurrences({ through, generationLimit: 2 }));
  for (const count of [0, -3]) {
    assertEquals((await read("COUNT=" + count)).occurrences({ through }), []);
  }
});

Deno.test("dateutil one-shot expansion keeps a compatible fractional start", async () => {
  const series = (await Recurrence.fromICalendar(
    ["DTSTART:20260101T090000.123Z", "RRULE:FREQ=DAILY;COUNT=1"],
    { profile: "dateutil", dateutilCompatible: true },
  )).exp();
  const through = NaiveDate.parse("2026-01-01");
  assertEquals(series.occurrences({ through }).map(String), [
    "2026-01-01T09:00:00Z", "2026-01-01T09:00:00.123Z",
  ]);
});
