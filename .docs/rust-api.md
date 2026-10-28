# Rust Helpers

The Rust crate provides backend-friendly date helpers and string-serializable
semantic date types. It intentionally leans on `chrono` for concrete instants
and dates, while adding Lona/Tento domain shapes such as `PartialDate`.

## Public Modules

- `date_unit` models calendar-scale units.
- `datetime_range` and `naive_date_range` add range helpers.
- `naive_date_ext` extends `chrono::NaiveDate`.
- `partial` defines `PartialDate` and `SemanticTime`.
- `year`, `year_month`, and `year_month_day` provide small calendar value
  helpers.

The crate re-exports:

```rust
pub use naive_date_range::NaiveDateRangeExt;
pub use partial::{PartialDate, SemanticTime};
```

## Helper Constructors

`src/lib.rs` exposes concise constructors used in tests and backend code:

- `naivedate("2026-04-29")` parses a `chrono::NaiveDate`.
- `utc_datetime(nd)` turns a date into midnight UTC.
- `current_milliseconds()` returns epoch milliseconds.
- `partial_date("ym-2026-04")` parses a `PartialDate`.
- `semantic_time("ymd-2026-04-29")` creates a range-like `SemanticTime`.
- `datetime("2026-04-29T18:30:00Z")` parses a UTC datetime.

Use fallible parsing directly in request handlers when user input can be
invalid. The helper constructors unwrap and are best for trusted inputs, tests,
and fixtures.

## PartialDate

Rust `PartialDate` supports the same semantic shapes as TypeScript:

```rust
PartialDate::Y(2026)
PartialDate::Ym(YearMonth { yr: 2026, mth1: 4 })
PartialDate::Ymd(naivedate("2026-04-29"))
PartialDate::Yw { yr: 2026, week: 18 }
```

`start()` and `end()` return the inclusive start and exclusive end date for the
bucket. `iter_weeks`, `iter_months`, and `iter_years` produce adjacent partial
date pairs for range-oriented callers.

## SemanticTime

`SemanticTime` is either:

- `Range(PartialDate)` for imprecise calendar buckets;
- `Point(DateTime<Utc>)` for exact instants.

It serializes as a string and deserializes by trying RFC 3339 first, then
`PartialDate`. Legacy `pt-` prefixed point strings are still accepted for
backward compatibility.

Use `SemanticTime` in API models only when the field genuinely accepts both
bucket-level and point-in-time values. Otherwise choose `PartialDate`,
`NaiveDate`, or `DateTime<Utc>` directly.
