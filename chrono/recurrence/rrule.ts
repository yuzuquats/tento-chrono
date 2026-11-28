import {
  DateUnit,
  Month,
  NaiveDate,
  PartialDate,
  Result,
  Tzname,
  Weekday,
  err,
  ok,
} from "../mod.ts";
import { TentoMath } from "../utils.ts";
import { ExDate } from "./exdate.ts";
import { frequencies, Frequency } from "./frequency.ts";
import { googleJulianDayFilter, googleJulianPeriodFilter, googleJulianWeekFilter } from "./google-julian-calendar.ts";
import { ICalAttributes, icalPropertyName, splitICalProperty } from "./ical-attributes.ts";
import { googleWrappedYearlyFilter } from "./google-yearly-day-wrap.ts";
import { IsoDate } from "./iso-date.ts";
import type { Option, Optional } from "../option.ts";
import type { TimezoneRegion } from "../timezone-region.ts";
import type { Month1 } from "../units/units.ts";

export interface RRuleLike {
  freq: Frequency;
  options?: Optional<{
    wkst: Weekday;
    interval: number;
    count: number;
    bysetpos: number[];
    byday: Weekday[];
    bynthday: Weekday.Nth[];
    /** First period whose ordinal weekday mask cannot be built. */
    dateutilOrdinalMaskError: { period: NaiveDate; message: string };
    /** Under mask lookahead, a candidate before DTSTART can still end UNTIL. */
    dateutilCheckUntilBeforeStart: boolean;
    /** Original offset when dateutil's UNTIL is stored as an aware wall time. */
    dateutilUntilOffsetMs: number;
    dateutilUntilUsesWall: boolean;
    /** Stop the dateutil counter at Python's maximum datetime year. */
    dateutilBoundedCalendar: boolean;
    /** Rebuild the stationary period at the dateutil cursor boundary. */
    dateutilSinglePeriod: boolean;
    /** Calendar anchor distinct from the original DTSTART on a backward step. */
    dateutilPeriodStart: NaiveDate;
    /** Exact signed interval for dateutil’s backward calendar or clock steps. */
    dateutilNegativeInterval: string;
    /** Written clock values when conversion to Number loses precision. */
    dateutilClockIntegers: Partial<Record<"byhour" | "byminute" | "bysecond", string[]>>;
    /** A programmatic empty selector contributes no expanded clock values. */
    dateutilEmptyClock: boolean;
    dateutilEmptyClockPhase: boolean;
    /** Calendar validation can still fail even when an empty clock yields no starts. */
    dateutilValidateEmptyCalendar: boolean;
    dateutilOrdinalIntegers: { weekday: Weekday; value: string }[];
    /** The library profiles apply ordinary and ordinal BYDAY masks independently. */
    intersectWeekdaySelectors: boolean;
    /** Google applies ordinal weekdays to the containing year or month in submonthly rules. */
    ordinalWeekdayPeriod: "year" | "month";
    /** Wrapped Google day stride for a weekly rule with implicit BYDAY. */
    googleWeeklyCadence: { start: NaiveDate; days: number };
    /** Google yearly periods whose day ordinals wrap into the calendar. */
    googleYearlyDayWrap: boolean;
    googleYearlyOrdinalRewind: boolean;
    /** Use the Julian-to-Gregorian calendar for an early Google master. */
    googleJulianCalendar: "continuous" | "nominal";
    /** Google retains a positive weekly position until the week number changes. */
    googlePositiveWeeklyPositions: boolean;
    bymonth: number[];
    /** Google yearly month-day rules without an explicit month use the master month. */
    implicitYearlyMonth: Month1;
    bymonthday: number[];
    byweekno: number[];
    /** The library profiles use calendar-year week masks. */
    libraryWeekNumberStart: NaiveDate;
    /** RFC yearly periods containing BYWEEKNO advance by week-numbering year. */
    rfcWeekYear: boolean;
    byyearday: number[];
    /** Western Easter offsets, populated by the dateutil profile. */
    byeaster: { offsets: number[]; start?: NaiveDate };
    /** The single offset parsed by rrule.js, including NaN for a list. */
    rruleJsEasterOffset: number;
    /** Calendar bounds, clock multiplicity, carry, and precision for rrule.js. */
    rruleJsClock: boolean;
    /** Clock selectors that the JS reference parses as strings or mixed arrays. */
    rruleJsClockText: Partial<Record<"byhour" | "byminute" | "bysecond", string | (number | string)[]>>;
    /** Written noninteger INTERVAL; the reference retains it as text. */
    rruleJsIntervalText: string;
    /** Keep string week numbers for rrule.js comparisons and boundary masks. */
    rruleJsWeekNumbers: (number | string)[];
    /** Reference host used when an empty initial clock set falls back to a Date. */
    rruleJsHostZone: TimezoneRegion;
    byhour: number[];
    byminute: number[];
    bysecond: number[];
    until: IsoDate;
    tzid: Tzname;
  }>;
}

const RULE_PREFIX = new Map(frequencies.map((freq) => [
  freq,
  `RRULE:FREQ=${Frequency.serialize(freq)}`,
]));

