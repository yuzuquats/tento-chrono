use std::ops::{Deref, Range};

use arbitrary::{Arbitrary, Unstructured};
use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, TimeZone, Utc};

pub struct DateTimeRange(pub std::ops::Range<DateTime<Utc>>);

impl Deref for DateTimeRange {
  type Target = std::ops::Range<DateTime<Utc>>;

  fn deref(&self) -> &Self::Target {
    &self.0
  }
}

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
  ) -> Range<DateTime<Utc>> {
    round_date(&dt.start, -pad_mths, nearest_mths, false)
      ..round_date(&dt.end, pad_mths, nearest_mths, true)
  }

  pub fn pad_and_round_range(&self, pad_mths: i32, nearest_mths: i32) -> DateTimeRange {
    DateTimeRange(
      round_date(&self.start, -pad_mths, nearest_mths, false)
        ..round_date(&self.end, pad_mths, nearest_mths, true),
    )
  }
}

pub fn round_date(
  dt: &DateTime<Utc>,
  padding_mths: i32,
  rounding_interval_mths: i32,
  round_up: bool,
) -> DateTime<Utc> {
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
  let mut rounded_month = if rounding_interval_mths > 1 {
    let remainder = (month + 1) % rounding_interval_mths;
    if round_up {
      month + 1 + remainder
    } else {
      month + 1 - remainder
    }
  } else {
    month + 1
  };

  if rounded_month > 12 {
    rounded_month -= 12;
    year += 1;
  }
  if rounded_month <= 0 {
    rounded_month += 12;
    year -= 1;
  }

  assert!(rounded_month > 0);
  assert!(rounded_month <= 12);

  let rounded_naive_date = NaiveDate::from_ymd_opt(year, rounded_month as u32, 1)
    .expect(&format!("y{year} m{rounded_month}"));
  let rounded_naive_datetime = NaiveDateTime::new(
    rounded_naive_date,
    chrono::NaiveTime::from_hms_opt(0, 0, 0).expect("couldn't add naivetime to datetime"),
  );

  DateTime::<Utc>::from_naive_utc_and_offset(rounded_naive_datetime, Utc)
}
