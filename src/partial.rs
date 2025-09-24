use std::fmt::{Debug, Display};

use anyhow::{Context, anyhow};
use chrono::{DateTime, Datelike, NaiveDate, Utc};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use utoipa::{
  PartialSchema, ToSchema,
  openapi::{Object, Type},
};

pub use super::year_month::YearMonth;

#[derive(Clone, PartialEq, Debug)]
pub enum SemanticTime {
  Range(PartialDate),
  Point(DateTime<Utc>),
}

impl SemanticTime {
  /// Create a SemanticTime from a PartialDate
  pub fn from_partial(pd: PartialDate) -> Self {
    SemanticTime::Range(pd)
  }

  /// Create a SemanticTime from a DateTime
  pub fn from_datetime(dt: DateTime<Utc>) -> Self {
    SemanticTime::Point(dt)
  }

  /// Get the start date of this semantic time
  pub fn start(&self) -> NaiveDate {
    match self {
      SemanticTime::Range(pd) => pd.start(),
      SemanticTime::Point(dt) => dt.date_naive(),
    }
  }

  /// Get the end date of this semantic time
  pub fn end(&self) -> NaiveDate {
    match self {
      SemanticTime::Range(pd) => pd.end(),
      SemanticTime::Point(dt) => dt.date_naive(),
    }
  }
}

impl Display for SemanticTime {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      SemanticTime::Range(pd) => write!(f, "{}", pd),
      SemanticTime::Point(dt) => write!(f, "{}", dt.to_rfc3339()),
    }
  }
}

impl Serialize for SemanticTime {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: Serializer,
  {
    serializer.serialize_str(&self.to_string())
  }
}

impl<'de> Deserialize<'de> for SemanticTime {
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: Deserializer<'de>,
  {
    let s: String = Deserialize::deserialize(deserializer)?;

    // Handle legacy pt- prefix for backward compatibility
    if s.starts_with("pt-") {
      let dt_str = &s[3..];
      return DateTime::parse_from_rfc3339(dt_str)
        .map(|dt| SemanticTime::Point(dt.into()))
        .map_err(serde::de::Error::custom);
    }

    // Try to parse as RFC3339 timestamp first
    if let Ok(dt) = DateTime::parse_from_rfc3339(&s) {
      return Ok(SemanticTime::Point(dt.into()));
    }

    // Otherwise, try to parse as PartialDate
    PartialDate::parse(&s)
      .map(SemanticTime::Range)
      .map_err(serde::de::Error::custom)
  }
}

impl PartialSchema for SemanticTime {
  fn schema() -> utoipa::openapi::RefOr<utoipa::openapi::schema::Schema> {
    utoipa::openapi::RefOr::T(utoipa::openapi::Schema::Object(
      utoipa::openapi::schema::ObjectBuilder::new()
        .schema_type(utoipa::openapi::schema::Type::String)
        .description(Some("A semantic time that can be either a range (e.g., 'ymd-2024-01-01') or a point (e.g., '2024-01-01T00:00:00Z')"))
        .build()
    ))
  }
}

impl ToSchema for SemanticTime {
  fn name() -> std::borrow::Cow<'static, str> {
    "SemanticTime".into()
  }

  fn schemas(
    _schemas: &mut Vec<(
      String,
      utoipa::openapi::RefOr<utoipa::openapi::schema::Schema>,
    )>,
  ) {
    // No additional schemas needed for a simple string type
  }
}

#[derive(Clone, PartialEq)]
pub enum PartialDate {
  Y(i32),                    // y-2024
  Ym(YearMonth),             // ym-2024-08
  Ymd(NaiveDate),            // ymd-2024-08-12
  Yw { yr: i32, week: u32 }, // yw-2024-03
}

