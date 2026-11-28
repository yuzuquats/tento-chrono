import { erm, NaiveDateTime, Result, TimezoneRegion, Tzname } from "../mod.ts";
import { formatICalParameter, ICalAttributes, splitICalProperty, unquoteICalParameter } from "./ical-attributes.ts";
import { IsoDate, readIsoDate } from "./iso-date.ts";
import { NaiveTime } from "../naive-time.ts";
import type { NaiveDate } from "../naive-date.ts";
import type { Option, Optional } from "../option.ts";

const defaultIsoDateParser = IsoDate.parse;

export class ICalDateLine implements ICalDateLine.Like {
  constructor(
    readonly label: string,
    readonly dates: NaiveDateTime[],
    readonly region?: Option<TimezoneRegion>,
    readonly value?: Option<"DATE" | "DATE-TIME" | "PERIOD">,
    readonly determinism?: Option<ICalDateLine.TestDeterminism>,
    /**
     * Each value's form as written: `timed` (it carried a time; a date-only
     * value is a whole local day) and `utc` (it ended in `Z`). Absent: as
     * `dates` were built by hand (every value timed, none UTC).
     */
    readonly forms?: Option<readonly ICalDateLine.Form[]>,
  ) {}

  // Examples:
  //
  // EXDATE;TZID=America/Los_Angeles:20240411T150000,20240418T150000,20241024T150000,20241219T150000,20250213T150000,20250501T150000
  // EXDATE:19980401T133000Z,19980402T133000Z
  // EXDATE;VALUE=DATE:20231225,20231226,20231227
  // EXDATE:20231225T090000,20231226T090000
  // EXDATE;VALUE=DATE-TIME:20231225T090000,20231226T090000
  // EXDATE;VALUE=DATE-TIME;TZID=Europe/Brussels:20231225T090000,20231226T090000
  //
  static async parse(
    s: string,
    deterministic: boolean = false,
    regions?: ReadonlyMap<string, TimezoneRegion>,
    parseDate?: typeof IsoDate.parse,
  ): Promise<Result<ICalDateLine>> {
    return readICalDateLine(s, deterministic, regions, parseDate);
  }

  toString(): string {
    if (this.dates.length === 1 && this.region == null && this.value == null) {
      const date = this.dates[0];
      if (date != null) return this.label + ":" + formatDate(this, date, 0);
    }
    const attributes = [this.label];

    const attributeOrder = this.determinism?.attributeOrder;
    if (attributeOrder) {
      for (const order of attributeOrder) {
        if (order === "TZID" && this.region) {
          attributes.push(`TZID=${formatICalParameter(this.region.fullname)}`);
        }
        if (order === "VALUE" && this.value) {
          attributes.push(`VALUE=${this.value}`);
        }
      }
    } else {
      if (this.region) attributes.push(`TZID=${formatICalParameter(this.region.fullname)}`);
      if (this.value) attributes.push(`VALUE=${this.value}`);
    }

    const dates = this.dates.map((date, index) => formatDate(this, date, index));
    return `${attributes.join(";")}:${dates.join(",")}`;
  }
}

function formatDate(line: ICalDateLine, date: NaiveDateTime, index: number): string {
  const form = line.forms?.[index];
  if (form == null ? line.value === "DATE" : !form.timed) return date.date.ical();
  const utc = form?.utc ?? line.determinism?.includeZ ?? false;
  const start = date.ical() + (utc ? "Z" : "");
  return form?.periodEnd != null ? `${start}/${form.periodEnd}` : start;
}

export namespace ICalDateLine {
  export class Raw {
    constructor(
      readonly tag: string,
      readonly attributes: ICalAttributes,
      readonly nd: IsoDate[],
      readonly periodEnds: readonly (string | null)[] = [],
    ) {}

    static parse(
      s: string,
      requiresTag: boolean = true,
      parseDate = IsoDate.parse,
    ): Result<Raw> {
      const line = s.includes("\n") ? s.split(/\r?\n/).join("") : s;

      const property = splitICalProperty(line);
      if (property == null || !property.attributes[0]) return erm("invalid");

      const attributes = ICalAttributes.fromRawAttributes(property.attributes);
      const timestamps: IsoDate[] = [];
      const periodEnds: (string | null)[] = [];
      let failure: Result<Raw> | undefined;
      for (const value of property.value.split(",")) {
        // Read PERIOD values as their starts and preserve each written suffix.
        const slash = value.indexOf("/");
        periodEnds.push(slash < 0 ? null : value.slice(slash + 1));
        const parsed = parseDate(slash < 0 ? value : value.slice(0, slash));
        if (parsed.isErr) failure ??= parsed.expeCast();
        else timestamps.push(parsed.exp());
      }
      if (failure !== undefined) return failure;

      const tagCandidate = attributes.order[0];
      if (requiresTag) {
        if (
          tagCandidate !== "EXDATE" && tagCandidate !== "DTSTART" &&
          tagCandidate !== "RDATE"
        ) {
          return erm(`tag required but got '${tagCandidate}'`);
        }
      }

      return Result.ok(
        new Raw(tagCandidate, attributes, timestamps, periodEnds),
      );
    }

