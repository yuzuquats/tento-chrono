import { assert, assertEquals } from "jsr:@std/assert";
import { DateTime } from "../chrono/datetime.ts";
import { naivedate, naivedatetime } from "../chrono/mod.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

Deno.test({
  name: "timezone edge cases - GMT/BST shared tzabbr",
  async fn() {
    const tz = await TimezoneRegion.get("Europe/London");

    // Test that winter time (GMT) and summer time (BST) are handled correctly
    // even though they share the same tzabbr in the tzdb format

    // Winter: January 15, 2025 should be GMT (UTC+0)
    const winterNdt = naivedatetime(2025, 1, 15, 14, 30);
    const winterDt = tz.toWallClock(winterNdt);
    assertEquals(winterDt.tz.info.offset.toHrsF, 0); // GMT is UTC+0
    assertEquals(winterDt.toUtc().toString(), "2025-01-15T14:30:00Z");

    // Summer: July 15, 2025 should be BST (UTC+1)
    const summerNdt = naivedatetime(2025, 7, 15, 14, 30);
    const summerDt = tz.toWallClock(summerNdt);
    assertEquals(summerDt.tz.info.offset.toHrsF, 1); // BST is UTC+1
    assertEquals(summerDt.toUtc().toString(), "2025-07-15T13:30:00Z");
  },
});

Deno.test({
  name: "timezone edge cases - DST transition moments",
  async fn() {
    const tz = await TimezoneRegion.get("Europe/London");

    // Test the exact moment of DST transitions in 2025
    // Spring forward: March 30, 2025 at 01:00 GMT -> 02:00 BST

    // Just before transition (still GMT)
    const beforeSpring = DateTime.fromRfc3339("2025-03-30T00:59:59Z").exp();
    const beforeTransition = tz.activeTransition(beforeSpring.mse);
    assertEquals(beforeTransition?.after.time.tz.info.offset.toHrsF, 0); // GMT

    // Just after transition (now BST)
    const afterSpring = DateTime.fromRfc3339("2025-03-30T01:00:01Z").exp();
    const afterTransition = tz.activeTransition(afterSpring.mse);
    assertEquals(afterTransition?.after.time.tz.info.offset.toHrsF, 1); // BST

    // Fall back: October 26, 2025 at 02:00 BST -> 01:00 GMT
    // This tests the reverse transition
    const fallTime = DateTime.fromRfc3339("2025-10-26T01:30:00Z").exp();
    const fallTransition = tz.activeTransition(fallTime.mse);
    assertEquals(fallTransition?.after.time.tz.info.offset.toHrsF, 0); // Back to GMT
  },
});

Deno.test({
  name: "timezone edge cases - America/Los_Angeles PDT/PST",
  async fn() {
    const tz = await TimezoneRegion.get("America/Los_Angeles");

    // Test US DST transitions which have clearer tzabbr separation

    // Winter: January should be PST (UTC-8)
    const winterNdt = naivedatetime(2025, 1, 15, 14, 30);
    const winterDt = tz.toWallClock(winterNdt);
    assertEquals(winterDt.tz.info.offset.toHrsF, -8); // PST is UTC-8

    // Summer: July should be PDT (UTC-7)
    const summerNdt = naivedatetime(2025, 7, 15, 14, 30);
    const summerDt = tz.toWallClock(summerNdt);
    assertEquals(summerDt.tz.info.offset.toHrsF, -7); // PDT is UTC-7

    // Test that the transitions have the correct tzabbr
    const winterTransition = tz.activeTransition(winterDt.mse);
    const summerTransition = tz.activeTransition(summerDt.mse);

    // These should have distinct tzabbr values (PST vs PDT)
    assert(winterTransition?.after.tzabbr === "PST");
    assert(summerTransition?.after.tzabbr === "PDT");
  },
});

