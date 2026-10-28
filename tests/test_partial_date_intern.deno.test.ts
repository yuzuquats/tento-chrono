import { assert, assertEquals, assertNotStrictEquals, assertStrictEquals, assertThrows } from "jsr:@std/assert";

import { NaiveDate, SemanticTime } from "../chrono/mod.ts";

// A sheet ingest parses the same few hundred day strings at every layer: a
// parsed partial date is interned (bounded), and `SemanticTime` no longer
// parses the text it just built.

Deno.test("Partial.parse interns: the same text answers the same (immutable) PartialDate", () => {
  const a = NaiveDate.Partial.parse("ymd-2031-3-7").exp();
  const b = NaiveDate.Partial.parse("ymd-2031-3-7").exp();
  assertStrictEquals(a, b);
  assertStrictEquals(NaiveDate.Partial.parseOptional("ymd-2031-3-7"), a);
  assertEquals(a.toString(), "ymd-2031-3-7");
  assertEquals(a.start.toString(), "2031-03-07");
  // A different spelling of the same day is its own entry.
  assertEquals(NaiveDate.Partial.parse("ymd-2031-03-07").exp().index, a.index);
});

Deno.test("Partial.parse interning is bounded: the oldest entry leaves first", () => {
  const first = NaiveDate.Partial.parse("ymd-1901-1-1").exp();
  // 5000 distinct texts that do not parse (a year 0): failures are never interned.
  for (let i = 0; i < 5000; i++) assert(NaiveDate.Partial.parse(`ymd-0-1-${i + 1}`).isErr);
  assertStrictEquals(NaiveDate.Partial.parse("ymd-1901-1-1").exp(), first, "failures kept nothing");
  for (let y = 0; y < 4200; y++) NaiveDate.Partial.parse(`y-${3000 + y}`);
  const again = NaiveDate.Partial.parse("ymd-1901-1-1").exp();
  assertNotStrictEquals(again, first, "4200 later entries evicted the first");
  assertEquals(again.toString(), first.toString());
});

Deno.test("Partial.parse interning keeps failures failing", () => {
  for (let i = 0; i < 2; i++) {
    assert(NaiveDate.Partial.parse("ymd-2026-0-9").isErr);
    assertEquals(NaiveDate.Partial.parseOptional("not-a-date"), null);
  }
});

Deno.test("SemanticTime.fromPartialDate accepts and rejects exactly what a re-parse of its text did", () => {
  const P = NaiveDate.Partial;
  const cases = [
    P.fromDate(NaiveDate.parse("2026-04-29")),
    P.fromMonth(2026, 12),
    P.fromYear(2026),
    P.fromWeek(2026, 18),
    new P("day", 0, 1 as never, 1 as never),
    new P("day", 2026, 0 as never, 1 as never),
    P.fromMonth(-5, 3),
    P.fromYear(0),
    P.fromWeek(2026, 0),
    new P("day", 2026, 13 as never, 40 as never),
  ];
  for (const partial of cases) {
    const raw = partial.toString();
    const reparse = P.parse(raw);
    const accepted = reparse.isOk && reparse.asOk() != null;
    if (accepted) assertEquals(SemanticTime.fromPartialDate(partial), raw);
    else assertThrows(() => SemanticTime.fromPartialDate(partial), Error, "invalid partial date");
  }
});
