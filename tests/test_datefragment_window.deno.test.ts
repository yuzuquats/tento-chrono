import { assertEquals } from "@std/assert";

import { DateFragment } from "../chrono/date-fragment.ts";
import { DateRegion } from "../chrono/date-region.ts";
import { DateTime } from "../chrono/datetime.ts";
import { naivedate } from "../chrono/mod.ts";
import { NaiveDateTime } from "../chrono/naive-datetime.ts";
import { GenericRange } from "../chrono/range.ts";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import { Utc, Tzname } from "../chrono/timezone.ts";
import { Duration } from "../chrono/units/duration.ts";
import { TimeOfDay } from "../chrono/units/time-of-day.ts";
import { installTimezoneLoader } from "./utils.deno.ts";

installTimezoneLoader();

type WindowedDateFragmentTestCaseJson = {
  name: string;
  description: string;
  windowed_date_fragment: {
    date_fragment: {
      date: string;
      tz: string;
      fragment_index?: number;
    };
    partial_window: Option<{
      start: Option<string>;
      end: Option<string>;
    }>;
    valid_hours: Option<{
      start: string;
      end: string;
    }>;
    y_offsets?: number[];
  };
  expected: {
    utc: {
      all: {
        start: string;
        end: string;
        duration: number;
      };
      partial_window: {
        start: string;
        end: string;
        duration: number;
      };
      valid_hours: {
        start: string;
        end: string;
        duration: number;
      };
    };
    local: {
      all: {
        start: string;
        end: string;
        duration: number;
      };
      partial_window: {
        start: string;
        end: string;
        duration: number;
      };
      valid_hours: {
        start: string;
        end: string;
        duration: number;
      };
    };
    y_offsets?: string[];
  };
};

class WindowedDateFragmentTestCase {
  constructor(
    readonly windowed: DateFragment.Windowed,
    readonly expected: {
      utc: {
        all: { range: DateTime.Range<Utc>; duration: number };
        partialWindow: { range: DateTime.Range<Utc>; duration: number };
        validHours: { range: DateTime.Range<Utc>; duration: number };
      };
      local: {
        all: { str: string; duration: number };
        partialWindow: { str: string; duration: number };
        validHours: { str: string; duration: number };
      };
      yOffsets?: { input: number[]; output: Duration.Time[] };
    },
    readonly name: string,
    readonly description: string,
  ) {}

  static async parse(
    raw: WindowedDateFragmentTestCaseJson,
  ): Promise<WindowedDateFragmentTestCase> {
    const dateParts = raw.windowed_date_fragment.date_fragment.date.split("-");
    const date = naivedate(
      Number.parseInt(dateParts[0]),
      Number.parseInt(dateParts[1]),
      Number.parseInt(dateParts[2]),
    );

    const tz = await TimezoneRegion.get(
      raw.windowed_date_fragment.date_fragment.tz as Tzname,
    );

    const dateRegion = new DateRegion(date, tz);
    const fragments = dateRegion.dateFragments();
    const fragmentIndex =
      raw.windowed_date_fragment.date_fragment.fragment_index ?? 0;

    if (fragmentIndex >= fragments.length) {
      throw new Error(
        `Fragment index ${fragmentIndex} out of range. Date ${raw.windowed_date_fragment.date_fragment.date} has ${fragments.length} fragment(s).`,
      );
    }

    const fragment = fragments[fragmentIndex];

    let partialWindow: Option<GenericRange<Option<NaiveDateTime>>> = undefined;
    if (raw.windowed_date_fragment.partial_window) {
      const pw = raw.windowed_date_fragment.partial_window;
      const start = pw.start ? NaiveDateTime.parse(pw.start) : undefined;
      const end = pw.end ? NaiveDateTime.parse(pw.end) : undefined;
      partialWindow = new GenericRange(start, end);
    }

    let validHours: Option<TimeOfDay.Range> = undefined;
    if (raw.windowed_date_fragment.valid_hours) {
      const vh = raw.windowed_date_fragment.valid_hours;
      const startTime = TimeOfDay.parse(vh.start);
      const endTime = TimeOfDay.parse(vh.end);
      if (startTime.isOk && endTime.isOk) {
        const start = startTime.asOk()!;
        const end = endTime.asOk()!;
        const endsOnNextDay =
          start.toMs > end.toMs || (start.toMs === 0 && end.toMs === 0);
        validHours = new TimeOfDay.Range(start, end, endsOnNextDay);
      }
    }

    const windowed = new DateFragment.Windowed(
      fragment,
      partialWindow,
      validHours,
    );

    const expectedUtcAll = new DateTime.Range(
      DateTime.fromRfc3339(raw.expected.utc.all.start).exp().toUtc(),
      DateTime.fromRfc3339(raw.expected.utc.all.end).exp().toUtc(),
    );

    const expectedUtcPartialWindow = new DateTime.Range(
      DateTime.fromRfc3339(raw.expected.utc.partial_window.start).exp().toUtc(),
      DateTime.fromRfc3339(raw.expected.utc.partial_window.end).exp().toUtc(),
    );

    const expectedUtcValidHours = new DateTime.Range(
      DateTime.fromRfc3339(raw.expected.utc.valid_hours.start).exp().toUtc(),
      DateTime.fromRfc3339(raw.expected.utc.valid_hours.end).exp().toUtc(),
    );

    const expectedLocalAll = `${raw.expected.local.all.start} to ${raw.expected.local.all.end}`;
    const expectedLocalPartialWindow = `${raw.expected.local.partial_window.start} to ${raw.expected.local.partial_window.end}`;
    const expectedLocalValidHours = `${raw.expected.local.valid_hours.start} to ${raw.expected.local.valid_hours.end}`;

    let yOffsetsData: Option<{ input: number[]; output: Duration.Time[] }> =
      undefined;
    if (
      raw.windowed_date_fragment.y_offsets &&
      raw.expected.y_offsets &&
      raw.windowed_date_fragment.y_offsets.length ===
        raw.expected.y_offsets.length
    ) {
      const outputDurations: Duration.Time[] = [];
      for (const durationStr of raw.expected.y_offsets) {
        outputDurations.push(Duration.Time.parse(durationStr).exp());
      }
      yOffsetsData = {
        input: raw.windowed_date_fragment.y_offsets,
        output: outputDurations,
      };
    }

    return new WindowedDateFragmentTestCase(
      windowed,
      {
        utc: {
          all: {
            range: expectedUtcAll,
            duration: raw.expected.utc.all.duration,
          },
          partialWindow: {
            range: expectedUtcPartialWindow,
            duration: raw.expected.utc.partial_window.duration,
          },
          validHours: {
            range: expectedUtcValidHours,
            duration: raw.expected.utc.valid_hours.duration,
          },
        },
        local: {
          all: {
            str: expectedLocalAll,
            duration: raw.expected.local.all.duration,
          },
          partialWindow: {
            str: expectedLocalPartialWindow,
            duration: raw.expected.local.partial_window.duration,
          },
          validHours: {
            str: expectedLocalValidHours,
            duration: raw.expected.local.valid_hours.duration,
          },
        },
        yOffsets: yOffsetsData,
      },
      raw.name,
      raw.description,
    );
  }