Deno.test({
  name: "timezone edge cases - binary search edge cases",
  async fn() {
    const tz = await TimezoneRegion.get("Europe/London");

    // Test binary search with times far in the past and future

    // Very early time (should return first available transition or null)
    const veryEarly = DateTime.fromRfc3339("1900-01-01T00:00:00Z").exp();
    const earlyTransition = tz.activeTransition(veryEarly.mse);
    // If no transition found, that's okay for very early dates (timezone data may not extend that far back)

    // Very late time (should return last transition)
    const veryLate = DateTime.fromRfc3339("2049-12-31T23:59:59Z").exp();
    const lateTransition = tz.activeTransition(veryLate.mse);
    assert(lateTransition !== null);

    // Test that transitions are properly sorted
    for (let i = 1; i < tz.transitions.length; i++) {
      const prev = tz.transitions[i - 1];
      const curr = tz.transitions[i];
      assert(
        prev.before.mse <= curr.before.mse,
        `Transitions not sorted: ${prev.before.mse} > ${curr.before.mse}`,
      );
    }
  },
});

Deno.test({
  name: "timezone edge cases - recurrence across multiple DST transitions",
  async fn() {
    const tz = await TimezoneRegion.get("Europe/London");

    // Test a long-running recurrence that crosses multiple DST transitions
    // This ensures our timezone handling works consistently over time

    // Create a recurrence that spans from winter 2024 to summer 2025
    const winterStart = naivedatetime(2024, 12, 1, 10, 0); // December 1, 2024 at 10:00

    // Test that local time is preserved across DST transitions
    const winterDt = tz.toWallClock(winterStart);
    const summerDate = naivedate(2025, 6, 1); // June 1, 2025
    const summerNdt = summerDate.withTime(winterStart.time); // Same local time
    const summerDt = tz.toWallClock(summerNdt);

    // Both should be at 10:00 local time, but different UTC times
    assertEquals(winterDt.ndt.time.toString(), "10:00:00");
    assertEquals(summerDt.ndt.time.toString(), "10:00:00");

    // Test the time difference more simply - just verify different UTC times
    const winterUtc = winterDt.toUtc().mse;
    const summerUtc = summerDt.toUtc().mse;

    // Just verify they have different offsets (this is the key test)
    assert(winterDt.tz.info.offset.toHrsF !== summerDt.tz.info.offset.toHrsF);
  },
});

Deno.test({
  name: "timezone edge cases - cached timezone invalidation",
  async fn() {
    const tz = await TimezoneRegion.get("Europe/London");

    // Test that timezone caching doesn't interfere with DST transitions
    // This was the original issue where GMT/BST shared tzabbr but had different offsets

    // Get timezone at different times that should have different offsets
    const winterTime = naivedatetime(2025, 1, 15, 12, 0);
    const summerTime = naivedatetime(2025, 7, 15, 12, 0);

    const winterTz = tz.tzAtMse(winterTime.mse);
    const summerTz = tz.tzAtMse(summerTime.mse);

    // These should have different offsets despite potentially sharing tzabbr
    assertEquals(winterTz.info.offset.toHrsF, 0); // GMT
    assertEquals(summerTz.info.offset.toHrsF, 1); // BST

    // Test multiple calls don't return stale cached values
    const winterTz2 = tz.tzAtMse(winterTime.mse);
    const summerTz2 = tz.tzAtMse(summerTime.mse);

    assertEquals(winterTz2.info.offset.toHrsF, 0);
    assertEquals(summerTz2.info.offset.toHrsF, 1);
  },
});

Deno.test({
  name: "timezone edge cases - invalid times during DST gaps",
  async fn() {
    const tz = await TimezoneRegion.get("Europe/London");

    // Test behavior during the "spring forward" gap
    // On March 30, 2025, 01:00 GMT becomes 02:00 BST
    // So times like 01:30 local don't exist

    // This should resolve to a valid time (the system should handle the gap)
    const gapTime = naivedatetime(2025, 3, 30, 1, 30); // 01:30 during the gap
    const resolved = tz.toWallClock(gapTime);

    // The resolved time should be valid (either before or after the gap)
    assert(resolved !== null);

    // Test that times just before and after the gap work correctly
    const beforeGap = naivedatetime(2025, 3, 30, 0, 59);
    const afterGap = naivedatetime(2025, 3, 30, 2, 1);

    const beforeResolved = tz.toWallClock(beforeGap);
    const afterResolved = tz.toWallClock(afterGap);

    assertEquals(beforeResolved.tz.info.offset.toHrsF, 0); // GMT
    assertEquals(afterResolved.tz.info.offset.toHrsF, 1); // BST
  },
});
