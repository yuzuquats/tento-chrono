import type { Option } from "../option.ts";

export function icalPropertyName(line: string): string {
  switch (line[0]) {
    case "D":
      if (line.startsWith("DTSTART:")) return "DTSTART";
      break;
    case "R":
      if (line.startsWith("RRULE:")) return "RRULE";
      if (line.startsWith("RDATE:")) return "RDATE";
      break;
    case "E":
      if (line.startsWith("EXRULE:")) return "EXRULE";
      if (line.startsWith("EXDATE:")) return "EXDATE";
      break;
  }
  const end = line.search(/[:;]/);
  return (end < 0 ? line : line.slice(0, end)).toUpperCase();
}

/** Split a content line at delimiters outside quoted parameter values. */
export function splitICalProperty(
  line: string,
): { attributes: string[]; value: string } | null {
  const attributes: string[] = [];
  let quoted = false;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') quoted = !quoted;
    if (quoted || (char !== ";" && char !== ":")) continue;
    attributes.push(line.slice(start, i));
    if (char === ":") return { attributes, value: line.slice(i + 1) };
    start = i + 1;
  }
  return null;
}

/** Quote a calendar parameter when its value contains a content-line delimiter. */
export function formatICalParameter(value: string): string {
  return /[,:;]/.test(value) ? '"' + value + '"' : value;
}

export function unquoteICalParameter(value: string): string {
  return value.replace(/^"([^"]*)"$/, "$1");
}

/** Split a property at literal delimiters as the library profiles do. */
export function splitLiteralICalProperty(
  line: string,
): ReturnType<typeof splitICalProperty> {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  return {
    attributes: line.slice(0, colon).split(";"),
    value: line.slice(colon + 1),
  };
}

/** Unfold physical iCalendar lines before interpreting their property grammar. */
export function calendarContentLines(source: readonly string[]): string[] {
  // Already separated content lines need no join, unfold or split.
  const separated: string[] = [];
  for (const line of source) {
    if (!line || /^[ \t]|[\r\n]/.test(line)) break;
    separated.push(line);
  }
  if (separated.length === source.length) return separated;
  // Preserve existing terminators, including the CR left by split("\n").
  const text = source.map((line) =>
    line.endsWith("\n") ? line : line.endsWith("\r") ? line + "\n" : line + "\r\n"
  ).join("");
  return text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/).filter(Boolean);
}

const RECURRENCE_PROPERTY = "(?:DTSTART|RRULE|EXRULE|RDATE|EXDATE)[;:]";
const PROPERTY_START = new RegExp("^" + RECURRENCE_PROPERTY, "i");
const BARE_RULE = "(?:[A-Z]+=[^;\\s]+;)*FREQ=";
const BARE_RULE_START = new RegExp("^" + BARE_RULE, "i");
// Python str.split() also recognizes the information separators U+001C–001F.
const DATEUTIL_WHITESPACE = /[\p{White_Space}\u001C-\u001F]+/u;
// Python str.splitlines() excludes U+001F, which is only a token separator.
const DATEUTIL_LINE_ENDING = /\r\n|[\n\r\v\f\u001C-\u001E\u0085\u2028\u2029]/u;
const DATEUTIL_TRAILING_WHITESPACE = /[\p{White_Space}\u001C-\u001F]+$/u;

function rruleJsProperty(line: string): string {
  return !line.includes(":") && icalPropertyName(line) !== "DTSTART"
    ? "RRULE:" + line
    : line;
}

