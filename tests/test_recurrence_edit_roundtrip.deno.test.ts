/**
 * A recurring edit re-serializes the master's rule (`RRule.parseWithRecurrence`
 * → `toRecurrenceArray`); it must not lose what the rule says:
 * - an EXDATE with a TZID (or a VALUE) is written back as it came — its wall
 *   time keeps its zone — and an EXDATE added by the edit goes on a plain line;
 * - a rule re-cut for "this and following" (`carryListsTo`) keeps those
 *   lines, and `splitRdatesAt` gives the series that ends at the cut the
 *   RDATE values before it and the series that starts there the rest.
 */
import { assertEquals } from "@std/assert";
import { DateTime } from "../chrono/datetime.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { IsoDate } from "../chrono/recurrence/iso-date.ts";
import { splitRdatesAt } from "../chrono/recurrence/recurrence.ts";
import { RRule } from "../chrono/recurrence/rrule.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Utc } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

Deno.test("an EXDATE with a TZID is written back as it came; an added EXDATE goes on a plain line", () => {
  const rrule = RRule.parseWithRecurrence([
    "RRULE:FREQ=WEEKLY;COUNT=5",
    "EXDATE;TZID=Europe/London:20260316T160000",
    "EXDATE:20260323T160000Z",
  ]).asOk()!;
  rrule.addExdate(IsoDate.parse("20260330T090000").asOk()!);
  assertEquals(rrule.toRecurrenceArray(), [
    "RRULE:FREQ=WEEKLY;COUNT=5",
    "EXDATE:20260323T160000Z,20260330T090000",
    "EXDATE;TZID=Europe/London:20260316T160000",
  ]);
});

Deno.test("carryListsTo keeps the EXDATE lines (TZID included) and the RDATE lines it is given", () => {
  const rrule = RRule.parseWithRecurrence([
    "RRULE:FREQ=WEEKLY;COUNT=5",
    "EXDATE;TZID=Europe/London:20260316T160000",
    "RDATE:20260318T200000Z",
  ]).asOk()!;
  const cut = new RRule({ freq: rrule.inner.freq, options: { until: IsoDate.parse("20260320T000000Z").asOk()! } });
  rrule.carryListsTo(cut, []);
  assertEquals(cut.toRecurrenceArray(), ["RRULE:FREQ=WEEKLY;UNTIL=20260320T000000Z", "EXDATE;TZID=Europe/London:20260316T160000"]);
});

Deno.test("splitRdatesAt: values before the cut stay, the rest go to the following series; each line keeps its parameters", async () => {
  const la = (await TimezoneRegion.get("America/Los_Angeles" as never))!;
  const start = la.toTz(Utc.parse("2026-03-09T16:00:00Z")!); // 09:00 PDT
  const cut = DateTime.fromRfc3339("2026-03-20T00:00:00Z").asOk()!.toUtc();
  const got = await splitRdatesAt([
    "RDATE:20260318T200000Z,20260325T200000Z",
    "RDATE;TZID=Europe/London:20260319T230000,20260320T010000",
    "RDATE;VALUE=DATE:20260319,20260320", // 09:00 PDT on each day: 16:00Z
    "RDATE:20260319T163000", // floating: 16:30 PDT = 23:30Z on 03-19
  ], cut, start, la);
  assertEquals(got.before, [
    "RDATE:20260318T200000Z",
    "RDATE;TZID=Europe/London:20260319T230000",
    "RDATE;VALUE=DATE:20260319",
    "RDATE:20260319T163000",
  ]);
  assertEquals(got.from, [
    "RDATE:20260325T200000Z",
    "RDATE;TZID=Europe/London:20260320T010000",
    "RDATE;VALUE=DATE:20260320",
  ]);
  void NaiveDate;
});
