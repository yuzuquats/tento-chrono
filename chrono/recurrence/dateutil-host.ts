import { NaiveDateTime } from "../naive-datetime.ts";
import { Time } from "../time.ts";
import { type DateutilZone, invalidDateutilOffset } from "./dateutil-tzif.ts";

/** Snapshot of the Python process timezone used by dateutil's tzlocal. */
export interface DateutilHost {
  /** Standard and daylight abbreviations from time.tzname. */
  readonly names: readonly [standard: string, daylight: string];
  readonly standardOffsetSeconds: number;
  readonly daylightOffsetSeconds: number;
  /** Daylight flag and seconds east of UTC from time.localtime. */
  localTime(
    epochSeconds: number,
  ): { isDaylight: boolean; offsetSeconds: number };
}

export class DateutilLocalZone implements DateutilZone {
  readonly hasInvalidOffset: boolean;
  readonly maxOffsetMs: number;
  private readonly standard: number;
  private readonly savings: number;

  constructor(
    private readonly host: DateutilHost,
    private readonly fold = false,
  ) {
    this.standard = host.standardOffsetSeconds * Time.MS_PER_SEC;
    this.savings = host.daylightOffsetSeconds * Time.MS_PER_SEC - this.standard;
    const daylight = this.standard + this.savings;
    this.hasInvalidOffset = Math.abs(this.standard) >= Time.MS_PER_DAY ||
      Math.abs(daylight) >= Time.MS_PER_DAY;
    this.maxOffsetMs = Math.max(0, this.standard, daylight);
  }

  private naiveDaylight(mse: number): boolean {
    return this.savings !== 0 &&
      this.host.localTime((mse - this.standard) / Time.MS_PER_SEC).isDaylight;
  }

  ambiguous(wall: NaiveDateTime): boolean {
    return this.isAmbiguous(wall.mse);
  }

  private isAmbiguous(mse: number): boolean {
    return !this.naiveDaylight(mse) && this.naiveDaylight(mse - this.savings);
  }

  private daylight(mse: number, fold: boolean): boolean {
    return this.isAmbiguous(mse) ? !fold : this.naiveDaylight(mse);
  }

  /** Bind the fold indicated by the parsed abbreviation when possible. */
  static parse(host: DateutilHost, label: string, wall: NaiveDateTime) {
    if (!host.names.includes(label)) return;
    const early = new DateutilLocalZone(host);
    const daylight = early.daylight(wall.mse, false);
    if (host.names[Number(daylight)] === label) return early;
    if (early.ambiguous(wall) && host.names[0] === label) {
      return new DateutilLocalZone(host, true);
    }
    if (label === "UTC" || label === "GMT") return;
    return early;
  }

  offset(wall: NaiveDateTime): number {
    return this.standard +
      (this.daylight(wall.mse, this.fold) ? this.savings : 0);
  }

  instant(wall: NaiveDateTime) {
    const offset = this.offset(wall);
    return wall.add({ ms: Math.abs(offset) < Time.MS_PER_DAY ? -offset : 0 })
      .asUtc();
  }

  wall(instant: number): NaiveDateTime {
    const daylight = this.daylight(instant, false);
    const offset = this.standard + (daylight ? this.savings : 0);
    if (
      Math.abs(offset) >= Time.MS_PER_DAY ||
      (daylight && Math.abs(this.savings) >= Time.MS_PER_DAY)
    ) {
      throw invalidDateutilOffset();
    }
    const standardWall = instant + this.standard;
    const savings = this.daylight(standardWall, true) ? this.savings : 0;
    if (Math.abs(savings) >= Time.MS_PER_DAY) throw invalidDateutilOffset();
    const mse = standardWall + savings;
    return NaiveDateTime.fromMse(mse as NaiveDateTime["mse"]);
  }

  forRule(): DateutilZone {
    // rrule builds new datetime.time values, whose fold defaults to zero.
    return this.fold ? new DateutilLocalZone(this.host) : this;
  }

  validateOffset(wall: NaiveDateTime): void {
    if (
      this.hasInvalidOffset && Math.abs(this.offset(wall)) >= Time.MS_PER_DAY
    ) {
      throw invalidDateutilOffset();
    }
  }

  validateRuleStart(wall: NaiveDateTime): void {
    if (
      Math.abs(this.savings) >= Time.MS_PER_DAY &&
      this.daylight(wall.mse, false)
    ) {
      throw invalidDateutilOffset();
    }
  }
}
