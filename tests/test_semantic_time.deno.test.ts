import { assertEquals, assertThrows } from "jsr:@std/assert";

import { DateTime, NaiveDate, SemanticTime } from "../chrono/mod.ts";

Deno.test("SemanticTime parses partial dates", () => {
  const time = SemanticTime.parse("ymd-2026-4-29");
  assertEquals(SemanticTime.partialDate(time)?.toString(), "ymd-2026-4-29");
  assertEquals(SemanticTime.dateKey(time)?.toString(), "ymd-2026-4-29");
});

Deno.test("SemanticTime normalizes legacy plain dates", () => {
  const time = SemanticTime.parse("2026-04-29");
  assertEquals(time, "ymd-2026-4-29");
  assertEquals(SemanticTime.dateKey(time)?.toString(), "ymd-2026-4-29");
});

Deno.test("SemanticTime parses RFC3339 timestamps", () => {
  const point = DateTime.fromRfc3339("2026-04-29T10:15:00Z").exp().toUtc();
  const time = SemanticTime.parse(point.toString());
  assertEquals(SemanticTime.dateTime(time)?.toString(), point.toString());
  assertEquals(SemanticTime.dateKey(time)?.toString(), "ymd-2026-4-29");
});

Deno.test("SemanticTime normalizes legacy pt timestamps", () => {
  const time = SemanticTime.parse("pt-2026-04-29T10:15:00Z");
  assertEquals(time, "2026-04-29T10:15:00Z");
  assertEquals(SemanticTime.dateKey(time)?.toString(), "ymd-2026-4-29");
});

Deno.test("SemanticTime rejects invalid values", () => {
  assertThrows(
    () => SemanticTime.parse("not-a-time"),
    Error,
    "SemanticTime.parse: invalid semantic time",
  );
});

Deno.test("SemanticTime can be built from a partial date", () => {
  const partial = NaiveDate.Partial.parse("yw-2026-18").exp();
  assertEquals(SemanticTime.fromPartialDate(partial), "yw-2026-18");
});

Deno.test("SemanticTime can be built from a UTC timestamp", () => {
  const point = DateTime.fromRfc3339("2026-04-29T10:15:00Z").exp().toUtc();
  assertEquals(SemanticTime.fromDateTime(point), "2026-04-29T10:15:00Z");
});

Deno.test("SemanticTime partial-first probing preserves normalized partials and timestamp offsets", () => {
  const cases = [
    ["ymd-2026-09-09", "ymd-2026-9-9"],
    ["2026-09-09", "ymd-2026-9-9"],
    ["yw-2026-37", "yw-2026-37"],
    ["pt-ym-2026-09", "ym-2026-9"],
    ["2026-09-09T05:34:56-07:00", "2026-09-09T12:34:56Z"],
    ["pt-2026-09-09T05:34:56-07:00", "2026-09-09T12:34:56Z"],
  ] as const;
  for (const [raw, expected] of cases) assertEquals<string>(SemanticTime.parse(raw), expected);
  for (const raw of ["ymd-bad-9-9", "ymd-2026-0-9", "yw-2026-0", "not-a-time"]) {
    const error = assertThrows(() => SemanticTime.parse(raw), Error);
    assertEquals(error.message, `SemanticTime.parse: invalid semantic time "${raw}"`);
  }
});
