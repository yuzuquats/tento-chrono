import { assertEquals } from "jsr:@std/assert";
import { naivedate } from "../chrono/mod.ts";
import {
  LunarConverter,
  HebrewConverter,
  IslamicConverter,
  PersianConverter,
  ThaiConverter,
  EthiopianConverter,
  IndianConverter,
} from "../chrono/secondary-calendars/mod.ts";
import { Fixtures } from "./fixture-runner.ts";

const DIR = new URL("secondary-calendars", import.meta.url).pathname;

type Input = string; // "YYYY-MM-DD"
type Expected = string | null;

function parse(input: Input) {
  const [y, m, d] = input.split("-").map(Number);
  return naivedate(y, m, d);
}

const converters: Record<string, (d: ReturnType<typeof parse>) => Expected> = {
  hebrew: (d) => HebrewConverter.labelFor(d),
  islamic: (d) => IslamicConverter.labelFor(d),
  persian: (d) => PersianConverter.labelFor(d),
  lunar: (d) => LunarConverter.labelFor(d),
  thai: (d) => ThaiConverter.labelFor(d),
  ethiopian: (d) => EthiopianConverter.labelFor(d),
  indian: (d) => IndianConverter.labelFor(d),
};

for (const [name, fn] of Object.entries(converters)) {
  Fixtures.load<Input, Expected>(DIR, name).run(
    (input) => fn(parse(input)),
    (result, expected, caseName) => assertEquals(result, expected, caseName),
  );
}