  test(): { passed: boolean; errors: string[] } {
    const errors: string[] = [];
    const tz = this.windowed.fragment.parent;

    const actualAll = this.windowed.applyAll();
    if (
      actualAll.start.rfc3339() !==
        this.expected.utc.all.range.start.rfc3339() ||
      actualAll.end.rfc3339() !== this.expected.utc.all.range.end.rfc3339()
    ) {
      errors.push(
        `applyAll() UTC mismatch:\n  Expected: ${this.expected.utc.all.range.start.rfc3339()} to ${this.expected.utc.all.range.end.rfc3339()}\n  Actual:   ${actualAll.start.rfc3339()} to ${actualAll.end.rfc3339()}`,
      );
    }

    const actualAllDuration =
      (actualAll.end.mse - actualAll.start.mse) / (1000 * 60 * 60);
    if (Math.abs(actualAllDuration - this.expected.utc.all.duration) > 0.01) {
      errors.push(
        `applyAll() UTC duration mismatch:\n  Expected: ${this.expected.utc.all.duration} hours\n  Actual:   ${actualAllDuration.toFixed(2)} hours`,
      );
    }

    const actualAllStartLocal = tz.toTz(actualAll.start);
    const actualAllEndLocal = tz.toTz(actualAll.end);
    const actualAllLocal = `${actualAllStartLocal.rfc3339()} to ${actualAllEndLocal.rfc3339()}`;
    if (actualAllLocal !== this.expected.local.all.str) {
      errors.push(
        `applyAll() Local mismatch:\n  Expected: ${this.expected.local.all.str}\n  Actual:   ${actualAllLocal}`,
      );
    }

    const actualPartialWindow = this.windowed.applyPartialWindow();
    if (
      actualPartialWindow.start.rfc3339() !==
        this.expected.utc.partialWindow.range.start.rfc3339() ||
      actualPartialWindow.end.rfc3339() !==
        this.expected.utc.partialWindow.range.end.rfc3339()
    ) {
      errors.push(
        `applyPartialWindow() UTC mismatch:\n  Expected: ${this.expected.utc.partialWindow.range.start.rfc3339()} to ${this.expected.utc.partialWindow.range.end.rfc3339()}\n  Actual:   ${actualPartialWindow.start.rfc3339()} to ${actualPartialWindow.end.rfc3339()}`,
      );
    }

    const actualPartialWindowDuration =
      (actualPartialWindow.end.mse - actualPartialWindow.start.mse) /
      (1000 * 60 * 60);
    if (
      Math.abs(
        actualPartialWindowDuration - this.expected.utc.partialWindow.duration,
      ) > 0.01
    ) {
      errors.push(
        `applyPartialWindow() UTC duration mismatch:\n  Expected: ${this.expected.utc.partialWindow.duration} hours\n  Actual:   ${actualPartialWindowDuration.toFixed(2)} hours`,
      );
    }

    const actualPartialWindowStartLocal = tz.toTz(actualPartialWindow.start);
    const actualPartialWindowEndLocal = tz.toTz(actualPartialWindow.end);
    const actualPartialWindowLocal = `${actualPartialWindowStartLocal.rfc3339()} to ${actualPartialWindowEndLocal.rfc3339()}`;
    if (actualPartialWindowLocal !== this.expected.local.partialWindow.str) {
      errors.push(
        `applyPartialWindow() Local mismatch:\n  Expected: ${this.expected.local.partialWindow.str}\n  Actual:   ${actualPartialWindowLocal}`,
      );
    }

    const actualValidHours = this.windowed.applyValidHours();
    if (
      actualValidHours.start.rfc3339() !==
        this.expected.utc.validHours.range.start.rfc3339() ||
      actualValidHours.end.rfc3339() !==
        this.expected.utc.validHours.range.end.rfc3339()
    ) {
      errors.push(
        `applyValidHours() UTC mismatch:\n  Expected: ${this.expected.utc.validHours.range.start.rfc3339()} to ${this.expected.utc.validHours.range.end.rfc3339()}\n  Actual:   ${actualValidHours.start.rfc3339()} to ${actualValidHours.end.rfc3339()}`,
      );
    }

    const actualValidHoursDuration =
      (actualValidHours.end.mse - actualValidHours.start.mse) /
      (1000 * 60 * 60);
    if (
      Math.abs(
        actualValidHoursDuration - this.expected.utc.validHours.duration,
      ) > 0.01
    ) {
      errors.push(
        `applyValidHours() UTC duration mismatch:\n  Expected: ${this.expected.utc.validHours.duration} hours\n  Actual:   ${actualValidHoursDuration.toFixed(2)} hours`,
      );
    }

    const actualValidHoursStartLocal = tz.toTz(actualValidHours.start);
    const actualValidHoursEndLocal = tz.toTz(actualValidHours.end);
    const actualValidHoursLocal = `${actualValidHoursStartLocal.rfc3339()} to ${actualValidHoursEndLocal.rfc3339()}`;
    if (actualValidHoursLocal !== this.expected.local.validHours.str) {
      errors.push(
        `applyValidHours() Local mismatch:\n  Expected: ${this.expected.local.validHours.str}\n  Actual:   ${actualValidHoursLocal}`,
      );
    }

    if (this.expected.yOffsets) {
      for (let i = 0; i < this.expected.yOffsets.input.length; i++) {
        const offsetY = this.expected.yOffsets.input[i];
        const expectedTime = this.expected.yOffsets.output[i];

        const actualTime = this.windowed.calculatePointerOffset(offsetY, 48);

        if (!actualTime.equals(expectedTime)) {
          errors.push(
            `yOffset[${i}] (${offsetY}px) mismatch:\n  Expected: ${expectedTime.toString()}\n  Actual:   ${actualTime.toString()}`,
          );
        }
      }
    }

    return {
      passed: errors.length === 0,
      errors,
    };
  }
}

