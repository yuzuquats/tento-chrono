import { assert, assertEquals } from "@std/assert";
import { TimezoneRegion } from "../chrono/timezone-region.ts";
import type { Tzname } from "../chrono/timezone.ts";

/**
 * A zone the service has no data for is built from the platform's offsets (`unserved`). V8 keeps a legacy spelling
 * as its canonical name (Asia/Kolkata resolves to Asia/Calcutta), so on an India host the host zone loaded first as
 * Asia/Calcutta, and a later `--tz Asia/Kolkata` resolved through the platform's canonical name to that cached
 * region: the render's record said `tz: Asia/Calcutta` for an explicit Asia/Kolkata (lona CLI zone suite under
 * TZ=Asia/Kolkata, 70/1). Built or served, a zone is named by its current IANA name, whichever spelling asked first.
 */
TimezoneRegion.setLoader({ load: (tz) => Promise.reject(new TimezoneRegion.Unserved(tz, "not-found")) });

Deno.test("unserved: the legacy spelling first (an India host's zone), then the current name: both are Asia/Kolkata", async () => {
  const legacy = await TimezoneRegion.getOpt("Asia/Calcutta" as Tzname);
  assert(legacy != null, "Asia/Calcutta did not build");
  assertEquals<string>(legacy.fullname, "Asia/Kolkata");
  const current = await TimezoneRegion.getOpt("Asia/Kolkata" as Tzname);
  assert(current != null, "Asia/Kolkata did not build");
  assertEquals<string>(current.fullname, "Asia/Kolkata");
});

Deno.test("unserved: the current name of another legacy spelling the platform keeps (Asia/Kathmandu) is itself", async () => {
  const region = await TimezoneRegion.getOpt("Asia/Kathmandu" as Tzname);
  assert(region != null, "Asia/Kathmandu did not build");
  assertEquals<string>(region.fullname, "Asia/Kathmandu");
  assertEquals<string>((await TimezoneRegion.getOpt("Asia/Katmandu" as Tzname))?.fullname ?? "", "Asia/Kathmandu");
});

/**
 * Only a spelling of the same zone is renamed (review E F1, operator Q9): TIMEZONE_LINKS also maps cities that IANA
 * merged in 2022+ into another zone (Europe/Amsterdam -> Europe/Brussels, Europe/Oslo -> Europe/Berlin), whose
 * history before 1970 differs and which the platform keeps as zones of their own. Unserved, such a city is built
 * under its own name, not its link target's.
 */
Deno.test("unserved: a merged city the platform keeps as its own zone keeps its name (Europe/Amsterdam, Europe/Oslo)", async () => {
  for (const name of ["Europe/Amsterdam", "Europe/Oslo", "Africa/Accra", "Asia/Kuala_Lumpur"]) {
    const region = await TimezoneRegion.getOpt(name as Tzname);
    assert(region != null, `${name} did not build`);
    assertEquals<string>(region.fullname, name);
  }
  assertEquals<string>((await TimezoneRegion.getOpt("Asia/Calcutta" as Tzname))?.fullname ?? "", "Asia/Kolkata");
});