impl PartialDate {
  pub fn start(&self) -> NaiveDate {
    match self {
      PartialDate::Y(yr) => NaiveDate::from_ymd_opt(*yr, 1, 1).expect("error constructing yr"),
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        NaiveDate::from_ymd_opt(*yr, *mth1, 1).expect("error constructing ym")
      }
      PartialDate::Ymd(naive_date) => *naive_date,
      PartialDate::Yw { yr, week } => NaiveDate::from_isoywd_opt(*yr, *week, chrono::Weekday::Mon)
        .expect("couldn't construct weekday"),
    }
  }

  pub fn end(&self) -> NaiveDate {
    match self {
      PartialDate::Y(yr) => NaiveDate::from_ymd_opt(*yr + 1, 1, 1).unwrap_or(NaiveDate::MAX),
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        if let Some(date) = if *mth1 == 12 {
          NaiveDate::from_ymd_opt(*yr + 1, 1, 1)
        } else {
          NaiveDate::from_ymd_opt(*yr, mth1 + 1, 1)
        } {
          return date;
        }

        return NaiveDate::MAX;
      }
      // todo!: if the number is too large we can have issues
      PartialDate::Ymd(nd) => nd.succ_opt().unwrap_or(*nd),
      PartialDate::Yw { yr, week } => {
        if let Some(nd) = NaiveDate::from_isoywd_opt(*yr, *week + 1, chrono::Weekday::Mon) {
          return nd;
        };

        if let Some(nd) = NaiveDate::from_isoywd_opt(*yr + 1, 1, chrono::Weekday::Mon) {
          return nd;
        };

        return NaiveDate::MAX;
      }
    }
  }

  /// Iterator that yields Week PartialDates (Yw) for the given date range
  /// Each item is a tuple of (start_week_partial_date, end_week_partial_date)
  pub fn iter_weeks(range: std::ops::Range<NaiveDate>) -> impl Iterator<Item = (Self, Self)> {
    // Start with the Monday of the week containing our range start date
    let start_date = range.start;
    let days_from_monday = start_date.weekday().num_days_from_monday();
    let start_monday = start_date - chrono::Duration::days(days_from_monday as i64);

    // Create the iterator
    WeekIterator {
      current_date: start_monday,
      end_date: range.end,
    }
  }

  /// Iterator that yields Month PartialDates (Ym) for the given date range
  /// Each item is a tuple of (start_month_partial_date, end_month_partial_date)
  pub fn iter_months(range: std::ops::Range<NaiveDate>) -> impl Iterator<Item = (Self, Self)> {
    // Get the first day of the month containing the start date
    let start_year = range.start.year();
    let start_month = range.start.month();

    // Create the iterator
    MonthIterator {
      current_year: start_year,
      current_month: start_month,
      end_date: range.end,
    }
  }

  /// Iterator that yields Year PartialDates (Y) for the given date range
  /// Each item is a tuple of (start_year_partial_date, end_year_partial_date)
  pub fn iter_years(range: std::ops::Range<NaiveDate>) -> impl Iterator<Item = (Self, Self)> {
    // Get the year of the start date
    let start_year = range.start.year();

    // Create the iterator
    YearIterator {
      current_year: start_year,
      end_date: range.end,
    }
  }
}

impl ToSchema for PartialDate {
  fn name() -> std::borrow::Cow<'static, str> {
    std::borrow::Cow::Borrowed("PartialDate")
  }

  fn schemas(
    _schemas: &mut Vec<(
      String,
      utoipa::openapi::RefOr<utoipa::openapi::schema::Schema>,
    )>,
  ) {
  }
}

impl PartialSchema for PartialDate {
  fn schema() -> utoipa::openapi::RefOr<utoipa::openapi::schema::Schema> {
    utoipa::openapi::RefOr::T(utoipa::openapi::Schema::Object(Object::with_type(
      Type::String,
    )))
  }
}

impl Display for PartialDate {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      PartialDate::Y(year) => write!(f, "y-{}", year),
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        write!(f, "ym-{:04}-{:02}", yr, mth1)
      }
      PartialDate::Ymd(date) => write!(
        f,
        "ymd-{:04}-{:02}-{:02}",
        date.year(),
        date.month(),
        date.day()
      ),
      PartialDate::Yw { yr, week } => {
        write!(f, "yw-{:04}-{:02}", yr, week)
      }
    }
  }
}

impl Debug for PartialDate {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    match self {
      Self::Y(arg0) => f.debug_tuple("Y").field(arg0).finish(),
      Self::Ym(arg0) => f.debug_tuple("Ym").field(arg0).finish(),
      Self::Ymd(arg0) => f.debug_tuple("Ymd").field(arg0).finish(),
      Self::Yw { yr, week } => f
        .debug_struct("Yw")
        .field("yr", yr)
        .field("week", week)
        .finish(),
    }
  }
}

