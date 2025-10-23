// Test file to debug NaiveDateTime compatibility

import { naivedatetime } from "../chrono/mod.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { NaiveDateTime } from "../chrono/naive-datetime.ts";
import { NaiveTime } from "../chrono/naive-time.ts";
import { Time } from "../chrono/time.ts";

Deno.test("debug test", () => {
  const date = NaiveDate.fromYmd1(2023, 3, 15).exp();
  console.log("NaiveDate properties:", Object.getOwnPropertyNames(date));

  const time = new NaiveTime(14 * Time.MS_PER_HR + 30 * Time.MS_PER_MIN);
  console.log("NaiveTime properties:", Object.getOwnPropertyNames(time));

  const datetime = new NaiveDateTime(date, time);
  console.log(
    "NaiveDateTime properties:",
    Object.getOwnPropertyNames(datetime),
  );
  console.log("datetime.date:", datetime.date);

  // Test helper function
  const dt = naivedatetime(2023, 3, 15, 14, 30);
  console.log("naivedatetime result:", dt);
});
