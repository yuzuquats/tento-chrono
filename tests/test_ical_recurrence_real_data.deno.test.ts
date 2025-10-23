import { DateTime } from "../chrono/datetime.ts";
import { NaiveDate } from "../chrono/naive-date.ts";
import { ICalendar } from "../chrono/recurrence/ical.ts";
import { Recurrence } from "../chrono/recurrence/recurrence.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Utc } from "../chrono/timezone.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

type RecurrenceTestCaseJson = {
  description?: string;
  event: {
    start: string;
    time_zone?: string;
    rules: string[];
  };
  query_range: {
    start: string;
    end: string;
  };
  recorded_instances: string[];
};

class RecurrenceTestCase {
  constructor(
    readonly recurr: Recurrence,
    readonly queryStart: NaiveDate,
    readonly queryEnd: NaiveDate,
    readonly recordedInstances: DateTime<Utc>[],
    readonly description?: string,
    readonly eventStart?: NaiveDate,
    readonly rawData?: RecurrenceTestCaseJson,
    readonly timezone?: Option<TimezoneRegion>,
  ) {}

  static async parse(raw: RecurrenceTestCaseJson): Promise<RecurrenceTestCase> {
    const ical = await ICalendar.Raw.parse(raw.event.rules);
    if (ical.isErr) throw new Error("couldn't parse rules");

    const recurr = new Recurrence(ical.asOk()!);

    // Get timezone from RRULE or from event time_zone field
    let timezone = await recurr.timezone();
    if (!timezone && raw.event.time_zone) {
      timezone = await TimezoneRegion.get(raw.event.time_zone);
    }

    const eventStartDate = Utc.parse(raw.event.start).ndt.date;

    if (timezone) {
      return new RecurrenceTestCase(
        recurr,
        timezone.toTz(Utc.parse(raw.query_range.start)).ndt.date,
        timezone.toTz(Utc.parse(raw.query_range.end)).ndt.date,
        raw.recorded_instances.map((i) => Utc.parse(i)),
        raw.description,
        timezone.toTz(Utc.parse(raw.event.start)).ndt.date,
        raw,
        timezone,
      );
    } else {
      return new RecurrenceTestCase(
        recurr,
        Utc.parse(raw.query_range.start).ndt.date,
        Utc.parse(raw.query_range.end).ndt.date,
        raw.recorded_instances.map((i) => Utc.parse(i)),
        raw.description,
        eventStartDate,
        raw,
        null,
      );
    }
  }

  async test(): Promise<boolean> {
    try {
      if (!this.rawData) {
        throw new Error("No raw data available for generateGoogleEvents");
      }

      const startDateTimeResult = DateTime.fromRfc3339(
        this.rawData.event.start,
      );
      if (startDateTimeResult.isErr) {
        throw new Error(
          `Failed to parse start datetime: ${startDateTimeResult.asErr()}`,
        );
      }
      const startDateTime = startDateTimeResult.asOk()!;

      const generator = await this.recurr.generateGoogleEvents(
        startDateTime,
        this.timezone,
      );

      // Generate events up to the query end date and convert to string format for comparison
      const queryEndDate = Utc.parse(this.rawData.query_range.end).ndt.date;
      const events = generator.generateUpToDate(queryEndDate);

      // Filter events to only include those within the query range (for proper comparison)
      const queryStartDate = Utc.parse(this.rawData.query_range.start).ndt.date;
      const filteredEvents = events.filter(
        (e) =>
          e.ndt.date.dse >= queryStartDate.dse &&
          e.ndt.date.dse < queryEndDate.dse,
      );

      const allnd = filteredEvents.map((e) => e.toString());
      const expectedDates = this.recordedInstances.map((r) => r.toString());

      const match = JSON.stringify(allnd) === JSON.stringify(expectedDates);

      console.log(
        `Test: ${this.description || "Unnamed"} - ${match ? "PASS" : "FAIL"}`,
      );
      if (!match) {
        console.log("EXPECTED:", expectedDates);
        console.log("GENERATED:", allnd);
      }

      return match;
    } catch (error) {
      console.log(
        `Test: ${this.description || "Unnamed"} - ERROR: ${error.message}`,
      );
      return false;
    }
  }

