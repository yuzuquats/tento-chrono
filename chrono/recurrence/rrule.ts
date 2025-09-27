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
} from "../mod";
import { TentoMath } from "../utils";
import { ExDate } from "./exdate";
import { Frequency } from "./frequency";
import { ICalAttributes } from "./ical-attributes";
import { IsoDate } from "./iso-date";

export interface RRuleLike {
  freq: Frequency;
  options?: Optional<{
    wkst: Weekday;
    interval: number;
    count: number;
    bysetpos: number;
    byday: Weekday[];
    bynthday: Weekday.Nth[];
    bymonth: number[];
    bymonthday: number[];
    byweekno: number[];
    byyearday: number[];
    byhour: number[];
    byminute: number[];
    bysecond: number[];
    until: IsoDate;
    tzid: Tzname;
  }>;
}

export class RRule {
  readonly exdates: IsoDate[] = [];

  constructor(
    readonly inner: RRuleLike,
    readonly parameterOrder: Option<string[]> = null,
  ) {}

  static parse(ser: string): Result<RRule> {
    return RRule.Raw.parse(ser).resolve();
  }

  static parseWithRecurrence(recurrence: string[]): Result<RRule> {
    const rruleString = recurrence.find((r) => r.startsWith("RRULE:"));
    if (!rruleString) return err(Error("No RRULE found in recurrence"));

    const parseResult = RRule.parse(rruleString);
    if (parseResult.isErr) return parseResult;

    const rrule = parseResult.asOk()!;

    // Parse all EXDATE lines using the new ExDate parser
    const exdateLines = recurrence.filter((r) => r.startsWith("EXDATE"));

    for (const exdateLine of exdateLines) {
      const exdateResult = ExDate.parse(exdateLine);
      if (!exdateResult.isOk) {
        console.error("invalid exdate", exdateLine);
        continue;
      }

      const exdate = exdateResult.asOk()!;
      // Add all parsed dates from this EXDATE line
      for (const isoDate of exdate.dates) {
        rrule.exdates.push(isoDate);
      }
    }

    return ok(rrule);
  }

  addExdate(date: IsoDate): void {
    this.exdates.push(date);
  }

  toRecurrenceArray(): string[] {
    const result: string[] = [this.toString()];

    if (this.exdates.length > 0) {
      // Format all exdates as a single EXDATE line
      const exdateStrs = this.exdates.map((d) => d.ical());
      result.push(`EXDATE:${exdateStrs.join(",")}`);
    }

    return result;
  }

