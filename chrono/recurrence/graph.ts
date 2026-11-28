import { DateTime } from "../datetime.ts";
import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { err, Result } from "../result.ts";
import { Time } from "../time.ts";
import { TimezoneRegion } from "../timezone-region.ts";
import { type FixedOffset, Tzname } from "../timezone.ts";
import {
  graphArgentinaAnchor,
  graphAustralianSeasons,
  graphBaghdad,
  graphBrazil2018Anchor,
  graphCuiaba,
  graphEgypt,
  graphEasterIsland,
  graphFiji,
  graphFixedOffset,
  graphFixedOffsetBefore,
  graphGrandTurk,
  graphHistoricalSamoa,
  graphHovd,
  graphIsrael,
  graphMexico,
  graphMorocco,
  graphMoroccoAnchor,
  graphNewfoundland,
  graphNewZealandHistory,
  graphNorthKoreaAnchor,
  graphNortheastBrazilWallTime,
  graphSaoPaulo,
  graphSouthernSeasons,
  graphRussianSeasons,
  graphHistoricalWindowsSeasons,
  graphVolgograd,
  graphVolgogradAnchor,
  graphWestBank,
  needsGraphHistoricalSamoa,
  resolveGraphNorthKoreaWallTime,
  resolveGraphSaoPauloWallTime,
  resolveGraphTongaWallTime,
  resolveGraphWallTime,
} from "./graph-timezones.ts";
import { GRAPH_WINDOWS_ZONES } from "./graph-windows-zones.ts";
import * as graphTimezones from "./graph-timezones.ts";
import { type BoundStart, readBoundGraphSeries, RecurrenceSeries } from "./series.ts";

const WEEKDAYS = {
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA",
  sunday: "SU",
} as const;

const INDICES = { first: 1, second: 2, third: 3, fourth: 4, last: -1 } as const;

// Live Graph captures match platform rules after the served transition table.
const PLATFORM_FUTURE_ZONES = new Set([
  "Alaskan Standard Time",
  "Aleutian Standard Time",
  "Atlantic Standard Time",
  "Azores Standard Time",
  "Central Europe Standard Time",
  "Central European Standard Time",
  "Central Standard Time",
  "Chatham Islands Standard Time",
  "Cuba Standard Time",
  "E. Europe Standard Time",
  "Easter Island Standard Time",
  "Eastern Standard Time",
  "FLE Standard Time",
  "GMT Standard Time",
  "GTB Standard Time",
  "Haiti Standard Time",
  "Lord Howe Standard Time",
  "Middle East Standard Time",
  "Mountain Standard Time",
  "New Zealand Standard Time",
  "Newfoundland Standard Time",
  "Norfolk Standard Time",
  "Pacific SA Standard Time",
  "Pacific Standard Time",
  "Pacific Standard Time (Mexico)",
  "Romance Standard Time",
  "Saint Pierre Standard Time",
  "Turks And Caicos Standard Time",
  "US Eastern Standard Time",
  "W. Europe Standard Time",
]);

