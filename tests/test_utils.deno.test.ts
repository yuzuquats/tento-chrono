import { assertEquals } from "jsr:@std/assert";
import { range } from "../chrono/range.ts";

Deno.test({
  name: "range",
  fn() {
    assertEquals([...range(0, 5)], [0, 1, 2, 3, 4]);
    assertEquals([...range(-2, 2)], [-2, -1, 0, 1]);
  },
});
