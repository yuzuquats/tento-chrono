import { assertEquals } from "@std/assert";

import { DateTime } from "../chrono/datetime.ts";
import { DateTimeRegion } from "../chrono/date-time-region.ts";
import { naivedatetime } from "../chrono/mod.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Tzname } from "../chrono/timezone.ts";

/**
 * The FRAME contract behind the calendar's "form follow" bug (task #22).
 *
 * A calendar column hands gestures a day start framed in the COLUMN's zone
 * (`DateFragment.start` is a `DateTime<FixedOffset>`). Every range a gesture
 * publishes must be CONVERTED to UTC before it reaches a display surface,
 * because the display conversion — `DateTimeRegion.Range.fromSingleTz`, which
 * calls `TimezoneRegion.toTz` → `dt.asUtc()` — RE-TAGS its input as UTC rather
 * than converting it. Feed it a column-local wall clock and the rendered time
 * slides by the UTC offset: 10:15 PDT renders as 3:15 am.
 *
 * These tests pin both halves so the seam cannot regress silently.
 */

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

Deno.test({
  name: "frame — TimezoneRegion.toTz re-tags a column-local DateTime",
  fn() {
    const tz = losAngeles();
    const local = draggedEndLocal(tz);

    assertEquals(local.time.hrs, 10, "the drag lands at 10:15 local");
    assertEquals(local.tz.info.offset.toHrsF, -7, "the column column is PDT");

    // Converted first: the display agrees with the drag.
    const converted = tz.toTz(local.toUtc());
    assertEquals(converted.time.hrs, 10);
    assertEquals(converted.time.mins, 15);

    // Handed over local: `toTz` re-tags 10:15 as UTC and then converts to
    // PDT — the reported "3:15 am".
    const retagged = tz.toTz(local);
    assertEquals(retagged.time.hrs, 3);
    assertEquals(retagged.time.mins, 15);
  },
});

Deno.test({
  name: "frame — the form's end time follows a resize only when framed UTC",
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

    // What the un-migrated resize published: a UTC-framed anchor beside a
    // column-local moving edge. Only the END is corrupted — exactly the
    // reported shape (start reads 10:00, end reads 3:15 am).
    const corrupted = DateTimeRegion.Range.fromSingleTz(
      new DateTime.Range(anchor, local.asUtc()),
      tz,
    );
    assertEquals(corrupted.start.ndt.time.hrs, 10, "start stays correct");
    assertEquals(corrupted.end.ndt.time.hrs, 3, "end slides by the offset");
    assertEquals(corrupted.end.ndt.time.mins, 15);
  },
});
