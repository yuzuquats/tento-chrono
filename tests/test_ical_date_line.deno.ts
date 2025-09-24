import { assertEquals } from "jsr:@std/assert/equals";

import { ICalDateLine } from "../chrono/recurrence/ical-date-line.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

// Test examples from the iCalendar spec and Google Calendar compatibility.
const examples = [
  "EXDATE;TZID=America/Los_Angeles:20240411T150000,20240418T150000,20241024T150000,20241219T150000,20250213T150000,20250501T150000",
  "EXDATE:19980401T133000Z,19980402T133000Z",
  "EXDATE;VALUE=DATE:20231225,20231226,20231227",
  "EXDATE:20231225T090000,20231226T090000",
  "EXDATE;VALUE=DATE-TIME:20231225T090000,20231226T090000",
  "EXDATE;VALUE=DATE-TIME;TZID=Europe/Brussels:20231225T090000,20231226T090000",
];

for (const input of examples) {
  Deno.test({
    name: `exdate/parse and toString for ${input.split(":")[0]}`,
    async fn() {
      const result = (await ICalDateLine.parse(input, true)).exp();
      assertEquals(result.toString(), input);
    },
  });
}

// Test additional edge cases: case-insensitivity, folded lines, and multiple EXDATE lines.
Deno.test({
  name: "exdate/case-insensitive property name",
  async fn() {
    const input = "exdate:20231225T090000";
    const ex = (await ICalDateLine.parse(input, true)).exp();
    assertEquals(ex.toString(), "EXDATE:20231225T090000");
  },
});

Deno.test({
  name: "exdate/unfold folded lines",
  async fn() {
    const input =
      "EXDATE:19980401T133000Z,19980402T133000Z,\n" + " 19980403T133000Z";
    const ex = (await ICalDateLine.parse(input, true)).exp();
    assertEquals(
      ex.toString(),
      "EXDATE:19980401T133000Z,19980402T133000Z,19980403T133000Z",
    );
  },
});
