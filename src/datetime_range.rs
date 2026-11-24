use std::ops::{Deref, Range};

#[cfg(feature = "arbitrary")]
use arbitrary::{Arbitrary, Unstructured};
use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, Utc};
#[cfg(feature = "arbitrary")]
use chrono::TimeZone;

pub struct DateTimeRange(pub std::ops::Range<DateTime<Utc>>);

impl Deref for DateTimeRange {
  type Target = std::ops::Range<DateTime<Utc>>;

  fn deref(&self) -> &Self::Target {
    &self.0
  }
}

#[cfg(feature = "arbitrary")]
impl<'a> Arbitrary<'a> for DateTimeRange {
  fn arbitrary(u: &mut Unstructured<'_>) -> arbitrary::Result<Self> {
    let start_timestamp: i64 = u.int_in_range(0..=Utc::now().timestamp())?;
    let end_timestamp: i64 = u.int_in_range(start_timestamp..=Utc::now().timestamp())?;

    let start = Utc
      .timestamp_opt(start_timestamp, 0)
      .single()
      .ok_or(arbitrary::Error::IncorrectFormat)?;
    let end = Utc
      .timestamp_opt(end_timestamp, 0)
      .single()
      .ok_or(arbitrary::Error::IncorrectFormat)?;

    Ok(DateTimeRange(start..end))
  }
}

impl DateTimeRange {
  pub fn pad_and_round_range_dt(
    dt: &Range<DateTime<Utc>>,
    pad_mths: i32,
    nearest_mths: i32,
  ) -> Option<Range<DateTime<Utc>>> {
    let start = round_date(&dt.start, pad_mths.checked_neg()?, nearest_mths, false)?;
    let end = round_date(&dt.end, pad_mths, nearest_mths, true)?;
    Some(start..end)
  }

  /// `self` with each end moved out by `pad_mths` and rounded out with
  /// `round_date`; `None` when an end leaves chrono's date range.
  pub fn pad_and_round_range(&self, pad_mths: i32, nearest_mths: i32) -> Option<DateTimeRange> {
    Self::pad_and_round_range_dt(self, pad_mths, nearest_mths).map(DateTimeRange)
  }
}

/// The first of a month at midnight UTC: `dt`'s month moved by
/// `padding_mths`, then rounded down (or up, with `round_up`) to a month
/// that is a multiple of `rounding_interval_mths` (December counts as 0, so
/// an interval of 3 rounds to March, June, September or December). An
/// interval of 1 or less only pads. The day of month and time are dropped.
/// `None` when the result is outside chrono's date range.
pub fn round_date(
  dt: &DateTime<Utc>,
  padding_mths: i32,
  rounding_interval_mths: i32,
  round_up: bool,
) -> Option<DateTime<Utc>> {
  let padded_month0 = i64::from(dt.month0()) + i64::from(padding_mths);
  let year = i64::from(dt.year()) + padded_month0.div_euclid(12);
  let month = padded_month0.rem_euclid(12) + 1;

  // Round the one-based month. Zero denotes December of the preceding year.
  let interval = i64::from(rounding_interval_mths);
  let rounded_month = if interval > 1 {
    let remainder = month % interval;
    if round_up {
      month + (interval - remainder) % interval
    } else {
      month - remainder
    }
  } else {
    month
  };

  let month0 = rounded_month - 1;
  let year = i32::try_from(year + month0.div_euclid(12)).ok()?;
  let rounded_naive_date = NaiveDate::from_ymd_opt(year, month0.rem_euclid(12) as u32 + 1, 1)?;
  let rounded_naive_datetime = NaiveDateTime::new(rounded_naive_date, chrono::NaiveTime::MIN);
  Some(DateTime::<Utc>::from_naive_utc_and_offset(rounded_naive_datetime, Utc))
}

#[cfg(test)]
mod tests {
  use super::*;

  fn utc(s: &str) -> DateTime<Utc> {
    DateTime::parse_from_rfc3339(s).unwrap().into()
  }

  fn round(s: &str, interval: i32, up: bool) -> String {
    round_date(&utc(s), 0, interval, up).unwrap().format("%Y-%m-%d").to_string()
  }

  #[test]
  fn rounds_to_multiples_of_the_interval() {
    assert_eq!(round("2024-07-10T00:00:00Z", 3, true), "2024-09-01");
    assert_eq!(round("2024-07-10T00:00:00Z", 3, false), "2024-06-01");
    assert_eq!(round("2024-08-10T00:00:00Z", 3, true), "2024-09-01");
    assert_eq!(round("2024-09-10T00:00:00Z", 3, true), "2024-09-01");
    assert_eq!(round("2024-11-10T00:00:00Z", 4, true), "2024-12-01");
    assert_eq!(round("2024-01-10T00:00:00Z", 6, true), "2024-06-01");
    assert_eq!(round("2024-01-10T00:00:00Z", 6, false), "2023-12-01");
  }

  #[test]
  fn interval_two_unchanged() {
    assert_eq!(round("2024-11-10T00:00:00Z", 2, true), "2024-12-01");
    assert_eq!(round("2024-11-10T00:00:00Z", 2, false), "2024-10-01");
    assert_eq!(round("2024-12-10T00:00:00Z", 2, true), "2024-12-01");
    assert_eq!(round("2024-01-10T00:00:00Z", 2, false), "2023-12-01");
  }

  #[test]
  fn out_of_range_is_none() {
    let max = DateTime::<Utc>::MAX_UTC;
    assert_eq!(round_date(&max, 12, 1, true), None);
    assert_eq!(round_date(&utc("2024-12-10T00:00:00Z"), 0, 25, true).unwrap(), utc("2026-01-01T00:00:00Z"));
  }

  #[test]
  fn extreme_padding_returns_none() {
    let date = utc("2024-05-10T00:00:00Z");
    assert_eq!(round_date(&date, i32::MAX, 1, false), None);
    assert_eq!(round_date(&date, i32::MIN, 1, false), None);

    let range = DateTimeRange(date..date);
    assert!(range.pad_and_round_range(i32::MIN, 1).is_none());
    assert!(range.pad_and_round_range(i32::MAX, 1).is_none());
  }

  #[test]
  fn pads_then_rounds() {
    let range = DateTimeRange(utc("2024-05-10T00:00:00Z")..utc("2024-05-20T00:00:00Z"));
    let padded = range.pad_and_round_range(1, 3).unwrap();
    assert_eq!(padded.start, utc("2024-03-01T00:00:00Z"));
    assert_eq!(padded.end, utc("2024-06-01T00:00:00Z"));
  }
}
