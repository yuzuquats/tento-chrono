/**
 * Calendar dates, times and partial dates (weeks, months, years).
 *
 *   deno run examples/dates.ts
 */
import { assertEquals } from "@std/assert";
import { NaiveDate, naivedate, naivedatetime, naivetime, PartialDate } from "../chrono/mod.ts";

// --- Dates ------------------------------------------------------------------

const d = naivedate(2024, 1, 31);
assertEquals(d.toString(), "2024-01-31");
assertEquals(d.dayOfWeek.label, "Wed");
assertEquals(d.isoWno, 5);
assertEquals(NaiveDate.parse("2024-02-29").dayOfYear, 60);

// Day arithmetic always lands on a real date.
assertEquals(d.add({ days: 30 }).toString(), "2024-03-01");
assertEquals(d.differenceInDays(naivedate(2024, 12, 25)), -329);

// Month arithmetic keeps the day of month, so it can produce a date that does
// not exist. That is what recurrence rules want (the 31st of every month skips
// February); check it before you use it.
const feb31 = d.addMonths(1);
assertEquals(feb31.toString(), "2024-02-31");
assertEquals(feb31.isValid(), false);

assertEquals(d.toStartOfWeekMon().toString(), "2024-01-29");
assertEquals(d.toStartOfMonth().toString(), "2024-01-01");
assertEquals(d.format(), "Jan 31, 2024");
assertEquals(d.ical(), "20240131");

// --- Times ------------------------------------------------------------------

assertEquals(naivetime(9, 30).toString(), "09:30:00");
assertEquals(naivedatetime(2024, 3, 10, 9, 30).toString(), "2024-03-10T09:30:00");

// --- Partial dates ----------------------------------------------------------
// A partial date names a whole year, month, ISO week or day. Its range is
// half-open: `start` is the first day, `end` the day after the last.

const week = PartialDate.parse("yw-2024-5").exp();
assertEquals(week.toStringReadable(), "Week 5, 2024");
assertEquals(week.start.toString(), "2024-01-29");
assertEquals(week.end.toString(), "2024-02-05");
assertEquals(week.add(1).toString(), "yw-2024-6");

const feb = PartialDate.parse("ym-2024-2").exp();
assertEquals(feb.toRange().numDays(), 29);
// The weeks that start in February 2024.
assertEquals(feb.generateSubPartials("week").map(String), [
  "yw-2024-6",
  "yw-2024-7",
  "yw-2024-8",
  "yw-2024-9",
]);

console.log("dates: ok");
