import { DateTime } from "../datetime.ts";
import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { err, ok, Result } from "../result.ts";
import { TimezoneRegion } from "../timezone-region.ts";
import { FixedOffset, Tzname, Utc } from "../timezone.ts";
import { RecurrenceExpansionLimitError } from "./generation-limit.ts";
import { icalPropertyName } from "./ical-attributes.ts";
import { ICalendar } from "./ical.ts";
import { IsoDate } from "./iso-date.ts";
import {
  GoogleEventGenerator,
  Recurrence,
  RecurrenceComposition,
} from "./recurrence.ts";
import { validateRfc5545 } from "./rfc5545.ts";

export type ICalendarRecurrenceProfile =
  | "rfc5545"
  | "google"
  | "dateutil"
  | "rrule-js";
export type RecurrenceProfile = ICalendarRecurrenceProfile | "outlook";
export type RecurrenceStart =
  | { date: string }
  | { dateTime: string; timeZone?: string | null };

export interface ICalendarRecurrenceOptions {
  profile?: ICalendarRecurrenceProfile;
  /** An external start, as supplied by an event master. */
  dtstart?: RecurrenceStart;
}

export type RecurrenceOccurrence = NaiveDate | NaiveDateTime | DateTime<Utc>;

interface BoundStart {
  local: NaiveDateTime;
  instant: DateTime<FixedOffset>;
  zone: TimezoneRegion | null;
  kind: "date" | "floating" | "instant";
}

export class RecurrenceSeries {
  private constructor(
    readonly profile: RecurrenceProfile,
    private readonly start: BoundStart,
    private readonly rules: readonly Recurrence[],
  ) {}

  /** Expand through a UTC date for instants, or a civil date for DATE/floating values. */
  occurrences({ through, generationLimit }: {
    through: NaiveDate;
    generationLimit?: number;
  }): RecurrenceOccurrence[] {
    return this.generator(generationLimit).generateUpToDate(through);
  }

  /** Read successive inclusive date windows without restarting expansion. */
  generator(generationLimit?: number) {
    const composition = compositionFor(this.profile);
    const generators = this.rules.map((rule) =>
      new GoogleEventGenerator(
        rule,
        this.start.instant,
        this.start.zone,
        composition,
        generationLimit,
        this.start.local,
      )
    );
    let total = 0;
    let failure: Error | undefined;
    return {
      generateUpToDate: (through: NaiveDate): RecurrenceOccurrence[] => {
        if (failure != null) throw failure;
        const instances = new Map<number, DateTime<Utc>>();
        try {
          for (const generator of generators) {
            for (const instance of generator.generateUpToDate(through)) {
              const key = this.start.kind === "date"
                ? instance.ndt.date.dse
                : instance.mse;
              instances.set(key, instance);
              if (
                generationLimit != null &&
                total + instances.size > generationLimit
              ) {
                throw new RecurrenceExpansionLimitError(generationLimit);
              }
            }
          }
        } catch (error) {
          failure = error instanceof Error ? error : new Error(String(error));
          throw failure;
        }
        total += instances.size;
        return [...instances.values()].sort((a, b) => a.mse - b.mse).map((
          instance,
        ) =>
          this.start.kind === "date"
            ? instance.ndt.date
            : this.start.kind === "floating"
            ? instance.ndt
            : instance
        );
      },
    };
  }

  static async read(
    source: readonly string[],
    { profile = "rfc5545", dtstart }: ICalendarRecurrenceOptions = {},
  ): Promise<Result<RecurrenceSeries>> {
    return await RecurrenceSeries.readLines(
      source,
      profile,
      dtstart,
      profile === "rfc5545",
    );
  }

  /** Native Graph patterns are normalized before reaching the shared generator. */
  static async readGraph(
    rule: string,
    start: RecurrenceStart,
  ): Promise<Result<RecurrenceSeries>> {
    return await RecurrenceSeries.readLines([rule], "outlook", start, false);
  }