  async testIncremental(): Promise<boolean> {
    try {
      if (!this.rawData) {
        throw new Error("No raw data available for generateGoogleEvents");
      }

      const startDateTimeResult = DateTime.fromRfc3339(
        this.rawData.event.start,
      );
      if (startDateTimeResult.isErr) {
        throw new Error(
          `Failed to parse start datetime: ${startDateTimeResult.asErr()}`,
        );
      }
      const startDateTime = startDateTimeResult.asOk()!;
      const generator = await this.recurr.generateGoogleEvents(
        startDateTime,
        this.timezone,
      );

      const queryStartDate = Utc.parse(this.rawData.query_range.start).ndt.date;
      const queryEndDate = Utc.parse(this.rawData.query_range.end).ndt.date;

      // Calculate a midpoint for incremental generation
      const totalDays = queryEndDate.dse - queryStartDate.dse;
      const midpointDse = queryStartDate.dse + Math.floor(totalDays / 2);
      const midpointDate = queryStartDate.addDays(Math.floor(totalDays / 2));

      // Generate events incrementally: first to midpoint, then to end
      const firstBatch = generator.generateUpToDate(midpointDate);
      const secondBatch = generator.generateUpToDate(queryEndDate);

      // Combine and filter all events
      const allEvents = [...firstBatch, ...secondBatch];
      const filteredEvents = allEvents.filter(
        (e) =>
          e.ndt.date.dse >= queryStartDate.dse &&
          e.ndt.date.dse < queryEndDate.dse,
      );

      const allnd = filteredEvents.map((e) => e.toString());
      const expectedDates = this.recordedInstances.map((r) => r.toString());

      const match = JSON.stringify(allnd) === JSON.stringify(expectedDates);

      return match;
    } catch (error) {
      return false;
    }
  }

  dbg() {
    console.log("RecurrenceTestCase {");
    console.log("  rules: ", this.recurr.inner.toString());
    console.log("  start: ", this.queryStart.toString());
    console.log("  end: ", this.queryEnd.toString());
    console.log(this.recordedInstances.map((i) => i.toString()));
    console.log("}");
  }
}

async function loadTestCases(): Promise<RecurrenceTestCase[]> {
  const testDataDir = "./tests/google_recurrence_test_data";
  const testCases: RecurrenceTestCase[] = [];

  for await (const dirEntry of Deno.readDir(testDataDir)) {
    if (dirEntry.name.endsWith(".instances.json")) {
      const filePath = `${testDataDir}/${dirEntry.name}`;
      const content = await Deno.readTextFile(filePath);
      const rawData = JSON.parse(content) as RecurrenceTestCaseJson;
      const testCase = await RecurrenceTestCase.parse(rawData);
      testCases.push(testCase);
    }
  }

  return testCases;
}

installTimezoneLoader();

Deno.test({
  name: "ical/recurr - real data comparison",
  fn: async () => {
    const testCases = await loadTestCases();
    let passCount = 0;
    let failCount = 0;

    for (const testCase of testCases) {
      const passed = await testCase.test();
      if (passed) {
        passCount++;
      } else {
        failCount++;
      }
    }

    console.log(
      `\nSummary: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`,
    );

    if (failCount > 0) {
      throw new Error(`${failCount} tests failed`);
    }
  },
});

Deno.test({
  name: "ical/recurr - incremental generation test",
  fn: async () => {
    const testCases = await loadTestCases();
    let passCount = 0;
    let failCount = 0;

    for (const testCase of testCases) {
      const passed = await testCase.testIncremental();
      if (passed) {
        passCount++;
      } else {
        failCount++;
        console.log(
          `Incremental test FAILED for: ${testCase.description || "Unnamed"}`,
        );
      }
    }

    console.log(
      `\nIncremental Generation Summary: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`,
    );

    if (failCount > 0) {
      throw new Error(`${failCount} incremental tests failed`);
    }
  },
});
