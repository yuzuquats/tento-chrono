import { assert, assertEquals } from "@std/assert";
import {
  DateTime,
  MsSinceEpoch,
  TimezoneRegion,
  Tzname,
  Utc,
} from "../../chrono/mod.ts";
import { random32 } from "./random.deno.ts";

Deno.test("regional conversion preserves instants and civil-date membership", async () => {
  const seed = 0x302b;
  const next = random32(seed);
  for (
    const name of [
      "America/Los_Angeles",
      "America/St_Johns",
      "Australia/Lord_Howe",
      "Pacific/Apia",
    ]
  ) {
    const zone = await TimezoneRegion.get(Tzname.parseOpt(name)!);
    for (let i = 0; i < 1024; i++) {
      const mse = Date.UTC(2000, 0, 1) + next(36 * 365 * 24 * 3600) * 1000 +
        next(1000);
      const utc = DateTime.fromMse(MsSinceEpoch.of(mse), Utc);
      const local = zone.toTz(utc);
      const context = `seed=${seed}, zone=${name}, case=${i}, mse=${mse}`;
      assertEquals(local.mse, utc.mse, context);
      assert(zone.date(local.date).containsInstant(utc), context);
    }
  }
});
