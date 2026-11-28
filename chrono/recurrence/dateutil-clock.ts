import type { NaiveDateTime } from "../naive-datetime.ts";
import type { NaiveTime } from "../naive-time.ts";
import { Time } from "../time.ts";
import { RecurrenceExpansionLimitError } from "./generation-limit.ts";
import type { RRuleLike } from "./rrule.ts";

function gcd(a: number, b: number): number {
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return Math.abs(a);
}

type ClockField = "byhour" | "byminute" | "bysecond";

function clockSelector(
  { freq, options }: RRuleLike,
  start: NaiveTime,
) {
  const field = freq === "hourly"
    ? "byhour"
    : freq === "minutely"
    ? "byminute"
    : freq === "secondly"
    ? "bysecond"
    : undefined;
  if (field == null) return;
  const base = field === "byhour" ? 24 : 60;
  const value = field === "byhour"
    ? start.hrs
    : field === "byminute"
    ? start.mins
    : start.secs;
  return {
    entries: options?.[field],
    exact: options?.dateutilClockIntegers?.[field],
    value,
    base,
  };
}

function clockIntegerError(value: bigint): string | undefined {
  if (value < -(1n << 63n) || value >= 1n << 63n) {
    return "Python int too large to convert to C long";
  }
  if (value < -(1n << 31n)) return "signed integer is less than minimum";
  if (value >= 1n << 31n) return "signed integer is greater than maximum";
}

export function validateDateutilExpandedClock(
  { freq, options }: RRuleLike,
): void {
  if (freq === "secondly") return;
  const fields: [ClockField, string, bigint][] = [];
  if (freq !== "minutely" && freq !== "hourly") {
    fields.push(["byhour", "hour", 23n]);
  }
  if (freq !== "minutely") fields.push(["byminute", "minute", 59n]);
  fields.push(["bysecond", "second", 59n]);

  const choices = fields.map(([field, , max]) => {
    const entries = options?.dateutilClockIntegers?.[field] ??
      options?.[field] ?? [];
    let first: bigint | undefined;
    let invalid: bigint | undefined;
    for (const raw of entries) {
      const value = BigInt(raw);
      if (first == null || value < first) first = value;
      if ((value < 0n || value > max) && (invalid == null || value < invalid)) {
        invalid = value;
      }
    }
    return { first: first ?? 0n, invalid };
  });
  // Walk the first invalid tuple in the ordered Cartesian product.
  // CPython converts all arguments to ints before checking clock ranges.
  const tuple = choices.map(({ first }) => first);
  if (choices.every(({ first, invalid }) => first !== invalid)) {
    const index = choices.findLastIndex(({ invalid }) => invalid != null);
    if (index === -1) return;
    tuple[index] = choices[index].invalid!;
  }
  for (const value of tuple) {
    const error = clockIntegerError(value);
    if (error != null) throw new RangeError(error);
  }
  for (const [index, [, name, max]] of fields.entries()) {
    if (tuple[index] < 0n || tuple[index] > max) {
      throw new RangeError(name + " must be in 0.." + max);
    }
  }
}

/** dateutil checks selectors at the rule's own frequency when constructing it. */
export function validateDateutilClockPhase(
  rule: RRuleLike,
  start: NaiveTime,
  interval = rule.options?.interval ?? 1,
): void {
  const selection = clockSelector(rule, start);
  if (selection == null) {
    validateDateutilExpandedClock(rule);
    return;
  }
  const { entries, exact, value, base } = selection;
  if (!entries?.length) return;
  if (!Number.isSafeInteger(interval)) return;
  const stride = BigInt(gcd(interval, base));
  if (
    !(exact ?? entries).some((entry) =>
      (BigInt(entry) - BigInt(value)) % stride === 0n
    )
  ) {
    throw new RangeError("Invalid rrule byxxx generates an empty set.");
  }
}

/** Check the time set that dateutil builds when it iterates a subdaily rule. */
export function validateDateutilClockCycle(
  rule: RRuleLike,
  start: NaiveTime,
): void {
  const selection = clockSelector(rule, start);
  if (selection == null) return;
  const { entries, value, base } = selection;
  const interval = rule.options?.interval ?? 1;
  if (entries?.length && Number.isSafeInteger(interval)) {
    const stride = gcd(interval, base);
    if (
      !entries.some((entry) =>
        entry >= 0 && entry < base && (entry - value) % stride === 0
      )
    ) {
      // The reference's modular search has no result to unpack.
      throw new RangeError("cannot unpack non-iterable NoneType object");
    }
  }
  validateDateutilClockReachability(rule, start);
  validateDateutilExpandedClock(rule);
}

