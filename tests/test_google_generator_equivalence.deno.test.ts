/**
 * `GoogleEventGenerator` keeps every generated instant across the corpus in
 * `google_generator_corpus.deno.ts` (zones with DST gaps of both sizes and
 * hemispheres; DAILY/WEEKLY/MONTHLY/YEARLY with BYDAY, BYMONTHDAY, BYSETPOS,
 * COUNT, UNTIL, EXDATE, RDATE), generated incrementally. The digests were
 * recorded from the generator as it was before its per-occurrence work was
 * reduced, so a change to any instant fails here. The BYSETPOS rows were
 * re-recorded when BYSETPOS was implemented: before, it was ignored (every
 * weekday instead of the month's last).
 */
import { assertEquals } from "@std/assert";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { Recurrence } from "../chrono/recurrence/recurrence.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Utc } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";
import { caseKey, digest, RULES, STARTS, STEP_DAYS, STEPS, ZONES } from "./google_generator_corpus.deno.ts";

installTimezoneLoader();

Deno.test("google generator: every corpus instant matches the recorded digest", async () => {
  const recorded: Record<string, [number, string]> = JSON.parse(
    await Deno.readTextFile(new URL("./google_generator_equivalence.json", import.meta.url)),
  );
  const mismatched: string[] = [];
  let cases = 0;
  let instants = 0;
  for (const zone of ZONES) for (const start of STARTS) for (const rules of RULES) {
    const parsed = await ICalendar.Raw.parse([...rules]);
    if (parsed.isErr) throw new Error(`corpus rule does not parse: ${rules.join(" ")}`);
    const recurr = new Recurrence(parsed.asOk()!);
    const tz = (await recurr.timezone()) ?? await TimezoneRegion.get(zone as never);
    if (tz == null) throw new Error(`corpus zone has no fixture: ${zone}`);
    const s = Utc.parse(start);
    if (s == null) throw new Error(`corpus start does not parse: ${start}`);
    const gen = await recurr.generateGoogleEvents(tz.toTz(s), tz);
    const mses: number[] = [];
    let end = s.ndt.date;
    for (let i = 0; i < STEPS; i++) {
      end = end.addDays(STEP_DAYS);
      for (const d of gen.generateUpToDate(end)) mses.push(d.mse);
    }
    const key = caseKey(zone, start, rules);
    const got = digest(mses);
    const want = recorded[key];
    if (want == null || want[0] !== got[0] || want[1] !== got[1]) mismatched.push(`${key}: want ${want} got ${got}`);
    cases++;
    instants += mses.length;
  }
  assertEquals(mismatched, []);
  assertEquals(cases, Object.keys(recorded).length);
  // The corpus is not trivially small: it spans several years of occurrences per case.
  if (instants < 50_000) throw new Error(`corpus generated only ${instants} instants`);
});
