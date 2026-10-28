import { assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { FixedTimezone, Tzname } from "../chrono/timezone.ts";
import { Duration } from "../chrono/units/duration.ts";

export const NY_EDT = new FixedTimezone("NY_EDT", {
  tzabbr: "EDT",
  tzname: "America/New_York" as Tzname,
  offset: Duration.Time.from({ mins: -240 }),
});
export const NY_EST = new FixedTimezone("NY_EST", {
  tzabbr: "EST",
  tzname: "America/New_York" as Tzname,
  offset: Duration.Time.from({ mins: -300 }),
});
export const LA_PDT = new FixedTimezone("LA_PDT", {
  tzabbr: "PDT",
  tzname: "America/Los_Angeles" as Tzname,
  offset: Duration.Time.from({ mins: -420 }),
});
export const LA_PST = new FixedTimezone("LA_PST", {
  tzabbr: "PST",
  tzname: "America/Los_Angeles" as Tzname,
  offset: Duration.Time.from({ mins: -480 }),
});

const fixtureLoader: TimezoneRegion.Loader = {
  load: async (tzname: Tzname) => {
    const name = tzname.replaceAll("/", "~");
    if (!/^[A-Za-z0-9_+~\-]+$/.test(name)) {
      throw new Error(`Invalid timezone fixture name: ${tzname}`);
    }
    const text = await Deno.readTextFile(
      new URL(`./timezones/2024b/${name}.json`, import.meta.url),
    );
    const transitions: TimezoneRegion.Transition.Serialized[] = JSON.parse(text);
    return transitions.map((value) => TimezoneRegion.Transition.parse(value, tzname));
  },
};

export function installTimezoneLoader() {
  TimezoneRegion.setLoader(fixtureLoader);
}

export function assertEqualsObject(actual: unknown, expected: unknown) {
  const ignoreNull = (_: string, value: unknown) => {
    if (value != null) return value;
  };

  assertEquals(
    JSON.stringify(actual, ignoreNull),
    JSON.stringify(expected, ignoreNull),
  );
}