function validateDateutilClockReachability(
  { freq, options }: RRuleLike,
  start: NaiveTime,
): void {
  const byHour = options?.byhour;
  const byMinute = options?.byminute;
  const bySecond = options?.bysecond;
  const minutely = freq === "minutely";
  if (
    minutely ? !byHour?.length : freq !== "secondly" ||
      (!byHour?.length && !byMinute?.length)
  ) return;

  const unitsPerHour = minutely ? 60 : 3600;
  const unitsPerDay = unitsPerHour * 24;
  const startUnit = start.hrs * unitsPerHour +
    (minutely ? start.mins : start.mins * 60 + start.secs);
  const interval = options?.interval ?? 1;
  if (!Number.isSafeInteger(interval)) return;
  const stride = gcd(interval, unitsPerDay);
  const hours = new Set(byHour);
  const minutes = new Set(byMinute);
  const seconds = new Set(bySecond);
  for (let at = startUnit % stride; at < unitsPerDay; at += stride) {
    if (hours.size !== 0 && !hours.has(Math.floor(at / unitsPerHour))) continue;
    const minute = minutely ? at % 60 : Math.floor(at / 60) % 60;
    if (minutes.size !== 0 && !minutes.has(minute)) continue;
    if (minutely || seconds.size === 0 || seconds.has(at % 60)) return;
  }
  throw new RangeError(
    minutely
      ? "Invalid combination of interval and byhour resulting in empty rule."
      : "Invalid combination of interval, byhour and byminute resulting in empty rule.",
  );
}

function divmod(value: bigint, base: bigint): [bigint, bigint] {
  const rem = value % base;
  return rem < 0n ? [value / base - 1n, rem + base] : [value / base, rem];
}

/** Advance one subdaily period with Python's component carries and raw day checks. */
export function dateutilBackwardClock(
  rule: RRuleLike,
  step: bigint,
  generationLimit?: number,
): (period: NaiveDateTime, filtered: boolean) => number {
  const { freq, options } = rule;
  const hourly = freq === "hourly";
  const minutely = freq === "minutely";
  const perDay = hourly ? 24 : minutely ? 1440 : 86400;
  const base = hourly ? 24n : 60n;
  const unitMs = Time.MS_PER_DAY / perDay;
  const own = hourly
    ? options?.byhour
    : minutely
    ? options?.byminute
    : options?.bysecond;
  const stride = gcd(Number(step % BigInt(perDay)), perDay);
  const attempts = hourly ? 1 : perDay / stride;
  const hours = options?.byhour;
  const minutes = options?.byminute;
  const upperBase = BigInt(perDay) / base;
  let filteredDate = -Infinity;
  const filteredClocks = new Set<number>();
  let checkedTimes = false;

  function advance(component: bigint): [bigint, bigint] {
    if (!own?.length) return divmod(component + step, base);
    let carry = 0n;
    for (let i = 0; i < Number(base); i++) {
      const [delta, value] = divmod(component + step, base);
      component = value;
      carry += delta;
      if (own.includes(Number(value))) return [carry, value];
    }
    throw new RangeError("cannot unpack non-iterable NoneType object");
  }

  function stepPeriod(
    { hrs, mins, secs }: NaiveTime,
    filtered: boolean,
  ): { dayOffset: bigint; clockUnits: number } {
    let upper = hourly ? 0n : BigInt(minutely ? hrs : hrs * 60 + mins);
    let component = BigInt(hourly ? hrs : minutely ? mins : secs);
    if (filtered) {
      const remaining = BigInt(perDay - 1) - (upper * base + component);
      // Python uses floor division even when the interval is negative.
      component += divmod(-remaining, -step)[0] * step;
    }
    let dayOffset = 0n;
    for (let i = 0; i < attempts; i++) {
      const [carry, next] = advance(component);
      const [days, withinDay] = divmod(upper + carry, upperBase);
      dayOffset += days;
      upper = withinDay;
      component = next;
      if (!hourly) {
        const hour = Number(minutely ? upper : upper / 60n);
        const minute = Number(minutely ? component : upper % 60n);
        if (hours?.length && !hours.includes(hour)) continue;
        if (!minutely && minutes?.length && !minutes.includes(minute)) continue;
      }
      return { dayOffset, clockUnits: Number(upper * base + component) };
    }
    throw new RangeError(
      minutely
        ? "Invalid combination of interval and byhour resulting in empty rule."
        : "Invalid combination of interval, byhour and byminute resulting in empty rule.",
    );
  }

  return (period, filtered) => {
    const { date, time } = period;
    if (filtered) {
      // Only a rejected day can send the reference clock back to a phase
      // it already visited. An accepted day strictly rewinds it.
      if (filteredDate !== date.dse) {
        filteredDate = date.dse;
        filteredClocks.clear();
      }
      if (filteredClocks.has(period.mse)) {
        if (generationLimit != null) {
          throw new RecurrenceExpansionLimitError(generationLimit);
        }
        throw new RangeError(
          "dateutil interval does not advance the recurrence",
        );
      }
      filteredClocks.add(period.mse);
    }
    const { dayOffset, clockUnits } = stepPeriod(time, filtered);
    // Python builds the next time set before accessing the new raw date.
    if (!checkedTimes) {
      validateDateutilExpandedClock(rule);
      checkedTimes = true;
    }
    const day = BigInt(date.day) + dayOffset;
    if (day < -(1n << 63n)) {
      throw new RangeError("Python int too large to convert to C long");
    }
    if (day < -(1n << 31n)) {
      throw new RangeError("signed integer is less than minimum");
    }
    if (day < 1n) throw new RangeError("day is out of range for month");
    return (date.dse + Number(dayOffset)) * Time.MS_PER_DAY +
      clockUnits * unitMs;
  };
}
