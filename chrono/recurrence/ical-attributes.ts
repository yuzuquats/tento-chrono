import type { Option } from "../option.ts";

export function icalPropertyName(line: string): string {
  const end = line.search(/[:;]/);
  return (end < 0 ? line : line.slice(0, end)).toUpperCase();
}

/** Split a content line at delimiters outside quoted parameter values. */
export function splitICalProperty(
  line: string,
): { attributes: string[]; value: string } | null {
  const attributes = [];
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

export class ICalAttributes {
  constructor(
    private readonly inner: Map<string, Option<string>>,
    readonly order: string[],
  ) {}

  get(key: string): Option<string> {
    return this.inner.get(key.toUpperCase());
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
