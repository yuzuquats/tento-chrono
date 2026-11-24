import { DateTime } from "./datetime.ts";
import { NaiveDate } from "./naive-date.ts";
import { Result } from "./result.ts";
import { Duration } from "./units/duration.ts";
import { Epoch } from "./units/epoch.ts";
import { MsSinceEpoch, Sign } from "./units/units.ts";
import { TentoMath } from "./utils.ts";
import type { Option } from "./option.ts";

export type Tzname = string & { type: "iana-timezone-name" }; // "America/New_York", "UTC"
export namespace Tzname {
  /** The UTC zone's IANA name. */
  export const UTC: Tzname = "UTC" as Tzname;

  /**
   * `name` as a `Tzname` when the runtime knows it as an IANA time zone
   * (`Intl.DateTimeFormat` accepts it), else `null` — the one place a string
   * takes the brand.
   */
  export function parseOpt(name: string): Option<Tzname> {
    if (known.has(name)) return name as Tzname;
    if (name === "" || typeof Intl === "undefined") return null;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: name });
    } catch {
      return null;
    }
    known.add(name);
    return name as Tzname;
  }

  /** Names `parseOpt` already accepted: a hot read skips the `Intl` probe. */
  const known = new Set<string>(["UTC"]);
}
export type Tzabbr = string; // "UTC", "PST", "PDT"

export interface TimezoneInfo {
  tzabbr?: Option<Tzabbr>;
  tzname?: Option<Tzname>;
  offset: Duration.Time;
}

export namespace TimezoneInfo {
  export function local(): TimezoneInfo {
    return localInfo(new Date());
  }

  export function tzabbr(info: TimezoneInfo): string {
    if (info.tzabbr === "%z") {
      return `${info.offset.asSignedHm(true)}`;
    }
    return info.tzabbr ?? "-";
  }
}

let localFormatter: Intl.DateTimeFormat | undefined;

function localOffsetMs(instant: Date): number {
  const localAsUtc = new Date(0);
  localAsUtc.setUTCFullYear(instant.getFullYear(), instant.getMonth(), instant.getDate());
  localAsUtc.setUTCHours(
    instant.getHours(), instant.getMinutes(), instant.getSeconds(), instant.getMilliseconds(),
  );
  return localAsUtc.getTime() - instant.getTime();
}

function localInfo(instant: Date, offsetMs = localOffsetMs(instant)): TimezoneInfo {
  const offset = Duration.Time.from({ ms: offsetMs });
  if (typeof Intl === "undefined") return { offset, tzabbr: "unknown" };

  localFormatter ??= new Intl.DateTimeFormat("en-US", { timeZoneName: "short" });
  const tzname = localFormatter.resolvedOptions().timeZone as Tzname;
  const tzabbr = localFormatter.formatToParts(instant).find((part) => part.type === "timeZoneName")?.value;
  return { offset, tzname, tzabbr };
}

export interface LogicalTimezone<Id extends string = any> {
  id: Id;
  info: TimezoneInfo;
  rfc3339: string;
}

export namespace LogicalTimezone {
  const timezoneCache: Map<string, LogicalTimezone<FixedOffset>> = new Map();
  const namelessTimezones: Map<
    Tzabbr,
    LogicalTimezone<FixedOffset>
  > = new Map();

  // "Z", "-07:00", "-08:00", etc
  export function parse(
    tz: string,
    tzname?: Option<string>,
    tzabbr?: Option<string>,
  ): LogicalTimezone<FixedOffset> {
    if (tz === "Z" || tz === "z") return Utc;

    if (tzabbr) {
      const key = `${tz}$n:${tzname ?? ""}$abbr:${tzabbr}`;
      let cached = timezoneCache.get(key);
      if (cached) return cached;
      cached = uncachedParse(tz, tzname, tzabbr);
      timezoneCache.set(key, cached);
      return cached;
    }

    if (!tzname && !tzabbr) {
      let cached = namelessTimezones.get(tz);
      if (cached) return cached;
      cached = uncachedParse(tz);
      namelessTimezones.set(tz, cached);
      return cached;
    }

    return uncachedParse(tz, tzname, tzabbr);
  }

