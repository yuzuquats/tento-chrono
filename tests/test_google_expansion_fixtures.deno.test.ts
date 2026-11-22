import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { DateTime, Recurrence, TimezoneRegion, Tzname } from "../chrono/mod.ts";
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
    const name = Tzname.parseOpt(timezone);
    assert(name != null, "invalid zone for Google master: " + timezone);
    const tz = await TimezoneRegion.getOpt(name);
    assert(tz != null, "missing zone for Google master: " + timezone);
    const recurrence = (await Recurrence.parse(rules)).exp();
    const startWall = tz.toTz(DateTime.fromRfc3339(start).exp());
    const from = DateTime.fromRfc3339(window.start).exp().toUtc();
    const to = DateTime.fromRfc3339(window.end).exp().toUtc();
    assert(from.mse < to.mse, "expected a nonempty query window");
    const end = to.ndt.date;
    const midpoint = from.ndt.date.addDays(
      Math.floor((end.dse - from.ndt.date.dse) / 2),
    );

    const oneShot = await recurrence.generateGoogleEvents(startWall, tz);
    const incremental = await recurrence.generateGoogleEvents(startWall, tz);
    return [
      oneShot.generateUpToDate(end),
      [
        ...incremental.generateUpToDate(midpoint),
        ...incremental.generateUpToDate(end),
      ],
    ].map((events) =>
      events.filter((event) => event.mse >= from.mse && event.mse < to.mse)
        .map((event) => event.toString())
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
