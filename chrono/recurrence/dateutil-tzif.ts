import type { DateTime } from "../datetime.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { Time } from "../time.ts";
import type { Utc } from "../timezone.ts";
import type { MsSinceEpoch } from "../units/units.ts";

interface LocalTimeType {
  readonly offset: number;
  readonly dst: boolean;
}

/** Timezone operations used by dateutil recurrence sets. */
export interface DateutilZone {
  readonly maxOffsetMs: number;
  readonly hasInvalidOffset: boolean;
  readonly invalidFixedOffsetMs?: number;
  instant(wall: NaiveDateTime): DateTime<Utc>;
  wall(instant: number): NaiveDateTime;
  ambiguous(wall: NaiveDateTime): boolean;
  validateOffset(wall: NaiveDateTime): void;
  forRule?(): DateutilZone;
  validateRuleStart?(wall: NaiveDateTime): void;
}

/** The TZif view used by dateutil 2.8.2's tzfile implementation. */
export class DateutilTzif implements DateutilZone {
  readonly maxOffsetMs: number;
  private readonly wallTransitions: number[] = [];

  private constructor(
    private readonly utcTransitions: readonly number[],
    private readonly transitionTypes: readonly LocalTimeType[],
    private readonly before: LocalTimeType,
    private readonly standard: LocalTimeType,
    readonly invalidFixedOffsetMs?: number,
  ) {
    this.maxOffsetMs = transitionTypes.reduce(
      (max, { offset }) => Math.max(max, offset),
      Math.max(0, before.offset, standard.offset),
    );
    let previous: LocalTimeType | undefined;
    let previousBase = 0;
    let previousDst = 0;
    for (const [index, type] of transitionTypes.entries()) {
      const dst = type.dst && previous != null
        ? ((!previous.dst ? type.offset - previous.offset : 0) || previousDst)
        : 0;
      if (type.dst && previous != null) previousDst = dst;
      const base = type.offset - dst;
      const adjustment =
        previous != null && base !== previousBase && type.dst !== previous.dst
          ? previousBase
          : base;
      this.wallTransitions.push(utcTransitions[index] + adjustment);
      previous = type;
      previousBase = base;
    }
  }

  static fixed(offset: number): DateutilTzif {
    const invalid = Math.abs(offset) >= Time.MS_PER_DAY;
    // Keep the wall clock for window traversal when UTC has no defined value.
    const type = { offset: invalid ? 0 : offset, dst: false };
    return new DateutilTzif([], [], type, type, invalid ? offset : undefined);
  }

  get hasInvalidOffset(): boolean {
    return this.invalidFixedOffsetMs != null;
  }

  validateOffset(): void {
    if (this.invalidFixedOffsetMs != null) throw invalidDateutilOffset();
  }

  static read(bytes: Uint8Array): DateutilTzif {
    const invalid = () => new RangeError("Invalid dateutil TZif timezone data");
    if (
      bytes.length < 44 ||
      String.fromCharCode(...bytes.subarray(0, 4)) !== "TZif"
    ) {
      throw invalid();
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const utcFlags = view.getUint32(20);
    const standardFlags = view.getUint32(24);
    const leapCount = view.getUint32(28);
    const transitionCount = view.getUint32(32);
    const typeCount = view.getUint32(36);
    const abbreviationBytes = view.getUint32(40);
    const indexStart = 44 + 4 * transitionCount;
    const typesStart = indexStart + transitionCount;
    const end = typesStart + 6 * typeCount + abbreviationBytes +
      8 * leapCount + standardFlags + utcFlags;
    if (typeCount === 0 || typeCount > 256 || end > bytes.length) {
      throw invalid();
    }

    const types: LocalTimeType[] = [];
    for (let i = 0; i < typeCount; i++) {
      const start = typesStart + 6 * i;
      const offset = view.getInt32(start) * Time.MS_PER_SEC;
      const dst = view.getUint8(start + 4);
      if (Math.abs(offset) >= Time.MS_PER_DAY || dst > 1) throw invalid();
      types.push({ offset, dst: dst === 1 });
    }
    const utcTransitions: number[] = [];
    const transitionTypes: LocalTimeType[] = [];
    for (let i = 0; i < transitionCount; i++) {
      const time = view.getInt32(44 + 4 * i) * Time.MS_PER_SEC;
      const type = types[bytes[indexStart + i]];
      if (type == null || (i > 0 && utcTransitions[i - 1] >= time)) {
        throw invalid();
      }
      utcTransitions.push(time);
      transitionTypes.push(type);
    }
    // dateutil reads the initial 32-bit block even in a version 2+ file.
    const before = types.find(({ dst }) => !dst) ?? types[0];
    const standard = transitionTypes.findLast(({ dst }) => !dst) ??
      transitionTypes.at(-1) ?? types[0];
    return new DateutilTzif(utcTransitions, transitionTypes, before, standard);
  }

  instant(wall: NaiveDateTime): DateTime<Utc> {
    const index = lastTransition(this.wallTransitions, wall.mse);
    const fold = this.ambiguousAt(wall.mse, index);
    return NaiveDateTime.fromMse(
      (wall.mse - this.offset(index - Number(fold))) as MsSinceEpoch,
    ).asUtc();
  }

  wall(instant: number): NaiveDateTime {
    return NaiveDateTime.fromMse(
      (instant +
        this.offset(
          lastTransition(this.utcTransitions, instant),
        )) as MsSinceEpoch,
    );
  }

  ambiguous(wall: NaiveDateTime): boolean {
    return this.ambiguousAt(
      wall.mse,
      lastTransition(this.wallTransitions, wall.mse),
    );
  }

  private ambiguousAt(wall: number, index: number): boolean {
    return index > 0 &&
      wall <
        this.wallTransitions[index] + this.offset(index - 1) -
          this.offset(index);
  }

  private offset(index: number): number {
    if (
      index >= this.transitionTypes.length - 1 ||
      this.transitionTypes.length === 0
    ) {
      return this.standard.offset;
    }
    return index < 0 ? this.before.offset : this.transitionTypes[index].offset;
  }
}

function lastTransition(transitions: readonly number[], value: number): number {
  let lower = 0;
  let upper = transitions.length;
  while (lower < upper) {
    const middle = lower + ((upper - lower) >>> 1);
    if (transitions[middle] <= value) lower = middle + 1;
    else upper = middle;
  }
  return lower - 1;
}

export function invalidDateutilOffset(): RangeError {
  return new RangeError(
    "offset must be a timedelta strictly between -timedelta(hours=24) and timedelta(hours=24).",
  );
}