const FIXED_WINDOWS_OFFSETS = new Map([
  ["Central America Standard Time", "-06:00"],
  ["Dateline Standard Time", "-12:00"],
  ["Hawaiian Standard Time", "-10:00"],
  ["UTC+12", "+12:00"],
  ["UTC+13", "+13:00"],
  ["UTC-02", "-02:00"],
  ["UTC-08", "-08:00"],
  ["UTC-09", "-09:00"],
  ["UTC-11", "-11:00"],
  ["Afghanistan Standard Time", "+04:30"],
  ["Aus Central W. Standard Time", "+08:45"],
  ["AUS Central Standard Time", "+09:30"],
  ["E. Australia Standard Time", "+10:00"],
  ["Canada Central Standard Time", "-06:00"],
  ["US Mountain Standard Time", "-07:00"],
  ["China Standard Time", "+08:00"],
  ["Taipei Standard Time", "+08:00"],
  ["Singapore Standard Time", "+08:00"],
  ["Korea Standard Time", "+09:00"],
  ["SA Pacific Standard Time", "-05:00"],
  ["SA Western Standard Time", "-04:00"],
  ["SA Eastern Standard Time", "-03:00"],
  ["Marquesas Standard Time", "-09:30"],
  ["Central Pacific Standard Time", "+11:00"],
  ["SE Asia Standard Time", "+07:00"],
  ["Tokyo Standard Time", "+09:00"],
  ["West Pacific Standard Time", "+10:00"],
  ["Greenwich Standard Time", "+00:00"],
  ["E. Africa Standard Time", "+03:00"],
  ["South Africa Standard Time", "+02:00"],
  ["Arab Standard Time", "+03:00"],
  ["Arabian Standard Time", "+04:00"],
  ["Cape Verde Standard Time", "-01:00"],
  ["Georgian Standard Time", "+04:00"],
  ["W. Central Africa Standard Time", "+01:00"],
  ["India Standard Time", "+05:30"],
  ["Myanmar Standard Time", "+06:30"],
  ["Nepal Standard Time", "+05:45"],
  ["Sri Lanka Standard Time", "+05:30"],
  ["Line Islands Standard Time", "+14:00"],
]);

// These Windows zones use a constant early offset followed by aligned IANA data.
const WINDOWS_EARLY_FIXED_OFFSETS = new Map<string, readonly [offset: string, firstIanaYear: number]>([
  ["Argentina Standard Time", ["-03:00", 2007]],
  ["Bahia Standard Time", ["-03:00", 2011]],
  ["Bangladesh Standard Time", ["+06:00", 2009]],
  ["Bougainville Standard Time", ["+10:00", 2014]],
  ["Libya Standard Time", ["+02:00", 2012]],
  ["Mauritius Standard Time", ["+04:00", 2008]],
  ["Norfolk Standard Time", ["+11:30", 2015]],
  ["North Korea Standard Time", ["+09:00", 2015]],
  ["Pakistan Standard Time", ["+05:00", 2008]],
  ["Tocantins Standard Time", ["-03:00", 2012]],
  ["Tonga Standard Time", ["+13:00", 2016]],
  ["Ulaanbaatar Standard Time", ["+08:00", 2015]],
  ["US Eastern Standard Time", ["-05:00", 2006]],
  ["Venezuela Standard Time", ["-04:00", 2007]],
  ["W. Australia Standard Time", ["+08:00", 2006]],
]);

const RUSSIAN_STANDARD_HOURS_BEFORE_2004 = new Map([
  ["Kaliningrad Standard Time", 2],
  ["Russian Standard Time", 3],
  ["Ekaterinburg Standard Time", 5],
  ["Omsk Standard Time", 6],
  ["Tomsk Standard Time", 6],
  ["Altai Standard Time", 6],
  ["N. Central Asia Standard Time", 6],
  ["North Asia Standard Time", 7],
  ["North Asia East Standard Time", 8],
  ["Yakutsk Standard Time", 9],
  ["Vladivostok Standard Time", 10],
  ["Magadan Standard Time", 11],
  ["Astrakhan Standard Time", 3],
  ["Saratov Standard Time", 3],
  ["Russia Time Zone 3", 4],
  ["Russia Time Zone 10", 11],
  ["Russia Time Zone 11", 12],
  ["Transbaikal Standard Time", 9],
  ["Sakhalin Standard Time", 10],
]);

type GraphWeekday = keyof typeof WEEKDAYS;
type GraphIndex = keyof typeof INDICES;
type GraphPattern = {
  type:
    | "daily"
    | "weekly"
    | "absoluteMonthly"
    | "relativeMonthly"
    | "absoluteYearly"
    | "relativeYearly";
  interval: number;
  daysOfWeek?: readonly GraphWeekday[];
  firstDayOfWeek?: GraphWeekday;
  index?: GraphIndex;
  dayOfMonth?: number;
  month?: number;
};

