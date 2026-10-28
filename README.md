# tento-chrono

Calendar and time types for TypeScript and Rust, built for calendar apps:

- **TypeScript (`@tento/chrono`)**: dates and times without hidden timezones,
  IANA timezones with daylight-saving rules, partial dates (a whole year,
  month, ISO week or day), RFC 5545 recurrence (`RRULE`, `EXDATE`, `RDATE`)
  and secondary calendars (Hebrew, Islamic, Persian, lunar and others). No
  dependencies; runs in browsers, Deno and other JavaScript runtimes.
- **Rust (`tento-chrono`)**: partial dates, year-month arithmetic and date
  ranges on top of [`chrono`](https://docs.rs/chrono), with the same text
  forms as the TypeScript side so the two can exchange values.

## TypeScript

```sh
deno add jsr:@tento/chrono
```

```ts
import { assertEquals } from "@std/assert";
import { naivedate, PartialDate, RRule } from "@tento/chrono";

const d = naivedate(2024, 1, 31);
assertEquals(d.add({ days: 30 }).toString(), "2024-03-01");
assertEquals(d.dayOfWeek.label, "Wed");

// A partial date covers a half-open range of days.
const week = PartialDate.parse("yw-2024-5").exp();
assertEquals(week.start.toString(), "2024-01-29");
assertEquals(week.end.toString(), "2024-02-05");

const rule = RRule.parse("FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=6").exp();
assertEquals(rule.toReadableDisplay(), "Weekly on Monday, Wednesday and Friday, 6 times");
```

Recurrence rules support every RFC 5545 RRULE part: all seven frequencies,
INTERVAL, COUNT, UNTIL, WKST and BYMONTH, BYWEEKNO, BYYEARDAY, BYMONTHDAY,
BYDAY, BYHOUR, BYMINUTE, BYSECOND and BYSETPOS, plus EXDATE and RDATE.

### Timezones

A `TimezoneRegion` holds an IANA zone's offset transitions. By default they
are built from the platform's own timezone data (`Intl`), with no network
access:

```ts
import { assertEquals } from "@std/assert";
import { naivedatetime, TimezoneRegion, Tzname } from "@tento/chrono";

const ny = await TimezoneRegion.get("America/New_York" as Tzname);
const winter = ny.datetime(naivedatetime(2024, 1, 15, 9)).asWallClock();
assertEquals(winter.toString(), "2024-01-15T09:00:00-05:00");
```

To use other zone data (your own files or server, pinned to a tzdata
version), install a loader with `TimezoneRegion.setLoader`; see
`TimezoneRegion.Loader`.

### Examples

- [`examples/dates.ts`](examples/dates.ts): dates, times, month arithmetic,
  partial dates.
- [`examples/timezones.ts`](examples/timezones.ts): instants, fixed offsets,
  zones and daylight saving.
- [`examples/recurrence.ts`](examples/recurrence.ts): RRULE/EXDATE series,
  dates and timed instants across a DST change.

```sh
deno run examples/dates.ts
```

## Rust

```toml
[dependencies]
tento-chrono = "0.1"
```

```rust
use tento_chrono::{PartialDate, naivedate, year_month::YearMonth};

# fn main() -> anyhow::Result<()> {
let month = PartialDate::parse("ym-2024-2")?;
assert_eq!(month.start(), Some(naivedate("2024-02-01")?));
assert_eq!(month.end(), naivedate("2024-03-01")?); // exclusive
assert_eq!(month.to_string(), "ym-2024-02");

let dec = YearMonth::parse("2024-12")?;
assert_eq!(dec.succ().to_string(), "2025-01");
# Ok(())
# }
```

Partial dates have the same text form on both sides (`y-`, `ym-`, `yw-`,
`ymd-`), except that Rust writes months, weeks and days zero-padded
(`ym-2024-02`) and TypeScript does not (`ym-2024-2`). Each side parses
either form, so compare parsed values rather than strings.

The crate needs a nightly toolchain (it uses coroutines); `rust-toolchain.toml`
pins one.

Features:

- `openapi`: `utoipa::ToSchema` for `PartialDate`, `SemanticTime` and `YearMonth`.
- `arbitrary`: `arbitrary::Arbitrary` for `DateTimeRange`.

Examples: [`examples/partial_dates.rs`](examples/partial_dates.rs) and
[`examples/months.rs`](examples/months.rs).

```sh
cargo run --example partial_dates
```

## Development

```sh
deno task check   # type-check the library, tests and examples
deno task test    # doc examples, unit tests and the examples
cargo test        # Rust unit tests, doc tests, and the TypeScript build run in boa
```

The tests in `tests/` that run inside the boa JavaScript engine need `deno` on
`PATH`. They bundle `chrono/` at build time.