function rruleJsTextLines(text: string, unfold: boolean): string[] {
  const input = text.trim();
  if (!unfold) return input.split(/\s/).filter(Boolean);
  const lines: string[] = [];
  for (const raw of input.split("\n")) {
    const line = raw.trimEnd();
    if (line === "") continue;
    if (line.startsWith(" ") && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

/** Read whitespace-separated recurrence properties and folded iCalendar lines. */
export function libraryRecurrenceContentLines(
  source: readonly string[],
  profile: "dateutil" | "rrule-js",
  unfold?: boolean,
): string[] {
  const dateutil = profile === "dateutil";
  const whitespace = dateutil ? DATEUTIL_WHITESPACE : /\s/;
  const separated: string[] = [];
  for (const line of source) {
    if (!line || whitespace.test(line)) break;
    separated.push(dateutil ? line : rruleJsProperty(line));
  }
  if (separated.length === source.length) return separated;
  const text = source.join("\r\n");
  if (!dateutil && unfold != null) {
    return rruleJsTextLines(text, unfold).map((line) =>
      line.includes(":") ? line : rruleJsProperty(line.trim())
    );
  }
  if (dateutil && unfold === false) {
    return text.split(DATEUTIL_WHITESPACE).filter(Boolean);
  }
  const exactUnfold = dateutil && unfold === true;
  const trimEnd = (text: string) =>
    dateutil ? text.replace(DATEUTIL_TRAILING_WHITESPACE, "") : text.trimEnd();
  const lineEnding = dateutil ? DATEUTIL_LINE_ENDING : /\r?\n/;
  const continuation = dateutil ? /^ / : /^[ \t]/;
  const logical: string[] = [];
  const folded = new Set<number>();
  for (const raw of text.split(lineEnding)) {
    const line = dateutil
      ? raw.replace(/^[\p{White_Space}\u001C-\u001F]+/u, "")
      : raw.trim();
    if (line === "") {
      // An indented blank is discarded in unfold mode. The preceding
      // property still keeps its original trailing characters.
      if (dateutil && continuation.test(raw) && logical.length > 0) {
        folded.add(logical.length - 1);
      }
      continue;
    }
    const previous = logical.at(-1);
    const bareRuleAfterDate = previous != null &&
      /^(?:DTSTART|RDATE|EXDATE)[;:]/i.test(previous) &&
      BARE_RULE_START.test(line);
    if (
      continuation.test(raw) && previous != null &&
      (exactUnfold || (!PROPERTY_START.test(line) && !bareRuleAfterDate))
    ) {
      const index = logical.length - 1;
      logical[index] = previous + trimEnd(raw.slice(1));
      if (dateutil) folded.add(index);
    } else {
      logical.push(exactUnfold ? raw : line);
    }
  }
  if (exactUnfold) return logical;
  if (dateutil) {
    // Keep whitespace inside a reconstructed physical line. Unfolding
    // removes only the first ASCII space from each continuation. Trailing
    // whitespace on the original line stays before the continuation.
    return logical.flatMap((line, index) =>
      folded.has(index) ? [line] : trimEnd(line).split(DATEUTIL_WHITESPACE)
    );
  }
  return logical.flatMap((line) => line.split(/\s+/).map(rruleJsProperty));
}

export class ICalAttributes {
  constructor(
    private readonly inner: Map<string, Option<string>>,
    readonly order: string[],
  ) {}

  get(key: string): Option<string> {
    return this.inner.get(key.toUpperCase());
  }

  /** @internal Iterate the stored fields independently of parameter order. */
  static entriesOf(attributes: ICalAttributes): IterableIterator<[string, Option<string>]> {
    return attributes.inner.entries();
  }

  static fromRawAttributes(attributeLines: string[]): ICalAttributes {
    const attributeOrder: string[] = [];
    const attributes: Map<string, Option<string>> = new Map();
    for (const rule of attributeLines) {
      const equals = rule.indexOf("=");
      const key = equals < 0 ? rule : rule.slice(0, equals);
      const value = equals < 0 ? undefined : rule.slice(equals + 1);
      const upper = key.toUpperCase();
      if (!attributes.has(upper)) attributeOrder.push(upper);
      attributes.set(upper, value);
    }
    return new ICalAttributes(attributes, attributeOrder);
  }
}
