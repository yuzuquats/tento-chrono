import { DateTime } from "../datetime.ts";
import { NaiveDate } from "../naive-date.ts";
import { NaiveDateTime } from "../naive-datetime.ts";
import { err, Result } from "../result.ts";
import { TimezoneRegion } from "../timezone-region.ts";
import { Tzname } from "../timezone.ts";
import { RecurrenceSeries, RecurrenceStart } from "./series.ts";

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
  /** Map a Graph timezone identifier (for example a Windows name) to IANA. */
  resolveTimeZone?: (graphName: string) => string | undefined;
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

async function graphZone(
  name: string,
  options: GraphRecurrenceOptions,
): Promise<TimezoneRegion> {
  const candidate = Tzname.parseOpt(options.resolveTimeZone?.(name) ?? name);
  const zone = candidate == null
    ? null
    : await TimezoneRegion.getOpt(candidate);
  if (zone == null) {
    throw new Error("Unmapped Graph recurrence timezone: " + name);
  }
  return zone;
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

    let start: RecurrenceStart;
    if (master.isAllDay) {
      start = { date: startDay.toString() };
    } else {
      const wireZone = await graphZone(master.start.timeZone, options);
      const rangeZone = await graphZone(
        range.recurrenceTimeZone || master.start.timeZone,
        options,
      );
      const wire = master.start.dateTime;
      const offset = /(?:Z|[+-]\d{2}:\d{2})$/i.test(wire);
      const parsed = DateTime.fromRfc3339(wire).exp();
      const instant = offset ? parsed : wireZone.toRfc5545WallClock(parsed.ndt);
      const local: NaiveDateTime = rangeZone.toTz(instant).ndt;
      if (local.date.dse !== startDay.dse) {
        throw new Error("Graph startDate does not match the master");
      }
      start = {
        dateTime: instant.toUtc().toString(),
        timeZone: rangeZone.fullname,
      };
    }
    return await RecurrenceSeries.readGraph("RRULE:" + parts.join(";"), start);
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