const DEFAULT_PARAMETER_ORDER = [
  "FREQ",
  "WKST",
  "COUNT",
  "INTERVAL",
  "BYSETPOS",
  "BYDAY",
  "BYMONTH",
  "BYMONTHDAY",
  "BYWEEKNO",
  "BYYEARDAY",
  "BYHOUR",
  "BYMINUTE",
  "BYSECOND",
  "UNTIL",
];

function ruleOptions(
  byday: Option<Weekday[]> = null,
  bynthday: Option<Weekday.Nth[]> = null,
  until: Option<IsoDate> = null,
): NonNullable<RRuleLike["options"]> {
  return {
    wkst: null,
    interval: null,
    count: null,
    bysetpos: null,
    byday,
    bynthday,
    bymonth: null,
    bymonthday: null,
    byweekno: null,
    byyearday: null,
    byhour: null,
    byminute: null,
    bysecond: null,
    tzid: undefined,
    until,
  };
}

// These fields resolve independently. Keep other syntax on the general parser.
const SCALAR_RULE = /^(?:RRULE:)?FREQ=([A-Z]+)(?:;(COUNT|INTERVAL)=([^;=]*))?(?:;(COUNT|INTERVAL)=([^;=]*))?$/;

/** @internal Read independently resolved scalar fields. */
export function parseScalarRule(line: string, positiveIntegersOnly = false): RRule | undefined {
  const fields = SCALAR_RULE.exec(line);
  if (fields == null || fields[0].length !== line.length) return;
  const [, frequency, firstKey, firstValue, secondKey, secondValue] = fields;
  if (firstKey != null && firstKey === secondKey) return;
  if (positiveIntegersOnly &&
    ((firstKey != null && !isPositiveScalar(firstValue)) || (secondKey != null && !isPositiveScalar(secondValue)))) return;
  const freq = Frequency.parse(frequency);
  if (freq == null) return;
  const options = ruleOptions();
  const order = ["FREQ"];
  if (firstKey != null) {
    if (firstKey === "COUNT") {
      order.push("COUNT");
      options.count = TentoMath.parseOpt(firstValue);
    } else {
      order.push("INTERVAL");
      options.interval = TentoMath.parseOpt(firstValue);
    }
  }
  if (secondKey != null) {
    if (secondKey === "COUNT") {
      order.push("COUNT");
      options.count = TentoMath.parseOpt(secondValue);
    } else {
      order.push("INTERVAL");
      options.interval = TentoMath.parseOpt(secondValue);
    }
  }
  return new RRule({ freq, options }, order);
}

function isPositiveScalar(text: string): boolean {
  if (text === "" || /\D/.test(text)) return false;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0;
}

function formatOrdinalWeekdays(days: Option<Weekday.Nth[]>): string[] {
  return days == null
    ? []
    : days.map((day) => day.n + Weekday.toString2cap(day.weekday));
}

function formatNonScalarParameter(
  param: string,
  options: RRuleLike["options"],
): string | undefined {
  let part: string | undefined;
  switch (param) {
    case "WKST":
      if (options?.wkst)
        part = `WKST=${Weekday.toString2cap(options.wkst)}`;
      break;
    case "BYSETPOS":
      if (options?.bysetpos != null && options.bysetpos.length > 0)
        part = `BYSETPOS=${options.bysetpos.join(",")}`;
      break;
    case "BYDAY":
      if (!options?.byday?.length && !options?.bynthday?.length) break;
      const selectors = [
        ...(options?.byday ?? []).map(Weekday.toString2cap),
        ...formatOrdinalWeekdays(options?.bynthday),
      ];
      if (selectors.length > 0) part = "BYDAY=" + selectors.join(",");
      break;
    case "BYMONTH":
      if (options?.bymonth != null && options.bymonth.length > 0)
        part = `BYMONTH=${options.bymonth.join(",")}`;
      break;
    case "BYMONTHDAY":
      if (options?.bymonthday != null && options.bymonthday.length > 0)
        part = `BYMONTHDAY=${options.bymonthday.join(",")}`;
      break;
    case "BYWEEKNO":
      if (options?.byweekno != null && options.byweekno.length > 0)
        part = `BYWEEKNO=${options.byweekno.join(",")}`;
      break;
    case "BYYEARDAY":
      if (options?.byyearday != null && options.byyearday.length > 0)
        part = `BYYEARDAY=${options.byyearday.join(",")}`;
      break;
    case "BYHOUR":
      if (options?.byhour != null && options.byhour.length > 0)
        part = `BYHOUR=${options.byhour.join(",")}`;
      break;
    case "BYMINUTE":
      if (options?.byminute != null && options.byminute.length > 0)
        part = `BYMINUTE=${options.byminute.join(",")}`;
      break;
    case "BYSECOND":
      if (options?.bysecond != null && options.bysecond.length > 0)
        part = `BYSECOND=${options.bysecond.join(",")}`;
      break;
    case "UNTIL":
      if (options?.until != null) {
        part = `UNTIL=${options.until.ical()}`;
      }
      break;
  }
  return part;
}