export interface GraphRecurringMaster {
  start: { dateTime: string; timeZone: string };
  end?: { dateTime: string; timeZone: string };
  originalStartTimeZone?: string;
  originalEndTimeZone?: string;
  isAllDay?: boolean;
  recurrence: {
    pattern: GraphPattern;
    range: {
      type: "noEnd" | "endDate" | "numbered";
      startDate: string;
      endDate?: string;
      numberOfOccurrences?: number;
      recurrenceTimeZone?: string;
    };
  };
}

export interface GraphRecurrenceOptions {
  /** Override the default IANA mapping for a Graph timezone identifier. */
  resolveTimeZone?: (graphName: string) => string | undefined;
  /** Original all-day recurrence zone when the Graph master omits it. */
  allDayTimeZone?: string;
  /**
   * Start of an unmodified timed occurrence on the range's first civil day.
   * Supply an RFC 3339 instant with an explicit offset. Its wall clock in the
   * recurrence zone must be the series clock, so avoid gap-shifted occurrences.
   */
  rangeStartOccurrence?: string;
}

function integer(
  value: number | undefined,
  label: string,
  max = Number.MAX_SAFE_INTEGER,
): number {
  if (!Number.isSafeInteger(value) || value! < 1 || value! > max) {
    throw new Error("Invalid Graph recurrence " + label);
  }
  return value!;
}

function patternParts(pattern: GraphPattern): string[] {
  const interval = "INTERVAL=" + integer(pattern.interval, "interval");
  switch (pattern.type) {
    case "daily":
      return ["FREQ=DAILY", interval];
    case "weekly": {
      const wkst = weekday(pattern.firstDayOfWeek ?? "sunday");
      return [
        "FREQ=WEEKLY",
        interval,
        "WKST=" + wkst,
        dayPart(pattern.daysOfWeek),
      ];
    }
    case "absoluteMonthly":
    case "absoluteYearly": {
      const parts = frequencyParts(pattern, interval);
      const day = integer(pattern.dayOfMonth, "dayOfMonth", 31);
      // Graph clamps to the last valid day of short months.
      const choices = day <= 28
        ? [day]
        : Array.from({ length: day - 27 }, (_, index) => 28 + index);
      return [...parts, "BYMONTHDAY=" + choices.join(","), "BYSETPOS=-1"];
    }
    case "relativeMonthly":
    case "relativeYearly": {
      const parts = frequencyParts(pattern, interval);
      const index = INDICES[pattern.index ?? "first"];
      if (index == null) throw new Error("Invalid Graph recurrence index");
      return [...parts, dayPart(pattern.daysOfWeek), "BYSETPOS=" + index];
    }
    default:
      throw new Error("Unsupported Graph recurrence pattern");
  }
}

function frequencyParts(pattern: GraphPattern, interval: string): string[] {
  return pattern.type.endsWith("Yearly")
    ? [
      "FREQ=YEARLY",
      interval,
      "BYMONTH=" + integer(pattern.month, "month", 12),
    ]
    : ["FREQ=MONTHLY", interval];
}

function weekday(value: GraphWeekday): string {
  const day = WEEKDAYS[value];
  if (day == null) throw new Error("Invalid Graph recurrence weekday");
  return day;
}

function dayPart(days: readonly GraphWeekday[] | undefined): string {
  if (!days?.length) throw new Error("Graph recurrence requires daysOfWeek");
  return "BYDAY=" + days.map(weekday).join(",");
}

const GRAND_TURK_FIXED_START = DateTime.fromRfc3339("2015-03-08T07:00:00Z").exp().mse;
const GRAND_TURK_CLOCK_SHIFT = DateTime.fromRfc3339("2017-11-05T06:00:00Z").exp().mse;
const GRAND_TURK_SEASONS_RESUME = NaiveDate.parse("2018-01-01").dse;

