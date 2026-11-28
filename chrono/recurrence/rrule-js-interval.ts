import type { NaiveDateTime } from "../naive-datetime.ts";
import { Time } from "../time.ts";
import type { Frequency } from "./frequency.ts";

type Field = number | string;

function add(a: Field, b: Field): Field {
  return typeof a === "string" || typeof b === "string"
    ? String(a) + String(b)
    : a + b;
}

/** Raw reference fields for text intervals and backward subdaily motion. */
export class RruleJsCounter {
  private fields: [Field, Field, Field];
  private clock: [Field, Field, Field];

  constructor(
    start: NaiveDateTime,
    private readonly interval: Field,
  ) {
    this.fields = [start.date.yr, start.date.month1, start.date.day1];
    this.clock = [start.time.hrs, start.time.mins, start.time.secs];
  }

  get year(): number {
    return Number(this.fields[0]);
  }

  get month(): number {
    return Number(this.fields[1]);
  }

  get dayMs(): number {
    return Date.UTC(this.year, this.month - 1, Number(this.fields[2]));
  }

  periodMs(unitMs: number): number {
    const [hour, minute, second] = this.clock.map((field) =>
      Math.trunc(Number(field))
    );
    return this.dayMs + hour * Time.MS_PER_HR +
      (unitMs <= Time.MS_PER_MIN ? minute * Time.MS_PER_MIN : 0) +
      (unitMs === Time.MS_PER_SEC ? second * Time.MS_PER_SEC : 0);
  }

  advanceDate(freq: Frequency, weekOffset: number): boolean {
    const previous = this.fields.slice();
    if (freq === "yearly") this.fields[0] = add(this.fields[0], this.interval);
    else if (freq === "monthly") {
      this.fields[1] = add(this.fields[1], this.interval);
      const month = this.month;
      if (month > 12) {
        const remainder = month % 12;
        this.fields[0] = this.year + Math.floor(month / 12) -
          (remainder === 0 ? 1 : 0);
        this.fields[1] = remainder || 12;
      }
    } else {
      this.addDays(
        freq === "weekly"
          ? Number(this.interval) * 7 - weekOffset
          : this.interval,
      );
    }
    return this.fields.some((field, i) => field !== previous[i]);
  }

  private addDays(step: Field) {
    this.fields[2] = add(this.fields[2], step);
    let day = Number(this.fields[2]);
    if (day <= 28 || !Number.isFinite(day)) return;
    // The counter uses Date.UTC's encoded month lengths below year 100.
    // No period can follow a day already beyond the last supported year.
    if (day > 366 * (10000 - this.year)) {
      this.fields[0] = 10000;
      return;
    }
    for (;;) {
      const length = new Date(Date.UTC(this.year, this.month, 0)).getUTCDate();
      if (!(day > length)) return;
      this.fields[2] = day -= length;
      if (this.month === 12) {
        this.fields[1] = 1;
        this.fields[0] = this.year + 1;
      } else this.fields[1] = this.month + 1;
    }
  }

  advanceClock(
    unitMs: number,
    skipDay: boolean,
    selectors: readonly (readonly number[] | null | undefined)[],
  ): boolean {
    const unit = unitMs === Time.MS_PER_HR
      ? 0
      : unitMs === Time.MS_PER_MIN
      ? 1
      : 2;
    const state = () => JSON.stringify([...this.fields, ...this.clock]);
    const previous = state();
    if (skipDay) {
      const [hour, minute, second] = this.clock;
      const tick = unit === 0
        ? hour
        : unit === 1
        ? add(Number(hour) * 60, minute)
        : add(Number(hour) * 3600 + Number(minute) * 60, second);
      const step = Number(this.interval);
      this.clock[unit] = add(
        this.clock[unit],
        Math.floor((Time.MS_PER_DAY / unitMs - 1 - Number(tick)) / step) * step,
      );
    }
    return this.addClock(unit, this.interval, selectors) &&
      previous !== state();
  }

  private addClock(
    unit: number,
    step: Field,
    selectors: readonly (readonly number[] | null | undefined)[],
  ): boolean {
    const base = unit === 0 ? 24 : 60;
    const seen = new Set<string>();
    for (;;) {
      const phase = JSON.stringify(this.clock.slice(0, unit + 1));
      if (seen.has(phase)) return false;
      seen.add(phase);
      const field = add(this.clock[unit], step);
      this.clock[unit] = field;
      const numeric = Number(field);
      if (!Number.isFinite(numeric)) return false;
      const carry = Math.floor(numeric / base);
      if (carry !== 0) {
        this.clock[unit] = ((numeric % base) + base) % base;
        if (unit === 0) this.addDays(carry);
        else if (!this.addClock(unit - 1, carry, selectors)) return false;
      }
      if (this.year > 9999) return false;
      if (
        selectors.slice(0, unit + 1).every((values, i) => {
          const value = this.clock[i];
          return values == null ||
            (typeof value === "number" && values.includes(value));
        })
      ) return true;
    }
  }
}
