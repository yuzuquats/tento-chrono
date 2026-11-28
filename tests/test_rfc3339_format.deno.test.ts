import {
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "@std/assert";
import { DateTime } from "../chrono/datetime.ts";
import { LogicalTimezone, type Tzname } from "../chrono/timezone.ts";
import { PlatformZone } from "../chrono/timezone-platform.ts";
import {
  Duration,
  NaiveDate,
  NaiveDateTime,
  NaiveTime,
  TimezoneRegion,
  Utc,
} from "../chrono/mod.ts";

Deno.test("rfc3339: a year below 1000 is zero-padded to four digits and reads back", () => {
  assertEquals(NaiveDate.fromYmd1(999, 1, 2).exp().rfc3339(), "0999-01-02");
  assertEquals(NaiveDate.fromYmd1(5, 12, 31).exp().rfc3339(), "0005-12-31");
  assertEquals(NaiveDate.fromYmd1(1000, 1, 1).exp().rfc3339(), "1000-01-01");
  const dt = new DateTime(
    new NaiveDateTime(
      NaiveDate.fromYmd1(42, 3, 4).exp(),
      new NaiveTime(3_600_000),
    ),
    Utc,
  );
  assertEquals(dt.rfc3339(), "0042-03-04T01:00:00Z");
  const back = DateTime.fromRfc3339(dt.rfc3339());
  assertEquals(
    back.isOk ? back.asOk()!.mse : null,
    dt.mse,
    "reads back to the same instant",
  );
});

const yearBounds = [
  {
    "input": "0000-01-01T00:00:00.123-00:00:31",
    "expected": "0000-01-01T00:00:31.123+00:00",
  },
  {
    "input": "9999-12-31T23:59:59.123+00:00:30",
    "expected": "9999-12-31T23:59:29.123+00:00",
  },
  {
    "input": "0000-01-01T12:00:00+23:59:59",
    "expected": "0000-01-01T11:59:01+23:59",
  },
  {
    "input": "9999-12-31T12:00:00-23:59:59",
    "expected": "9999-12-31T12:00:59-23:59",
  },
];
for (const { input, expected } of yearBounds) {
  Deno.test(`RFC3339 offset rounding keeps four-digit year bounds for ${input}`, () => {
    const local = DateTime.fromRfc3339(input).exp();
    const wire = local.rfc3339();
    assertEquals(wire, expected, input);
    assertEquals(Date.parse(wire), local.mse, input);
    assertEquals(DateTime.fromRfc3339(wire).exp().mse, local.mse, input);
  });
}

Deno.test("RFC3339 keeps the extended-year UTC output when no four-digit year fits", () => {
  const local = DateTime.fromRfc3339("9999-12-31T23:59:59-23:59:31").exp();
  assertEquals(local.rfc3339(), "10000-01-01T23:59:30Z");
  assertEquals(local.rfc3339(), local.toUtc().rfc3339());
});

Deno.test("historical platform offsets serialize as RFC 3339 without shifting the instant", async () => {
  const cases = [
    {
      "zone": "Africa/Monrovia",
      "instant": "1960-06-01T12:00:00Z",
      "offsetSeconds": -2670,
      "expected": "1960-06-01T11:16:00-00:44",
    },
    {
      "zone": "Asia/Kolkata",
      "instant": "1903-06-01T18:38:55.123Z",
      "offsetSeconds": 19270,
      "expected": "1903-06-01T23:59:55.123+05:21",
    },
  ];
  for (const { zone, instant, offsetSeconds, expected } of cases) {
    const utc = DateTime.fromRfc3339(instant).exp();
    const region = await TimezoneRegion.get(zone as Tzname);
    const local = region.toTz(utc);

    assertEquals(local.mse, utc.mse);
    assertEquals(local.tz.info.offset.toSecs, offsetSeconds);
    assertEquals(local.rfc3339(), expected, zone);
    assertEquals(local.toString(), expected);
    assertEquals(JSON.stringify(local), JSON.stringify(expected));
    assertEquals(Date.parse(expected), utc.mse);
    assertEquals(DateTime.fromRfc3339(expected).exp().mse, utc.mse);

    const [initial] = PlatformZone.transitions(zone, utc.mse, utc.mse + 1000)!;
    assertEquals(initial.before, expected);
    assertEquals(initial.after, expected);
  }
});

Deno.test("RFC3339 cache admits recurrent keys and keeps them through a unique scan", () => {
  const seed = Date.UTC(2248, 0, 1);
  const text = (index: number) => new Date(seed + index * 1000).toISOString();
  const shared = text(0);
  DateTime.fromRfc3339(shared);
  const warm = DateTime.fromRfc3339(shared);
  if (DateTime.fromRfc3339(shared) !== warm) {
    throw new Error("Repeated parse did not enter the cache");
  }
  for (let i = 1; i <= 512; i++) {
    assertEquals(DateTime.fromRfc3339(text(i)).exp().mse, seed + i * 1000);
  }
  if (DateTime.fromRfc3339(shared) !== warm) {
    throw new Error("Unique scan displaced a repeated parse");
  }
  const next = Array.from({ length: 128 }, (_, i) => text(1024 + i));
  for (let pass = 0; pass < 3; pass++) {
    for (const input of next) DateTime.fromRfc3339(input);
  }
  const admitted = next.map((input) => DateTime.fromRfc3339(input));
  for (const [i, input] of next.entries()) {
    if (DateTime.fromRfc3339(input) !== admitted[i]) {
      throw new Error("Repeated working set did not enter the cache");
    }
  }
});

Deno.test("RFC3339 cache evicts the least recently used admitted key", () => {
  const epoch = Date.UTC(2250, 0, 1);
  const input = (index: number) => new Date(epoch + index * 1000).toISOString();
  const parse = (index: number) => DateTime.fromRfc3339(input(index));
  const admit = (index: number) => {
    parse(index);
    return parse(index);
  };
  const entries = Array.from({ length: 128 }, (_, index) => admit(index));
  assertStrictEquals(parse(0), entries[0]);
  assertStrictEquals(parse(64), entries[64]);
  assertStrictEquals(parse(127), entries[127]);
  assertStrictEquals(parse(127), entries[127]);

  const firstNew = admit(128);
  const secondNew = admit(129);
  assertStrictEquals(parse(128), firstNew);
  assertStrictEquals(parse(129), secondNew);
  assertStrictEquals(parse(0), entries[0]);
  assertStrictEquals(parse(64), entries[64]);
  assertStrictEquals(parse(127), entries[127]);
  assertStrictEquals(parse(3), entries[3]);
  assertNotStrictEquals(parse(1), entries[1]);
  assertNotStrictEquals(parse(2), entries[2]);
  assertEquals(entries[1].exp().mse, epoch + 1000);
});

Deno.test("RFC3339 deferred admission reuses validation with fresh civil fields", () => {
  const epoch = Date.UTC(2260, 0, 1);
  for (let i = 0; i < 128; i++) {
    const input = new Date(epoch + i * 1000).toISOString();
    DateTime.fromRfc3339(input);
    DateTime.fromRfc3339(input);
  }

  const input = "2170-12-31T23:59:59.9999+06:25";
  const first = DateTime.fromRfc3339(input);
  const firstDateTime = first.exp();
  const fields = firstDateTime.date.ymd1 as { day: number };
  fields.day = 7;
  const zone = firstDateTime.tz;
  const writtenOffset = zone.info.offset;
  zone.info.offset = Duration.Time.hrs(3);
  try {
    const second = DateTime.fromRfc3339(input);
    const secondDateTime = second.exp();
    assertNotStrictEquals(second, first);
    assertNotStrictEquals(secondDateTime.ndt, firstDateTime.ndt);
    assertEquals(secondDateTime.date.toString(), "2171-01-01");
    assertStrictEquals(secondDateTime.tz, zone);
    assertEquals(secondDateTime.mse, Date.UTC(2171, 0, 1) - 10_800_000);
    assertStrictEquals(DateTime.fromRfc3339(input), second);
  } finally {
    zone.info.offset = writtenOffset;
  }
});

Deno.test("RFC3339 epoch reads preserve the wire grammar and millisecond rounding", () => {
  for (
    const [text, expected] of [
      ["1970-01-01", 0],
      ["1970-01-01T00:00:00", 0],
      ["1970-01-01t01:05:09.0005+01:05:09", 1],
      ["1969-12-31T23:59:59.9994z", -1],
      ["1969-12-31T23:59:59.9995Z", 0],
      ["1969-12-31T23:59:49.100-00:00:11", 100],
      ["1969-12-31T23:59:59-00:00", -1000],
      ["9999-12-31T23:59:59.9995-00:00:01", 253402300800999],
    ] as const
  ) {
    assertEquals<number>(DateTime.epochFromRfc3339(text).exp(), expected, text);
    assertEquals<number>(DateTime.fromRfc3339(text).exp().mse, expected, text);
  }
  for (
    const text of [
      "2024-02-30T01:00:00Z",
      "1900-02-29",
      "1970-01-01T24:00:00Z",
      "1970-01-01T23:59:60Z",
      "1970-01-01T00:00:00.Z",
      "1970-01-01T00:00:00+24:00",
      "1970-01-01T00:00:00+00:00:60",
      "1970-01-01T00:00:00Z ",
    ]
  ) {
    const rich = DateTime.fromRfc3339(text).expe();
    assertEquals(
      DateTime.epochFromRfc3339(text).expe().message,
      rich.message,
      text,
    );
  }
});

Deno.test("RFC3339 epoch reads are independent of the parsed DateTime cache", () => {
  const key = (i: number) =>
    new Date(Date.UTC(2262, 0, 1, 0, 0, i)).toISOString();
  const resident = Array.from({ length: 128 }, (_, i) => {
    DateTime.fromRfc3339(key(i));
    return DateTime.fromRfc3339(key(i));
  });

  const input = "2263-01-01T12:00:00+06:25";
  const expected = Date.UTC(2263, 0, 1, 5, 35);
  const first = DateTime.fromRfc3339(input).exp();
  const zone = first.tz;
  const offset = zone.info.offset;
  zone.info.offset = Duration.Time.hrs(2);
  try {
    DateTime.epochFromRfc3339(key(0)).exp();
    for (let i = 128; i < 260; i++) DateTime.epochFromRfc3339(key(i)).exp();
    assertEquals(DateTime.epochFromRfc3339(input).exp(), expected);
    const second = DateTime.fromRfc3339(input);
    assertNotStrictEquals(second.exp(), first);
    assertStrictEquals(DateTime.fromRfc3339(input), second);
    assertEquals(second.exp().mse, Date.UTC(2263, 0, 1, 10));
    assertEquals(DateTime.epochFromRfc3339(input).exp(), expected);
    assertNotStrictEquals(DateTime.fromRfc3339(key(0)), resident[0]);
    assertStrictEquals(DateTime.fromRfc3339(key(1)), resident[1]);
  } finally {
    zone.info.offset = offset;
  }
});

Deno.test("RFC3339 probation collisions preserve independent admission and expiry", async () => {
  // Use a separate cache so the clock and probation occupancy are fixed.
  const url = new URL(
    "../chrono/datetime.ts?probation-collisions",
    import.meta.url,
  );
  const { DateTime: Parser } = await import(url.href);
  const parse = (text: string) => Parser.fromRfc3339(text);
  const resident = (i: number) =>
    new Date(Date.UTC(2264, 0, 1, 0, 0, i)).toISOString();
  for (let i = 0; i < 128; i++) {
    parse(resident(i));
    parse(resident(i));
  }

  // These spellings share a parsed clock but must occupy distinct probation slots.
  const [primary, collision, last] = [0, 1, 2].map((i) =>
    `2265-01-01T00:00:00.1230${i}Z`
  );
  const primaryTrial = parse(primary);
  const collisionTrial = parse(collision);
  parse(last);
  for (let i = 0; i < 125; i++) parse(resident(127));

  const primaryHit = parse(primary); // Exactly 128 lookups since the first probe.
  assertNotStrictEquals(primaryHit, primaryTrial);
  assertStrictEquals(parse(primary), primaryHit);

  const collisionRefresh = parse(collision); // This key is now 129 lookups old.
  assertNotStrictEquals(collisionRefresh, collisionTrial);
  const collisionHit = parse(collision);
  assertNotStrictEquals(collisionHit, collisionRefresh);
  assertStrictEquals(parse(collision), collisionHit);
  assertStrictEquals(parse(primary), primaryHit);

  parse("2265-01-02T00:00:00.12300Z");
  const freshCollision = "2265-01-02T00:00:00.12301Z";
  const freshTrial = parse(freshCollision);
  parse("2265-01-02T00:00:00.12302Z");
  const freshHit = parse(freshCollision);
  assertNotStrictEquals(freshHit, freshTrial);
  assertStrictEquals(parse(freshCollision), freshHit);
});

Deno.test("RFC3339 offset memo preserves spelling, metadata, and shared zones", () => {
  const spellings = ["+00:00", "-00:00", "+00:00:00", "-00:00:00", "+06:17"];
  const zones = spellings.map((text) => LogicalTimezone.parse(text));
  assertEquals(new Set(zones).size, spellings.length);
  const parsed = (day: string, text: string) =>
    DateTime.fromRfc3339("2266-04-" + day + "T12:00:00" + text).exp();
  for (const [i, text] of spellings.entries()) {
    assertStrictEquals(parsed("01", text).tz, zones[i]);
    assertEquals(zones[i].id, text);
  }

  const mutable = zones[4];
  const writtenOffset = mutable.info.offset;
  mutable.info.offset = Duration.Time.mins(41);
  try {
    assertStrictEquals(parsed("02", spellings[0]).tz, zones[0]);
    const reused = parsed("02", spellings[4]);
    assertStrictEquals(reused.tz, mutable);
    assertEquals(reused.mse, Date.UTC(2266, 3, 2, 11, 19));

    const named = DateTime.fromRfc3339(
      "2266-04-02T12:00:00+06:17",
      "Test/Named",
      "TEST",
    ).exp();
    assertNotStrictEquals(named.tz, mutable);
    assertEquals(String(named.tz.info.tzname), "Test/Named");
    assertEquals(String(named.tz.info.tzabbr), "TEST");

    // More distinct decoded offsets than the memo can retain.
    for (let i = 1; i <= 132; i++) {
      const hours = String(Math.floor(i / 60)).padStart(2, "0");
      const minutes = String(i % 60).padStart(2, "0");
      parsed("03", "+" + hours + ":" + minutes);
    }
    assertStrictEquals(parsed("04", spellings[4]).tz, mutable);
  } finally {
    mutable.info.offset = writtenOffset;
  }
});