// The caller has already checked the first loop condition.
function appendRemainingRuleParameters(
  line: string,
  order: string[],
  options: RRuleLike["options"],
  first: number,
  index: number,
  custom: boolean,
  seen: Set<string> | undefined,
): string {
  do {
    const param = order[index];
    if (param === "FREQ") continue;
    if (seen !== undefined) {
      if (seen.has(param)) continue;
      seen.add(param);
    } else if (custom && index > first && order.indexOf(param) !== index) {
      continue;
    }
    if (param === "COUNT") {
      if (options?.count != null) line += (line === "" ? "RRULE:COUNT=" : ";COUNT=") + options.count;
      continue;
    }
    if (param === "INTERVAL") {
      if (options?.interval != null) line += (line === "" ? "RRULE:INTERVAL=" : ";INTERVAL=") + options.interval;
      continue;
    }
    const part = formatNonScalarParameter(param, options);
    if (part !== undefined) line += line === "" ? "RRULE:" + part : ";" + part;
  } while (++index < order.length);
  return line;
}

type EasterSelector = NonNullable<NonNullable<RRuleLike["options"]>["byeaster"]>;

const exactEasterOffsets = new WeakMap<EasterSelector, string[]>();

/** @internal Keep exact dateutil integers for expansion behind the numeric public view. */
export function dateutilEasterSelector(offsets: string[], start?: NaiveDate): EasterSelector {
  const selector = { offsets: offsets.map(Number), start };
  exactEasterOffsets.set(selector, offsets);
  return selector;
}

/** @internal Return the offsets used by the traversal. */
export function easterOffsets(selector: EasterSelector): readonly (number | string)[] {
  return exactEasterOffsets.get(selector) ?? selector.offsets;
}

export class RRule {
  readonly exdates: IsoDate[] = [];
  /**
   * The series' RDATE lines, verbatim (`parseWithRecurrence`), written back
   * by `toRecurrenceArray` so an edit that re-serializes the rule keeps the
   * instances they add (RFC 5545 §3.8.5.2).
   */
  readonly rdateLines: string[] = [];
  /**
   * EXDATE lines that carry parameters (a TZID or a VALUE), verbatim: their
   * values are also in `exdates` (an `IsoDate` drops the TZID), but
   * `toRecurrenceArray` writes these lines back as they came, so a TZID's
   * wall time keeps its zone across an edit. `exdates` added since (or
   * from plain lines) are written as one plain `EXDATE:` line.
   */
  readonly exdateLines: string[] = [];
  /** The `exdates` that came from `exdateLines` (by identity), not re-written on the plain line. */
  #fromExdateLines?: Set<IsoDate>;

  constructor(
    readonly inner: RRuleLike,
    readonly parameterOrder: Option<string[]> = null,
  ) {}

  static parse(ser: string, parseUntil?: typeof IsoDate.parse): Result<RRule> {
    const scalar = parseScalarRule(ser);
    return scalar == null ? RRule.Raw.parse(ser).resolve(parseUntil) : ok(scalar);
  }

