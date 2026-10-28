/**
 * Instants, fixed offsets and IANA timezones with daylight-saving rules.
 *
 *   deno run examples/timezones.ts
 */
import { assertEquals } from "@std/assert";
import {
  DateTime,
  Duration,
  FixedTimezone,
  naivedatetime,
  TimezoneRegion,
  Tzname,
  Utc,
} from "../chrono/mod.ts";

// --- Instants and fixed offsets ---------------------------------------------

const launch = DateTime.fromRfc3339("2024-07-04T12:00:00-04:00").exp();
assertEquals(launch.toUtc().toString(), "2024-07-04T16:00:00Z");

const ist = new FixedTimezone("IST", {
  tzabbr: "IST",
  tzname: "Asia/Kolkata" as Tzname,
  offset: Duration.Time.from({ hrs: 5, mins: 30 }),
});
assertEquals(launch.toTz(ist).toString(), "2024-07-04T21:30:00+05:30");
assertEquals(launch.toTz(ist).eq(launch), true); // same instant, different wall clock

// --- Timezone regions -------------------------------------------------------
// A TimezoneRegion knows every offset transition of an IANA zone. By default
// regions are built from the platform's own timezone data (Intl), with no
// network access; `TimezoneRegion.setLoader` installs another source.

const ny = await TimezoneRegion.get("America/New_York" as Tzname);
if (ny == null) throw new Error("America/New_York did not load");

// Wall-clock times resolve to the offset in force on that date.
const winter = ny.datetime(naivedatetime(2024, 1, 15, 9, 0)).asWallClock();
const summer = ny.datetime(naivedatetime(2024, 7, 15, 9, 0)).asWallClock();
assertEquals(winter.toString(), "2024-01-15T09:00:00-05:00");
assertEquals(summer.toString(), "2024-07-15T09:00:00-04:00");

// 2024-03-10 is 23 hours long in New York: clocks skip from 02:00 to 03:00.
const before = ny.datetime(naivedatetime(2024, 3, 9, 12, 0)).asWallClock();
const after = ny.datetime(naivedatetime(2024, 3, 10, 12, 0)).asWallClock();
assertEquals(after.durationSince(before).toHrs, 23);

// And an instant converts to the zone's wall clock.
const utcNoon = Utc.parse("2024-11-03T12:00:00Z");
if (utcNoon == null) throw new Error("does not parse");
assertEquals(ny.toTz(utcNoon).toString(), "2024-11-03T07:00:00-05:00");

console.log("timezones: ok");