  private static async readLines(
    source: readonly string[],
    profile: RecurrenceProfile,
    external: RecurrenceStart | undefined,
    strict: boolean,
  ): Promise<Result<RecurrenceSeries>> {
    try {
      const lines = source.join("\r\n").replace(/\r?\n[ \t]/g, "").split(
        /\r?\n/,
      ).filter(Boolean);
      let startLines = lines.filter((line) =>
        icalPropertyName(line) === "DTSTART"
      );
      let bound: BoundStart | undefined;
      if (external != null) {
        if (startLines.length > 0) throw new Error("DTSTART supplied twice");
        const parsed = await bindExternalStart(external, profile);
        bound = parsed.start;
        startLines = [parsed.line];
        lines.unshift(parsed.line);
      }
      if (startLines.length !== 1) throw new Error("Expected one DTSTART");
      if (strict) validateRfc5545(lines, startLines[0]);

      const shared = [];
      const ruleLines = [];
      for (const line of lines) {
        const name = icalPropertyName(line);
        if (name === "RRULE") ruleLines.push(profileRule(line, profile));
        else {
          if (name === "DTSTART" || name === "RDATE" || name === "EXDATE") {
            const match = /;TZID=(?:"([^"]+)"|([^;:]+))/i.exec(line);
            if (match != null) {
              const zone = await loadZone(match[1] ?? match[2]);
              // The low-level date parser takes an unquoted IANA name.
              shared.push(line.replace(match[0], ";TZID=" + zone.fullname));
              continue;
            }
          }
          shared.push(line);
        }
      }
      if (
        ruleLines.length > 1 && profile !== "dateutil" && profile !== "rrule-js"
      ) {
        throw new Error("This profile requires at most one RRULE");
      }

      const rules = [];
      for (const rule of ruleLines.length ? ruleLines : [null]) {
        const raw = await ICalendar.Raw.parse(
          rule == null ? shared : [...shared, rule],
        );
        if (raw.isErr) return err(raw.asErr()!);
        rules.push(new Recurrence(raw.exp()));
      }
      if (bound == null) {
        const parsed = rules[0].inner.dtstart!;
        const form = parsed.forms?.[0];
        const local = parsed.dates[0];
        if (local == null || parsed.dates.length !== 1) {
          throw new Error("Expected one DTSTART value");
        }
        const zone = parsed.region ?? null;
        const kind = form?.timed === false
          ? "date"
          : zone == null && !form?.utc
          ? "floating"
          : "instant";
        bound = {
          local,
          instant: resolveStart(local, zone, profile),
          zone,
          kind,
        };
      }
      return ok(new RecurrenceSeries(profile, bound, rules));
    } catch (error) {
      return err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

function compositionFor(profile: RecurrenceProfile): RecurrenceComposition {
  if (profile === "google") {
    return {
      ...RecurrenceComposition.GOOGLE,
      useGoogleYearlyWeeks: true,
      resolveWallTime: (zone, local, start) =>
        zone.googleDatetimeResolved(local, start, true),
    };
  }
  if (profile === "dateutil") {
    return {
      ...RecurrenceComposition.RULE_ONLY,
      resolveWallTime: (zone, local) => zone.toDateutilWallClock(local),
      resolveExdate: dateutilExdate,
    };
  }
  if (profile === "rrule-js") {
    return {
      ...RecurrenceComposition.RULE_ONLY,
      // RRuleSet interprets EXDATE's clock fields in the DTSTART zone.
      resolveExdate: (value, _region, _utc, seriesZone) =>
        seriesZone?.toRfc5545WallClock(value).toUtc() ?? value.asUtc(),
    };
  }
  return RecurrenceComposition.RULE_ONLY;
}

function dateutilExdate(
  value: NaiveDateTime,
  region: TimezoneRegion | null,
  utc: boolean,
  seriesZone: TimezoneRegion | null,
): DateTime<Utc> | null {
  const sourceZone = utc ? null : region ?? seriesZone;
  const instant = sourceZone?.toDateutilWallClock(value).toUtc() ??
    value.asUtc();
  if (sourceZone?.fullname !== seriesZone?.fullname) {
    // Python datetime equality rejects an inter-zone match when a fold changes either offset.
    if (sourceZone != null && isRepeatedWallTime(sourceZone, value)) {
      return null;
    }
    if (
      seriesZone != null &&
      isRepeatedWallTime(seriesZone, seriesZone.toTz(instant).ndt)
    ) return null;
  }
  return instant;
}

function isRepeatedWallTime(
  zone: TimezoneRegion,
  value: NaiveDateTime,
): boolean {
  // In a fold the RFC resolver selects the earlier instant and toWallClock selects the later one.
  // In a gap the two instants have the opposite order.
  return zone.toRfc5545WallClock(value).mse < zone.toWallClock(value).mse;
}

async function loadZone(name: string): Promise<TimezoneRegion> {
  const iana = Tzname.parseOpt(name);
  const zone = iana == null ? null : await TimezoneRegion.getOpt(iana);
  if (zone == null) throw new Error("Unknown recurrence timezone: " + name);
  return zone;
}

function resolveStart(
  local: NaiveDateTime,
  zone: TimezoneRegion | null,
  profile: RecurrenceProfile,
) {
  return zone == null
    ? local.asUtc()
    : profile === "dateutil"
    ? zone.toDateutilWallClock(local)
    : zone.toRfc5545WallClock(local);
}

async function bindExternalStart(
  external: RecurrenceStart,
  profile: RecurrenceProfile,
): Promise<{
  line: string;
  start: BoundStart;
}> {
  if ("date" in external) {
    const date = NaiveDate.parse(external.date);
    const local = new NaiveDateTime(date);
    return {
      line: "DTSTART;VALUE=DATE:" + date.ical(),
      start: { local, instant: local.asUtc(), zone: null, kind: "date" },
    };
  }

  const zone = external.timeZone == null
    ? null
    : await loadZone(external.timeZone);
  const hasOffset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(external.dateTime);
  const explicit = hasOffset
    ? DateTime.fromRfc3339(external.dateTime).exp()
    : null;
  const local = explicit != null
    ? (zone?.toTz(explicit) ?? explicit.toUtc()).ndt
    : NaiveDateTime.parse(external.dateTime);
  if (local == null) throw new Error("Invalid DTSTART dateTime");
  const instant = explicit == null
    ? resolveStart(local, zone, profile)
    : zone?.toTz(explicit) ?? explicit.toUtc();
  const kind = zone != null || explicit != null ? "instant" : "floating";
  const line = zone != null
    ? "DTSTART;TZID=" + zone.fullname + ":" + local.ical()
    : "DTSTART:" + local.ical() + (explicit != null ? "Z" : "");
  return { line, start: { local, instant, zone, kind } };
}

function profileRule(line: string, profile: RecurrenceProfile): string {
  const rule = line.toUpperCase();
  if (/(?:^|;)(BYEASTER|BYWEEKDAY)=/.test(rule)) {
    throw new Error("Unsupported recurrence selector");
  }
  if (profile === "rfc5545") {
    // Chrono has millisecond precision and represents leap seconds as :59.
    return rule.replace(
      /([:;]BYSECOND=)([^;]+)/,
      (_, key: string, value: string) =>
        key +
        value.split(",").map((second) => Number(second) === 60 ? "59" : second)
          .join(","),
    );
  }
  if (profile !== "google") return rule;
  // Google preserves the master time for these selector/frequency pairs in the captures.
  const frequency = /(?:^RRULE:|;)FREQ=([^;]+)/.exec(rule)?.[1];
  const parts = rule.slice(6).split(";");
  const interval = Number(
    parts.find((part) => part.startsWith("INTERVAL="))?.slice(9) ?? 1,
  );
  const ignoreWeekNumber =
    (frequency === "WEEKLY" || frequency === "MONTHLY") &&
    interval > 1 &&
    parts.some((part) =>
      /^BYDAY=(?:(?:MO|TU|WE|TH|FR|SA|SU),)*(?:MO|TU|WE|TH|FR|SA|SU)$/.test(
        part,
      )
    );
  return "RRULE:" + parts.filter((part) => {
    if (ignoreWeekNumber && part.startsWith("BYWEEKNO=")) return false;
    if (frequency === "DAILY" && /^BY(?:MINUTE|SECOND)=/.test(part)) {
      return false;
    }
    if (frequency === "MONTHLY" && part.startsWith("BYHOUR=")) return false;
    return true;
  }).join(";");
}
