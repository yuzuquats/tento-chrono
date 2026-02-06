import { assertEquals, assertNotEquals } from "@std/assert";
import { DateTimeRegion } from "../chrono/date-time-region.ts";
import { NaiveDateTime } from "../chrono/naive-datetime.ts";
import { naivedatetime } from "../chrono/mod.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Tzname } from "../chrono/timezone.ts";

// Use local file loader for testing
const TZ_DATA_PATH =
  "/home/james/mono/container_data/tento-tz/2025a/1900_2050";

TimezoneRegion.setLoader({
  load: async (tzname: Tzname) => {
    const filename = tzname.replaceAll("/", "~") + ".json";
    const data = await Deno.readTextFile(`${TZ_DATA_PATH}/${filename}`);
    const json = JSON.parse(data);
    return json.map((s: TimezoneRegion.Transition.Serialized) =>
      TimezoneRegion.Transition.parse(s, tzname)
    );
  },
});

/**
 * Tests for DateTimeRegion.asUtcTp() vs asWallClock() behavior.
 *
 * This documents a BUG in `asUtcTp()`:
 * - asUtcTp() treats the naive datetime as if it were already in UTC
 * - asWallClock() correctly interprets the naive datetime as wall-clock time
 *
 * For February 5, 2026 at midnight in America/Los_Angeles (PST, UTC-8):
 * - CORRECT (asWallClock): Feb 5 midnight PST = Feb 5, 08:00:00Z
 * - WRONG (asUtcTp): Treats Feb 5 midnight as UTC, converts to PST = Feb 4, 16:00:00Z (4PM UTC)
 */

Deno.test({
  name: "DateTimeRegion - asUtcTp vs asWallClock - Feb 5 midnight PST",
  async fn() {
    const tz = await TimezoneRegion.get("America/Los_Angeles");

    // February 5, 2026 at midnight local time
    const ndt = naivedatetime(2026, 2, 5, 0, 0);
    const dtr = new DateTimeRegion(ndt, tz);

    const asUtcTp = dtr.asUtcTp();
    const asWallClock = dtr.asWallClock();

    console.log("Input: Feb 5, 2026 00:00 in America/Los_Angeles (PST, UTC-8)");
    console.log("asUtcTp().toUtc():", asUtcTp.toUtc().toString());
    console.log("asWallClock().toUtc():", asWallClock.toUtc().toString());

    // asWallClock is CORRECT:
    // Feb 5, 2026 00:00 PST = Feb 5, 2026 08:00:00Z
    assertEquals(
      asWallClock.toUtc().toString(),
      "2026-02-05T08:00:00Z",
      "asWallClock should correctly interpret midnight PST as 8AM UTC",
    );

    // asUtcTp is WRONG:
    // It treats "2026-02-05T00:00" as UTC, then "converts" to PST
    // Feb 5, 2026 00:00 UTC converted to "PST timezone" = Feb 4, 2026 16:00:00 PST
    // But since it stores the offset, when converted back to UTC it's Feb 4, 2026 16:00 UTC... wait no
    // Let's see what it actually produces

    // BUG DEMONSTRATION: These should be equal for correct behavior
    // If asUtcTp had the same semantics as asWallClock, they'd match
    assertNotEquals(
      asUtcTp.toUtc().toString(),
      asWallClock.toUtc().toString(),
      "BUG: asUtcTp and asWallClock produce different results - asUtcTp is wrong",
    );
  },
});

Deno.test({
  name: "DateTimeRegion - asUtcTp vs asWallClock - during DST (PDT)",
  async fn() {
    const tz = await TimezoneRegion.get("America/Los_Angeles");

    // July 15, 2025 at 10:00 AM PDT (daylight saving time, UTC-7)
    const ndt = naivedatetime(2025, 7, 15, 10, 0);
    const dtr = new DateTimeRegion(ndt, tz);

    const asUtcTp = dtr.asUtcTp();
    const asWallClock = dtr.asWallClock();

    console.log("\nInput: July 15, 2025 10:00 in America/Los_Angeles (PDT, UTC-7)");
    console.log("asUtcTp().toUtc():", asUtcTp.toUtc().toString());
    console.log("asWallClock().toUtc():", asWallClock.toUtc().toString());

    // asWallClock is CORRECT:
    // July 15, 2025 10:00 PDT = July 15, 2025 17:00:00Z
    assertEquals(
      asWallClock.toUtc().toString(),
      "2025-07-15T17:00:00Z",
      "asWallClock should correctly interpret 10AM PDT as 5PM UTC",
    );

    // BUG: asUtcTp produces different result
    assertNotEquals(
      asUtcTp.toUtc().toString(),
      asWallClock.toUtc().toString(),
      "BUG: asUtcTp and asWallClock produce different results",
    );
  },
});

