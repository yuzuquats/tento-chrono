import { assertEquals } from "@std/assert";

import { DateTime } from "../chrono/datetime.ts";
import { DateTimeRegion } from "../chrono/date-time-region.ts";
import { naivedatetime } from "../chrono/mod.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Tzname } from "../chrono/timezone.ts";

// Calendar gestures resolve the moving edge in the column's timezone. Region
// conversion must preserve that instant through the display and form paths.

const LOS_ANGELES = "America/Los_Angeles" as Tzname;

/** A hermetic America/Los_Angeles region (no loader, no network): one
 *  spring-forward transition, so any instant after it resolves to PDT
 *  (UTC-07:00). Enough for a September 2027 calendar column. */
function losAngeles(): TimezoneRegion {
  return new TimezoneRegion(LOS_ANGELES, [
    TimezoneRegion.Transition.parse(
      {
        before: "2027-03-14T01:59:59-08:00",
        before_tz_abbr: "PST",
        after: "2027-03-14T03:00:00-07:00",
        after_tz_abbr: "PDT",
      },
      LOS_ANGELES,
    ),
  ]);
}

/** The column-local 10:15 the operator drags a resize handle to. */
function draggedEndLocal(tz: TimezoneRegion): DateTime<string> {
  const dayStart = tz.toWallClock(naivedatetime(2027, 9, 20, 0, 0));
  return dayStart.add({ hrs: 10, mins: 15 });
}

Deno.test("frame — region conversion preserves the calendar drag instant", () => {
  const tz = losAngeles();
  const local = draggedEndLocal(tz);

  const regional = tz.toTz(local);
  assertEquals(regional.rfc3339(), "2027-09-20T10:15:00-07:00");
  assertEquals(regional.mse, local.mse);
  assertEquals(tz.toTz(local.toUtc()).mse, local.mse);
  assertEquals(TimezoneRegion.UTC.toTz(local).toUtc().rfc3339(), "2027-09-20T17:15:00Z");
});

Deno.test("frame — region conversion selects the offset at the original instant", () => {
  const name = "America/New_York" as Tzname;
  const tz = new TimezoneRegion(name, [
    TimezoneRegion.Transition.parse({
      before: "2025-03-09T02:00:00-05:00",
      before_tz_abbr: "EST",
      after: "2025-03-09T03:00:00-04:00",
      after_tz_abbr: "EDT",
    }, name),
    TimezoneRegion.Transition.parse({
      before: "2025-11-02T02:00:00-04:00",
      before_tz_abbr: "EDT",
      after: "2025-11-02T01:00:00-05:00",
      after_tz_abbr: "EST",
    }, name),
  ]);

  // The Los Angeles source clocks read 22:30 and 23:30 on the previous date.
  const first = DateTime.fromRfc3339("2025-11-01T22:30:00-07:00").exp();
  const second = DateTime.fromRfc3339("2025-11-01T23:30:00-07:00").exp();
  assertEquals(tz.toTz(first).rfc3339(), "2025-11-02T01:30:00-04:00");
  assertEquals(tz.toTz(second).rfc3339(), "2025-11-02T01:30:00-05:00");
  assertEquals(tz.toTz(first).mse, first.mse);
  assertEquals(tz.toTz(second).mse, second.mse);
});

Deno.test({
  name: "frame — the form's end time follows a resize after UTC conversion",
  fn() {
    const tz = losAngeles();
    const local = draggedEndLocal(tz);
    const anchor = tz.toWallClock(naivedatetime(2027, 9, 20, 10, 0)).toUtc();

    // What a gesture must publish: both edges converted to UTC.
    const displayed = DateTimeRegion.Range.fromSingleTz(
      new DateTime.Range(anchor, local.toUtc()),
      tz,
    );
    assertEquals(displayed.start.ndt.time.hrs, 10);
    assertEquals(displayed.start.ndt.time.mins, 0);
    assertEquals(displayed.end.ndt.time.hrs, 10, "end follows the drag");
    assertEquals(displayed.end.ndt.time.mins, 15);

    // Explicitly reinterpreting the moving edge as UTC changes its instant.
    // A subsequent display conversion correctly shows that different instant.
    const corrupted = DateTimeRegion.Range.fromSingleTz(
      new DateTime.Range(anchor, local.asUtc()),
      tz,
    );
    assertEquals(corrupted.start.ndt.time.hrs, 10, "start stays correct");
    assertEquals(corrupted.end.ndt.time.hrs, 3, "end slides by the offset");
    assertEquals(corrupted.end.ndt.time.mins, 15);
  },
});
