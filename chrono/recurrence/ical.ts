import { Result, err, ok } from "../result.ts";
import { icalPropertyName } from "./ical-attributes.ts";
import { ICalDateLine } from "./ical-date-line.ts";
import { RRule } from "./rrule.ts";
import type { Option, Optional } from "../option.ts";

export namespace ICalendar {
  export type Lines = Optional<{
    rrule: RRule;
    exdate: ICalDateLine[];
    /** RDATE lines (RFC 5545 §3.8.5.2): instances added to the set. */
    rdate: ICalDateLine[];
    dtstart: ICalDateLine;
  }>;

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

    static async parse(
      lines: string[],
      deterministic: boolean = false,
    ): Promise<Result<Raw>> {
      const inner: Lines = {};
      const order: Option<string[]> = deterministic ? [] : null;

      for (const line of lines) {
        const property = icalPropertyName(line);
        if (property === "RRULE") {
          const rrule = RRule.parse(line);
          order?.push("RRULE");
          if (rrule.asErr())
            return err(Error("failed to parse rrule", rrule.asErr()!));
          inner.rrule = rrule.asOk()!;
        } else if (property === "EXDATE") {
          const date = await ICalDateLine.parse(line, deterministic);
          order?.push("EXDATE");
          if (date.asErr())
            return err(Error("failed to parse exdate", date.asErr()!));
          if (!inner.exdate) {
            inner.exdate = [];
          }
          inner.exdate.push(date.asOk()!);
        } else if (property === "RDATE") {
          const date = await ICalDateLine.parse(line, deterministic);
          order?.push("RDATE");
          if (date.asErr())
            return err(Error("failed to parse rdate", date.asErr()!));
          (inner.rdate ??= []).push(date.asOk()!);
        } else if (property === "DTSTART") {
          const date = await ICalDateLine.parse(line, deterministic);
          order?.push("DTSTART");
          if (date.asErr())
            return err(Error("failed to parse dtstart", date.asErr()!));
          inner.dtstart = date.asOk()!;
        }
      }

      return ok(new ICalendar.Raw(inner, order));
    }

    toString(): string {
      const parts: string[] = [];
      let nextExdate = 0;
      let nextRdate = 0;

      for (const order of this.order ?? ["DTSTART", "RRULE", "EXDATE", "RDATE"]) {
        if (order === "DTSTART" && this.lines.dtstart) {
          parts.push(this.lines.dtstart.toString());
        } else if (order === "RRULE" && this.lines.rrule) {
          parts.push(this.lines.rrule.toString());
        } else if (order === "EXDATE" && this.lines.exdate) {
          if (this.order == null) {
            for (const exdate of this.lines.exdate) parts.push(exdate.toString());
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