  toString(): string {
    let sb: string[] = [];

    let rruleParts: string[] = [];
    const orderToUse = this.parameterOrder ?? [
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

    const options = this.inner.options;
    for (const param of orderToUse) {
      switch (param) {
        case "FREQ":
          if (this.inner.freq) {
            rruleParts.push(`FREQ=${Frequency.serialize(this.inner.freq)}`);
          }
          break;
        case "WKST":
          if (options?.wkst)
            rruleParts.push(`WKST=${Weekday.toString2cap(options.wkst)}`);
          break;
        case "COUNT":
          if (options?.count != null) rruleParts.push(`COUNT=${options.count}`);
          break;
        case "INTERVAL":
          if (options?.interval != null)
            rruleParts.push(`INTERVAL=${options.interval}`);
          break;
        case "BYSETPOS":
          if (options?.bysetpos != null)
            rruleParts.push(`BYSETPOS=${options.bysetpos}`);
          break;
        case "BYDAY":
          if (options?.bynthday != null && options.bynthday.length > 0) {
            const bydayStr = options.bynthday
              .map(
                (nthDay) =>
                  `${nthDay.n}${Weekday.toString2cap(nthDay.weekday)}`,
              )
              .join(",");
            rruleParts.push(`BYDAY=${bydayStr}`);
          } else if (options?.byday != null && options.byday.length > 0) {
            const bydayStr = options.byday
              .map((day) => Weekday.toString2cap(day))
              .join(",");
            rruleParts.push(`BYDAY=${bydayStr}`);
          }
          break;
        case "BYMONTH":
          if (options?.bymonth != null && options.bymonth.length > 0)
            rruleParts.push(`BYMONTH=${options.bymonth.join(",")}`);
          break;
        case "BYMONTHDAY":
          if (options?.bymonthday != null && options.bymonthday.length > 0)
            rruleParts.push(`BYMONTHDAY=${options.bymonthday.join(",")}`);
          break;
        case "BYWEEKNO":
          if (options?.byweekno != null && options.byweekno.length > 0)
            rruleParts.push(`BYWEEKNO=${options.byweekno.join(",")}`);
          break;
        case "BYYEARDAY":
          if (options?.byyearday != null && options.byyearday.length > 0)
            rruleParts.push(`BYYEARDAY=${options.byyearday.join(",")}`);
          break;
        case "BYHOUR":
          if (options?.byhour != null && options.byhour.length > 0)
            rruleParts.push(`BYHOUR=${options.byhour.join(",")}`);
          break;
        case "BYMINUTE":
          if (options?.byminute != null && options.byminute.length > 0)
            rruleParts.push(`BYMINUTE=${options.byminute.join(",")}`);
          break;
        case "BYSECOND":
          if (options?.bysecond != null && options.bysecond.length > 0)
            rruleParts.push(`BYSECOND=${options.bysecond.join(",")}`);
          break;
        case "UNTIL":
          if (options?.until != null) {
            rruleParts.push(`UNTIL=${options.until.ical()}`);
          }
          break;
      }
    }

    if (rruleParts.length > 0) {
      sb.push("RRULE:" + rruleParts.join(";"));
    }

    return sb.join(";");
  }

  toReadableDisplay(): string {
    const options = this.inner.options;
    const interval = options?.interval ?? 1;
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

  toFilterProps(
    limit?: Option<number>,
    end?: Option<NaiveDate>,
    useGoogleCalendarBehavior?: boolean,
  ): NaiveDate.FilterProps {
    const options = this.inner.options;

    let step: DateUnit;
    const interval = options?.interval ?? 1;

    // Google Calendar behavior: BYWEEKNO with monthly/weekly frequency generates consecutive weekly events
    const hasWeekNoFilter = options?.byweekno && options.byweekno.length > 0;
    const shouldUseWeeklyStep =
      useGoogleCalendarBehavior &&
      hasWeekNoFilter &&
      (this.inner.freq === "monthly" || this.inner.freq === "weekly");

    if (shouldUseWeeklyStep) {
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
          step = DateUnit.weeks(interval);
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
    // Apply BYMONTH first for yearly frequency to get the right months, then apply weekday filters
    if (options?.bymonth && options.bymonth.length > 0) {
      const months = options.bymonth.map((m) => new Month(m as any));
      filters.push(NaiveDate.Filter.byMonthOfYear(months));
    }
    // Enhanced filter composition for yearly BYWEEKNO patterns
    const hasYearlyByweekno =
      options?.byweekno &&
      options.byweekno.length > 0 &&
      this.inner.freq === "yearly";
    const hasByday = options?.byday && options.byday.length > 0;

    if (hasYearlyByweekno && hasByday && useGoogleCalendarBehavior) {
      // Special handling for yearly BYWEEKNO + BYDAY patterns
      // Apply BYWEEKNO first, then BYDAY to fix the 2026 missing event issue
      const yearlyByweeknoFilter = (partialdate: PartialDate.Tuple) => {
        return (function* () {
          const seenDates = new Set<string>();
          for (const weekno of options.byweekno!) {
            // Apply BYWEEKNO filter first
            const useCalendarYear = useGoogleCalendarBehavior;
            const useGoogleCalendarLogic =
              useGoogleCalendarBehavior && weekno > 0;
            const singleWeekFilter = useGoogleCalendarLogic
              ? NaiveDate.Filter.byWeekNoGoogle(weekno, useCalendarYear)
              : NaiveDate.Filter.byWeekNo(weekno, useCalendarYear);

            // Then apply BYDAY filter to each result
            for (const [weekDate, _weekUnit] of singleWeekFilter(partialdate)) {
              const bydayFilter = NaiveDate.Filter.byWeekday(options.byday!);
              for (const [dayDate, dayUnit] of bydayFilter([weekDate, "day"])) {
                const dateKey = dayDate.toString();
                if (!seenDates.has(dateKey)) {
                  seenDates.add(dateKey);
                  yield [dayDate, dayUnit] as PartialDate.Tuple;
                }
              }
            }
          }
        })();
      };
      filters.push(yearlyByweeknoFilter);
    } else {
      // Original filter composition for non-yearly patterns
      if (options?.bynthday && options.bynthday.length > 0)
        filters.push(NaiveDate.Filter.byNthWeekday(options.bynthday));
      else if (options?.byday && options.byday.length > 0)
        filters.push(NaiveDate.Filter.byWeekday(options.byday));
      if (options?.byweekno && options.byweekno.length > 0) {
        // Skip BYWEEKNO filter for Google Calendar consecutive behavior
        if (!(useGoogleCalendarBehavior && shouldUseWeeklyStep)) {
          // Create a single filter that handles multiple week numbers with OR logic
          const byWeekNoFilter = (partialdate: PartialDate.Tuple) => {
            return (function* () {
              const seenDates = new Set<string>();
              for (const weekno of options.byweekno!) {
                // For Google Calendar behavior:
                // - Positive week numbers: use calendar year mode
                // - Negative week numbers: use calendar year mode
                // - For non-Google behavior: use ISO week mode (false)
                const useCalendarYear = useGoogleCalendarBehavior;
                const useGoogleCalendarLogic =
                  useGoogleCalendarBehavior && weekno > 0;
                const singleWeekFilter = useGoogleCalendarLogic
                  ? NaiveDate.Filter.byWeekNoGoogle(weekno, useCalendarYear)
                  : NaiveDate.Filter.byWeekNo(weekno, useCalendarYear);

                for (const result of singleWeekFilter(partialdate)) {
                  const dateKey = result[0].toString();
                  if (!seenDates.has(dateKey)) {
                    seenDates.add(dateKey);
                    yield result;
                  }
                }
              }
            })();
          };
          filters.push(byWeekNoFilter);
        }
      }
      if (options?.bymonthday && options.bymonthday.length > 0)
        filters.push(NaiveDate.Filter.byDayOfMonth(options.bymonthday));
    }
    if (options?.byyearday && options.byyearday.length > 0)
      filters.push(NaiveDate.Filter.byDayOfYear(options.byyearday));

    const filter =
      filters.length > 0
        ? filters.length === 1
          ? filters[0]
          : NaiveDate.Filter.compose(filters)
        : NaiveDate.Filter.identity();

    // Build options
    const filterOptions: NaiveDate.FilterPropsOptions = {};
    if (options?.until) {
      // Handle UNTIL based on whether it's date-only or datetime
      const untilDate = options.until.trunc();

      if (options.until.nt) {
        // DateTime UNTIL: inclusive up to the exact datetime
        // Use the date portion as the end date (filter will include events on this date)
        filterOptions.end = untilDate;
      } else {
        // Date-only UNTIL: exclusive of the entire day (Google Calendar behavior)
        // Use the day before as the end date (filter will exclude events on UNTIL date)
        filterOptions.end = untilDate.addDays(-1);
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

    if (options?.count) {
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
    if (options?.wkst) filterOptions.weekStart = options.wkst;
    filterOptions.filter = filter;
    filterOptions.recurLimit = 1000;

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
      filterOptions.limit = limit ?? filterOptions.limit;
    }

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
      if (s.startsWith(PREFIX)) {
        s = s.slice(PREFIX.length);
      }
      const attributes = ICalAttributes.fromRawAttributes(s.split(";"));
      return new Raw(attributes);
    }

    resolve(): Result<RRule> {
      const rules = this.attributes;
      const freq = Frequency.parse(rules.get("FREQ"));
      if (!freq) return err(Error("no frequency"));

      let byday: Option<Weekday[]> = null;
      let bynthday: Option<Weekday.Nth[]> = null;
      const bydayStr = rules.get("BYDAY");
      if (bydayStr) {
        const days = bydayStr.split(",");

        // Check if the first day matches nth-weekday pattern (e.g., "2TU", "-1FR")
        const firstDay = days[0];
        const firstNthWeekday = Weekday.parseNthOpt(firstDay);

        if (firstNthWeekday) {
          // This is an nth-weekday pattern, parse all days as nth-weekdays
          bynthday = [];
          for (const day of days) {
            const nthWeekday = Weekday.parseNthOpt(day);
            if (!nthWeekday) continue;
            bynthday.push(nthWeekday);
          }
          if (bynthday.length === 0) bynthday = null;
        } else {
          // This is a regular weekday pattern, parse all days as weekdays
          byday = [];
          for (const day of days) {
            const weekday = Weekday.parseOpt(day);
            if (!weekday) continue;
            byday.push(weekday);
          }
          if (byday.length === 0) byday = null;
        }
      }

      const until = rules.get("UNTIL");

      // Parse BYHOUR
      let byhour: Option<number[]> = null;
      const byhourStr = rules.get("BYHOUR");
      if (byhourStr) {
        const hours = byhourStr
          .split(",")
          .map((h) => TentoMath.parseOpt(h))
          .filter((h) => h !== null) as number[];
        if (hours.length > 0) byhour = hours;
      }

      // Parse BYMINUTE
      let byminute: Option<number[]> = null;
      const byminuteStr = rules.get("BYMINUTE");
      if (byminuteStr) {
        const minutes = byminuteStr
          .split(",")
          .map((m) => TentoMath.parseOpt(m))
          .filter((m) => m !== null) as number[];
        if (minutes.length > 0) byminute = minutes;
      }

      // Parse BYSECOND
      let bysecond: Option<number[]> = null;
      const bysecondStr = rules.get("BYSECOND");
      if (bysecondStr) {
        const seconds = bysecondStr
          .split(",")
          .map((s) => TentoMath.parseOpt(s))
          .filter((s) => s !== null) as number[];
        if (seconds.length > 0) bysecond = seconds;
      }

      return ok(
        new RRule(
          {
            freq,
            options: {
              wkst: Weekday.parseOpt(rules.get("WKST")),
              interval: TentoMath.parseOpt(rules.get("INTERVAL")),
              count: TentoMath.parseOpt(rules.get("COUNT")),
              bysetpos: TentoMath.parseOpt(rules.get("BYSETPOS")),
              byday: byday,
              bynthday: bynthday,
              bymonth: rules.get("BYMONTH")
                ? (rules
                    .get("BYMONTH")!
                    .split(",")
                    .map((m) => TentoMath.parseOpt(m))
                    .filter((m) => m !== null) as number[])
                : null,
              bymonthday: rules.get("BYMONTHDAY")
                ? (rules
                    .get("BYMONTHDAY")!
                    .split(",")
                    .map((d) => TentoMath.parseOpt(d))
                    .filter((d) => d !== null) as number[])
                : null,
              byweekno: rules.get("BYWEEKNO")
                ? (rules
                    .get("BYWEEKNO")!
                    .split(",")
                    .map((w) => TentoMath.parseOpt(w))
                    .filter((w) => w !== null) as number[])
                : null,
              byyearday: rules.get("BYYEARDAY")
                ? (rules
                    .get("BYYEARDAY")!
                    .split(",")
                    .map((y) => TentoMath.parseOpt(y))
                    .filter((y) => y !== null) as number[])
                : null,
              byhour: byhour,
              byminute: byminute,
              bysecond: bysecond,
              tzid: rules.get("TZID"),
              until: until ? IsoDate.parse(until).exp() : null,
            },
          },
          rules.order,
        ),
      );
    }
  }
}
