import { assertThrows } from "@std/assert";
import { Fixtures } from "./fixture-runner.deno.ts";

Deno.test("fixture discovery rejects a pattern with no matching files", () => {
  const dir = new URL("./fixtures/", import.meta.url).pathname;
  assertThrows(
    () => Fixtures.load(dir, "missing-fixture"),
    Error,
    "No missing-fixture.*.json fixtures",
  );
});
