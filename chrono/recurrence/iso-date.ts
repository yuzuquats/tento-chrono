import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { NaiveTime } from "../naive-time.ts";
import { Result, erm, ok } from "../result.ts";
import type { Option } from "../option.ts";

export class IsoDate {
  constructor(
    readonly nd: NaiveDate,
    readonly nt: Option<NaiveTime>,
    // todo: parsing wil fail if the input has a different timezone
    readonly z: Option<"Z">,
  ) {}

  static parse(s: string): Result<IsoDate> {
    return IsoDate.parseRaw(s).map(([nd, nt, Z]) => new IsoDate(nd, nt, Z));
  }

  static parseRaw(
    s: string,
  ): Result<[NaiveDate, Option<NaiveTime>, Option<"Z">]> {
    const regex = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})?(\d{2})?)?Z?$/;
    const input = s.trim();
    const match = input.match(regex);
    if (!match) return erm(`icaldate/no-match/input=${s}`);

    const [_, year, month, day, hrs, mins, secs] = match;

    const ndr = NaiveDate.fromYmd1Str(year, month, day);
    if (ndr.isErr) return ndr.expeCast();
    const nd = ndr.asOk()!;

    let nt: Option<NaiveTime> = null;
    if (hrs != null) {
      const hours = Number(hrs);
      const minutes = Number(mins ?? "0");
      const seconds = Number(secs ?? "0");
      if (hours > 23 || minutes > 59 || seconds > 60) {
        return erm(`icaldate/time-out-of-range/input=${s}`);
      }
      // RFC 5545 §3.3.12 treats :60 as :59 when leap seconds are unsupported.
      nt = NaiveTime.wrap({ hrs: hours, mins: minutes, secs: Math.min(seconds, 59) });
    }

    return ok([nd, nt, input.endsWith("Z") ? "Z" : null]);
  }

  trunc(): NaiveDate {
    return this.nd;
  }

  extend(): NaiveDateTime {
    return this.nd.withTime(this.nt ?? undefined);
  }

  ical(): string {
    if (this.nt) return this.extend().ical() + (this.z ?? "");
    return this.nd.ical() + (this.z ?? "");
  }

  toString(): string {
    return this.ical();
  }
}
