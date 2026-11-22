import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import {
  DateTime,
  NaiveDate,
  Recurrence,
  RecurrenceOccurrence,
} from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

interface GoogleSeries {
  start: string;
  timezone?: string;
  rules: string[];
  window: { start: string; end: string };
}

type RecordedExpansion = { google: string[] } | {
  error: string;
  googleHttpStatus: number;
};

installTimezoneLoader();

const dir = new URL("./fixtures/", import.meta.url).pathname;
Fixtures.load<GoogleSeries, RecordedExpansion>(dir, "google-expansion").run(
  async ({ start, timezone, rules, window }) => {
    const allDay = !start.includes("T");
    const parsed = await Recurrence.fromICalendar(rules, {
      profile: "google",
      dtstart: allDay
        ? { date: start }
        : { dateTime: start, timeZone: timezone },
    });
    if (parsed.isErr) return { error: parsed.asErr()!.message };

    const series = parsed.exp();
    const from = DateTime.fromRfc3339(window.start).exp().toUtc();
    const to = DateTime.fromRfc3339(window.end).exp().toUtc();
    assert(from.mse < to.mse, "expected a nonempty query window");
    const fromDay = allDay
      ? NaiveDate.parse(window.start.slice(0, 10))
      : from.ndt.date;
    const end = allDay
      ? NaiveDate.parse(window.end.slice(0, 10)).addDays(-1)
      : to.ndt.date;
    const midpoint = fromDay.addDays(Math.floor((end.dse - fromDay.dse) / 2));

    const inWindow = (event: RecurrenceOccurrence) => {
      if (allDay) {
        const day = NaiveDate.parse(String(event));
        return day.dse >= fromDay.dse && day.dse <= end.dse;
      }
      assert(event instanceof DateTime, "expected a timed occurrence");
      return event.mse >= from.mse && event.mse < to.mse;
    };
    const incremental = series.generator();
    const oneShot = series.occurrences({ through: end }).filter(inWindow).map(
      String,
    );
    assertEquals(
      [
        ...incremental.generateUpToDate(midpoint),
        ...incremental.generateUpToDate(end),
      ].filter(inWindow).map(String),
      oneShot,
      "incremental reads must match one-shot generation",
    );
    return oneShot;
  },
  (actual, expected, name) => {
    if ("google" in expected) {
      assertEquals(actual, expected.google, name);
    } else {
      assertEquals(expected.googleHttpStatus, 400, name);
      assert(!Array.isArray(actual), name);
      assertStringIncludes(actual.error, expected.error, name);
    }
  },
);
