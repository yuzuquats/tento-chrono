import { assert, assertEquals } from "@std/assert";
import { NaiveDate, Recurrence } from "../chrono/mod.ts";
import { DateutilTzif } from "../chrono/recurrence/dateutil-tzif.ts";
import { Fixtures } from "./fixture-runner.deno.ts";

interface Input {
  lines: string[];
  tzid: string;
  originalOffsetMs: number;
  replacementOffsetMs: number;
  through: string;
}

interface Output {
  cold: string[];
  warm: string[];
}

async function bind(input: Input): Promise<string[]> {
  const dateutilTzids = { [input.tzid]: DateutilTzif.fixed(input.originalOffsetMs) };
  const pending = Recurrence.fromICalendar(input.lines, { profile: "dateutil", dateutilTzids });
  dateutilTzids[input.tzid] = DateutilTzif.fixed(input.replacementOffsetMs);
  const series = (await pending).exp();
  return series.occurrences({ through: NaiveDate.parse(input.through) }).map(String);
}

if (import.meta.main) {
  // Each subprocess starts without the lazy dateutil date reader.
  const input: Input = JSON.parse(Deno.args[0]);
  const result: Output = { cold: await bind(input), warm: await bind(input) };
  console.log(JSON.stringify(result));
} else {
  const dir = new URL("./fixtures/", import.meta.url).pathname;
  Fixtures.load<Input, Output>(dir, "test_dateutil_bind").run(
    async (input) => {
      const run = await new Deno.Command(Deno.execPath(), {
        args: ["run", "--cached-only", import.meta.filename!, JSON.stringify(input)],
        stdout: "piped",
        stderr: "piped",
      }).output();
      const decoder = new TextDecoder();
      assert(run.success, decoder.decode(run.stderr));
      return JSON.parse(decoder.decode(run.stdout));
    },
    (actual, expected, name) => assertEquals(actual, expected, name),
  );
}
