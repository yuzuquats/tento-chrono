import { assertEquals } from "@std/assert";
import { DateTime } from "../chrono/datetime.ts";
import { NaiveDate, NaiveDateTime, NaiveTime, Utc } from "../chrono/mod.ts";

Deno.test("rfc3339: a year below 1000 is zero-padded to four digits and reads back", () => {
  assertEquals(NaiveDate.fromYmd1(999, 1, 2).exp().rfc3339(), "0999-01-02");
  assertEquals(NaiveDate.fromYmd1(5, 12, 31).exp().rfc3339(), "0005-12-31");
  assertEquals(NaiveDate.fromYmd1(1000, 1, 1).exp().rfc3339(), "1000-01-01");
  const dt = new DateTime(
    new NaiveDateTime(
      NaiveDate.fromYmd1(42, 3, 4).exp(),
      new NaiveTime(3_600_000),
    ),
    Utc,
  );
  assertEquals(dt.rfc3339(), "0042-03-04T01:00:00Z");
  const back = DateTime.fromRfc3339(dt.rfc3339());
  assertEquals(
    back.isOk ? back.asOk()!.mse : null,
    dt.mse,
    "reads back to the same instant",
  );
});
