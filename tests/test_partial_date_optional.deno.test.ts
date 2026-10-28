import { assertEquals } from "jsr:@std/assert";
import { NaiveDate } from "../chrono/mod.ts";

Deno.test("PartialDate optional probing preserves grammar and existing permissive parsing", () => {
  const cases = [
    ["y-2026", "y-2026"],
    ["ym-2026-09", "ym-2026-9"],
    ["ymd-2026-09-09", "ymd-2026-9-9"],
    ["yw-2026-37", "yw-2026-37"],
    ["y-2026-extra", "y-2026"],
    ["ym-2026-13", "ym-2026-13"],
    ["ymd-2026-2-30", "ymd-2026-2-30"],
    ["ymd-2026", "ymd-2026-null-null"],
  ] as const;
  for (const [raw, expected] of cases) {
    const optional = NaiveDate.Partial.parseOptional(raw);
    assertEquals(optional?.toString(), expected);
    assertEquals(optional, NaiveDate.Partial.parse(raw).asOk());
  }
});

Deno.test("PartialDate keeps public errors and rejects malformed recognized partials identically", () => {
  const cases = [
    ["2026-09-09T12:34:56Z", "unknown ty"],
    ["2026-09-09", "unknown ty"],
    ["pt-2026-09-09T12:34:56Z", "unknown ty"],
    ["Y-2026", "unknown ty"],
    ["", "unknown ty"],
    ["ymd-bad-9-9", "<1"],
    ["ymd-2026-0-9", "<1"],
    ["yw-2026-0", "<1"],
    ["y-0", "<1"],
    ["ymd-2026--9", "<1"],
  ] as const;
  for (const [raw, message] of cases) {
    assertEquals(NaiveDate.Partial.parse(raw).asErr()?.message, message);
    assertEquals(NaiveDate.Partial.parseOptional(raw), null);
  }
});

Deno.test("PartialDate optional non-format probe allocates no Error while public parse preserves one", () => {
  const OriginalError = globalThis.Error;
  let constructed = 0;
  const CountedError = new Proxy(OriginalError, {
    construct(target, args, newTarget) {
      constructed++;
      return Reflect.construct(target, args, newTarget);
    },
  });
  let optionalErrors = -1, publicErrors = -1, malformedErrors = -1;
  globalThis.Error = CountedError;
  try {
    for (const raw of ["2026-09-09T12:34:56Z", "2026-09-09T05:34:56-07:00", "2026-09-09", "not-a-time", ""]) {
      NaiveDate.Partial.parseOptional(raw);
    }
    optionalErrors = constructed;
    NaiveDate.Partial.parse("2026-09-09T12:34:56Z");
    publicErrors = constructed - optionalErrors;
    NaiveDate.Partial.parseOptional("ymd-bad-9-9");
    malformedErrors = constructed - optionalErrors - publicErrors;
  } finally {
    globalThis.Error = OriginalError;
  }
  assertEquals(optionalErrors, 0);
  assertEquals(publicErrors, 1);
  assertEquals(malformedErrors, 1);
});
