import { TimezoneRegion } from "../timezone-region.ts";
import { Tzname } from "../timezone.ts";

// Calendar's stored recurrence lines expose the IANA targets of these aliases.
const GOOGLE_SHORT_TIMEZONES = new Map([
  ["ACT", "Australia/Darwin"],
  ["AET", "Australia/Sydney"],
  ["AGT", "America/Argentina/Buenos_Aires"],
  ["ART", "Africa/Cairo"],
  ["AST", "America/Anchorage"],
  ["BET", "America/Sao_Paulo"],
  ["BST", "Asia/Dhaka"],
  ["CAT", "Africa/Maputo"],
  ["CNT", "America/St_Johns"],
  ["CST", "America/Chicago"],
  ["CTT", "Asia/Shanghai"],
  ["EAT", "Africa/Nairobi"],
  ["ECT", "Europe/Paris"],
  ["EST", "America/Panama"],
  ["HST", "Pacific/Honolulu"],
  ["IET", "America/Indiana/Indianapolis"],
  ["IST", "Asia/Kolkata"],
  ["JST", "Asia/Tokyo"],
  ["MIT", "Pacific/Apia"],
  ["MST", "America/Phoenix"],
  ["NET", "Asia/Yerevan"],
  ["NST", "Pacific/Auckland"],
  ["PLT", "Asia/Karachi"],
  ["PNT", "America/Phoenix"],
  ["PRT", "America/Puerto_Rico"],
  ["PST", "America/Los_Angeles"],
  ["SST", "Pacific/Guadalcanal"],
  ["VST", "Asia/Ho_Chi_Minh"],
]);

function googleDateFixedZone(name: string): TimezoneRegion | null | undefined {
  if (
    /^(?:UTC|GMT)$/i.test(name) ||
    /^(?:Etc\/)?(?:Greenwich|GMT0|UCT|Universal|Zulu)$/.test(name) ||
    name === "UT"
  ) return TimezoneRegion.UTC;

  // Google accepts a signed offset, optionally prefixed by GMT, UTC or UT.
  const match =
    /^(?:GMT|UTC|UT)?([+-])(?:(\d{2})(\d{2})|(\d{1,2})(?::(\d{1,2}))?)$/i.exec(
      name,
    );
  if (match != null) {
    const [, sign, compactHours, compactMinutes, colonHours, colonMinutes] =
      match;
    const hours = Number(compactHours ?? colonHours);
    const minutes = Number(compactMinutes ?? colonMinutes ?? 0);
    if (minutes >= 60 || hours * 60 + minutes > 18 * 60) return null;
    if (hours === 0 && minutes === 0) return TimezoneRegion.UTC;

    const offset = sign + String(hours).padStart(2, "0") + ":" +
      String(minutes).padStart(2, "0");
    const key = ("GMT" + offset) as Tzname;
    const epoch = "2000-01-01T00:00:00" + offset;
    const transition = TimezoneRegion.Transition.parse({
      before: epoch,
      after: epoch,
      before_tz_abbr: key,
      after_tz_abbr: key,
    }, key);
    return TimezoneRegion.fromCalendarTransitions(key, [transition]);
  }
  return undefined;
}

function googleDateZoneAlias(name: string): string {
  return GOOGLE_SHORT_TIMEZONES.get(name) ?? name;
}

/** Resolve built-in offsets directly and defer IANA lookup to the caller. */
export function loadedGoogleDateTimezone(
  name: string,
  findZone: (tz: Tzname) => TimezoneRegion | null | undefined,
): TimezoneRegion | null | undefined {
  const fixed = googleDateFixedZone(name);
  if (fixed !== undefined) return fixed;
  const region = findZone(googleDateZoneAlias(name) as Tzname);
  return region == null ? region : googleRecurrenceTimezone(region);
}

export async function resolveGoogleDateTimezone(
  name: string,
  fallback?: (timeZone: string) =>
    TimezoneRegion | null | undefined | Promise<TimezoneRegion | null | undefined>,
): Promise<TimezoneRegion | null> {
  const fixed = googleDateFixedZone(name);
  if (fixed !== undefined) return fixed ?? await fallback?.(name) ?? null;
  const alias = googleDateZoneAlias(name);
  let iana = knownGoogleDateTimezoneName(alias);
  if (iana === undefined) {
    const links = await TimezoneRegion.legacyNames();
    googleTimezoneAliases ??= new Set([...links.keys(), ...links.values()]);
    iana = knownGoogleDateTimezoneName(alias);
  }
  if (iana == null) return await fallback?.(name) ?? null;
  const region = await TimezoneRegion.getOpt(iana);
  return region == null
    ? await fallback?.(name) ?? TimezoneRegion.platformRecurrenceZone(iana)
    : googleRecurrenceTimezone(region);
}

export function googleRecurrenceTimezone(
  region: TimezoneRegion,
): TimezoneRegion {
  // Keep served transitions and extend the table where the platform offset
  // agrees at its boundary.
  return TimezoneRegion.forPlatformRecurrence(region, {
    extendServedPast: true,
    extendServedFuture: true,
  });
}

let googleTimezoneAliases: ReadonlySet<Tzname> | undefined;

/** Validate spelling without starting a legacy timezone table load. */
export function knownGoogleDateTimezoneName(name: string): Tzname | null | undefined {
  const iana = Tzname.parseOpt(name);
  if (iana == null) return null;
  const platformName = new Intl.DateTimeFormat("en", { timeZone: name }).resolvedOptions().timeZone;
  if (platformName === name) return iana;
  if (platformName.toUpperCase() === name.toUpperCase()) return null;
  // Both sides of a backward link can differ from the platform name.
  if (/^Etc\/(?:UTC|GMT(?:[+-]\d+)?)$/.test(name)) return iana;
  if (googleTimezoneAliases == null) return undefined;
  return googleTimezoneAliases.has(iana) ? iana : null;
}