async function findGraphZone(name: string, startYear: number, override: string | undefined) {
  // Graph's stored-clock rules use the UTC wire name.
  const mapped = name === "UTC" ? name : GRAPH_WINDOWS_ZONES.get(name) ?? name;
  const candidate = Tzname.parseOpt(override ?? mapped);
  const baseZone = candidate == null ? null : await TimezoneRegion.getOpt(candidate);
  if (baseZone == null) return null;
  if (override != null) {
    return TimezoneRegion.forPlatformRecurrence(baseZone, { extendServedFuture: true });
  }
  const early = WINDOWS_EARLY_FIXED_OFFSETS.get(name);
  const zone = early == null ? baseZone : graphFixedOffsetBefore(baseZone, early[0], early[1]);
  const fixedOffset = FIXED_WINDOWS_OFFSETS.get(name);
  if (fixedOffset != null) return graphFixedOffset(zone, fixedOffset);
  if (name === "E. South America Standard Time") return graphSaoPaulo(zone);
  if (name === "Montevideo Standard Time") return graphSouthernSeasons(zone, startYear, "montevideo");
  if (name === "Namibia Standard Time") return graphSouthernSeasons(zone, startYear, "windhoek");
  if (name === "Arabic Standard Time") return graphBaghdad(zone);
  if (name === "W. Mongolia Standard Time") return graphHovd(zone, startYear);
  if (name === "Central Brazilian Standard Time") return graphCuiaba(zone, startYear);
  if (name === "Egypt Standard Time") return graphEgypt(zone);
  if (name === "Central Standard Time (Mexico)") return graphMexico(zone, 6);
  if (name === "Mountain Standard Time (Mexico)") return graphMexico(zone, 7);
  if (name === "Eastern Standard Time (Mexico)") {
    return graphMexico(zone, 6, {
      firstYear: Math.max(1, Math.min(startYear, 1996)),
      cancun: true,
    });
  }
  if (name === "Fiji Standard Time") return graphFiji(zone);
  if (name === "Israel Standard Time") return graphIsrael(zone);
  if (name === "AUS Eastern Standard Time") {
    return graphAustralianSeasons(zone, startYear, "east");
  }
  if (name === "Cen. Australia Standard Time") {
    return graphAustralianSeasons(zone, startYear, "central");
  }
  if (name === "Lord Howe Standard Time" && startYear < 2004) {
    return graphAustralianSeasons(zone, startYear, "lord-howe");
  }
  if (name === "Tasmania Standard Time") {
    return graphAustralianSeasons(zone, startYear, "tasmania");
  }
  if (name === "West Bank Standard Time") return graphWestBank(zone);
  const historicalHours = RUSSIAN_STANDARD_HOURS_BEFORE_2004.get(name);
  if (historicalHours != null && startYear < 2004) {
    return graphRussianSeasons(zone, historicalHours, startYear);
  }
  if (name === "Morocco Standard Time") return graphMorocco(zone);
  if (name === "Volgograd Standard Time") return graphVolgograd(zone);
  const seasons = graphHistoricalWindowsSeasons(zone, name, startYear) ??
    graphNewZealandHistory(zone, name, startYear) ?? zone;
  let historical = seasons;
  if (name === "Easter Island Standard Time") historical = graphEasterIsland(seasons, startYear);
  if (name === "Newfoundland Standard Time") historical = graphNewfoundland(seasons);
  if (name === "Turks And Caicos Standard Time") historical = graphGrandTurk(seasons, startYear);
  return PLATFORM_FUTURE_ZONES.has(name)
    ? TimezoneRegion.forPlatformRecurrence(historical, { extendServedFuture: true })
    : historical;
}

/** Drop fractional seconds without rounding the master clock into the next minute. */
function parseGraphMasterClock(value: string): Result<DateTime<FixedOffset>> {
  const whole = value.replace(/(:\d{2}:\d{2})\.\d+/, "$1");
  if (whole === value) return DateTime.fromRfc3339(value);
  const validated = DateTime.epochFromRfc3339(value);
  return validated.isErr ? validated.expeCast() : DateTime.fromRfc3339(whole);
}

