import { assert, assertEquals, assertThrows } from "@std/assert";
import { PartialDate, SemanticTime } from "../chrono/mod.ts";

Deno.test("partial-date exchange preserves signed, zero and legacy positive years", () => {
  for (const yr of [-262143, -44, -1, 0, 1, 2024, 262142]) {
    for (const text of [`y-${yr}`, `ym-${yr}-3`, `ymd-${yr}-3-15`, `yw-${yr}-10`]) {
      const value = PartialDate.parse(text).exp();
      assertEquals(value.yr, yr);
      assertEquals(value.toString(), text);
      assertEquals(PartialDate.parseOptional(text)?.toString(), text);
      assertEquals(PartialDate.parse(text).exp().toString(), text); // interned copy
    }
  }
  for (const [input, canonical] of [["ym-+2024-02", "ym-2024-2"], ["ymd-0024-03-05", "ymd-24-3-5"]]) {
    assertEquals(PartialDate.parse(input).exp().toString(), canonical);
  }
  assertEquals(PartialDate.fromStr("year", "0", null, null, null).exp().yr, 0);
});

Deno.test("partial-date grammar consumes every field without shifting signed years", () => {
  for (const text of ["y--", "ym--44--3", "y-2024-", "y-2024-1", "ym-2024-2-3", "ymd-2024-2", "yw-2024-1-2", "y-1.5", "y-9007199254740992"]) {
    assert(PartialDate.parse(text).isErr, text);
    assertEquals(PartialDate.parseOptional(text), null);
  }
});


Deno.test("SemanticTime agrees with public partial parsing for signed, zero and invalid fields", () => {
  for (const yr of [-262143, -44, -1, 0, 1, 2024, 262142]) {
    for (const raw of [`y-${yr}`, `ym-${yr}-3`, `ymd-${yr}-3-15`, `yw-${yr}-10`]) {
      const partial = PartialDate.parse(raw).exp();
      assertEquals(SemanticTime.fromPartialDate(partial), raw);
      assertEquals(SemanticTime.parse(raw), raw);
    }
  }
  for (const partial of [
    PartialDate.fromYear(Number.NaN),
    PartialDate.fromYear(Number.POSITIVE_INFINITY),
    PartialDate.fromYear(1.5),
    PartialDate.fromYear(9007199254740992),
    PartialDate.fromMonth(0, 0),
    PartialDate.fromMonth(-44, 1.5),
    PartialDate.fromWeek(0, -1),
    PartialDate.fromWeek(-44, 1e21),
  ]) {
    assert(PartialDate.parse(partial.toString()).isErr, partial.toString());
    assertThrows(() => SemanticTime.fromPartialDate(partial), Error, "invalid partial date");
  }
});
