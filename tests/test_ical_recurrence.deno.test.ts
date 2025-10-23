import { assertEquals } from "jsr:@std/assert";
import { naivedate, naivedatetime, naivetime } from "../chrono/mod.ts";
import { ICalDateLine } from "../chrono/recurrence/ical-date-line.ts";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { IsoDate } from "../chrono/recurrence/iso-date.ts";
import { RRule } from "../chrono/recurrence/rrule.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Weekday } from "../chrono/units/weekday.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

Deno.test({
  name: "ical/recurr",
  async fn() {
    const input =
      "DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY;UNTIL=20100101T000000Z";
    const recurr = (await ICalendar.Raw.parse(input.split("\n"), true)).exp();
    assertEquals(
      recurr.lines.dtstart.dates[0],
      naivedatetime(1997, 9, 2, 9, 0, 0),
    );
    assertEquals(recurr.lines.dtstart.region.fullname, "America/New_York");
    assertEquals(recurr.lines.rrule.inner.freq, "weekly");
    assertEquals(
      recurr.lines.rrule.inner.options.until.extend(),
      naivedatetime(2010, 1, 1, 0, 0, 0),
    );
  },
});

Deno.test({
  name: "parses multiline rules",
  async fn() {
    const input = "DTSTART:19970902T090000Z\nRRULE:FREQ=YEARLY;COUNT=3";
    const ical = (await ICalendar.Raw.parse(input.split("\n"), true)).exp();
    assertEquals(ical.dtstart.dates[0], naivedatetime(1997, 9, 2, 9, 0, 0));
    assertEquals(ical.rrule.inner.freq, "yearly");
    assertEquals(ical.rrule.inner.options.count, 3);
  },
});

Deno.test({
  name: "parses legacy dtstart in rrule",
  async fn() {
    const input =
      "RRULE:FREQ=WEEKLY;\nDTSTART;TZID=America/New_York:19970902T090000";
    const ical = (await ICalendar.Raw.parse(input.split("\n"), true)).exp();
    assertEquals(ical.rrule.inner.freq, "weekly");
    assertEquals(ical.dtstart.dates[0], naivedatetime(1997, 9, 2, 9, 0, 0));
    assertEquals(ical.dtstart.region.fullname, "America/New_York");
  },
});

Deno.test({
  name: "parses dtstart with timezone",
  async fn() {
    const input = "DTSTART;TZID=America/New_York:19970902T090000";
    const recurr = (await ICalendar.Raw.parse([input], true)).exp();
    assertEquals(recurr.dtstart.dates[0], naivedatetime(1997, 9, 2, 9, 0, 0));
    assertEquals(recurr.dtstart.region?.fullname, "America/New_York");
  },
});

Deno.test({
  name: "dtstart serialization",
  async fn() {
    const recurr = new ICalendar.Raw({
      dtstart: new ICalDateLine(
        "DTSTART",
        [naivedatetime(1997, 9, 2, 9, 0, 0)],
        await TimezoneRegion.get("America/New_York"),
      ),
    });
    assertEquals(
      recurr.toString(),
      "DTSTART;TZID=America/New_York:19970902T090000",
    );

    const recurrWithFreq = new ICalendar.Raw({
      dtstart: new ICalDateLine(
        "DTSTART",
        [naivedatetime(1997, 9, 2, 9, 0, 0)],
        await TimezoneRegion.get("America/New_York"),
      ),
      rrule: new RRule({
        freq: "weekly",
      }),
    });
    assertEquals(
      recurrWithFreq.toString(),
      "DTSTART;TZID=America/New_York:19970902T090000\nRRULE:FREQ=WEEKLY",
    );
  },
});

Deno.test({
  name: "recurrence/case-insensitive property name",
  async fn() {
    const input = ["RRULE:FREQ=WEEKLY;BYDAY=FR"];
    const recurr = (await ICalendar.Raw.parse(input, true)).exp();
    assertEquals(recurr.rrule.inner.freq, "weekly");
  },
});

Deno.test({
  name: "testConvertAndBack",
  async fn() {
    const recurr = new ICalendar.Raw({
      dtstart: new ICalDateLine(
        "DTSTART",
        [naivedatetime(2017, 10, 17, 0, 30, 0)],
        null,
        null,
        {
          includeZ: true,
        },
      ),
      rrule: new RRule(
        {
          freq: "monthly",
          options: {
            until: new IsoDate(naivedate(2017, 12, 22), naivetime(1, 30), "Z"),
            interval: 1,
            bysetpos: 17,
            byday: [
              Weekday.SUN,
              Weekday.MON,
              Weekday.TUE,
              Weekday.WED,
              Weekday.THU,
              Weekday.FRI,
              Weekday.SAT,
            ],
            wkst: Weekday.SUN,
            byhour: [11],
            byminute: [0],
            bysecond: [0],
          },
        },
        [
          "FREQ",
          "UNTIL",
          "INTERVAL",
          "BYSETPOS",
          "BYDAY",
          "WKST",
          "BYHOUR",
          "BYMINUTE",
          "BYSECOND",
        ],
      ),
    });
    const rrstr = recurr.toString();
    const expected =
      "DTSTART:20171017T003000Z\nRRULE:FREQ=MONTHLY;UNTIL=20171222T013000Z;INTERVAL=1;BYSETPOS=17;BYDAY=SU,MO,TU,WE,TH,FR,SA;WKST=SU;BYHOUR=11;BYMINUTE=0;BYSECOND=0";
    assertEquals(rrstr, expected);

    const newrr = (await ICalendar.Raw.parse(rrstr.split("\n"), true)).exp();
    assertEquals(newrr.toString(), rrstr);
  },
});

Deno.test({
  name: "rrule/serde/weekly,exdate,byday-th",
  async fn() {
    const exdate =
      "EXDATE;TZID=America/Los_Angeles:20240411T150000,20240418T150000,20241024T150000,20241219T150000,20250213T150000,20250501T150000";
    const rrule = "RRULE:FREQ=WEEKLY;BYDAY=TH";
    const input = [exdate, rrule];
    const recurr = (await ICalendar.Raw.parse(input, true)).exp();
    assertEquals(recurr.lines.rrule.inner.freq, "weekly");
    assertEquals(recurr.toString(), exdate + "\n" + rrule);
  },
});