pub struct Ymdw {
  pub yr: i32,
  pub mth1: Option<i32>,
  pub week: Option<u32>,
  pub day: Option<i32>,
}

impl PartialDate {
  pub fn parse(s: &str) -> anyhow::Result<PartialDate> {
    let parts: Vec<&str> = s.split('-').collect();

    match parts.as_slice() {
      ["y", year] => year
        .parse::<i32>()
        .map(PartialDate::Y)
        .context("Year Invalid"),
      ["ym", year, month] => {
        let yr = year.parse::<i32>().context("Year Invalid")?;
        let mth1 = month.parse::<u32>().context("Month Invalid")?;
        Ok(PartialDate::Ym(YearMonth { yr, mth1 }))
      }
      ["ymd", year, month, day] => {
        let year = year.parse::<i32>().context("Year Invalid")?;
        let month = month.parse::<u32>().context("Month Invalid")?;
        let day = day.parse::<u32>().context("Day Invalid")?;
        NaiveDate::from_ymd_opt(year, month, day)
          .ok_or_else(|| anyhow!("invalid date"))
          .map(PartialDate::Ymd)
      }
      ["yw", yr, week] => {
        let yr = yr.parse::<i32>().context("Year Invalid")?;
        let week = week.parse::<u32>().context("Week Invalid")?;
        Ok(PartialDate::Yw { yr, week })
      }
      parts => Err(anyhow!(format!(
        "Invalid type, expected one of (y, ym, ymd, yw), found: {:?}",
        parts.get(0)
      ))),
    }
  }

  pub fn from_ymdw(
    yr: i32,
    mth1: Option<i32>,
    week: Option<u32>,
    day: Option<i32>,
  ) -> anyhow::Result<PartialDate> {
    if let Some(week) = week {
      return Ok(PartialDate::Yw { yr, week });
    }
    if let Some(day) = day {
      let mth1 = mth1.ok_or(anyhow!("no month"))?;
      let nd =
        NaiveDate::from_ymd_opt(yr, mth1 as u32, day as u32).ok_or(anyhow!("ymd not valid"))?;
      return Ok(PartialDate::Ymd(nd));
    }
    if let Some(mth1) = mth1 {
      return Ok(PartialDate::Ym(YearMonth {
        yr,
        mth1: mth1 as u32,
      }));
    }
    Ok(PartialDate::Y(yr))
  }

  pub fn as_ymdw(self) -> Ymdw {
    match self {
      PartialDate::Y(yr) => Ymdw {
        yr,
        mth1: None,
        week: None,
        day: None,
      },
      PartialDate::Ym(year_month) => Ymdw {
        yr: year_month.yr,
        mth1: Some(year_month.mth1 as i32),
        week: None,
        day: None,
      },
      PartialDate::Ymd(naive_date) => Ymdw {
        yr: naive_date.year(),
        mth1: Some(naive_date.month0() as i32 + 1),
        week: None,
        day: Some(naive_date.day0() as i32 + 1),
      },
      PartialDate::Yw { yr, week } => Ymdw {
        yr,
        mth1: None,
        week: Some(week),
        day: None,
      },
    }
  }
}

impl Serialize for PartialDate {
  fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
  where
    S: Serializer,
  {
    serializer.serialize_str(&format!("{self}"))
  }
}

impl<'de> Deserialize<'de> for PartialDate {
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: Deserializer<'de>,
  {
    let s: String = Deserialize::deserialize(deserializer)?;
    PartialDate::parse(&s).map_err(serde::de::Error::custom)
  }
}

/// Iterator struct for generating week PartialDates
pub struct WeekIterator {
  current_date: NaiveDate,
  end_date: NaiveDate,
}

impl Iterator for WeekIterator {
  type Item = (PartialDate, PartialDate);

