import { assert, assertEquals } from "@std/assert";
import {
  DateTime,
  MsSinceEpoch,
  TimezoneRegion,
  Tzname,
  Utc,
} from "../../chrono/mod.ts";
import { random32 } from "./random.deno.ts";

const start = Date.UTC(2000, 0, 1);
const end = Date.UTC(2036, 1, 1);

Deno.test("regional conversion agrees with Intl across random instants and transition boundaries", async () => {
  const seed = 0x302b;
  const next = random32(seed);
  for (
    const name of [
      "America/Los_Angeles",
      "America/St_Johns",
      "Australia/Lord_Howe",
      "Pacific/Apia",
    ]
  ) {
    const tzname = Tzname.parseOpt(name);
    assert(tzname != null, name);
    const zone = await TimezoneRegion.getOpt(tzname);
    assert(zone != null, `Missing zone ${name}`);
    const oracle = new Intl.DateTimeFormat("en-CA", {
      timeZone: name,
      calendar: "gregory",
      numberingSystem: "latn",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });

    const verify = (mse: number, label: string) => {
      const utc = DateTime.fromMse(MsSinceEpoch.of(mse), Utc);
      const local = zone.toTz(utc);
      const context = `seed=${seed}, zone=${name}, ${label}, mse=${mse}`;
      assertEquals(local.mse, utc.mse, context);
      const expected = new Map(
        oracle.formatToParts(mse).map((
          { type, value },
        ) => [type, Number(value)]),
      );
      const { date, time } = local;
      assertEquals(
        [
          date.yr,
          date.month1,
          date.day1,
          time.hrs,
          time.mins,
          time.secs,
          time.ms,
        ],
        ["year", "month", "day", "hour", "minute", "second", "fractionalSecond"]
          .map((field) => expected.get(field as Intl.DateTimeFormatPartTypes)),
        context,
      );
      assert(zone.date(date).containsInstant(utc), context);
    };

    for (let i = 0; i < 1024; i++) {
      verify(
        start + next((end - start) / 1000) * 1000 + next(1000),
        `case=${i}`,
      );
    }
    const shifts = zone.transitions.filter(({ before, after }) =>
      before.mse >= start && before.mse < end &&
      before.time.tz.info.offset.toMs !== after.time.tz.info.offset.toMs
    );
    assert(shifts.length > 0, `No offset transitions for ${name}`);
    for (const { before } of shifts) {
      for (
        const delta of [-1 - next(3_600_000), -1, 0, 1, 1 + next(3_600_000)]
      ) {
        verify(before.mse + delta, `transition=${before.mse}, delta=${delta}`);
      }
    }
  }
});
