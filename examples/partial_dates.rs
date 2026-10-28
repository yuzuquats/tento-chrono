//! Partial dates: a whole year, month, ISO week or day, as one value.
//!
//!   cargo run --example partial_dates

use chrono::NaiveDate;
use tento_chrono::{PartialDate, SemanticTime, datetime};

fn ymd(y: i32, m: u32, d: u32) -> NaiveDate {
  NaiveDate::from_ymd_opt(y, m, d).expect("a real date")
}

fn main() -> anyhow::Result<()> {
  // Each kind has a short text form: y-, ym-, yw- and ymd-.
  let week = PartialDate::parse("yw-2024-5")?;
  let month = PartialDate::parse("ym-2024-2")?;
  let year = PartialDate::parse("y-2024")?;
  let day = PartialDate::parse("ymd-2024-02-29")?;

  // Its range is half-open: `start` is the first day, `end` the day after the last.
  assert_eq!(week.start(), Some(ymd(2024, 1, 29)));
  assert_eq!(week.end(), ymd(2024, 2, 5));
  assert_eq!(month.start(), Some(ymd(2024, 2, 1)));
  assert_eq!(month.end(), ymd(2024, 3, 1));
  assert_eq!(year.end(), ymd(2025, 1, 1));
  assert_eq!(day.end(), ymd(2024, 3, 1));

  // Only real dates parse.
  assert!(PartialDate::parse("ym-2024-13").is_err());
  assert!(PartialDate::parse("yw-2021-53").is_err()); // 2021 has 52 ISO weeks

  // Display writes the canonical, zero-padded form; serde uses the same text.
  assert_eq!(month.to_string(), "ym-2024-02");
  assert_eq!(serde_json::to_string(&week)?, r#""yw-2024-05""#);
  let parsed: PartialDate = serde_json::from_str(r#""ymd-2024-02-29""#)?;
  assert_eq!(parsed, day);

  // List the months (or weeks, or years) a range of dates touches. These
  // iterators include the range's end date, so a range ending on April 1st
  // includes April.
  let months: Vec<String> = PartialDate::iter_months(ymd(2024, 1, 15)..ymd(2024, 3, 31))
    .map(|(month, _next)| month.to_string())
    .collect();
  assert_eq!(months, ["ym-2024-01", "ym-2024-02", "ym-2024-03"]);

  // A SemanticTime is either a partial date or an exact instant.
  let all_day = SemanticTime::from_partial(day);
  let meeting = SemanticTime::from_datetime(datetime("2024-02-29T17:00:00Z")?);
  assert_eq!(all_day.to_string(), "ymd-2024-02-29");
  assert_eq!(meeting.to_string(), "2024-02-29T17:00:00+00:00");
  assert_eq!(all_day.start(), meeting.start());

  println!("partial_dates: ok");
  Ok(())
}
