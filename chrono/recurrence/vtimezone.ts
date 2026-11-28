import { DateTime } from "../datetime.ts";
import type { NaiveDate } from "../naive-date.ts";
import { err, ok, type Result } from "../result.ts";
import { Time } from "../time.ts";
import { TimezoneRegion } from "../timezone-region.ts";
import type { FixedOffset, Tzname } from "../timezone.ts";
import type { MsSinceEpoch } from "../units/units.ts";
import {
  calendarContentLines,
  icalPropertyName,
  splitICalProperty,
} from "./ical-attributes.ts";
import {
  dateForm,
  decodeRfcText,
  rfcObservance,
  validateContentLine,
  validateRfcValueParameter,
} from "./rfc5545.ts";
import { IsoDate } from "./iso-date.ts";
import { type ICalendarRecurrenceOptions, RecurrenceSeries } from "./series.ts";

type Observance = NonNullable<ReturnType<typeof rfcObservance>>;

// RFC 3986 §3. The URI is parsed for syntax only.
const REG_NAME_CHAR = "(?:[A-Za-z0-9._~!$&'()*+,;=-]|%[0-9A-Fa-f]{2})";
const PCHAR = "(?:" + REG_NAME_CHAR + "|[:@])";
const URI_PATH = new RegExp("^(?:" + PCHAR + "|/)*$");
const URI_QUERY_OR_FRAGMENT = new RegExp("^(?:" + PCHAR + "|[/?])*$");
const URI_AUTHORITY = new RegExp(
  "^(?:(?:" + REG_NAME_CHAR + "|:)*@)?(\\[[^\\]]+\\]|" + REG_NAME_CHAR + "*)(?::[0-9]*)?$",
);
const IPV_FUTURE = /^v[0-9a-f]+\.[A-Za-z0-9._~!$&'()*+,;=:-]+$/i;

function isTimezoneUrl(value: string): boolean {
  const parts = /^[A-Za-z][A-Za-z0-9+.-]*:([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/.exec(value);
  if (parts == null) return false;
  const [, hierarchy, query = "", fragment = ""] = parts;
  if (!URI_QUERY_OR_FRAGMENT.test(query) || !URI_QUERY_OR_FRAGMENT.test(fragment)) return false;
  if (!hierarchy.startsWith("//")) return URI_PATH.test(hierarchy);

  const slash = hierarchy.indexOf("/", 2);
  const authority = hierarchy.slice(2, slash < 0 ? undefined : slash);
  const host = URI_AUTHORITY.exec(authority)?.[1];
  if (host == null) return false;
  if (host.startsWith("[")) {
    const literal = host.slice(1, -1);
    const ipv6 = /^[0-9A-Fa-f:.]+$/.test(literal) && URL.canParse("http://" + host);
    if (!ipv6 && !IPV_FUTURE.test(literal)) return false;
  }
  return slash < 0 || URI_PATH.test(hierarchy.slice(slash));
}

function readComponent(
  source: readonly string[],
): { name: Tzname; observances: Observance[]; validUntil?: MsSinceEpoch } {
  const lines = calendarContentLines(source);
  if (
    lines[0]?.toUpperCase() !== "BEGIN:VTIMEZONE" ||
    lines.at(-1)?.toUpperCase() !== "END:VTIMEZONE"
  ) {
    throw new Error("Expected one VTIMEZONE component");
  }

  let name: Tzname | undefined;
  let validUntil: MsSinceEpoch | undefined;
  let block: string[] | undefined;
  const observances: Observance[] = [];
  const seen = new Set<string>();
  for (const line of lines.slice(1, -1)) {
    const tag = icalPropertyName(line);
    if (block != null) {
      block.push(line);
      if (tag === "END") {
        const observance = rfcObservance(block);
        if (observance == null) {
          throw new Error("Expected STANDARD or DAYLIGHT in VTIMEZONE");
        }
        observances.push(observance);
        block = undefined;
      }
    } else if (tag === "BEGIN") {
      block = [line];
    } else {
      if (tag === "END") throw new Error("Unexpected END in VTIMEZONE");
      const content = splitICalProperty(line);
      if (content == null) throw new Error("Missing VTIMEZONE property value");
      validateContentLine(content);
      if (!["TZID", "LAST-MODIFIED", "TZURL", "TZUNTIL"].includes(tag)) continue;
      if (seen.has(tag)) {
        throw new Error(tag === "TZID" ? "VTIMEZONE requires exactly one TZID" : "Duplicate VTIMEZONE " + tag);
      }
      seen.add(tag);
      if (tag === "TZID") {
        validateRfcValueParameter(content.attributes, "TEXT");
        const zoneId = decodeRfcText(content.value, "VTIMEZONE TZID");
        if (zoneId === "") throw new Error("Invalid VTIMEZONE TZID");
        name = zoneId as Tzname;
      } else if (tag === "LAST-MODIFIED" || tag === "TZUNTIL") {
        validateRfcValueParameter(content.attributes, "DATE-TIME");
        const hasZone = content.attributes.slice(1).some((parameter) => /^TZID=/i.test(parameter));
        if (dateForm(content.value, hasZone) !== "utc") {
          throw new Error("VTIMEZONE " + tag + " requires UTC DATE-TIME");
        }
        if (tag === "TZUNTIL") validUntil = IsoDate.parse(content.value).exp().extend().mse;
      } else {
        validateRfcValueParameter(content.attributes, "URI");
        if (!isTimezoneUrl(content.value)) throw new Error("Invalid VTIMEZONE TZURL");
      }
    }
  }
  if (block != null) throw new Error("Unclosed VTIMEZONE observance");
  if (name == null) throw new Error("VTIMEZONE requires exactly one TZID");
  if (observances.length === 0) {
    throw new Error("VTIMEZONE requires at least one observance");
  }
  return { name, observances, validUntil };
}

/** Expand a calendar-defined zone through an inclusive UTC day. */
export async function readVTimeZone(
  source: readonly string[],
  { through, generationLimit, rfcTimeZone }: {
    through: NaiveDate;
    generationLimit?: number;
    rfcTimeZone?: ICalendarRecurrenceOptions["rfcTimeZone"];
  },
): Promise<Result<TimezoneRegion>> {
  try {
    const { name, observances, validUntil } = readComponent(source);
    // RFC 7808 §7.1 is exclusive, while through includes the entire UTC day.
    const coverageEnd = through.mse + Time.MS_PER_DAY;
    if (validUntil != null && coverageEnd > validUntil) {
      throw new Error("VTIMEZONE TZUNTIL does not cover the full UTC date " + through);
    }
    const onsets = new Map<MsSinceEpoch, Observance>();
    for (const observance of observances) {
      const parsed = await RecurrenceSeries.read(observance.lines, {
        rfcDateMode: "written",
        rfcTimeZone: (tzid) =>
          tzid === observance.zone.fullname
            ? observance.zone
            : rfcTimeZone?.(tzid),
      });
      if (parsed.isErr) return parsed.expeCast();
      for (
        const onset of parsed.exp().occurrences({ through, generationLimit })
      ) {
        if (!(onset instanceof DateTime)) {
          throw new Error("Expected an absolute VTIMEZONE onset");
        }
        const previous = onsets.get(onset.mse);
        if (previous != null && previous.to !== observance.to) {
          throw new Error("Conflicting VTIMEZONE onsets at " + onset);
        }
        if (previous == null) onsets.set(onset.mse, observance);
      }
    }
    if (onsets.size === 0) {
      throw new Error("No VTIMEZONE onset through " + through);
    }

    const transitions: TimezoneRegion.Transition[] = [];
    const atOffset = (offset: string, label: string) =>
      DateTime.fromRfc3339("1970-01-01T00:00:00" + offset, name, label).exp()
        .tz;
    let effective: DateTime<FixedOffset>["tz"] | undefined;
    for (const [mse, observance] of [...onsets].sort(([a], [b]) => a - b)) {
      const before = effective ?? atOffset(observance.from, observance.from);
      const abbreviation = observance.abbreviation || observance.component;
      effective = atOffset(observance.to, abbreviation);
      transitions.push({
        before: {
          mse,
          time: DateTime.fromMse(mse, before),
          tzabbr: before.info.tzabbr ?? before.id,
        },
        after: { time: DateTime.fromMse(mse, effective), tzabbr: abbreviation },
      });
    }
    return ok(TimezoneRegion.fromCalendarTransitions(
      name,
      transitions,
      coverageEnd,
    ));
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
