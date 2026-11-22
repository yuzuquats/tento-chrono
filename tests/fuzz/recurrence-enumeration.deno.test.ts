import { assertEquals } from "@std/assert";
import {
  DateTime,
  MsSinceEpoch,
  NaiveDate,
  NaiveDateTime,
  Recurrence,
  RecurrenceComposition,
  RRule,
  RRuleInstances,
  TimezoneRegion,
} from "../../chrono/mod.ts";
import { random32 } from "./random.deno.ts";

const dayMs = 86_400_000;
const weekdays = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const frequencies = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;

function isoDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function yearDay(date: Date): number {
  return 1 + (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / dayMs;
}

Deno.test("bounded recurrence expansion agrees with one-day-at-a-time enumeration", async () => {
  const seed = 0xd047;
  const next = random32(seed);
  for (let i = 0; i < 320; i++) {
    const freq = frequencies[i % frequencies.length];
    const start = Date.UTC(1896 + next(209), next(12), 1 + next(31));
    const end = start + (370 + next(730)) * dayMs;
    const anchor = new Date(start);
    const anchorYear = anchor.getUTCFullYear();
    const anchorMonth = anchor.getUTCMonth();
    const interval = 1 + next(4);
    const weekStart = next(7);
    const anchorWeek = (anchor.getUTCDay() - weekStart + 7) % 7;
    const byDay = [anchor.getUTCDay(), next(7)];
    const byMonth = [anchorMonth, next(12)];
    const byMonthDay = [anchor.getUTCDate(), -1 - next(31)];
    const byYearDay = [yearDay(anchor), -1 - next(366)];
    const fields = [`FREQ=${freq}`, `INTERVAL=${interval}`];
    if (freq === "DAILY" || freq === "WEEKLY") {
      fields.push(`BYDAY=${byDay.map((d) => weekdays[d]).join(",")}`);
      fields.push(`BYMONTH=${byMonth.map((m) => m + 1).join(",")}`);
    }
    if (freq === "WEEKLY") fields.push(`WKST=${weekdays[weekStart]}`);
    if (freq === "MONTHLY") fields.push(`BYMONTHDAY=${byMonthDay.join(",")}`);
    if (freq === "YEARLY") fields.push(`BYYEARDAY=${byYearDay.join(",")}`);

    const expected: string[] = [];
    for (let time = start; time <= end; time += dayMs) {
      const date = new Date(time);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      const day = date.getUTCDate();
      const days = (time - start) / dayMs;
      let matches: boolean;
      if (freq === "MONTHLY") {
        const monthIndex = (year - anchorYear) * 12 + month - anchorMonth;
        const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
        matches = monthIndex % interval === 0 &&
          (byMonthDay.includes(day) || byMonthDay.includes(day - last - 1));
      } else if (freq === "YEARLY") {
        const yearIndex = year - anchorYear;
        const ordinal = yearDay(date);
        const last = yearDay(new Date(Date.UTC(year, 11, 31)));
        matches = yearIndex % interval === 0 &&
          (byYearDay.includes(ordinal) ||
            byYearDay.includes(ordinal - last - 1));
      } else {
        const period = freq === "WEEKLY"
          ? Math.floor((days + anchorWeek) / 7)
          : days;
        matches = period % interval === 0 && byDay.includes(date.getUTCDay()) &&
          byMonth.includes(month);
      }
      if (matches) expected.push(isoDay(time));
    }

    const count = i % 8 < 4 ? undefined : 1 + next(30);
    if (count != null) fields.push(`COUNT=${count}`);
    const rrule = "RRULE:" + fields.join(";");
    const startDate = isoDay(start);
    const endDate = isoDay(end);
    const context =
      `seed=${seed} case=${i} start=${startDate} end=${endDate} ${rrule}`;
    const lines = [
      `DTSTART;VALUE=DATE:${startDate.replaceAll("-", "")}`,
      rrule,
    ];
    const rec = (await Recurrence.parse(lines)).exp();
    const through = NaiveDate.parse(endDate);
    const want = expected.slice(0, count ?? expected.length);
    assertEquals(
      [...rec.generateToDate(undefined, through)].map(String),
      want,
      `date generator: ${context}`,
    );

    const at = DateTime.fromRfc3339(startDate + "T00:00:00Z").exp();
    const gen = await rec.generateEvents(
      at,
      TimezoneRegion.UTC,
      RecurrenceComposition.RFC5545,
    );
    assertEquals(
      gen.generateUpToDate(through).map((d) => String(d.date)),
      want,
      `event generator: ${context}`,
    );

    const rule = RRule.parse(rrule).exp();
    const wall = NaiveDateTime.fromMse(MsSinceEpoch.of(start));
    const instances = RRuleInstances.expand(
      rule,
      wall,
      false,
      undefined,
      undefined,
      true,
      end,
    );
    assertEquals(
      [...instances].map((d) => String(d.date)),
      want,
      `instance expander: ${context}`,
    );
  }
});

Deno.test("subdaily recurrence consumes COUNT before exclusions and merges explicit additions", async () => {
  const seed = 0x64ac;
  const next = random32(seed);
  const periods = [["HOURLY", 3600], ["MINUTELY", 60], [
    "SECONDLY",
    1,
  ]] as const;
  const utcText = (mse: number) =>
    new Date(mse).toISOString().replace(".000Z", "Z");
  const ical = (mse: number) =>
    utcText(mse).replaceAll("-", "").replaceAll(":", "");
  for (let i = 0; i < 120; i++) {
    const [freq, periodSeconds] = periods[i % periods.length];
    const start = Date.UTC(1950 + next(101), next(12), 1 + next(28));
    const interval = 1 + next(5);
    const count = 2 + next(20);
    // Midnight satisfies the filters and lands on the first interval.
    const hours = [0, 1 + next(23)];
    const minutes = [0, 1 + next(59)];
    const seconds = [0, 1 + next(59)];
    const expected: number[] = [];
    for (
      let elapsed = 0;
      elapsed < 172_800 && expected.length < count;
      elapsed++
    ) {
      const period = Math.floor(elapsed / periodSeconds);
      if (
        period % interval === 0 &&
        hours.includes(Math.floor(elapsed / 3600) % 24) &&
        minutes.includes(Math.floor(elapsed / 60) % 60) &&
        seconds.includes(elapsed % 60)
      ) {
        expected.push(start + elapsed * 1000);
      }
    }
    const rule =
      `RRULE:FREQ=${freq};INTERVAL=${interval};COUNT=${count};BYHOUR=${hours};BYMINUTE=${minutes};BYSECOND=${seconds}`;
    const omitted = expected[next(expected.length)];
    const explicit = i % 2 === 0
      ? start + dayMs + next(86_400) * 1000
      : expected.find((instant) => instant !== omitted)!;
    const lines = [
      `DTSTART:${ical(start)}`,
      rule,
      `EXDATE:${ical(omitted)}`,
      `RDATE:${ical(explicit)}`,
    ];
    const context = `seed=${seed} case=${i} ${lines.join(" ")}`;
    const want = [
      ...new Set([
        ...expected.filter((instant) => instant !== omitted),
        explicit,
      ]),
    ]
      .sort((a, b) => a - b).map(utcText);
    const rec = (await Recurrence.parse(lines)).exp();
    const at = DateTime.fromRfc3339(utcText(start)).exp();
    const gen = await rec.generateEvents(
      at,
      TimezoneRegion.UTC,
      RecurrenceComposition.RFC5545,
    );
    const firstDay = gen.generateUpToDate(NaiveDate.parse(isoDay(start))).map(
      String,
    );
    const secondDay = gen.generateUpToDate(
      NaiveDate.parse(isoDay(start + dayMs)),
    ).map(String);
    assertEquals(
      firstDay,
      want.filter((s) => s.slice(0, 10) === isoDay(start)),
      context,
    );
    assertEquals([...firstDay, ...secondDay], want, context);
  }
});
