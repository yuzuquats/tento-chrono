//! Month arithmetic and date ranges.
//!
//!   cargo run --example months

use anyhow::Context;
use chrono::NaiveDate;
use tento_chrono::{
  NaiveDateRangeExt,
  date_unit::{DateUnit, DateUnitType},
  datetime,
  datetime_range::DateTimeRange,
  naive_date_ext::NaiveDateExt,
  naivedate,
  year_month::YearMonth,
  year_month_day::YearMonthDay,
};

fn main() -> anyhow::Result<()> {
  // YearMonth steps through months and knows which days it holds.
  let dec = YearMonth::parse("2024-12")?;
  assert_eq!(dec.succ().to_string(), "2025-01");
  assert_eq!(dec.pred().to_string(), "2024-11");
  assert_eq!(dec.dates(), Some(naivedate("2024-12-01")?..naivedate("2025-01-01")?));
  assert_eq!(YearMonth::from_nd(naivedate("2024-02-29")?), YearMonth { yr: 2024, mth1: 2 });
  assert!(YearMonth::parse("2024-13").is_err());

  // YearMonthDay adds months and keeps the day of month, even past the
  // month's end: callers decide what the 31st of February means.
  let jan31 = YearMonthDay { yr: 2024, mth1: 1, day1: 31 };
  let feb31 = jan31.add_months(1);
  assert_eq!((feb31.yr, feb31.mth1, feb31.day1), (2024, 2, 31));
  assert_eq!(feb31.to_nd(), None); // not a real date
  let back = jan31.add_months(-13);
  assert_eq!((back.yr, back.mth1, back.day1), (2022, 12, 31));

  // Days and weeks step through real dates, so they need one to start from.
  let week = DateUnit { value: 1, ty: DateUnitType::Weeks };
  let next = jan31.add(&week).context("Jan 31 is a real date")?;
  assert_eq!(next.to_nd(), Some(naivedate("2024-02-07")?));
  assert!(feb31.add(&week).is_none());

  // Iterate the days of a half-open range.
  let days: Vec<NaiveDate> =
    (naivedate("2024-02-27")?..naivedate("2024-03-02")?).days_between_iter().collect();
  assert_eq!(days.len(), 4);
  assert_eq!(days[2], naivedate("2024-02-29")?);
  assert_eq!(naivedate("1970-01-02")?.days_since_epoch(), 1);

  // Move each end of a range out by a month, then snap it out to a quarter
  // boundary (March, June, September or December).
  let range = DateTimeRange(datetime("2024-05-10T00:00:00Z")?..datetime("2024-05-20T00:00:00Z")?);
  let padded = range.pad_and_round_range(1, 3).context("in chrono's range")?;
  assert_eq!(padded.start, datetime("2024-03-01T00:00:00Z")?);
  assert_eq!(padded.end, datetime("2024-06-01T00:00:00Z")?);

  println!("months: ok");
  Ok(())
}
