import { assertEquals } from "@std/assert";
import { DateTime, Recurrence, TimezoneRegion, Tzname } from "../chrono/mod.ts";
import { resolveGoogleDateTimezone } from "../chrono/recurrence/google-timezones.ts";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import {
  exclusionsOfLines,
  isExcludedInstance,
  type RecurrenceShift,
  shiftRecurrenceLines,
  splitRdatesAt,
} from "../chrono/recurrence/recurrence.ts";
import { RRule } from "../chrono/recurrence/rrule.ts";
import { Fixtures } from "./fixture-runner.deno.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

type Edit =
  | {
    kind: "split";
    lines: string[];
    start: string;
    cut: string;
    timezone?: string;
  }
  | { kind: "move"; lines: string[]; shift: RecurrenceShift; timezone?: string }
  | { kind: "rewrite"; lines: string[]; zones?: string[] }
  | {
    kind: "exclusions";
    lines: string[];
    starts: string[];
    timezone?: string;
  };

installTimezoneLoader();

function loadedZone(name: string) {
  return TimezoneRegion.getOpt(Tzname.parseOpt(name)!);
}

const dir = new URL("./fixtures/", import.meta.url).pathname;
Fixtures.load<
  Edit,
  string[] | boolean[] | { before: string[]; from: string[] }
>(dir, "recurrence-edit").run(
  async (edit) => {
    if (edit.kind === "exclusions") {
      const zone = edit.timezone == null
        ? null
        : await loadedZone(edit.timezone);
      const exclusions = exclusionsOfLines(
        edit.lines,
        zone?.fullname ?? Tzname.UTC,
        (name) => name === zone?.fullname ? zone : null,
      );
      return edit.starts.map((value) => {
        const at = DateTime.fromRfc3339(value).exp().toUtc();
        const wall = zone?.toTz(at).ndt ?? at.ndt;
        return isExcludedInstance(exclusions!, wall, at);
      });
    }
    if (edit.kind === "rewrite") {
      if (edit.zones == null) {
        return RRule.parseWithRecurrence(edit.lines).exp().toRecurrenceArray();
      }
      const regions = new Map();
      for (const name of edit.zones) {
        regions.set(name, await resolveGoogleDateTimezone(name));
      }
      const raw = (await ICalendar.Raw.parse(edit.lines, false, regions)).exp();
      const written = raw.toString().split("\n");
      (await Recurrence.fromICalendar(written, { profile: "google" })).exp();
      return written;
    }
    const timezone = edit.timezone == null
      ? null
      : await loadedZone(edit.timezone);
    if (edit.kind === "split") {
      const cut = DateTime.fromRfc3339(edit.cut).exp().toUtc();
      const start = DateTime.fromRfc3339(edit.start).exp();
      return splitRdatesAt(edit.lines, cut, start, timezone);
    }
    return shiftRecurrenceLines(edit.lines, edit.shift, timezone, () => null);
  },
  (result, expected) => assertEquals(result, expected),
);