    async resolve(
      deterministic: boolean = false,
      regions?: ReadonlyMap<string, TimezoneRegion>,
    ): Promise<ICalDateLine> {
      return resolveICalDateLine(this, deterministic, regions);
    }
  }
}

function resolveICalDateLine(
  raw: ICalDateLine.Raw,
  deterministic: boolean,
  regions?: ReadonlyMap<string, TimezoneRegion>,
): ICalDateLine | Promise<ICalDateLine> {
  const tzid = raw.attributes.get("tzid");
  if (typeof tzid !== "string") return makeICalDateLine(raw, deterministic);
  const name = unquoteICalParameter(tzid);
  const known = regions?.get(tzid) ?? regions?.get(name);
  if (known != null) return makeICalDateLine(raw, deterministic, known);
  return TimezoneRegion.get(name as Tzname, Tzname.UTC, "ical-tzid").then((region) =>
    makeICalDateLine(raw, deterministic, region)
  );
}

function makeICalDateLine(
  raw: ICalDateLine.Raw,
  deterministic: boolean,
  region?: TimezoneRegion,
): ICalDateLine {
  let exdateValue: Option<"DATE" | "DATE-TIME" | "PERIOD">;
  const value = raw.attributes.get("value");
  if (value != null && typeof value === "string") {
    const v = value.toUpperCase();
    if (v === "DATE-TIME" || v === "DATE" || v === "PERIOD") {
      exdateValue = v;
    }
  }

  const dates = new Array<NaiveDateTime>(raw.nd.length);
  const forms = new Array<ICalDateLine.Form>(raw.nd.length);
  raw.nd.forEach((date, i) => {
    dates[i] = date.extend();
    forms[i] = dateLineForm(date, raw.periodEnds[i]);
  });

  return new ICalDateLine(
    raw.tag,
    dates,
    region,
    exdateValue,
    deterministic
      ? {
        attributeOrder: raw.attributes.order,
        includeZ: raw.nd[0]?.z != null,
      }
      : null,
    forms,
  );
}

function dateLineForm(date: IsoDate, periodEnd?: string | null): ICalDateLine.Form {
  return {
    timed: date.nt != null,
    utc: date.z != null,
    ...(date.submillisecondMicros > 0 ? { submillisecondMicros: date.submillisecondMicros } : {}),
    ...(periodEnd != null ? { periodEnd } : {}),
  };
}

function singleDateLine(
  label: string,
  deterministic: boolean,
  timestamp: NaiveDateTime,
  form: ICalDateLine.Form,
): ICalDateLine {
  return new ICalDateLine(
    label, [timestamp], undefined, undefined,
    deterministic ? { attributeOrder: [label], includeZ: form.utc } : null,
    [form],
  );
}

function dateLineBuilder(label: string, deterministic: boolean) {
  return (date: NaiveDate, time: Option<NaiveTime>, utc: Option<"Z">) =>
    singleDateLine(label, deterministic, new NaiveDateTime(date, time ?? NaiveTime.ZERO), {
      timed: time != null,
      utc: utc != null,
    });
}

const plainDateLineBuilders = new Map(["DTSTART", "EXDATE", "RDATE"].map((label) => [
  label,
  [dateLineBuilder(label, false), dateLineBuilder(label, true)] as const,
]));

/** @internal Avoid a promise hop until a date-line timezone needs loading. */
export function readICalDateLine(
  line: string,
  deterministic: boolean,
  regions?: ReadonlyMap<string, TimezoneRegion>,
  parseDate = IsoDate.parse,
  propertyName?: string,
): Result<ICalDateLine> | Promise<Result<ICalDateLine>> {
  if (propertyName != null && line[propertyName.length] === ":" && !line.includes("\n")) {
    const value = line.slice(propertyName.length + 1);
    if (!value.includes(",") && !value.includes("/")) {
      if (parseDate === defaultIsoDateParser) {
        const builders = plainDateLineBuilders.get(propertyName);
        const build = builders?.[deterministic ? 1 : 0] ?? dateLineBuilder(propertyName, deterministic);
        return readIsoDate(value, build);
      }
      return parseDate(value).map((date) =>
        singleDateLine(propertyName, deterministic, date.extend(), dateLineForm(date))
      );
    }
  }
  const raw = ICalDateLine.Raw.parse(line, true, parseDate);
  if (raw.isErr) return raw.expeCast();
  const resolved = resolveICalDateLine(raw.exp(), deterministic, regions);
  return resolved instanceof Promise ? resolved.then((value) => Result.ok(value)) : Result.ok(resolved);
}

export namespace ICalDateLine {
  export type Options = Optional<{
    tzid: Tzname;
    value: "DATE" | "DATE-TIME" | "PERIOD";
  }>;

  /** How one value of the line was written (see `ICalDateLine.forms`). */
  export type Form = {
    readonly timed: boolean;
    readonly utc: boolean;
    /** @internal Remainder used when comparing dateutil values. */
    readonly submillisecondMicros?: number;
    readonly periodEnd?: string;
  };

  export type TestDeterminism = Optional<{
    attributeOrder: string[];
    includeZ: boolean;
  }>;

  export type Like = {
    dates: NaiveDateTime[];
  } & Options;
}