  static parseWithRecurrence(recurrence: string[]): Result<RRule> {
    const rruleString = recurrence.find((r) => /^RRULE:/i.test(r));
    if (!rruleString) return err(Error("No RRULE found in recurrence"));

    const parseResult = RRule.parse(rruleString);
    if (parseResult.isErr) return parseResult;

    const rrule = parseResult.asOk()!;

    for (const line of recurrence) if (icalPropertyName(line) === "RDATE") rrule.rdateLines.push(line);

    // Parse all EXDATE lines using the new ExDate parser
    const exdateLines = recurrence.filter((r) => icalPropertyName(r) === "EXDATE");

    for (const exdateLine of exdateLines) {
      const exdateResult = ExDate.parse(exdateLine);
      if (!exdateResult.isOk) {
        return exdateResult.expeCast();
      }

      const exdate = exdateResult.asOk()!;
      const parameterized = splitICalProperty(exdateLine)!.attributes.length > 1;
      if (parameterized) rrule.exdateLines.push(exdateLine);
      // Add all parsed dates from this EXDATE line
      for (const isoDate of exdate.dates) {
        rrule.exdates.push(isoDate);
        if (parameterized) (rrule.#fromExdateLines ??= new Set()).add(isoDate);
      }
    }

    return ok(rrule);
  }

  addExdate(date: IsoDate): void {
    this.exdates.push(date);
  }

  /**
   * Give `target` (a rule re-cut from this one) this rule's EXDATEs — the
   * parameterized lines verbatim — and the RDATE lines `rdateLines`
   * (default: all of them).
   */
  carryListsTo(target: RRule, rdateLines: readonly string[] = this.rdateLines): void {
    for (const d of this.exdates) {
      target.exdates.push(d);
      if (this.#fromExdateLines?.has(d)) (target.#fromExdateLines ??= new Set()).add(d);
    }
    target.exdateLines.push(...this.exdateLines);
    target.rdateLines.push(...rdateLines);
  }

  /** The recurrence lines: the RRULE, the EXDATEs and the RDATE lines (`rdateLines` overrides them). */
  toRecurrenceArray(rdateLines: readonly string[] = this.rdateLines): string[] {
    const result: string[] = [this.toString()];

    const plain = this.exdates.filter((d) => !this.#fromExdateLines?.has(d));
    if (plain.length > 0) {
      // Format the plain exdates as a single EXDATE line
      const exdateStrs = plain.map((d) => d.ical());
      result.push(`EXDATE:${exdateStrs.join(",")}`);
    }
    result.push(...this.exdateLines);
    result.push(...rdateLines);

    return result;
  }

  toString(): string {
    const customOrder = this.parameterOrder;
    const order = customOrder ?? DEFAULT_PARAMETER_ORDER;
    // Short orders can check for duplicates directly. Longer custom orders
    // use a set to keep traversal linear.
    const seen = customOrder != null && order.length > DEFAULT_PARAMETER_ORDER.length
      ? new Set<string>() : undefined;
    const { freq, options } = this.inner;
    const first = order[0] === "FREQ" ? 1 : 0;
    let line = freq && (first === 1 || order.includes("FREQ"))
      ? (RULE_PREFIX.get(freq) ?? `RRULE:FREQ=${Frequency.serialize(freq)}`) : "";
    if (!(first < order.length)) return line;
    let index = first;
    if (seen === undefined) {
      // Write the first parameter before checking the live order again.
      const param = order[index++];
      if (param === "COUNT") {
        if (options?.count != null) line += (line === "" ? "RRULE:COUNT=" : ";COUNT=") + options.count;
      } else if (param === "INTERVAL") {
        if (options?.interval != null) line += (line === "" ? "RRULE:INTERVAL=" : ";INTERVAL=") + options.interval;
      } else if (param !== "FREQ") {
        const part = formatNonScalarParameter(param, options);
        if (part !== undefined) line += line === "" ? "RRULE:" + part : ";" + part;
      }
      if (!(index < order.length)) return line;
    }
    return appendRemainingRuleParameters(line, order, options, first, index, customOrder != null, seen);
  }

  toReadableDisplay(): string {
    const options = this.inner.options;
    const interval = options?.interval === 0 ? 1 : (options?.interval ?? 1);
    let description = "";

    // Build frequency description
    switch (this.inner.freq) {
      case "daily":
        if (interval === 1) {
          description = "Daily";
        } else {
          description = `Every ${interval} days`;
        }
        break;
      case "weekly":
        if (interval === 1) {
          description = "Weekly";
        } else {
          description = `Every ${interval} weeks`;
        }
        break;
      case "monthly":
        if (interval === 1) {
          description = "Monthly";
        } else {
          description = `Every ${interval} months`;
        }
        break;
      case "yearly":
        if (interval === 1) {
          description = "Yearly";
        } else {
          description = `Every ${interval} years`;
        }
        break;
      case "hourly":
        if (interval === 1) {
          description = "Hourly";
        } else {
          description = `Every ${interval} hours`;
        }
        break;
      case "minutely":
        if (interval === 1) {
          description = "Every minute";
        } else {
          description = `Every ${interval} minutes`;
        }
        break;
      case "secondly":
        if (interval === 1) {
          description = "Every second";
        } else {
          description = `Every ${interval} seconds`;
        }
        break;
    }

    // Add weekday constraints for weekly frequency
    if (
      this.inner.freq === "weekly" &&
      options?.byday &&
      options.byday.length > 0
    ) {
      const dayNames = options.byday.map((day) => {
        switch (day) {
          case Weekday.SUN:
            return "Sunday";
          case Weekday.MON:
            return "Monday";
          case Weekday.TUE:
            return "Tuesday";
          case Weekday.WED:
            return "Wednesday";
          case Weekday.THU:
            return "Thursday";
          case Weekday.FRI:
            return "Friday";
          case Weekday.SAT:
            return "Saturday";
          default:
            return day.toString();
        }
      });

      if (dayNames.length === 1) {
        description += ` on ${dayNames[0]}`;
      } else if (dayNames.length === 2) {
        description += ` on ${dayNames[0]} and ${dayNames[1]}`;
      } else {
        const lastDay = dayNames.pop();
        description += ` on ${dayNames.join(", ")} and ${lastDay}`;
      }
    }

    // Add nth weekday constraints for monthly frequency
    if (
      this.inner.freq === "monthly" &&
      options?.bynthday &&
      options.bynthday.length > 0
    ) {
      const nthDayDescriptions = options.bynthday.map((nthDay) => {
        const ordinal =
          nthDay.n === -1
            ? "last"
            : nthDay.n === 1
              ? "1st"
              : nthDay.n === 2
                ? "2nd"
                : nthDay.n === 3
                  ? "3rd"
                  : `${nthDay.n}th`;

        const dayName = (() => {
          switch (nthDay.weekday) {
            case Weekday.SUN:
              return "Sunday";
            case Weekday.MON:
              return "Monday";
            case Weekday.TUE:
              return "Tuesday";
            case Weekday.WED:
              return "Wednesday";
            case Weekday.THU:
              return "Thursday";
            case Weekday.FRI:
              return "Friday";
            case Weekday.SAT:
              return "Saturday";
            default:
              return nthDay.weekday.toString();
          }
        })();

        return `${ordinal} ${dayName}`;
      });

      if (nthDayDescriptions.length === 1) {
        description += ` on the ${nthDayDescriptions[0]}`;
      } else {
        const lastDesc = nthDayDescriptions.pop();
        description += ` on the ${nthDayDescriptions.join(", ")} and ${lastDesc}`;
      }
    }

    // Add month day constraints
    if (options?.bymonthday && options.bymonthday.length > 0) {
      const dayNumbers = options.bymonthday.map((day) => day.toString());
      if (dayNumbers.length === 1) {
        description += ` on day ${dayNumbers[0]}`;
      } else {
        const lastDay = dayNumbers.pop();
        description += ` on days ${dayNumbers.join(", ")} and ${lastDay}`;
      }
    }

    // Add month constraints for yearly frequency
    if (
      this.inner.freq === "yearly" &&
      options?.bymonth &&
      options.bymonth.length > 0
    ) {
      const monthNames = options.bymonth.map((month) => {
        const monthIndex = month - 1; // Convert 1-based to 0-based
        const monthName = Month.MONTHS_OF_YEAR[monthIndex];
        return monthName ?? month.toString();
      });

      if (monthNames.length === 1) {
        description += ` in ${monthNames[0]}`;
      } else {
        const lastMonth = monthNames.pop();
        description += ` in ${monthNames.join(", ")} and ${lastMonth}`;
      }
    }

    // Add ending conditions
    if (options?.count != null) {
      description += `, ${options.count} times`;
    } else if (options?.until) {
      const untilDate = options.until.trunc();
      description += `, until ${untilDate.toString()}`;
    }

    return description;
  }

  /**
   * Whether the rule places instances below the day: an HOURLY, MINUTELY or
   * SECONDLY frequency, or BYHOUR / BYMINUTE / BYSECOND. Such a rule's
   * instances come from `RRuleInstances.expand`; the date generator
   * (`toFilterProps`) places one instance a day, at DTSTART's time.
   */
  hasTimeParts(): boolean {
    const options = this.inner.options;
    return this.inner.freq === "hourly" ||
      this.inner.freq === "minutely" ||
      this.inner.freq === "secondly" ||
      (options?.byhour?.length ?? 0) > 0 ||
      (options?.byminute?.length ?? 0) > 0 ||
      (options?.bysecond?.length ?? 0) > 0;
  }

  toFilterProps(
    limit?: Option<number>,
    end?: Option<NaiveDate>,
    useGoogleCalendarBehavior?: boolean,
    untilDateOverride?: Option<NaiveDate>,
    ignoreTimeParts: boolean = false,
    googleYearlyStart?: NaiveDate | null,
    deferSetPos = false,
  ): NaiveDate.FilterProps {
    const options = this.inner.options;

    let step: DateUnit;
    const rawInterval = options?.interval ?? 1;
    if (!Number.isSafeInteger(rawInterval) || rawInterval < 0) throw new RangeError("recurrence interval must be a nonnegative safe integer");
    const interval = Math.max(1, rawInterval);
    const cadence = options?.googleWeeklyCadence;
    const groupWrappedWeeks = cadence != null && cadence.days < 7 && Boolean(options?.bysetpos?.length);

    // Google Calendar behavior: BYWEEKNO with monthly/weekly frequency generates consecutive weekly events
    const hasWeekNoFilter = options?.byweekno && options.byweekno.length > 0;
    const shouldUseWeeklyStep =
      useGoogleCalendarBehavior &&
      hasWeekNoFilter &&
      (this.inner.freq === "monthly" || this.inner.freq === "weekly");

    if (options?.googleJulianCalendar === "nominal" && this.inner.freq === "daily") {
      step = DateUnit.months(1);
    } else if (shouldUseWeeklyStep) {
      step = DateUnit.weeks(1);
    } else {
      switch (this.inner.freq) {
        case "yearly":
          step = DateUnit.years(interval);
          break;
        case "monthly":
          step = DateUnit.months(interval);
          break;
        case "weekly":
          step = cadence == null ? DateUnit.weeks(interval)
            : groupWrappedWeeks ? DateUnit.weeks(1)
            : DateUnit.days(cadence.days);
          break;
        case "daily":
          step = DateUnit.days(interval);
          break;
        case "hourly":
        case "minutely":
        case "secondly":
          // For sub-daily frequencies, use daily step
          step = DateUnit.days(1);
          break;
        default:
          step = DateUnit.days(1);
      }
    }

    // Build filters array
    const filters: NaiveDate.Filter[] = [];
    const rfcWeeks = options?.rfcWeekYear ? options.byweekno : undefined;
    if (rfcWeeks != null) {
      filters.push(NaiveDate.Filter.byWeekOfRecurrenceYear(rfcWeeks, options?.wkst ?? Weekday.MON));
    }
    // BYMONTH expands an ordinary yearly period into months. Numbered-week
    // candidates are already days, so BYMONTH tests their civil month.
    const monthFilter = options?.bymonth?.length
      ? NaiveDate.Filter.byMonthOfYear(options.bymonth.map((month) => new Month(month as Month1)))
      : undefined;
    const filterDaysByMonth = useGoogleCalendarBehavior &&
      (this.inner.freq === "weekly" || (this.inner.freq === "yearly" && hasWeekNoFilter));
    if (monthFilter != null && !filterDaysByMonth) filters.push(monthFilter);
    const wrappedDays: NaiveDate.Filter | undefined = groupWrappedWeeks ? function* ([first]) {
      // Rank the wrapped day grid inside each WKST-aligned week.
      const distance = cadence.start.dse - first.castValid().dse;
      const offset = distance >= 0 ? distance : (distance % cadence.days + cadence.days) % cadence.days;
      for (let day = offset; day < 7; day += cadence.days) {
        yield [first.addDays(day), "day"];
      }
    } : undefined;
    if (wrappedDays != null) filters.push(wrappedDays);
    // Enhanced filter composition for yearly BYWEEKNO patterns
    const hasYearlyByweekno =
      options?.byweekno &&
      options.byweekno.length > 0 &&
      this.inner.freq === "yearly";
    const hasByday = options?.byday && options.byday.length > 0;
    const byWeekNo = (weekno: number) => {
      const wkst = options?.wkst ?? Weekday.MON;
      if (useGoogleCalendarBehavior && hasYearlyByweekno && googleYearlyStart != null) {
        return NaiveDate.Filter.byWeekNoGoogle(weekno, true, wkst, googleYearlyStart);
      }
      return useGoogleCalendarBehavior && weekno > 0
        ? NaiveDate.Filter.byWeekNoGoogle(weekno, true)
        : NaiveDate.Filter.byWeekNo(weekno, useGoogleCalendarBehavior, wkst);
    };

    const weekOrdinals = hasYearlyByweekno && googleYearlyStart != null && options?.bynthday?.length
      ? NaiveDate.Filter.byNthWeekday(options.bynthday)
      : undefined;
    if (hasYearlyByweekno && useGoogleCalendarBehavior && (hasByday || weekOrdinals != null)) {
      const ordinary = options.byday?.length ? NaiveDate.Filter.byWeekday(options.byday) : undefined;
      filters.push(function* (period: PartialDate.Tuple) {
        const ordinalDays = new Set<number>();
        if (weekOrdinals != null) {
          for (const [date] of weekOrdinals(period)) {
            const day = date.toResult().asOk();
            if (day != null) ordinalDays.add(day.dse);
          }
        }
        const byDse = new Map<number, PartialDate.Tuple>();
        for (const weekno of options.byweekno!) {
          for (const [date] of byWeekNo(weekno)(period)) {
            const day = date.toResult().asOk();
            if (day != null && ordinalDays.has(day.dse)) byDse.set(day.dse, [day, "day"]);
            if (ordinary != null) {
              for (const [dayDate, dayUnit] of ordinary([date, "day"])) {
                const valid = dayDate.toResult().asOk();
                if (valid != null) byDse.set(valid.dse, [valid, dayUnit]);
              }
            }
          }
        }
        for (const [, tuple] of [...byDse.entries()].sort((a, b) => a[0] - b[0])) yield tuple;
      });
    } else {
      const ordinal = options?.bynthday?.length
        ? NaiveDate.Filter.byNthWeekday(options.bynthday, true, options.ordinalWeekdayPeriod ?? undefined)
        : undefined;
      if (options?.intersectWeekdaySelectors && ordinal && options.byday?.length) {
        filters.push(ordinal);
        filters.push(NaiveDate.Filter.byWeekday(options.byday));
      } else if (ordinal && options?.byday?.length) {
        const selectors = [NaiveDate.Filter.byWeekday(options.byday), ordinal];
        filters.push(function* (period: PartialDate.Tuple) {
          const days = new Map<number, PartialDate.Tuple>();
          for (const select of selectors) {
            for (const selected of select(period)) {
              days.set(selected[0].castValid().dse, selected);
            }
          }
          yield* [...days.values()].sort((a,b) => a[0].castValid().dse - b[0].castValid().dse);
        });
      } else if (ordinal) {
        filters.push(ordinal);
      } else if (options?.byday?.length) {
        filters.push(NaiveDate.Filter.byWeekday(options.byday));
      }
      if (options?.libraryWeekNumberStart != null && options.byweekno?.length) {
        filters.push(NaiveDate.Filter.byLibraryWeekNo(
          options.byweekno,
          options.wkst ?? Weekday.MON,
          step.type === "week" ? options.libraryWeekNumberStart : undefined,
        ));
      } else if (rfcWeeks == null && options?.byweekno && options.byweekno.length > 0) {
        // Skip BYWEEKNO filter for Google Calendar consecutive behavior
        if (!(useGoogleCalendarBehavior && shouldUseWeeklyStep)) {
          // Create a single filter that handles multiple week numbers with OR logic
          const byWeekNoFilter = (partialdate: PartialDate.Tuple) => {
            return (function* () {
              const byDse = new Map<number, PartialDate.Tuple>();
              for (const weekno of options.byweekno!) {
                const singleWeekFilter = byWeekNo(weekno);

                for (const result of singleWeekFilter(partialdate)) {
                  const valid = result[0].toResult().asOk();
                  if (valid != null && !byDse.has(valid.dse)) {
                    byDse.set(valid.dse, [valid, result[1]]);
                  }
                }
              }
              for (const [, tuple] of [...byDse.entries()].sort((a, b) => a[0] - b[0])) {
                yield tuple;
              }
            })();
          };
          filters.push(byWeekNoFilter);
        }
      }
      if (options?.bymonthday && options.bymonthday.length > 0)
        filters.push(NaiveDate.Filter.byDayOfMonth(options.bymonthday));
    }
    if (options?.implicitYearlyMonth != null) {
      // Apply after ranking weekdays in the full year.
      filters.push(NaiveDate.Filter.byMonthOfYear([new Month(options.implicitYearlyMonth)]));
    }
    if (options?.byyearday && options.byyearday.length > 0)
      filters.push(NaiveDate.Filter.byDayOfYear(options.byyearday));
    if (options?.rruleJsEasterOffset != null) {
      filters.push(NaiveDate.Filter.byRruleJsEaster(options.rruleJsEasterOffset));
    }
    if (options?.byeaster != null) {
      const easter = NaiveDate.Filter.byEaster(easterOffsets(options.byeaster), options.byeaster.start);
      // Weekly Easter masks are keyed by the week before BYDAY can expand it.
      if (step.type === "week") {
        filters.unshift(easter);
      } else {
        // dateutil rebuilds the period's mask even if other selectors discard it.
        filters.unshift(function* (period) {
          easter.checkYear(period[0].yr);
          yield period;
        });
        filters.push(easter);
      }
    }

    // BYMONTH limits dates selected within a week, including yearly BYWEEKNO.
    if (monthFilter != null && filterDaysByMonth) filters.push(monthFilter);
    const julianDays = options?.googleJulianCalendar === "continuous" &&
        (options.bymonth?.length || options.bymonthday?.length || options.bynthday?.length)
      ? googleJulianDayFilter(options)
      : undefined;
    const standard = filters.length === 1 ? filters[0]
      : filters.length > 1 ? NaiveDate.Filter.compose(filters) : NaiveDate.Filter.identity();
    let composed = standard;
    if (options?.googleJulianCalendar === "nominal") {
      composed = hasYearlyByweekno && googleYearlyStart != null
        ? googleJulianWeekFilter(options, googleYearlyStart, standard)
        : googleJulianPeriodFilter(options, this.inner.freq);
    } else if (julianDays != null) {
      composed = wrappedDays == null ? julianDays : NaiveDate.Filter.compose([wrappedDays, julianDays]);
    }
    // BYSETPOS picks from each period's whole set of days. A rule with time
    // parts applies it to the set of instants instead (`RRuleInstances`).
    const setpos = options?.bysetpos;
    const rankDays = !deferSetPos && setpos != null && setpos.length > 0 && (ignoreTimeParts || !this.hasTimeParts());
    const filter = rankDays ? NaiveDate.Filter.bySetPos(composed, setpos) : composed;

    // Build options
    const filterOptions: NaiveDate.FilterPropsOptions = {};
    if (options?.until) {
      // Handle UNTIL based on whether it's date-only or datetime
      const untilDate = untilDateOverride ?? options.until.trunc();

      if (untilDateOverride != null || options.until.nt) {
        // DateTime UNTIL (or caller-converted local UNTIL date): inclusive
        filterOptions.end = untilDate;
      } else if (useGoogleCalendarBehavior) {
        // Date-only UNTIL: exclusive of the entire day (Google Calendar behavior)
        // Use the day before as the end date (filter will exclude events on UNTIL date)
        filterOptions.end = untilDate.addDays(-1);
      } else {
        // RFC 5545 §3.3.10: DATE UNTIL is inclusive of the UNTIL date
        filterOptions.end = untilDate;
      }
    }
    // Override end if it's explicitly passed in, but respect UNTIL date restrictions
    if (end) {
      if (filterOptions.end && filterOptions.end.dse < end.dse) {
        // Keep the UNTIL date if it's earlier than the query end
        // This preserves the exclusive date-only UNTIL behavior
      } else {
        filterOptions.end = end;
      }
    }

    if (options?.count != null) {
      // For Google Calendar consecutive weekly BYWEEKNO behavior,
      // we manage COUNT manually in the recurrence generator
      const isYearlyMultiEvent =
        useGoogleCalendarBehavior &&
        hasWeekNoFilter &&
        this.inner.freq === "yearly" &&
        options?.byday &&
        options.byday.length > 1;
      const isYearlyByWeekNo =
        useGoogleCalendarBehavior &&
        hasWeekNoFilter &&
        this.inner.freq === "yearly";
      if (
        useGoogleCalendarBehavior &&
        (shouldUseWeeklyStep || isYearlyMultiEvent || isYearlyByWeekNo)
      ) {
        // Don't set a limit at all, we'll handle COUNT in the recurrence generator
        // This allows the generator to produce enough events for the post-processor to apply COUNT correctly
      } else {
        filterOptions.limit = options.count;
      }
    }
    const hasWeekDayExpander = Boolean(
      options?.byday?.length ||
      options?.bynthday?.length ||
      options?.bymonthday?.length ||
      options?.byyearday?.length ||
      options?.libraryWeekNumberStart != null ||
      options?.byeaster?.offsets.length,
    );
    if (hasWeekDayExpander || groupWrappedWeeks) {
      filterOptions.weekStart = options?.wkst ?? Weekday.MON;
    }
    filterOptions.filter = filter;
    if (options?.googleYearlyDayWrap) {
      const julian = hasYearlyByweekno && googleYearlyStart != null
        ? googleJulianWeekFilter(options, googleYearlyStart, standard)
        : googleJulianPeriodFilter(options, this.inner.freq);
      // Google accepts one clock value per field for an override. In that
      // case each distinct day contributes one position to the timed grid.
      const singleClock = [options.byhour, options.byminute, options.bysecond]
        .every((values) => values == null || values.length <= 1);
      const highestPositiveRank = setpos?.length && setpos.every((position) => position > 0) && (rankDays || singleClock)
        ? Math.max(...setpos)
        : undefined;
      Object.assign(filterOptions, googleWrappedYearlyFilter(
        interval,
        composed,
        julian,
        options.googleJulianCalendar === "nominal",
        rankDays ? setpos : undefined,
        highestPositiveRank,
        options.googleYearlyOrdinalRewind === true,
      ));
    }
    filterOptions.periodLookbehindDays = step.type === "year" && hasWeekNoFilter && options?.libraryWeekNumberStart == null ? 7 : 0;
    filterOptions.recurLimit = filterOptions.end != null ? Number.POSITIVE_INFINITY : Math.max(1000, options?.count ?? 0, limit ?? 0);

    // For Google Calendar yearly BYWEEKNO patterns, ensure we don't limit the generator prematurely
    if (
      useGoogleCalendarBehavior &&
      hasWeekNoFilter &&
      this.inner.freq === "yearly"
    ) {
      // Don't override the limit if it's already unset for Google Calendar patterns
      if (filterOptions.limit === undefined) {
        filterOptions.limit = limit;
      }
    } else {
      // A caller's `limit` shortens the series; it never lengthens it past
      // COUNT (it used to replace COUNT: COUNT=3 under a limit of 10 gave 10).
      const count = filterOptions.limit;
      filterOptions.limit = limit != null && count != null ? Math.min(limit, count) : (limit ?? count);
    }

    if (options?.count === 0 || limit === 0) filterOptions.limit = 0;
    return {
      step,
      options: filterOptions,
    };
  }
}

export namespace RRule {
  export class Raw {
    constructor(readonly attributes: ICalAttributes) {}

    static parse(s: string): Raw {
      const PREFIX = "RRULE:";
      if (s.slice(0, PREFIX.length).toUpperCase() === PREFIX) {
        s = s.slice(PREFIX.length);
      }
      const attributes = ICalAttributes.fromRawAttributes(s.split(";"));
      return new Raw(attributes);
    }

    resolve(parseUntil = IsoDate.parse): Result<RRule> {
      const rules = this.attributes;
      const freq = Frequency.parse(rules.get("FREQ"));
      if (!freq) return err(Error("no frequency"));

      let byday: Option<Weekday[]> = null;
      let bynthday: Option<Weekday.Nth[]> = null;
      const bydayStr = rules.get("BYDAY");
      if (bydayStr) {
        const days = bydayStr.split(",");

        byday = [];
        bynthday = [];
        for (const day of days) {
          const nth = Weekday.parseNthOpt(day);
          if (nth) bynthday.push(nth);
          else {
            const weekday = Weekday.parseOpt(day);
            if (weekday) byday.push(weekday);
          }
        }
        if (byday.length === 0) byday = null;
        if (bynthday.length === 0) bynthday = null;
      }

      const until = rules.get("UNTIL");
      const untilResult = until != null ? parseUntil(until) : null;
      if (untilResult?.isErr) return untilResult.expeCast();

      const options = ruleOptions(byday, bynthday, untilResult?.asOk());
      // The default option shape is stable. Decode selectors only when written.
      for (const [key, value] of ICalAttributes.entriesOf(rules)) {
        switch (key) {
          case "WKST":
            options.wkst = Weekday.parseOpt(value);
            break;
          case "INTERVAL":
            options.interval = TentoMath.parseOpt(value);
            break;
          case "COUNT":
            options.count = TentoMath.parseOpt(value);
            break;
          case "BYSETPOS":
            if (value) options.bysetpos = ruleNumberList(value).filter((position) => position !== 0);
            break;
          case "BYMONTH":
            if (value) options.bymonth = ruleNumberList(value);
            break;
          case "BYMONTHDAY":
            if (value) options.bymonthday = ruleNumberList(value);
            break;
          case "BYWEEKNO":
            if (value) options.byweekno = ruleNumberList(value);
            break;
          case "BYYEARDAY":
            if (value) options.byyearday = ruleNumberList(value);
            break;
          case "BYHOUR":
          case "BYMINUTE":
          case "BYSECOND": {
            if (!value) break;
            const times = ruleNumberList(value);
            if (times.length === 0) break;
            if (key === "BYHOUR") options.byhour = times;
            else if (key === "BYMINUTE") options.byminute = times;
            else options.bysecond = times;
            break;
          }
          case "TZID":
            options.tzid = value as Option<Tzname>;
            break;
        }
      }
      return ok(new RRule({ freq, options }, rules.order));
    }
  }
}

function ruleNumberList(text: string): number[] {
  const values: number[] = [];
  for (const part of text.split(",")) {
    const value = TentoMath.parseOpt(part);
    if (value != null) values.push(value);
  }
  return values;
}
