/**
 * Recurring events: RFC 5545 RRULE / EXDATE / RDATE lines.
 *
 *   deno run examples/recurrence.ts
 */
import { assertEquals } from "@std/assert";
import { naivedate, Recurrence, RRule, TimezoneRegion, Tzname, Utc } from "../chrono/mod.ts";

// --- A rule on its own ------------------------------------------------------

const rule = RRule.parse("FREQ=MONTHLY;BYMONTHDAY=31;COUNT=4").exp();
assertEquals(rule.toReadableDisplay(), "Monthly on day 31, 4 times");

// --- Dates of a series ------------------------------------------------------
// The 31st of every month: months without one are skipped, and the EXDATE
// removes March.
const monthly = (await Recurrence.parse([
  "DTSTART;VALUE=DATE:20240131",
  "RRULE:FREQ=MONTHLY;BYMONTHDAY=31;COUNT=4",
  "EXDATE;VALUE=DATE:20240331",
])).exp();
assertEquals([...monthly.generate()].map(String), ["2024-01-31", "2024-05-31", "2024-07-31"]);

// --- Instants of a timed series ---------------------------------------------
// Every Monday at 09:00 in Los Angeles. The wall-clock time stays 09:00 across
// the March daylight-saving change, so the UTC instant moves by an hour.
const la = await TimezoneRegion.get("America/Los_Angeles" as Tzname);
if (la == null) throw new Error("America/Los_Angeles did not load");
const start = Utc.parse("2024-03-04T17:00:00Z"); // Monday 09:00 PST
if (start == null) throw new Error("does not parse");

const weekly = (await Recurrence.parse(["RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3"])).exp();
const events = await weekly.generateGoogleEvents(la.toTz(start), la);
const instants = events.generateUpToDate(naivedate(2024, 12, 31));
assertEquals(instants.map((e) => e.jsdate().toISOString()), [
  "2024-03-04T17:00:00.000Z", // 09:00 PST
  "2024-03-11T16:00:00.000Z", // 09:00 PDT
  "2024-03-18T16:00:00.000Z",
]);

console.log("recurrence: ok");
