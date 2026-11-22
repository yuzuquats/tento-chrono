import { assertEquals } from "@std/assert";
import {
  DateFragment,
  DateTime,
  ExDate,
  GenericRange,
  ICalendar,
  NaiveDate,
  NaiveDateTime,
  Recurrence,
  RecurrenceComposition,
  RRule,
  TimeOfDay,
  TimezoneRegion,
  Tzname,
} from "../chrono/mod.ts";

const at = (text: string) => DateTime.fromRfc3339(text).exp();
const day = (text: string) => NaiveDate.fromRfc3339(text).exp();

Deno.test("recurrence uses DTSTART's region for both date and timed rules", async () => {
  const expected = [
    "2026-03-07T17:00:00Z",
    "2026-03-08T16:00:00Z",
    "2026-03-09T16:00:00Z",
  ];
  for (const rule of ["FREQ=DAILY;COUNT=3", "FREQ=DAILY;COUNT=3;BYHOUR=9"]) {
    const recurrence = (await Recurrence.parse([
      "DTSTART;TZID=America/Los_Angeles:20260307T090000",
      "RRULE:" + rule,
    ])).exp();
    for (
      const composition of [
        RecurrenceComposition.RFC5545,
        RecurrenceComposition.GOOGLE,
      ]
    ) {
      const gen = await recurrence.generateEvents(
        at(expected[0]),
        null,
        composition,
      );
      assertEquals(
        gen.generateUpToDate(day("2026-03-07")).map(String),
        expected.slice(0, 1),
      );
      assertEquals(
        gen.generateUpToDate(day("2026-03-10")).map(String),
        expected.slice(1),
      );
    }
  }

  const recurrence = (await Recurrence.parse([
    "DTSTART;TZID=America/Los_Angeles:20260307T090000",
    "RRULE:FREQ=DAILY;COUNT=2",
  ])).exp();
  const explicit = await recurrence.generateEvents(
    at(expected[0]),
    TimezoneRegion.UTC,
    RecurrenceComposition.RFC5545,
  );
  assertEquals(explicit.generateUpToDate(day("2026-03-10")).map(String), [
    "2026-03-07T17:00:00Z",
    "2026-03-08T17:00:00Z",
  ]);
});

Deno.test("recurrence without a region retains the supplied fixed offset", async () => {
  const recurrence = (await Recurrence.parse([
    "RRULE:FREQ=DAILY;UNTIL=20260309T110000Z",
    "EXDATE:20260308T110000Z",
    "RDATE:20260311T010000",
  ])).exp();
  const gen = await recurrence.generateEvents(
    at("2026-03-08T01:00:00+14:00"),
    null,
    RecurrenceComposition.RFC5545,
  );
  assertEquals(gen.generateUpToDate(day("2026-03-07")).map(String), [
    "2026-03-07T11:00:00Z",
  ]);
  assertEquals(gen.generateUpToDate(day("2026-03-11")).map(String), [
    "2026-03-09T11:00:00Z",
    "2026-03-10T11:00:00Z",
  ]);
});

Deno.test("iCalendar dispatch recognizes complete property names case-insensitively", async () => {
  const lines = [
    "dtstart:20260101T090000Z",
    "rRuLe:freq=daily;count=3",
    "exdate:20260102T090000Z",
    "rdate:20260105T090000Z",
    "RRULE-EXT:FREQ=MONTHLY",
  ];
  const recurrence = (await Recurrence.parse(lines)).exp();
  const gen = await recurrence.generateEvents(
    at("2026-01-01T09:00:00Z"),
    null,
    RecurrenceComposition.RFC5545,
  );
  assertEquals(gen.generateUpToDate(day("2026-01-06")).map(String), [
    "2026-01-01T09:00:00Z",
    "2026-01-03T09:00:00Z",
    "2026-01-05T09:00:00Z",
  ]);
  assertEquals(RRule.parseWithRecurrence(lines).exp().inner.freq, "daily");
  assertEquals(ExDate.parseMultiple(lines).length, 1);
});