function truncateGraphMinute(value: DateTime): DateTime {
  const remainder = value.ndt.time.toMs % Time.MS_PER_MIN;
  return remainder === 0 ? value : value.add({ ms: -remainder });
}

export async function readGraphRecurrence(
  master: GraphRecurringMaster,
  options: GraphRecurrenceOptions = {},
): Promise<Result<RecurrenceSeries>> {
  try {
    const { pattern, range } = master.recurrence;
    const startDay = NaiveDate.parse(range.startDate);
    const parts = patternParts(pattern);
    switch (range.type) {
      case "numbered":
        parts.push(
          "COUNT=" + integer(range.numberOfOccurrences, "numberOfOccurrences"),
        );
        break;
      case "endDate": {
        const end = NaiveDate.parse(range.endDate ?? "");
        if (end.dse < startDay.dse) {
          throw new Error("Graph recurrence endDate precedes startDate");
        }
        parts.push("UNTIL=" + end.ical());
        break;
      }
      case "noEnd":
        break;
      default:
        throw new Error("Unsupported Graph recurrence range");
    }

    const overrides = options.resolveTimeZone == null ? undefined : new Map<string, string | undefined>();
    const overrideFor = (name: string): string | undefined => {
      if (overrides == null) return undefined;
      if (!overrides.has(name)) overrides.set(name, options.resolveTimeZone?.(name));
      return overrides.get(name);
    };
    const findZone = async (name: string) => findGraphZone(name, startDay.yr, overrideFor(name));
    const requireZone = async (name: string) => {
      const zone = await findZone(name);
      if (zone == null) throw new Error("Unmapped Graph recurrence timezone: " + name);
      return zone;
    };
    const originalZone = master.isAllDay
      ? options.allDayTimeZone ?? master.originalStartTimeZone
      : master.originalStartTimeZone;
    const samoa = !range.recurrenceTimeZone &&
        originalZone === "Samoa Standard Time" &&
        needsGraphHistoricalSamoa(startDay) && overrideFor(originalZone) == null
      ? graphHistoricalSamoa(await requireZone("Pacific/Apia"))
      : undefined;
    let boundStart: BoundStart;
    let wireStart: DateTime | NaiveDateTime;
    let recurrenceZone: TimezoneRegion | undefined;
    let viewWallDurationMs: number | undefined;
    let resolveWallTime: typeof resolveGraphSaoPauloWallTime | undefined;
    if (master.isAllDay) {
      if (options.rangeStartOccurrence != null) {
        throw new Error("Graph rangeStartOccurrence requires a timed series");
      }
      const zoneName = range.recurrenceTimeZone || originalZone || master.start.timeZone;
      // Civil expansion is independent of the zone. calendarView needs it
      // for overlap selection, even when Graph displays the dates in UTC.
      recurrenceZone = samoa ??
        await findZone(zoneName).catch(() => null) ??
        undefined;
      const local = startDay.withTime();
      boundStart = { local, instant: local.asUtc(), zone: null, kind: "date" };
      wireStart = local;
    } else {
      const wireZone = samoa != null && master.start.timeZone === originalZone
        ? samoa
        : await requireZone(master.start.timeZone);
      const startValue = master.start.dateTime;
      const offset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(startValue);
      const parsedStart = parseGraphMasterClock(startValue);
      if (parsedStart.isErr) {
        throw new Error(`Invalid Graph start.dateTime ${JSON.stringify(startValue)}`, {
          cause: parsedStart.asErr(),
        });
      }
      const parsed = parsedStart.exp();
      const exact = offset ? parsed : wireZone.toRfc5545WallClock(parsed.ndt);
      // Graph stores seconds on the master but expands starts at minute precision.
      const instant = truncateGraphMinute(exact);
      // A bare range can still recur in the original zone when the server
      // serializes the master in UTC. Prefer it if it agrees with startDate.
      const namedRange = range.recurrenceTimeZone;
      const supplied = options.rangeStartOccurrence;
      const occurrence = supplied != null && /(?:Z|[+-]\d{2}:\d{2})$/i.test(supplied)
        ? DateTime.fromRfc3339(supplied).asOk()
        : null;
      if (supplied != null && occurrence == null) {
        throw new Error("Graph rangeStartOccurrence must be an RFC 3339 instant");
      }
      let original = samoa == null && !namedRange && originalZone
        ? await findZone(originalZone)
        : null;
      const grandTurkFixedRange = original != null && wireZone.fullname === "UTC" &&
        originalZone === "Turks And Caicos Standard Time" && overrideFor(originalZone) == null &&
        instant.mse >= GRAND_TURK_FIXED_START && startDay.dse < GRAND_TURK_SEASONS_RESUME;
      if (grandTurkFixedRange && original != null) original = graphFixedOffset(original, "-04:00");
      const namedZone = namedRange ? await requireZone(namedRange) : undefined;
      // Graph can retain an IANA original name while returning its Windows
      // counterpart on the range. Distinct Windows names retain their own rules.
      const sameOriginalZone = !namedRange || namedRange === originalZone ||
        (wireZone.fullname === "UTC" && !namedRange.includes("/") && originalZone?.includes("/") &&
          (await findZone(originalZone))?.fullname === namedZone?.fullname);
      const storedName = namedRange || originalZone;
      const storedClockZone = wireZone.fullname === "UTC" && sameOriginalZone &&
          storedName != null && overrideFor(storedName) == null
        ? storedName
        : undefined;
      const volgogradAnchor = storedClockZone === "Volgograd Standard Time"
        ? graphVolgogradAnchor(instant.toUtc(), startDay, Boolean(namedRange))
        : undefined;
      const fallback = original != null &&
          (original.toTz(occurrence ?? instant).ndt.date.dse === startDay.dse ||
            volgogradAnchor?.date.dse === startDay.dse)
        ? original
        : wireZone;
      const rangeZone = samoa ?? namedZone ?? fallback;
      const projected = rangeZone.toTz(instant);
      const local: NaiveDateTime = projected.ndt;
      const anchorZone = namedZone != null || fallback === original ? storedClockZone : undefined;
      let anchor = anchorZone == null ? local : volgogradAnchor ?? local;
      if (anchorZone === "Morocco Standard Time") {
        anchor = graphMoroccoAnchor(
          instant.toUtc(),
          local,
          Boolean(range.recurrenceTimeZone),
        );
      } else if (
        anchorZone === "E. South America Standard Time" ||
        anchorZone === "Central Brazilian Standard Time"
      ) {
        anchor = graphBrazil2018Anchor(
          startDay,
          local,
          Boolean(range.recurrenceTimeZone),
        );
      } else if (anchorZone === "Argentina Standard Time") {
        anchor = graphArgentinaAnchor(startDay, local, Boolean(namedRange));
      } else if (
        anchorZone === "North Korea Standard Time"
      ) {
        anchor = graphNorthKoreaAnchor(startDay, local);
      } else if (
        anchorZone === "Turks And Caicos Standard Time" &&
        instant.mse >= GRAND_TURK_CLOCK_SHIFT && startDay.dse < GRAND_TURK_SEASONS_RESUME
      ) {
        if (grandTurkFixedRange) {
          // The omitted timezone preserves a fixed recurrence clock after the 2017 fold.
          anchor = local.add({ ms: -Time.MS_PER_HR });
        } else if (local.time.toMs >= 22 * Time.MS_PER_HR && local.time.toMs < 23 * Time.MS_PER_HR) {
          // Graph stores the near-midnight variant on the previous evening.
          anchor = local.add({ ms: Time.MS_PER_HR });
        }
      }
      const rangeName = namedRange || (fallback === original ? originalZone : master.start.timeZone);
      const rangeZoneName = rangeName != null && overrideFor(rangeName) == null ? rangeName : undefined;
      if (rangeZoneName === "E. South America Standard Time") {
        resolveWallTime = resolveGraphSaoPauloWallTime;
      } else if (rangeZoneName === "Tonga Standard Time") {
        resolveWallTime = resolveGraphTongaWallTime;
      } else if (rangeZoneName === "Bahia Standard Time") {
        resolveWallTime = graphNortheastBrazilWallTime("bahia");
      } else if (rangeZoneName === "Tocantins Standard Time") {
        resolveWallTime = graphNortheastBrazilWallTime("tocantins");
      } else if (
        rangeZoneName === "North Korea Standard Time" && startDay.yr < 2014
      ) {
        resolveWallTime = resolveGraphNorthKoreaWallTime;
      }
      recurrenceZone = rangeZone;
      if (
        occurrence == null && samoa == null && anchor === local &&
        wireZone.fullname === "UTC" && exact.tz.info.offset.toMs === 0 && master.end?.timeZone === "UTC"
      ) {
        const end = parseGraphMasterClock(master.end.dateTime).asOk();
        if (end != null && end.tz.info.offset.toMs === 0 && end.mse >= exact.mse) {
          // Truncate the wire endpoints independently, then recover their local clocks.
          const minuteEnd = truncateGraphMinute(end);
          const localEnd = rangeZone.toTz(minuteEnd).ndt;
          const resolve = resolveWallTime ?? resolveGraphWallTime;
          if (localEnd.mse >= local.mse && resolve(rangeZone, local).mse === instant.mse &&
            resolve(rangeZone, localEnd).mse === minuteEnd.mse) {
            viewWallDurationMs = localEnd.mse - local.mse;
          }
        }
      }
      if (occurrence != null) {
        const selected = rangeZone.toTz(occurrence);
        const observedWall = selected.ndt;
        if (observedWall.date.dse !== startDay.dse) {
          throw new Error("Graph rangeStartOccurrence must fall on startDate");
        }
        const resolved = (resolveWallTime ?? resolveGraphWallTime)(rangeZone, observedWall);
        if (observedWall.time.toMs % Time.MS_PER_MIN !== 0 || resolved.mse !== occurrence.mse) {
          throw new Error("Graph rangeStartOccurrence cannot determine the recurrence clock");
        }
        boundStart = samoa != null
          ? { local: observedWall, instant: observedWall.asUtc(), zone: null, kind: "floating" }
          : { local: observedWall, instant: selected, zone: rangeZone, kind: "instant" };
        wireStart = samoa != null ? observedWall : occurrence;
      } else {
        if (anchor.date.dse !== startDay.dse) {
          throw new Error("Graph startDate does not match the master");
        }
        boundStart = samoa != null
          ? { local, instant: local.asUtc(), zone: null, kind: "floating" }
          : {
            local: anchor,
            instant: anchor === local ? projected : rangeZone.toRfc5545WallClock(anchor),
            zone: rangeZone,
            kind: "instant",
          };
        wireStart = samoa != null ? local : anchor === local ? instant : anchor;
      }
    }
    const rule = "RRULE:" + parts.join(";");
    const { local, instant, zone } = boundStart;
    // Keep the text path for values that can change across its wire encoding.
    const utcYear = wireStart instanceof DateTime ? instant.toUtc().ndt.date.yr : local.date.yr;
    if (local.date.yr >= 0 && local.date.yr <= 9999 && utcYear >= 0 && utcYear <= 9999 &&
      local.time.ms === 0 && (zone == null || /^[A-Za-z0-9_+./-]+$/.test(zone.fullname))) {
      return RecurrenceSeries[readBoundGraphSeries](
        rule, boundStart, graphTimezones, samoa, recurrenceZone, resolveWallTime, viewWallDurationMs,
      );
    }
    return await RecurrenceSeries.readGraph(
      rule,
      boundStart.kind === "date" ? { date: local.date.toString() } : {
        dateTime: wireStart instanceof DateTime ? wireStart.toUtc().toString() : wireStart.toString(),
        timeZone: zone?.fullname,
      },
      samoa,
      recurrenceZone,
      resolveWallTime,
      viewWallDurationMs,
    );
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
