/**
 * # toWallClock
 *
 * ## Invariants Tested
 * - Normal dates (no DST) resolve with correct offset
 * - Same date, different times produce the same offset (cache hit)
 * - Spring-forward: before/in-gap/after transition use correct offsets
 * - Fall-back: before/after overlap use correct offsets
 * - UTC produces "Z" offset with no transitions
 * - Consecutive days use independent cache entries
 *
 * ## Notes
 * Requires installTimezoneLoader() for timezone database access.
 * DST dates are for America/Los_Angeles (US Pacific):
 *   Spring forward: 2nd Sunday of March (2026-03-08, 2:00 AM → 3:00 AM)
 *   Fall back: 1st Sunday of November (2026-11-01, 2:00 AM → 1:00 AM)
 */
import { assertEquals } from "jsr:@std/assert";
import { installTimezoneLoader } from "../utils.deno.ts";
import { NaiveDate, NaiveDateTime, NaiveTime, TimezoneRegion } from "@tento-chrono";
import { Fixtures } from "../fixture-runner.ts";

installTimezoneLoader();

type Input = {
  tz: string;
  date?: string;
  time?: string;
  times?: string[];
  dates?: { date: string; time: string }[];
};

type Expected = {
  offset?: string;
  rfc3339?: string;
  allOffset?: string;
};

function parseTime(s: string): NaiveTime {
  const [h, m, sec] = s.split(":").map(Number);
  return NaiveTime.wrap({ hrs: h, mins: m, secs: sec });
}

function makeNdt(date: string, time: string): NaiveDateTime {
  return new NaiveDateTime(NaiveDate.parse(date), parseTime(time));
}

Fixtures.load<Input, Expected>(
  new URL(".", import.meta.url).pathname,
  "wall-clock",
).run(
  async (input) => {
    const tz = input.tz === "UTC"
      ? TimezoneRegion.UTC
      : await TimezoneRegion.get(input.tz);

    // Multi-time case: same date, multiple times
    if (input.times) {
      return input.times.map((t) => {
        const ndt = makeNdt(input.date!, t);
        return tz.toWallClock(ndt);
      });
    }

    // Multi-date case
    if (input.dates) {
      return input.dates.map((d) => {
        const ndt = makeNdt(d.date, d.time);
        return tz.toWallClock(ndt);
      });
    }

    // Single case
    const ndt = makeNdt(input.date!, input.time!);
    return tz.toWallClock(ndt);
  },
  (result, expected) => {
    if (Array.isArray(result)) {
      if (expected.allOffset) {
        for (const r of result) {
          assertEquals(r.tz.rfc3339, expected.allOffset);
        }
      }
      return;
    }

    if (expected.offset) {
      assertEquals(result.tz.rfc3339, expected.offset);
    }
    if (expected.rfc3339) {
      assertEquals(result.rfc3339(), expected.rfc3339);
    }
  },
);
