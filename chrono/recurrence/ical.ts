import { err, ok, Result } from "../result.ts";
import { icalPropertyName } from "./ical-attributes.ts";
import { ICalDateLine, readICalDateLine } from "./ical-date-line.ts";
import type { IsoDate } from "./iso-date.ts";
import { RRule } from "./rrule.ts";
import type { Option, Optional } from "../option.ts";
import type { TimezoneRegion } from "../timezone-region.ts";

export namespace ICalendar {
  export type Lines = Optional<{
    rrule: RRule;
    exdate: ICalDateLine[];
    /** RDATE lines (RFC 5545 §3.8.5.2): instances added to the set. */
    rdate: ICalDateLine[];
    dtstart: ICalDateLine;
  }>;

  /**
   * Editable view of one recurrence rule and its date lines. Retain the original
   * content lines when editing calendars that carry additional rules or properties.
   */
  export class Raw {
    constructor(
      readonly lines: Lines,
      readonly order: Option<string[]> = null,
    ) {}

    get rrule(): Option<RRule> {
      return this.lines.rrule;
    }

    get dtstart(): Option<ICalDateLine> {
      return this.lines.dtstart;
    }

    static parse(
      lines: string[],
      deterministic: boolean = false,
      regions?: ReadonlyMap<string, TimezoneRegion>,
      parseDate?: typeof IsoDate.parse,
      parseUntil?: typeof IsoDate.parse,
    ): Promise<Result<Raw>> {
      return readCalendarLines(lines, deterministic, regions, parseDate, parseUntil);
    }

    toString(): string {
      const parts: string[] = [];
      let nextExdate = 0;
      let nextRdate = 0;

      for (
        const order of this.order ?? ["DTSTART", "RRULE", "EXDATE", "RDATE"]
      ) {
        if (order === "DTSTART" && this.lines.dtstart) {
          parts.push(this.lines.dtstart.toString());
        } else if (order === "RRULE" && this.lines.rrule) {
          parts.push(this.lines.rrule.toString());
        } else if (order === "EXDATE" && this.lines.exdate) {
          if (this.order == null) {
            for (const exdate of this.lines.exdate) {
              parts.push(
                exdate.toString(),
              );
            }
          } else {
            const exdate = this.lines.exdate[nextExdate++];
            if (exdate != null) parts.push(exdate.toString());
          }
        } else if (order === "RDATE" && this.lines.rdate) {
          if (this.order == null) {
            for (const rdate of this.lines.rdate) parts.push(rdate.toString());
          } else {
            const rdate = this.lines.rdate[nextRdate++];
            if (rdate != null) parts.push(rdate.toString());
          }
        }
      }

      return parts.join("\n");
    }
  }
}

/** @internal Read content lines, including rules already normalized by a profile. */
export async function readCalendarLines(
  lines: readonly (string | RRule.Raw)[],
  deterministic: boolean,
  regions?: ReadonlyMap<string, TimezoneRegion>,
  parseDate?: typeof IsoDate.parse,
  parseUntil?: typeof IsoDate.parse,
  resolvedStart?: ICalDateLine,
): Promise<Result<ICalendar.Raw>> {
  const inner: ICalendar.Lines = resolvedStart == null ? {} : { dtstart: resolvedStart };
  const order: Option<string[]> = deterministic ? (resolvedStart == null ? [] : ["DTSTART"]) : null;

  for (const line of lines) {
    const property = typeof line === "string" ? icalPropertyName(line) : "RRULE";
    if (property === "RRULE") {
      const rrule = typeof line === "string" ? RRule.parse(line, parseUntil) : line.resolve(parseUntil);
      order?.push("RRULE");
      if (rrule.asErr()) {
        return err(Error("failed to parse rrule", rrule.asErr()!));
      }
      inner.rrule = rrule.asOk()!;
    } else if (typeof line === "string" && (property === "EXDATE" || property === "RDATE" || property === "DTSTART")) {
      const parsed = readICalDateLine(line, deterministic, regions, parseDate, property);
      const date = parsed instanceof Promise ? await parsed : parsed;
      order?.push(property);
      if (date.asErr()) {
        return err(Error("failed to parse " + property.toLowerCase(), date.asErr()!));
      }
      const value = date.asOk()!;
      if (property === "EXDATE") (inner.exdate ??= []).push(value);
      else if (property === "RDATE") (inner.rdate ??= []).push(value);
      else inner.dtstart = value;
    }
  }

  return ok(new ICalendar.Raw(inner, order));
}
