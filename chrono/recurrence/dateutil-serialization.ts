import type { NaiveDateTime } from "../naive-datetime.ts";

const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
const SELECTORS = [
  "BYSETPOS", "BYMONTH", "BYMONTHDAY", "BYYEARDAY", "BYWEEKNO", "BYDAY",
  "BYHOUR", "BYMINUTE", "BYSECOND", "BYEASTER",
] as const;

function compareInteger(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}

function formatClock(compact: string): string {
  // The pinned reference's strftime writes unpadded years below 1000
  // and omits timezone and fractional fields.
  return Number(compact.slice(0, 4)) + compact.slice(4, 15);
}

function weekdaySelector(value: string, frequency: string): string {
  const plain = new Set<number>();
  const ordinal = new Map<number, Set<bigint>>();
  for (const token of value.split(",")) {
    const day = WEEKDAYS.indexOf(token.slice(-2));
    if (token.length === 2 || (frequency !== "YEARLY" && frequency !== "MONTHLY")) {
      plain.add(day);
    } else {
      const entries = ordinal.get(day) ?? new Set<bigint>();
      entries.add(BigInt(token.slice(0, -2)));
      ordinal.set(day, entries);
    }
  }
  const tokens: string[] = [];
  for (const [day, weekday] of WEEKDAYS.entries()) {
    if (plain.has(day)) tokens.push(weekday);
  }
  for (const [day, weekday] of WEEKDAYS.entries()) {
    const entries = ordinal.get(day);
    if (entries == null) continue;
    for (const n of [...entries].sort(compareInteger)) tokens.push((n > 0n ? "+" : "") + n + weekday);
  }
  return tokens.join(",");
}

export function serializeDateutilRule(
  parts: ReadonlyMap<string, string>,
  start: NaiveDateTime,
  defaultWeekStart: string,
): string {
  const frequency = parts.get("FREQ")!;
  const interval = BigInt(parts.get("INTERVAL") ?? "1");
  const weekStart = parts.get("WKST") ?? defaultWeekStart;
  const output = ["FREQ=" + frequency];
  if (interval !== 1n) output.push("INTERVAL=" + interval);
  if (weekStart !== "MO") output.push("WKST=" + weekStart);
  const count = parts.get("COUNT");
  if (count != null) output.push("COUNT=" + BigInt(count));
  const until = parts.get("UNTIL");
  if (until != null) output.push("UNTIL=" + formatClock(until));

  for (const [key, value] of dateutilSelectors(parts, start)) output.push(key + "=" + value);
  return "DTSTART:" + formatClock(start.ical()) + "\nRRULE:" + output.join(";");
}

/** The normalized selectors dateutil saves for str() and replace(). */
export function dateutilSelectors(parts: ReadonlyMap<string, string>, start: NaiveDateTime): Map<string, string> {
  const frequency = parts.get("FREQ")!;
  const interval = BigInt(parts.get("INTERVAL") ?? "1");
  const selectors = new Map<string, string>();
  for (const key of SELECTORS) {
    const written = parts.get(key);
    if (written == null || written === "") continue;
    if (key === "BYDAY") {
      selectors.set(key, weekdaySelector(written, frequency));
      continue;
    }
    let values = written.split(",").map(BigInt);
    if (key !== "BYSETPOS") {
      if (key !== "BYEASTER") values = [...new Set(values)];
      values.sort(compareInteger);
    }
    if (key === "BYMONTHDAY") {
      values = [...values.filter((n) => n > 0n), ...values.filter((n) => n < 0n)];
    }
    const clock = key === "BYHOUR" && frequency === "HOURLY" ? [start.time.hrs, 24]
      : key === "BYMINUTE" && frequency === "MINUTELY" ? [start.time.mins, 60]
      : key === "BYSECOND" && frequency === "SECONDLY" ? [start.time.secs, 60]
      : undefined;
    if (clock != null) {
      const [value, base] = clock;
      const stride = gcd(interval, BigInt(base));
      values = values.filter((n) => (n - BigInt(value)) % stride === 0n);
    }
    if (values.length > 0) selectors.set(key, values.join(","));
  }
  return selectors;
}