Deno.test("deterministic calendar round trips retain interleaved exclusions once each", async () => {
  const lines = [
    "DTSTART:20260101T090000Z",
    "EXDATE;VALUE=DATE:20260102,20260104",
    "RDATE:20260106T090000Z",
    "EXDATE:20260103T090000Z",
    "RRULE:FREQ=DAILY;COUNT=4",
  ];
  let serialized = lines.join("\n");
  for (let i = 0; i < 3; i++) {
    serialized = (await ICalendar.Raw.parse(serialized.split("\n"), true)).exp()
      .toString();
    assertEquals(serialized, lines.join("\n"));
  }
  const canonical = (await ICalendar.Raw.parse(lines)).exp().toString().split(
    "\n",
  );
  assertEquals(canonical.filter((line) => line.startsWith("EXDATE")), [
    lines[1],
    lines[3],
  ]);
});

Deno.test("naive parsing validates the whole string and preserves milliseconds", () => {
  for (
    const text of [
      "2026-01-01",
      "2026-02-30T09:00",
      "2026-01-01T09:00T12:00",
      "2026-01-01T09x:00",
      "2026-01-01T24:00",
      "2026-01-01T09:60",
      "2026-01-01T09:00:60",
      "2026-01-01T09:00+02:00",
    ]
  ) assertEquals(NaiveDateTime.parse(text), null, text);

  assertEquals(
    NaiveDateTime.parse("2026-1-2T9:0")?.toString(),
    "2026-01-02T09:00:00",
  );
  assertEquals(
    NaiveDateTime.parse("2026-01-01T09:00:30.5")?.toString(),
    "2026-01-01T09:00:30.500",
  );
  assertEquals(
    NaiveDateTime.parse("2026-01-01T09:00:30.005")?.time.toMs,
    32_430_005,
  );
  assertEquals(
    NaiveDateTime.parse("2026-01-01T09:00:30.500Z")?.toString(),
    "2026-01-01T09:00:30.500",
  );
  for (const text of ["2026-01-01junk", "2026-01-01-02", "2026-02-30"]) {
    assertEquals(NaiveDate.fromRfc3339(text).isErr, true, text);
    assertEquals(NaiveDate.parseOpt(text), null, text);
  }
});

Deno.test("date-fragment clipping stays within the fragment and midnight shifts retain their sign", async () => {
  const la = await TimezoneRegion.get("America/Los_Angeles" as Tzname);
  const [beforeGap, afterGap] = la.date(day("2026-03-08")).dateFragments();
  const hours = (start: number, end: number, overnight = false) =>
    new TimeOfDay.Range(
      TimeOfDay.fromHms({ hrs: start }),
      TimeOfDay.fromHms({ hrs: end }),
      overnight,
    );
  const before = afterGap.clamp(hours(0, 2));
  assertEquals([before.start.mse, before.end.mse], [
    afterGap.start.mse,
    afterGap.start.mse,
  ]);
  const after = beforeGap.clamp(hours(22, 2, true));
  assertEquals([after.start.mse, after.end.mse], [
    beforeGap.end.mse,
    beforeGap.end.mse,
  ]);
  assertEquals(beforeGap.clamp(hours(1, 3)).duration.toMins, 60);

  const night = hours(22, 2, true);
  assertEquals(
    new DateFragment.Windowed(beforeGap, undefined, night).applyAll().duration
      .toMins,
    0,
  );
  const ordinary = la.date(day("2026-03-09")).dateFragments()[0];
  assertEquals(ordinary.clamp(night).duration.toHrsF, 2);
  assertEquals(
    new DateFragment.Windowed(ordinary, undefined, night).applyAll().duration
      .toHrsF,
    4,
  );
  const partial = new GenericRange<NaiveDateTime | null>(
    null,
    NaiveDateTime.parse("2026-03-08T01:00")!,
  );
  const clipped = new DateFragment.Windowed(afterGap, partial);
  assertEquals(clipped.applyPartialWindow().duration.toMins, 0);
  assertEquals(clipped.applyAll().duration.toMins, 0);

  const saoPaulo = await TimezoneRegion.get("America/Sao_Paulo" as Tzname);
  assertEquals(saoPaulo.date(day("2018-02-17")).shift()?.shift.toMins, -60);
  assertEquals(la.date(day("2026-03-08")).shift()?.shift.toMins, 60);
});
