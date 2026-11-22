import { assertEquals } from "@std/assert";
import { DateTime } from "../../chrono/datetime.ts";
import { NaiveDate } from "../../chrono/naive-date.ts";
import { NaiveTime } from "../../chrono/naive-time.ts";
import { NaiveDateTime } from "../../chrono/naive-datetime.ts";
import { FixedTimezone, Tzname, Utc } from "../../chrono/timezone.ts";
import { Duration } from "../../chrono/units/duration.ts";

import { random32 } from "./random.deno.ts";

function refDate(d: NaiveDate): string {
  return [
    String(d.yr).padStart(4, "0"),
    String(d.month1).padStart(2, "0"),
    String(d.day1).padStart(2, "0"),
  ].join("-");
}
function refTime(t: NaiveTime): string {
  const base = `${t.hrs.toString().padStart(2, "0")}:${
    t.mins.toString().padStart(2, "0")
  }:${t.secs.toString().padStart(2, "0")}`;
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
  const seed = 20261003;
  const next = random32(seed);
  const zones = [
    Utc,
    new FixedTimezone("p0530", {
      tzabbr: "IST",
      tzname: "Asia/Kolkata" as Tzname,
      offset: Duration.Time.from({ mins: 330 }),
    }),
    new FixedTimezone("m0800", {
      tzabbr: "PST",
      tzname: "America/Los_Angeles" as Tzname,
      offset: Duration.Time.from({ mins: -480 }),
    }),
  ];
  for (let i = 0; i < 20000; i++) {
    const yr = i % 10 === 0 ? 1 + next(999) : 1 + next(9999);
    const date = NaiveDate.fromYmd1(yr, 1 + next(12), 1 + next(28)).exp();
    const ms = i % 4 === 0 ? 1 + next(999) : 0;
    const time = new NaiveTime(
      next(24) * 3_600_000 + next(60) * 60_000 + next(60) * 1000 + ms,
    );
    const context = `seed=${seed}, case=${i}, date=${date}, time=${time.toMs}`;
    assertEquals(date.rfc3339(), refDate(date), context);
    assertEquals(time.toRfc3339(), refTime(time), context);
    const dt = new DateTime(
      new NaiveDateTime(date, time),
      zones[next(zones.length)]!,
    );
    assertEquals(dt.rfc3339(), refDateTime(dt), context + `, zone=${dt.tz.id}`);
    assertEquals(
      dt.toString(),
      refDateTime(dt),
      context + `, zone=${dt.tz.id}`,
    );
  }
});
