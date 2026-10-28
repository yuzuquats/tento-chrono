/**
 * Rule corpus for `GoogleEventGenerator` equivalence (tests/test_google_generator_equivalence.deno.test.ts):
 * every zone x start x rule below, generated incrementally in 31-day steps for 36 steps. The recorded
 * digests (google_generator_equivalence.json) were taken from the generator before the loop-invariant
 * DTSTART wall-time conversion was hoisted out of the per-occurrence loop (tento-chrono, lona-sdk wave 6);
 * any change to a generated instant changes a digest.
 */

/** Zones with spring-forward/fall-back gaps of 30/60 minutes, both hemispheres, and none. */
export const ZONES = [
  "America/Los_Angeles", "America/New_York", "Europe/London", "Australia/Sydney",
  "Asia/Kolkata", "Australia/Lord_Howe", "UTC",
] as const;

/** DTSTARTs (UTC) next to the 2026 transitions, and on a month's 31st. */
export const STARTS = [
  "2026-03-06T09:30:00Z", "2026-03-08T10:30:00Z", "2026-10-31T23:15:00Z",
  "2026-11-01T08:30:00Z", "2026-04-04T15:45:00Z", "2026-01-31T01:00:00Z",
] as const;

/** DAILY/WEEKLY/MONTHLY/YEARLY with BYDAY, BYMONTHDAY, BYSETPOS, COUNT, UNTIL, EXDATE and RDATE. */
export const RULES: readonly (readonly string[])[] = [
  ["RRULE:FREQ=DAILY"],
  ["RRULE:FREQ=DAILY;INTERVAL=3;COUNT=200"],
  ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR"],
  ["RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SU;UNTIL=20280101T000000Z"],
  ["RRULE:FREQ=MONTHLY;BYMONTHDAY=31"],
  ["RRULE:FREQ=MONTHLY;BYDAY=-1FR"],
  ["RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1"],
  ["RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=30"],
  ["RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU"],
  ["RRULE:FREQ=YEARLY"],
  ["RRULE:FREQ=DAILY;UNTIL=20270315"],
  ["RRULE:FREQ=DAILY", "EXDATE:20260310T093000Z,20261102T083000Z"],
  ["RRULE:FREQ=WEEKLY;BYDAY=SA,SU", "EXDATE;VALUE=DATE:20260314,20260315"],
  ["RRULE:FREQ=WEEKLY;COUNT=10", "RDATE:20260401T120000Z"],
];

/** The corpus key of one case. */
export function caseKey(zone: string, start: string, rules: readonly string[]): string {
  return `${zone}|${start}|${rules.join(" ")}`;
}

/** Incremental steps: 36 calls of `generateUpToDate`, 31 days apart. */
export const STEPS = 36;
export const STEP_DAYS = 31;

/** `[count, FNV-1a 32-bit of the comma-joined instants (ms since epoch)]`. */
export function digest(instants: readonly number[]): [number, string] {
  const text = instants.join(",");
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return [instants.length, h.toString(16).padStart(8, "0")];
}
