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
    Some(round_date(&dt.start, -pad_mths, nearest_mths, false)?..round_date(&dt.end, pad_mths, nearest_mths, true)?)
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
  let mut year = dt.year();
  let mut month = dt.month() as i32 - 1; // (0..=11)

  month += padding_mths;
  while month < 0 {
    month += 12;
    year -= 1;
  }
  while month > 11 {
    month -= 12;
    year += 1;
  }

  // Round to the nearest interval
  //
  // note: convert back to 1..=12 before rounding
  // rounding December by 2 should leave us with December
  //
  // 12, 2 => 12
  // 11, 2 => 10, 12
  // 10, 2 => 10
  // 9,  2 => 8, 10
  // ...
  // 1,  2 => 0, 2
  //
  let rounded_month = if rounding_interval_mths > 1 {
    let remainder = (month + 1) % rounding_interval_mths;
    if round_up {
      month + 1 + (rounding_interval_mths - remainder) % rounding_interval_mths
    } else {
      month + 1 - remainder
    }
  } else {
    month + 1
  };

  // Back to a year and a month in 1..=12 (rounding can leave 0 or 13+).
  let month0 = rounded_month - 1;
  year = year.checked_add(month0.div_euclid(12))?;
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
  fn pads_then_rounds() {
    let range = DateTimeRange(utc("2024-05-10T00:00:00Z")..utc("2024-05-20T00:00:00Z"));
    let padded = range.pad_and_round_range(1, 3).unwrap();
    assert_eq!(padded.start, utc("2024-03-01T00:00:00Z"));
    assert_eq!(padded.end, utc("2024-06-01T00:00:00Z"));
  }
}