  fn next(&mut self) -> Option<Self::Item> {
    // If we've gone past the end date, stop iteration
    // We use >= instead of > to make the iterator inclusive of the end date
    if self.current_date >= self.end_date {
      // Special case: if the current date is exactly on the end date,
      // include it as the last week in the iteration
      if self.current_date == self.end_date {
        // Get the ISO year and week number for the current date (Monday)
        let iso_year = self.current_date.iso_week().year();
        let iso_week = self.current_date.iso_week().week();

        // Create the PartialDate for this week
        let week_pd = PartialDate::Yw {
          yr: iso_year,
          week: iso_week,
        };

        // Calculate the next week's date, being careful with bounds
        let next_date = if let Some(next) = self
          .current_date
          .checked_add_signed(chrono::Duration::days(7))
        {
          next
        } else {
          // If we can't calculate next week (due to overflow), use MAX
          return Some((week_pd.clone(), week_pd));
        };

        // Get the next week's PartialDate
        let next_iso_year = next_date.iso_week().year();
        let next_iso_week = next_date.iso_week().week();
        let next_week_pd = PartialDate::Yw {
          yr: next_iso_year,
          week: next_iso_week,
        };

        // Move the current_date past the end to stop iteration next time
        self.current_date = self
          .end_date
          .checked_add_signed(chrono::Duration::days(1))
          .unwrap_or(NaiveDate::MAX);

        // Return the week at the end date and the next week
        return Some((week_pd, next_week_pd));
      }
      return None;
    }

    // Get the ISO year and week number for the current date (Monday)
    let iso_year = self.current_date.iso_week().year();
    let iso_week = self.current_date.iso_week().week();

    // Create the PartialDate for this week
    let week_pd = PartialDate::Yw {
      yr: iso_year,
      week: iso_week,
    };

    // Calculate the next week's date, being careful with bounds
    let next_date = if let Some(next) = self
      .current_date
      .checked_add_signed(chrono::Duration::days(7))
    {
      next
    } else {
      // Handle potential overflow by stopping iteration
      return None;
    };

    // Get the next week's PartialDate
    let next_iso_year = next_date.iso_week().year();
    let next_iso_week = next_date.iso_week().week();
    let next_week_pd = PartialDate::Yw {
      yr: next_iso_year,
      week: next_iso_week,
    };

    // Save the current value before moving iterator state
    let result = Some((week_pd, next_week_pd));

    // Move the current_date forward to the next week
    self.current_date = next_date;

    // Return the current week and the next week
    result
  }
}

/// Iterator struct for generating month PartialDates
pub struct MonthIterator {
  current_year: i32,
  current_month: u32,
  end_date: NaiveDate,
}

/// Iterator struct for generating year PartialDates
pub struct YearIterator {
  current_year: i32,
  end_date: NaiveDate,
}

impl Iterator for MonthIterator {
  type Item = (PartialDate, PartialDate);

  fn next(&mut self) -> Option<Self::Item> {
    // Get the first day of the current month
    let current_date = match NaiveDate::from_ymd_opt(self.current_year, self.current_month, 1) {
      Some(date) => date,
      None => return None, // Invalid date, stop iteration
    };

    // If we've gone past the end date, stop iteration
    // Check for current_date >= self.end_date to make it exclusive,
    // but we need to handle the case where the end date is in the current month
    if current_date > self.end_date {
      return None;
    }

    // Create the PartialDate for this month
    let month_pd = PartialDate::Ym(YearMonth {
      yr: self.current_year,
      mth1: self.current_month,
    });

    // Calculate the next month
    let (next_year, next_month) = if self.current_month == 12 {
      (self.current_year + 1, 1)
    } else {
      (self.current_year, self.current_month + 1)
    };

    // Get the first day of the next month
    let next_month_pd = PartialDate::Ym(YearMonth {
      yr: next_year,
      mth1: next_month,
    });

    // Check if the next month's first day is after the end date
    // If so, this is the last month we should include
    let next_date = match NaiveDate::from_ymd_opt(next_year, next_month, 1) {
      Some(date) => date,
      None => return None, // Invalid date, stop iteration
    };

    // Save the current value before moving iterator state
    let result = Some((month_pd, next_month_pd));

    // Update the iterator state
    self.current_year = next_year;
    self.current_month = next_month;

    // If the next month starts after our end date, this was our final month
    // Update state to ensure we don't yield any more months
    if next_date > self.end_date {
      // Set the current month to something that will definitely be past the end date
      // to stop iteration on the next call
      if let Some(max_date) = self.end_date.checked_add_signed(chrono::Duration::days(32)) {
        let year = max_date.year();
        let month = max_date.month();
        self.current_year = year;
        self.current_month = month;
      }
    }

    // Return current month and next month
    result
  }
}

