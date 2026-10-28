//! Calendar types on top of [`chrono`]: partial dates (a whole year, month,
//! ISO week or day), year-month arithmetic and date ranges.
//!
//! ```
//! use tento_chrono::{PartialDate, naivedate};
//!
//! # fn main() -> anyhow::Result<()> {
//! let week = PartialDate::parse("yw-2024-5")?;
//! assert_eq!(week.start(), Some(naivedate("2024-01-29")?));
//! assert_eq!(week.end(), naivedate("2024-02-05")?); // exclusive
//! assert_eq!(week.to_string(), "yw-2024-05");
//! # Ok(())
//! # }
//! ```
//!
//! More in `examples/`. The TypeScript package (`@tento/chrono`) lives in the
//! same repository under `chrono/`.

#![feature(coroutines, coroutine_trait)]
#![feature(iter_from_coroutine)]

pub mod date_unit;
pub mod datetime_range;
pub mod naive_date_ext;
pub mod naive_date_range;
pub mod partial;
pub mod year;
pub mod year_month;
pub mod year_month_day;

pub use naive_date_range::NaiveDateRangeExt;
pub use partial::{PartialDate, SemanticTime};

/// Runs the Rust snippets in README.md as doc tests.
#[cfg(doctest)]
#[doc = include_str!("../README.md")]
pub struct ReadmeDoctests;

use std::str::FromStr;

use anyhow::Context;
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};

/// Parses a `YYYY-MM-DD` date.
pub fn naivedate(s: &str) -> anyhow::Result<NaiveDate> {
  NaiveDate::from_str(s).with_context(|| format!("invalid date: {s:?}"))
}

/// Midnight UTC at the start of `nd`.
pub fn utc_datetime(nd: NaiveDate) -> DateTime<Utc> {
  let ndt: NaiveDateTime = nd.and_time(NaiveTime::MIN);
  DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc)
}

/// Milliseconds since the Unix epoch; 0 when the system clock is set before it.
pub fn current_milliseconds() -> u64 {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map_or(0, |d| d.as_millis() as u64)
}

/// Parses a partial date (`y-2024`, `ym-2024-2`, `yw-2024-5`, `ymd-2024-2-29`).
pub fn partial_date(s: &str) -> anyhow::Result<PartialDate> {
  PartialDate::parse(s)
}

/// Parses a partial date as a `SemanticTime` range.
pub fn semantic_time(s: &str) -> anyhow::Result<SemanticTime> {
  partial_date(s).map(SemanticTime::from_partial)
}

/// Parses an RFC 3339 timestamp, converted to UTC.
pub fn datetime(s: &str) -> anyhow::Result<DateTime<Utc>> {
  DateTime::parse_from_rfc3339(s)
    .map(Into::into)
    .with_context(|| format!("invalid RFC 3339 timestamp: {s:?}"))
}
