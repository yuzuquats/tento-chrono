import { assert, assertEquals } from "@std/assert";
import {
  DateTime,
  ICalendar,
  NaiveDate,
  NaiveDateTime,
  Recurrence,
  RecurrenceComposition,
  RRule,
  RRuleInstances,
} from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";

type Input =
  | {
    start: string;
    rrule: string;
    roundTrip?: boolean;
    after?: string;
    through?: string;
  }
  | { start: string; lines: string[] }
  | { profileLines: string[]; through: string }
  | { parseLines: string[] }
  | { serializeLines: string[] };
type Expected = boolean | string[] | { python: string[]; chrono: string[] };
interface Inventory {
  sourceSha256: string;
  otherCases: {
    source: string;
    line: number;
    status: string;
    reason: string;
  }[];
}

const dir = new URL("./recurrence_fixtures/", import.meta.url);
const fixtures = Fixtures.load<Input, Expected>(dir.pathname, "dateutil");
const inventory: Inventory = JSON.parse(
  await Deno.readTextFile(new URL("dateutil-inventory.json", dir)),
);
const reference = new URL("./reference_tests/test_rrule.py", import.meta.url);

Deno.test("dateutil fixtures account for every vendored Python test", async () => {
  const bytes = await Deno.readFile(reference);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  assertEquals(
    Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0"))
      .join(""),
    inventory.sourceSha256,
  );
  const ids = [];
  let cls = "";
  for (const line of new TextDecoder().decode(bytes).split("\n")) {
    const declaration = /^class (\w+)/.exec(line);
    if (declaration) cls = declaration[1];
    const method = /^    def (test\w+)\(/.exec(line);
    const func = /^def (test\w+)\(/.exec(line);
    if (method) ids.push(cls + "." + method[1]);
    if (func) ids.push(func[1]);
  }
  const names = fixtures.items.flatMap(({ cases }) =>
    cases.map(({ name }) => name)
  );
  const unique = new Set(names);
  assertEquals(unique.size, names.length, "duplicate dateutil fixture names");
  const recorded = names.filter((name) => !name.includes("#"));
  for (const name of names) {
    assert(unique.has(name.split("#")[0]), name);
  }
  for (const { source, line, status, reason } of inventory.otherCases) {
    assert(
      ["unsupported", "python-api"].includes(status) && line > 0 &&
        reason.length > 0,
      source,
    );
    recorded.push(source);
  }
  assertEquals(recorded.sort(), ids.sort());
});

fixtures.run(
  async (input) => {
    if ("profileLines" in input) {
      const series = (await Recurrence.fromICalendar(input.profileLines, {
        profile: "dateutil",
      })).exp();
      return series.occurrences({
        through: NaiveDate.parse(input.through),
        generationLimit: 500_000,
      }).map(String);
    }
    if ("serializeLines" in input) {
      return (await ICalendar.Raw.parse(input.serializeLines)).exp().toString()
        .split("\n");
    }
    if ("parseLines" in input) {
      return (await Recurrence.parse(input.parseLines)).isOk;
    }
    if ("lines" in input) {
      const series = (await Recurrence.parse(input.lines)).exp();
      const start = DateTime.fromRfc3339(input.start).exp();
      const gen = await series.generateEvents(
        start,
        null,
        RecurrenceComposition.RFC5545,
        500_000,
      );
      return gen.generateUpToDate(NaiveDate.parse("9999-12-31")).map(String);
    }
    const rule = RRule.parse(input.rrule).exp();
    const start = NaiveDateTime.parse(input.start);
    assert(start != null, input.start);
    const through = input.through ? NaiveDateTime.parse(input.through) : null;
    assert(!input.through || through != null, input.through);
    const after = input.after ? NaiveDateTime.parse(input.after) : null;
    assert(!input.after || after != null, input.after);
    const expand = (r: RRule) =>
      [...RRuleInstances.expand(
        r,
        start,
        false,
        500_000,
        undefined,
        false,
        through?.mse,
      )].filter((d) =>
        after == null ||
        (after.mse < d.mse && (through == null || d.mse < through.mse))
      ).map(String);
    const actual = expand(rule);
    if (input.roundTrip) {
      assertEquals(
        expand(RRule.parse(rule.toString()).exp()),
        actual,
        input.rrule,
      );
    }
    return actual;
  },
  (actual, expected, name) => {
    assertEquals(
      actual,
      typeof expected === "boolean" || Array.isArray(expected)
        ? expected
        : expected.chrono,
      name,
    );
  },
);
