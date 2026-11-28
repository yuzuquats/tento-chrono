import { Time } from "../time.ts";

// Decimal zeroes from the pinned dateutil reference's Python Unicode 15.0 table.
const DATEUTIL_DECIMAL_ZEROES = [
  0x30,
  0x660,
  0x6F0,
  0x7C0,
  0x966,
  0x9E6,
  0xA66,
  0xAE6,
  0xB66,
  0xBE6,
  0xC66,
  0xCE6,
  0xD66,
  0xDE6,
  0xE50,
  0xED0,
  0xF20,
  0x1040,
  0x1090,
  0x17E0,
  0x1810,
  0x1946,
  0x19D0,
  0x1A80,
  0x1A90,
  0x1B50,
  0x1BB0,
  0x1C40,
  0x1C50,
  0xA620,
  0xA8D0,
  0xA900,
  0xA9D0,
  0xA9F0,
  0xAA50,
  0xABF0,
  0xFF10,
  0x104A0,
  0x10D30,
  0x11066,
  0x110F0,
  0x11136,
  0x111D0,
  0x112F0,
  0x11450,
  0x114D0,
  0x11650,
  0x116C0,
  0x11730,
  0x118E0,
  0x11950,
  0x11C50,
  0x11D50,
  0x11DA0,
  0x11F50,
  0x16A60,
  0x16AC0,
  0x16B50,
  0x1D7CE,
  0x1D7D8,
  0x1D7E2,
  0x1D7EC,
  0x1D7F6,
  0x1E140,
  0x1E2F0,
  0x1E4F0,
  0x1E950,
  0x1FBF0,
];

/** Convert Python's decimal digits without changing other numeric glyphs. */
export function normalizeDateutilDigits(value: string): string {
  // deno-lint-ignore no-control-regex -- Match every code point outside ASCII.
  return value.replace(/[^\x00-\x7f]/gu, (digit) => {
    const code = digit.codePointAt(0)!;
    const zero = DATEUTIL_DECIMAL_ZEROES.find((start) =>
      code >= start && code < start + 10
    );
    return zero == null ? digit : String(code - zero);
  });
}

export function dateutilOffsetMagnitude(offset: string): number | undefined {
  const fields = /^(?:(\d+):(\d+)|(\d{1,2}|\d{4}))$/.exec(offset);
  if (fields == null) return undefined;
  const [, hourText, minuteText, compact] = fields;
  // Python consumes a four-digit token as HHMM before checking for a colon.
  if (hourText?.length === 4) return undefined;
  const hours = Number(hourText ?? compact.slice(0, 2));
  const minutes = Number(minuteText ?? compact.slice(2));
  return (hours * 60 + minutes) * Time.MS_PER_MIN;
}

/** Decode a standard or daylight offset from dateutil's tzstr fallback. */
export function dateutilTzstrOffset(
  abbreviation: string,
  written: string,
): number | undefined {
  const sign = written[0];
  const signed = sign === "+" || sign === "-";
  // The reference lexer only separates a sign after a letter or a period.
  if (signed && !/[A-Za-z.]$/.test(abbreviation)) return;
  const offset = signed ? written.slice(1) : written;
  const magnitude = dateutilOffsetMagnitude(offset);
  if (magnitude == null) return undefined;
  // tzstr defaults to POSIX west-positive offsets, except for literal UTC/GMT.
  const east = abbreviation === "UTC" || abbreviation === "GMT"
    ? sign !== "-"
    : sign === "-";
  return east ? magnitude : -magnitude;
}