impl Iterator for YearIterator {
  type Item = (PartialDate, PartialDate);

  fn next(&mut self) -> Option<Self::Item> {
    // Get the first day of the current year
    let current_date = match NaiveDate::from_ymd_opt(self.current_year, 1, 1) {
      Some(date) => date,
      None => return None, // Invalid date, stop iteration
    };

    // If we've gone past the end date, stop iteration
    if current_date > self.end_date {
      return None;
    }

    // Create the PartialDate for this year
    let year_pd = PartialDate::Y(self.current_year);

    // Calculate the next year
    let next_year = self.current_year + 1;

    // Get the PartialDate for the next year
    let next_year_pd = PartialDate::Y(next_year);

    // Check if the first day of the next year is after the end date
    // If so, this is the last year we should include
    let next_date = match NaiveDate::from_ymd_opt(next_year, 1, 1) {
      Some(date) => date,
      None => return None, // Invalid date, stop iteration
    };

    // Save the current value before moving iterator state
    let result = Some((year_pd, next_year_pd));

    // Update the iterator state
    self.current_year = next_year;

    // If the next year starts after our end date, this was our final year
    // Update state to ensure we don't yield any more years
    if next_date > self.end_date {
      // Set the current year to something that will definitely be past the end date
      // to stop iteration on the next call
      self.current_year = self.end_date.year() + 2;
    }

    // Return current year and next year
    result
  }
}

#[cfg(test)]
mod test {
  use super::{PartialDate, YearMonth};
  use chrono::NaiveDate;
  use std::ops::Range;

  #[test]
  pub fn test() {
    let pd = PartialDate::parse("yw-2025-09").unwrap();
    println!("{}", pd.start());
    println!("{}", pd.end());
  }

  #[test]
  pub fn test_week_iterator() {
    // Define a test range - 2 weeks from 2025-05-05 (a Monday) to 2025-05-19 (a Monday)
    let start_date = NaiveDate::from_ymd_opt(2025, 5, 5).unwrap();
    let end_date = NaiveDate::from_ymd_opt(2025, 5, 19).unwrap();
    let range = Range {
      start: start_date,
      end: end_date,
    };

    // Test the week iterator
    let week_iter = PartialDate::iter_weeks(range);
    let weeks: Vec<_> = week_iter.collect();

    // Should have 3 weeks (inclusive of end date)
    assert_eq!(weeks.len(), 3);

    // Check first week is week 19 of 2025
    match &weeks[0].0 {
      PartialDate::Yw { yr, week } => {
        assert_eq!(*yr, 2025);
        assert_eq!(*week, 19);
      }
      _ => panic!("Expected Yw date type"),
    }

    // Check second week is week 20 of 2025
    match &weeks[1].0 {
      PartialDate::Yw { yr, week } => {
        assert_eq!(*yr, 2025);
        assert_eq!(*week, 20);
      }
      _ => panic!("Expected Yw date type"),
    }

    // Check third week is week 21 of 2025
    match &weeks[2].0 {
      PartialDate::Yw { yr, week } => {
        assert_eq!(*yr, 2025);
        assert_eq!(*week, 21);
      }
      _ => panic!("Expected Yw date type"),
    }
  }

  #[test]
  pub fn test_week_iterator_year_boundary() {
    // Define a test range that crosses year boundary
    let start_date = NaiveDate::from_ymd_opt(2025, 12, 29).unwrap();
    let end_date = NaiveDate::from_ymd_opt(2026, 1, 12).unwrap();
    let range = Range {
      start: start_date,
      end: end_date,
    };

    // Test the week iterator
    let week_iter = PartialDate::iter_weeks(range);
    let weeks: Vec<_> = week_iter.collect();

    // Should have 3 weeks (inclusive of end date)
    assert_eq!(weeks.len(), 3);

    // Check first week is week 1 of 2026 (ISO week year can differ from calendar year)
    match &weeks[0].0 {
      PartialDate::Yw { yr, week } => {
        assert_eq!(*yr, 2026);
        assert_eq!(*week, 1);
      }
      _ => panic!("Expected Yw date type"),
    }

    // Check second week is week 2 of 2026
    match &weeks[1].0 {
      PartialDate::Yw { yr, week } => {
        assert_eq!(*yr, 2026);
        assert_eq!(*week, 2);
      }
      _ => panic!("Expected Yw date type"),
    }

    // Check third week is week 3 of 2026
    match &weeks[2].0 {
      PartialDate::Yw { yr, week } => {
        assert_eq!(*yr, 2026);
        assert_eq!(*week, 3);
      }
      _ => panic!("Expected Yw date type"),
    }
  }

