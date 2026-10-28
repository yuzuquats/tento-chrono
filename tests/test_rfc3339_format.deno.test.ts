/**
 * The RFC 3339 formatters (`NaiveDate.rfc3339`, `TimeOfDay.toRfc3339`,
 * `DateTime.rfc3339`) format directly instead of through padStart/join
 * arrays. This pins their text to the previous formulation, reproduced here
 * as the reference, over random dates (years 1-9999 and below 1000), times
 * with and without milliseconds, and UTC and fixed-offset instants. The
 * year is always four digits (RFC 3339 §5.6 `date-fullyear = 4DIGIT`;
 * operator ruling 2026-10-03: a year below 1000 printed unpadded was a bug,
 * and `DateTime.fromRfc3339` could not read it back).
 */
import { assertEquals } from "@std/assert";
import { DateTime } from "../chrono/datetime.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { NaiveTime } from "../chrono/naive-time.ts";
import { NaiveDateTime } from "../chrono/naive-datetime.ts";
import { FixedTimezone, Tzname, Utc } from "../chrono/timezone.ts";
import { Duration } from "../chrono/units/duration.ts";

function refDate(d: NaiveDate): string {
  return [String(d.yr).padStart(4, "0"), String(d.month1).padStart(2, "0"), String(d.day1).padStart(2, "0")].join("-");
}
function refTime(t: NaiveTime): string {
  const base = `${t.hrs.toString().padStart(2, "0")}:${t.mins.toString().padStart(2, "0")}:${t.secs.toString().padStart(2, "0")}`;
  return t.ms > 0 ? `${base}.${t.ms.toString().padStart(3, "0")}` : base;
}
function refDateTime(dt: DateTime): string {
  const sb: string[] = ["", "T", "", ""];
  sb[0] = refDate(dt.ndt.date);
  sb[2] = refTime(dt.ndt.time);
  sb[3] = dt.tz.rfc3339;
  return sb.join("");
}

Deno.test("rfc3339 formatters keep their text", () => {
  let x = 20261003;
  const next = (n: number) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return x % n;
  };
  const zones = [
    Utc,
    new FixedTimezone("p0530", { tzabbr: "IST", tzname: "Asia/Kolkata" as Tzname, offset: Duration.Time.from({ mins: 330 }) }),
    new FixedTimezone("m0800", { tzabbr: "PST", tzname: "America/Los_Angeles" as Tzname, offset: Duration.Time.from({ mins: -480 }) }),
  ];
  for (let i = 0; i < 20000; i++) {
    const yr = i % 10 === 0 ? 1 + next(999) : 1 + next(9999);
    const date = NaiveDate.fromYmd1(yr, 1 + next(12), 1 + next(28)).exp();
    const ms = next(4) === 0 ? next(1000) : 0;
    const time = new NaiveTime(next(24) * 3_600_000 + next(60) * 60_000 + next(60) * 1000 + ms);
    assertEquals(date.rfc3339(), refDate(date));
    assertEquals(time.toRfc3339(), refTime(time));
    const dt = new DateTime(new NaiveDateTime(date, time), zones[next(zones.length)]!);
    assertEquals(dt.rfc3339(), refDateTime(dt));
    assertEquals(dt.toString(), refDateTime(dt));
  }
});

Deno.test("rfc3339: a year below 1000 is zero-padded to four digits and reads back", () => {
  assertEquals(NaiveDate.fromYmd1(999, 1, 2).exp().rfc3339(), "0999-01-02");
  assertEquals(NaiveDate.fromYmd1(5, 12, 31).exp().rfc3339(), "0005-12-31");
  assertEquals(NaiveDate.fromYmd1(1000, 1, 1).exp().rfc3339(), "1000-01-01");
  const dt = new DateTime(new NaiveDateTime(NaiveDate.fromYmd1(42, 3, 4).exp(), new NaiveTime(3_600_000)), Utc);
  assertEquals(dt.rfc3339(), "0042-03-04T01:00:00Z");
  const back = DateTime.fromRfc3339(dt.rfc3339());
  assertEquals(back.isOk ? back.asOk()!.mse : null, dt.mse, "reads back to the same instant");
});
