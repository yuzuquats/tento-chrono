import { assertEquals } from "@std/assert";
import { naivedate, naivedatetime } from "../chrono/mod.ts";
import { NaiveTime } from "../chrono/naive-time.ts";
import { IsoDate } from "../chrono/recurrence/iso-date.ts";
import { RRule } from "../chrono/recurrence/rrule.ts";

// Test serialize/deserialize
function test_google_serde(google_rrule: string) {
  const des = RRule.parse(google_rrule).exp();
  const ser = des.toString();
  assertEquals(google_rrule, ser);
}

Deno.test({
  name: "rrule/parse",
  fn() {
    const rule = "RRULE:FREQ=WEEKLY;WKST=WE";
    const rrule = RRule.parse(rule).exp();
    assertEquals(rule, rrule.toString());
  },
});

Deno.test({
  name: "rrule/interval=0",
  fn() {
    [
      "RRULE:FREQ=YEARLY;INTERVAL=0;BYSETPOS=1;BYDAY=MO",
      "RRULE:FREQ=MONTHLY;INTERVAL=0;BYSETPOS=1;BYDAY=MO",
      "RRULE:FREQ=DAILY;INTERVAL=0;BYSETPOS=1;BYDAY=MO",
      "RRULE:FREQ=HOURLY;INTERVAL=0;BYSETPOS=1;BYDAY=MO",
      "RRULE:FREQ=MINUTELY;INTERVAL=0;BYSETPOS=1;BYDAY=MO",
      "RRULE:FREQ=SECONDLY;INTERVAL=0;BYSETPOS=1;BYDAY=MO",
    ].map((s) => {
      const rrule = RRule.parse(s).exp();
      assertEquals(rrule.toString(), s);
    });
  },
});

Deno.test({
  name: "rrule/options/deserialize",
  fn() {
    {
      const rrule = RRule.parse("FREQ=WEEKLY;UNTIL=20100101T000000Z").exp();
      assertEquals(rrule.inner.freq, "weekly");
      assertEquals(
        rrule.inner.options.until.extend(),
        naivedatetime(2010, 1, 1),
      );
    }

    {
      const rrule = RRule.parse("FREQ=WEEKLY;UNTIL=20100101").exp();
      assertEquals(rrule.inner.freq, "weekly");
      assertEquals(
        rrule.inner.options.until.extend(),
        naivedatetime(2010, 1, 1),
      );
    }
  },
});

Deno.test({
  name: "rrule/options/serialize",
  fn() {
    assertEquals(
      new RRule({
        freq: "weekly",
        options: {
          until: new IsoDate(naivedate(2010, 1, 1), NaiveTime.ZERO, "Z"),
        },
      }).toString(),
      "RRULE:FREQ=WEEKLY;UNTIL=20100101T000000Z",
    );
  },
});

Deno.test({
  name: "rrule/serde/weekly,cnt,byday",
  fn() {
    const rrule = "RRULE:FREQ=WEEKLY;COUNT=20;BYDAY=MO";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,cnt,byday-tu",
  fn() {
    const rrule = "RRULE:FREQ=WEEKLY;COUNT=20;BYDAY=TU";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,cnt,byday-th",
  fn() {
    const rrule = "RRULE:FREQ=WEEKLY;COUNT=20;BYDAY=TH";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,until,byday-fr",
  fn() {
    const rrule = "RRULE:FREQ=WEEKLY;UNTIL=20220617T065959Z;BYDAY=FR";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/monthly,until,bymonthday",
  fn() {
    const rrule = "RRULE:FREQ=MONTHLY;UNTIL=20190419;BYMONTHDAY=20";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,until,byday-mo,we",
  fn() {
    const rrule = "RRULE:FREQ=WEEKLY;UNTIL=20140813T230000Z;BYDAY=MO,WE";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,until,byday-all-days",
  fn() {
    const rrule =
      "RRULE:FREQ=WEEKLY;UNTIL=20150209T043000Z;BYDAY=SU,MO,TU,WE,TH,FR,SA";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,until",
  fn() {
    const rrule = "RRULE:FREQ=WEEKLY;UNTIL=20190507T065959Z";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,until,byday-su",
  fn() {
    const rrule = "RRULE:FREQ=WEEKLY;UNTIL=20190616T065959Z;BYDAY=SU";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,until-simple",
  fn() {
    const rrule = "RRULE:FREQ=WEEKLY;UNTIL=20240116T045959Z";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,wkst-mo,until,byday-su",
  fn() {
    const rrule = "RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20190617T065959Z;BYDAY=SU";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,wkst-mo,until,byday-fr,tu",
  fn() {
    const rrule =
      "RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20200601T065959Z;BYDAY=FR,TU";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,wkst-mo,until,interval,byday-fr,we",
  fn() {
    const rrule =
      "RRULE:FREQ=WEEKLY;WKST=MO;UNTIL=20210120T075959Z;INTERVAL=12;BYDAY=FR,WE";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/weekly,wkst-su,until,interval,byday-mo",
  fn() {
    const rrule =
      "RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20220627T065959Z;INTERVAL=2;BYDAY=MO";
    test_google_serde(rrule);
  },
});

Deno.test({
  name: "rrule/serde/yearly",
  fn() {
    const rrule = "RRULE:FREQ=YEARLY";
    test_google_serde(rrule);
  },
});