  #[test]
  pub fn test_month_iterator() {
    // Define a test range - 3 months from 2025-05-15 to 2025-08-15
    let start_date = NaiveDate::from_ymd_opt(2025, 5, 15).unwrap();
    let end_date = NaiveDate::from_ymd_opt(2025, 8, 15).unwrap();
    let range = Range {
      start: start_date,
      end: end_date,
    };

    // Test the month iterator
    let month_iter = PartialDate::iter_months(range);
    let months: Vec<_> = month_iter.collect();

    // Should have 4 months (May, June, July, August)
    // August is included because we're making the iterator inclusive of the end date
    assert_eq!(months.len(), 4);

    // Check first month is May 2025
    match &months[0].0 {
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        assert_eq!(*yr, 2025);
        assert_eq!(*mth1, 5);
      }
      _ => panic!("Expected Ym date type"),
    }

    // Check second month is June 2025
    match &months[1].0 {
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        assert_eq!(*yr, 2025);
        assert_eq!(*mth1, 6);
      }
      _ => panic!("Expected Ym date type"),
    }

    // Check third month is July 2025
    match &months[2].0 {
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        assert_eq!(*yr, 2025);
        assert_eq!(*mth1, 7);
      }
      _ => panic!("Expected Ym date type"),
    }

    // Check fourth month is August 2025
    match &months[3].0 {
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        assert_eq!(*yr, 2025);
        assert_eq!(*mth1, 8);
      }
      _ => panic!("Expected Ym date type"),
    }
  }

  #[test]
  pub fn test_month_iterator_year_boundary() {
    // Define a test range that crosses year boundary - 3 months from 2025-12-15 to 2026-02-15
    let start_date = NaiveDate::from_ymd_opt(2025, 12, 15).unwrap();
    let end_date = NaiveDate::from_ymd_opt(2026, 2, 15).unwrap();
    let range = Range {
      start: start_date,
      end: end_date,
    };

    // Test the month iterator
    let month_iter = PartialDate::iter_months(range);
    let months: Vec<_> = month_iter.collect();

    // Should have 3 months (December, January, February)
    // February is included because we're making the iterator inclusive of the end date
    assert_eq!(months.len(), 3);

    // Check first month is December 2025
    match &months[0].0 {
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        assert_eq!(*yr, 2025);
        assert_eq!(*mth1, 12);
      }
      _ => panic!("Expected Ym date type"),
    }

    // Check second month is January 2026
    match &months[1].0 {
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        assert_eq!(*yr, 2026);
        assert_eq!(*mth1, 1);
      }
      _ => panic!("Expected Ym date type"),
    }

    // Check third month is February 2026
    match &months[2].0 {
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        assert_eq!(*yr, 2026);
        assert_eq!(*mth1, 2);
      }
      _ => panic!("Expected Ym date type"),
    }
  }

  #[test]
  pub fn test_month_iterator_exact_boundary() {
    // Test with end date exactly on the first day of the month
    // Range from 2025-03-01 to 2025-05-01 (end date is May 1st)
    let start_date = NaiveDate::from_ymd_opt(2025, 3, 1).unwrap();
    let end_date = NaiveDate::from_ymd_opt(2025, 5, 1).unwrap();
    let range = Range {
      start: start_date,
      end: end_date,
    };

    // Test the month iterator
    let month_iter = PartialDate::iter_months(range);
    let months: Vec<_> = month_iter.collect();

    // Should have 3 months (March, April, May)
    // May should be included because its first day is exactly the end date
    // and our iterator is inclusive of the end date
    assert_eq!(months.len(), 3);

    // Last month should be May
    match &months[2].0 {
      PartialDate::Ym(YearMonth { yr, mth1 }) => {
        assert_eq!(*yr, 2025);
        assert_eq!(*mth1, 5);
      }
      _ => panic!("Expected Ym date type"),
    }
  }

  #[test]
  pub fn test_week_iterator_exact_boundary() {
    // Test with end date exactly on a Monday
    // Range from 2025-05-05 (Monday) to 2025-05-19 (Monday)
    let start_date = NaiveDate::from_ymd_opt(2025, 5, 5).unwrap();
    let end_date = NaiveDate::from_ymd_opt(2025, 5, 19).unwrap();
    let range = Range {
      start: start_date,
      end: end_date,
    };

    // Test the week iterator
    let week_iter = PartialDate::iter_weeks(range);
    let weeks: Vec<_> = week_iter.collect();

    // We should have 3 weeks in this test case because the end date (2025-05-19) is inclusive
    // in the range and matches exactly a week boundary (Monday)
    assert_eq!(weeks.len(), 3);

    // First week should be week 19 of 2025
    match &weeks[0].0 {
      PartialDate::Yw { yr, week } => {
        assert_eq!(*yr, 2025);
        assert_eq!(*week, 19);
      }
      _ => panic!("Expected Yw date type"),
    }

    // Second week should be week 20 of 2025
    match &weeks[1].0 {
      PartialDate::Yw { yr, week } => {
        assert_eq!(*yr, 2025);
        assert_eq!(*week, 20);
      }
      _ => panic!("Expected Yw date type"),
    }

    // Third week should be week 21 of 2025
    match &weeks[2].0 {
      PartialDate::Yw { yr, week } => {
        assert_eq!(*yr, 2025);
        assert_eq!(*week, 21);
      }
      _ => panic!("Expected Yw date type"),
    }
  }

  #[test]
  pub fn test_year_iterator() {
    // Define a test range - 3 years from 2023-05-15 to 2025-12-15
    let start_date = NaiveDate::from_ymd_opt(2023, 5, 15).unwrap();
    let end_date = NaiveDate::from_ymd_opt(2025, 12, 15).unwrap();
    let range = Range {
      start: start_date,
      end: end_date,
    };

    // Test the year iterator
    let year_iter = PartialDate::iter_years(range);
    let years: Vec<_> = year_iter.collect();

    // Should have 3 years (2023, 2024, 2025)
    assert_eq!(years.len(), 3);

    // Check first year is 2023
    match &years[0].0 {
      PartialDate::Y(year) => {
        assert_eq!(*year, 2023);
      }
      _ => panic!("Expected Y date type"),
    }

    // Check first year end date is 2024
    match &years[0].1 {
      PartialDate::Y(year) => {
        assert_eq!(*year, 2024);
      }
      _ => panic!("Expected Y date type for end_date"),
    }

    // Check second year is 2024
    match &years[1].0 {
      PartialDate::Y(year) => {
        assert_eq!(*year, 2024);
      }
      _ => panic!("Expected Y date type"),
    }

    // Check third year is 2025
    match &years[2].0 {
      PartialDate::Y(year) => {
        assert_eq!(*year, 2025);
      }
      _ => panic!("Expected Y date type"),
    }
  }

  #[test]
  pub fn test_year_iterator_exact_boundary() {
    // Test with end date exactly on January 1st
    // Range from 2023-05-15 to 2026-01-01 (exactly on year boundary)
    let start_date = NaiveDate::from_ymd_opt(2023, 5, 15).unwrap();
    let end_date = NaiveDate::from_ymd_opt(2026, 1, 1).unwrap();
    let range = Range {
      start: start_date,
      end: end_date,
    };

    // Test the year iterator
    let year_iter = PartialDate::iter_years(range);
    let years: Vec<_> = year_iter.collect();

    // Should have 4 years (2023, 2024, 2025, 2026)
    // 2026 is included because we're inclusive of the end date
    assert_eq!(years.len(), 4);

    // Check last year is 2026
    match &years[3].0 {
      PartialDate::Y(year) => {
        assert_eq!(*year, 2026);
      }
      _ => panic!("Expected Y date type"),
    }
  }
}