Deno.test({
  name: "DateTimeRegion - what asUtcTp actually does",
  async fn() {
    const tz = await TimezoneRegion.get("America/Los_Angeles");

    // February 5, 2026 at midnight local time
    const ndt = naivedatetime(2026, 2, 5, 0, 0);
    const dtr = new DateTimeRegion(ndt, tz);

    const asUtcTp = dtr.asUtcTp();

    // asUtcTp treats the naive datetime as UTC, then finds the offset at that UTC instant
    // 2026-02-05T00:00:00 as UTC
    // At that UTC instant, LA is UTC-8 (PST)
    // So it creates a DateTime with that offset

    console.log("\nDemonstrating asUtcTp behavior:");
    console.log("Input naive datetime:", ndt.toString());
    console.log("asUtcTp result:", asUtcTp.toString());
    console.log("asUtcTp.toUtc():", asUtcTp.toUtc().toString());
    console.log("asUtcTp.tz.info.offset:", asUtcTp.tz.info.offset.toHrsF);

    // The asUtcTp() method does:
    // 1. Creates DateTime(ndt, Utc) - treats "2026-02-05T00:00" as UTC timestamp
    // 2. Calls tz.toTz() on that - converts UTC to local timezone
    // Result: Feb 4, 2026 16:00:00 PST (which is Feb 5, 00:00:00 UTC)
    //
    // When we call .toUtc() on that, we get back Feb 5, 00:00:00 UTC
    // So asUtcTp().toUtc() returns the original naive datetime interpreted as UTC!

    assertEquals(
      asUtcTp.toUtc().toString(),
      "2026-02-05T00:00:00Z",
      "asUtcTp().toUtc() returns the naive datetime as if it were UTC (this is the bug!)",
    );
  },
});

/**
 * Tests verifying that the old recurrence code pattern and the new pattern are equivalent.
 *
 * Old pattern (event-item.ts before refactor):
 *   const start = (timezone ?? TimezoneRegion.UTC)
 *     .datetime(this.inner.st!.toUtc().ndt)
 *     .asUtcTp();
 *
 * New pattern (event-item.ts after refactor):
 *   const start = (timezone ?? TimezoneRegion.UTC).toTz(this.inner.st!.toUtc());
 *
 * These are equivalent because when the NaiveDateTime came from a UTC DateTime's .ndt,
 * asUtcTp() correctly interprets it as UTC (since it actually IS UTC).
 */

Deno.test({
  name: "Recurrence pattern equivalence - standard time (PST)",
  async fn() {
    const tz = await TimezoneRegion.get("America/Los_Angeles");
    const { DateTime } = await import("../chrono/datetime.ts");

    // Simulate an event stored in UTC: Feb 5, 2026 at 17:00 UTC
    const eventUtc = DateTime.fromRfc3339("2026-02-05T17:00:00Z").exp();

    // Old pattern: tz.datetime(eventUtc.toUtc().ndt).asUtcTp()
    const oldPattern = tz.datetime(eventUtc.toUtc().ndt).asUtcTp();

    // New pattern: tz.toTz(eventUtc.toUtc())
    const newPattern = tz.toTz(eventUtc.toUtc());

    console.log("\nRecurrence pattern equivalence (PST):");
    console.log("Input UTC:", eventUtc.toString());
    console.log("Old pattern result:", oldPattern.toString());
    console.log("New pattern result:", newPattern.toString());

    // Both should produce the same result
    assertEquals(
      oldPattern.toString(),
      newPattern.toString(),
      "Old and new patterns should produce identical results",
    );

    // Both should be 9:00 AM PST (17:00 UTC - 8 hours)
    assertEquals(
      oldPattern.toString(),
      "2026-02-05T09:00:00-08:00",
      "Should be 9 AM PST",
    );
  },
});