  function uncachedParse(
    tz: string,
    tzname?: Option<string>,
    tzabbr?: Option<string>,
  ) {
    let offsetStr = tz;
    let sign: Sign = 1;

    const plus = tz.startsWith("+");
    if (plus || tz.startsWith("-")) {
      sign = tz.startsWith("+") ? 1 : -1;
      offsetStr = offsetStr.slice(1);
    }

    const [h, m, s] = offsetStr.split(":");
    const offset = Duration.Time.from({
      hrs: TentoMath.int(h),
      mins: TentoMath.int(m),
      secs: TentoMath.int(s),
      sign,
    });

    return new FixedTimezone(tzabbr ?? tz, {
      offset,
      tzname: tzname as Tzname,
      tzabbr,
    });
  }
}

class UtcTimezone implements LogicalTimezone<"utc"> {
  id: "utc" = "utc" as const;
  info = {
    tzname: "UTC" as Tzname,
    offset: Duration.Time.ZERO,
  };
  rfc3339: string = "Z";

  now(): DateTime<Utc> {
    return DateTime.fromMse(Epoch.currentMse(), Utc);
  }

  parse(s: Option<string>): Option<DateTime<Utc>> {
    if (s == null || s === undefined) return null;
    return DateTime.fromRfc3339(s).exp().toUtc();
  }

  parseOpt(s: Option<string>): Option<Result<DateTime<Utc>>> {
    if (s == null || s === undefined) return null;
    const dt = DateTime.fromRfc3339(s);
    if (dt.isErr) return Result.err(dt.asErr()!);
    return Result.ok(dt.asOk()!.toUtc());
  }
}

export const Utc = new UtcTimezone();
export type Utc = "utc";

export class FixedTimezone<Id extends Tzabbr = FixedOffset>
  implements LogicalTimezone<Id>
{
  id: Id;
  info: TimezoneInfo;

  constructor(id: Id, info: TimezoneInfo) {
    this.id = id;
    this.info = info;
  }

  get rfc3339(): string {
    return this.info.offset.asSignedHm();
  }
}

export class LocalTimezone implements LogicalTimezone<Local> {
  id: Local = "local";
  #resolved?: TimezoneInfo;

  constructor(info?: TimezoneInfo) {
    this.#resolved = info;
  }

  get info(): TimezoneInfo {
    return this.#resolved ?? TimezoneInfo.local();
  }

  set info(info: TimezoneInfo) {
    this.#resolved = info;
  }

  /** @internal Snapshot the host offset at this instant. */
  atInstant(mse: MsSinceEpoch): LocalTimezone {
    if (this.#resolved != null) return this;
    const instant = new Date(mse);
    return new LocalTimezone(Number.isFinite(instant.getTime()) ? localInfo(instant) : this.info);
  }

  /** @internal Interpret a naive epoch value as host-local civil fields. */
  atWallClock(mse: MsSinceEpoch): LocalTimezone {
    if (this.#resolved != null) return this;
    const wall = new Date(mse);
    if (!Number.isFinite(wall.getTime())) return new LocalTimezone(this.info);

    // Offset-less ISO parsing uses the host zone, choosing the earlier
    // occurrence in an overlap and advancing by the gap when one is skipped.
    const instant = new Date(wall.toISOString().slice(0, -1));
    const resolvedMse = instant.getTime();
    if (!Number.isFinite(resolvedMse)) return new LocalTimezone(this.info);

    const offset = mse - resolvedMse;
    const gap = localOffsetMs(instant) - offset;
    // Keep the original civil fields and the corresponding pre-gap label.
    const labelInstant = gap > 0 ? new Date(resolvedMse - gap) : instant;
    return new LocalTimezone(localInfo(labelInstant, offset));
  }

  now(): DateTime<Local> {
    return DateTime.fromMse(Epoch.currentMse(), Local);
  }

  get today(): NaiveDate {
    return Local.now().withTime().date;
  }

  get rfc3339(): string {
    return this.info.offset.asSignedHm();
  }

  fromMse(mse: MsSinceEpoch): DateTime<Local> {
    return DateTime.fromMse(mse, Local);
  }
}

export const Local = new LocalTimezone();
export type Local = "local";

export type FixedOffset = string & Exclude<string, Local | Utc>;
