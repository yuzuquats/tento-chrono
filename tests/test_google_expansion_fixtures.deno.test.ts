import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { DateTime, Recurrence } from "../chrono/mod.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

interface GoogleSeries {
  start: string;
  timezone: string;
  rules: string[];
  window: { start: string; end: string };
}

interface RecordedExpansion {
  google: string[];
  knownDifference?: { reason: string; chrono: string[] };
}

installTimezoneLoader();

const dir = new URL("./fixtures/", import.meta.url).pathname;
Fixtures.load<GoogleSeries, RecordedExpansion>(dir, "google-expansion").run(
  async ({ start, timezone, rules, window }) => {
    const series = (await Recurrence.fromICalendar(rules, {
      profile: "google",
      dtstart: { dateTime: start, timeZone: timezone },
    })).exp();
    const from = DateTime.fromRfc3339(window.start).exp().toUtc();
    const to = DateTime.fromRfc3339(window.end).exp().toUtc();
    assert(from.mse < to.mse, "expected a nonempty query window");
    const end = to.ndt.date;
    const midpoint = from.ndt.date.addDays(
      Math.floor((end.dse - from.ndt.date.dse) / 2),
    );

    const incremental = series.generator();
    return [
      series.occurrences({ through: end }),
      [
        ...incremental.generateUpToDate(midpoint),
        ...incremental.generateUpToDate(end),
      ],
    ].map((events) =>
      events.filter((event) => {
        assert(event instanceof DateTime, "expected a timed occurrence");
        return event.mse >= from.mse && event.mse < to.mse;
      }).map(String)
    );
  },
  ([oneShot, incremental], expected) => {
    assertEquals(
      incremental,
      oneShot,
      "incremental reads must match one-shot generation",
    );
    const known = expected.knownDifference;
    if (known != null) {
      assertNotEquals(
        oneShot,
        expected.google,
        "Google parity restored. Remove the known difference from this fixture.",
      );
      assertEquals(oneShot, known.chrono, known.reason);
    } else {
      assertEquals(oneShot, expected.google);
    }
  },
);
