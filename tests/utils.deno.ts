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

const LOADERS = {
  url: <TimezoneRegion.Loader>{
    load: async (tzname: Tzname) => {
      const resp = await fetch(
        `https://dev--static.lona.so:8443/timezones/2024b/1900_2050/${tzname.replaceAll(
          "/",
          "~",
        )}.json`,
      );
      const json = await resp.json();
      return json.map((s: TimezoneRegion.Transition.Serialized) =>
        TimezoneRegion.Transition.parse(s, tzname),
      );
    },
  },
  // file: <TimezoneRegion.Loader>{
  //   load: async () => {
  //     const module = await import(
  //       "../../../container_data/tento-tz/2024b/1970_2050/America~Los_Angeles.json",
  //       {
  //         with: { type: "json" },
  //       }
  //     );
  //     return module.default.map((s: TimezoneRegion.Transition.Serialized) =>
  //       TimezoneRegion.Transition.parse(s, "America/Los_Angeles")
  //     );
  //   },
  // },
};

export function installTimezoneLoader() {
  TimezoneRegion.setLoader(LOADERS.url);
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
