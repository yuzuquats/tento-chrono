import { DateTime } from "./datetime.ts";
import { NaiveDate } from "./naive-date.ts";
import { Time } from "./time.ts";
import { Utc } from "./timezone.ts";
import { TentoMath } from "./utils.ts";
import type { Option } from "./option.ts";

declare const semanticTimeBrand: unique symbol;

export type SemanticTime = string & {
  readonly [semanticTimeBrand]: "SemanticTime";
};

export namespace SemanticTime {
  export function parse(raw: string): SemanticTime {
    const normalized = normalize(raw);
    const partial = NaiveDate.Partial.parseOptional(normalized);
    if (partial != null) return fromPartialDate(partial);

    const pointResult = DateTime.fromRfc3339(normalized);
    if (pointResult.isOk) {
      const point = pointResult.asOk();
      if (point != null) return fromDateTime(point.toUtc());
    }

    throw new Error(`SemanticTime.parse: invalid semantic time "${raw}"`);
  }

  export function normalize(raw: string): string {
    if (raw.startsWith("pt-")) return raw.slice(3);
    if (raw.length <= 10 && /^\d{4}-\d{1,2}-\d{1,2}$/.test(raw)) return `ymd-${raw}`;
    return raw;
  }

  export function fromPartialDate(partial: NaiveDate.Partial): SemanticTime {
    const raw = partial.toString();
    // The fields `NaiveDate.Partial.parse` would read back from `raw`, checked
    // directly (a safe integer year and positive integer fields) instead of parsing
    // the text just built: the same values pass and fail.
    if (partialFieldsParse(partial)) return raw as SemanticTime;
    throw new Error(`SemanticTime.fromPartialDate: invalid partial date "${raw}"`);
  }

  /** Match the signed-year and positive-field grammar of Partial.parse. */
  function partialFieldsParse(partial: NaiveDate.Partial): boolean {
    const validYear = Number.isSafeInteger(partial.yr);
    const atLeastOne = (v: Option<number>): boolean => {
      if (!/^\d+$/.test(String(v))) return false;
      const n = TentoMath.int(String(v));
      return !Number.isNaN(n) && n >= 1;
    };
    switch (partial.type) {
      case "year":
        return validYear;
      case "month":
        return validYear && atLeastOne(partial.mth);
      case "day":
        return validYear && atLeastOne(partial.mth) && atLeastOne(partial.day);
      case "week":
        return validYear && atLeastOne(partial.wno);
    }
  }

  export function fromDateTime(point: DateTime<Utc>): SemanticTime {
    return point.toString() as SemanticTime;
  }

  export function partialDate(time: SemanticTime): Option<NaiveDate.Partial> {
    return NaiveDate.Partial.parseOptional(normalize(time));
  }

  export function dateTime(time: SemanticTime): Option<DateTime<Utc>> {
    const parsed = DateTime.fromRfc3339(normalize(time));
    if (!parsed.isOk) return null;
    const point = parsed.asOk();
    return point == null ? null : point.toUtc();
  }

  export function dateKey(time: SemanticTime): Option<NaiveDate.Partial> {
    const normalized = normalize(time);
    const partial = NaiveDate.Partial.parseOptional(normalized);
    if (partial != null) return partial;
    const point = DateTime.fromRfc3339(normalized).asOk();
    if (point == null) return null;
    // The UTC date depends only on the day carried by the written offset.
    const carry = point.tz === Utc ? 0 :
      Math.floor((point.time.toMs - point.tz.info.offset.toMs) / Time.MS_PER_DAY);
    return NaiveDate.Partial.fromDate(carry === 0 ? point.date : point.date.addDays(carry));
  }
}