async function loadTestCases(): Promise<WindowedDateFragmentTestCase[]> {
  const testDataPath = "./tests/test_datefragment_window.example.json";
  const content = await Deno.readTextFile(testDataPath);
  const rawCases = JSON.parse(content) as WindowedDateFragmentTestCaseJson[];

  const testCases: WindowedDateFragmentTestCase[] = [];
  for (const raw of rawCases) {
    const testCase = await WindowedDateFragmentTestCase.parse(raw);
    testCases.push(testCase);
  }

  return testCases;
}

Deno.test({
  name: "windowed-date-fragment/json-test-cases",
  async fn() {
    const testCases = await loadTestCases();
    let passCount = 0;
    let failCount = 0;

    console.log(
      `\nRunning ${testCases.length} windowed date fragment tests:\n`,
    );

    for (const testCase of testCases) {
      const result = testCase.test();

      if (result.passed) {
        passCount++;
        console.log(`✅ ${testCase.name}: ${testCase.description}`);
      } else {
        failCount++;
        console.log(`❌ ${testCase.name}: ${testCase.description}`);
        for (const error of result.errors) {
          console.log(`   ${error}`);
        }
      }
    }

    console.log(
      `\n📊 Summary: ${passCount} passed, ${failCount} failed out of ${testCases.length} tests`,
    );

    if (failCount > 0) {
      throw new Error(`${failCount} tests failed`);
    }
  },
});