Deno.test({
  name: "Recurrence pattern equivalence - daylight saving time (PDT)",
  async fn() {
    const tz = await TimezoneRegion.get("America/Los_Angeles");
    const { DateTime } = await import("../chrono/datetime.ts");

    // Simulate an event stored in UTC: July 15, 2025 at 17:00 UTC (during PDT)
    const eventUtc = DateTime.fromRfc3339("2025-07-15T17:00:00Z").exp();

    // Old pattern: tz.datetime(eventUtc.toUtc().ndt).asUtcTp()
    const oldPattern = tz.datetime(eventUtc.toUtc().ndt).asUtcTp();

    // New pattern: tz.toTz(eventUtc.toUtc())
    const newPattern = tz.toTz(eventUtc.toUtc());

    console.log("\nRecurrence pattern equivalence (PDT):");
    console.log("Input UTC:", eventUtc.toString());
    console.log("Old pattern result:", oldPattern.toString());
    console.log("New pattern result:", newPattern.toString());

    // Both should produce the same result
    assertEquals(
      oldPattern.toString(),
      newPattern.toString(),
      "Old and new patterns should produce identical results",
    );

    // Both should be 10:00 AM PDT (17:00 UTC - 7 hours)
    assertEquals(
      oldPattern.toString(),
      "2025-07-15T10:00:00-07:00",
      "Should be 10 AM PDT",
    );
  },
});

Deno.test({
  name: "Recurrence pattern equivalence - around DST transition",
  async fn() {
    const tz = await TimezoneRegion.get("America/Los_Angeles");
    const { DateTime } = await import("../chrono/datetime.ts");

    // March 9, 2025 at 10:30 UTC - this is AFTER the spring forward transition
    // DST transition: March 9, 2025 at 2:00 AM PST -> 3:00 AM PDT (10:00 UTC)
    const eventUtc = DateTime.fromRfc3339("2025-03-09T10:30:00Z").exp();

    // Old pattern
    const oldPattern = tz.datetime(eventUtc.toUtc().ndt).asUtcTp();

    // New pattern
    const newPattern = tz.toTz(eventUtc.toUtc());

    console.log("\nRecurrence pattern equivalence (around DST):");
    console.log("Input UTC:", eventUtc.toString());
    console.log("Old pattern result:", oldPattern.toString());
    console.log("New pattern result:", newPattern.toString());

    // Both should produce the same result
    assertEquals(
      oldPattern.toString(),
      newPattern.toString(),
      "Old and new patterns should produce identical results around DST",
    );

    // 10:30 UTC on March 9 is 3:30 AM PDT (after spring forward)
    assertEquals(
      oldPattern.toString(),
      "2025-03-09T03:30:00-07:00",
      "Should be 3:30 AM PDT (after spring forward)",
    );
  },
});

Deno.test({
  name: "Recurrence pattern equivalence - with UTC timezone",
  async fn() {
    const tz = TimezoneRegion.UTC;
    const { DateTime } = await import("../chrono/datetime.ts");

    // Event in UTC
    const eventUtc = DateTime.fromRfc3339("2026-02-05T17:00:00Z").exp();

    // Old pattern with UTC timezone
    const oldPattern = tz.datetime(eventUtc.toUtc().ndt).asUtcTp();

    // New pattern with UTC timezone
    const newPattern = tz.toTz(eventUtc.toUtc());

    console.log("\nRecurrence pattern equivalence (UTC):");
    console.log("Input UTC:", eventUtc.toString());
    console.log("Old pattern result:", oldPattern.toString());
    console.log("New pattern result:", newPattern.toString());

    // Both should produce the same result
    assertEquals(
      oldPattern.toString(),
      newPattern.toString(),
      "Old and new patterns should produce identical results with UTC timezone",
    );
  },
});
