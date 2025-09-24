use chrono::NaiveDate;
use std::ops::Range;

/// Extension trait for Range<NaiveDate> to iterate through dates
pub trait NaiveDateRangeExt {
  /// Returns an iterator that yields each date in the range, inclusive of start and exclusive of end
  fn days_between_iter(&self) -> DaysBetweenIter;
}

/// Iterator that yields successive dates in a range
pub struct DaysBetweenIter {
  current: Option<NaiveDate>,
  end: NaiveDate,
}

impl Iterator for DaysBetweenIter {
  type Item = NaiveDate;

  fn next(&mut self) -> Option<Self::Item> {
    if let Some(current) = self.current {
      // If we've reached the end, stop iterating
      if current >= self.end {
        return None;
      }

      // Get the current date to return
      let result = current;

      // Move to the next date
      self.current = current.succ_opt();

      Some(result)
    } else {
      None
    }
  }
}

impl NaiveDateRangeExt for Range<NaiveDate> {
  fn days_between_iter(&self) -> DaysBetweenIter {
    DaysBetweenIter {
      current: Some(self.start),
      end: self.end,
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use chrono::NaiveDate;

  #[test]
  fn test_days_between_iter() {
    // Create a range of 5 days
    let start = NaiveDate::from_ymd_opt(2023, 1, 1).unwrap();
    let end = NaiveDate::from_ymd_opt(2023, 1, 6).unwrap();
    let range = start..end;

    // Collect all dates into a vector
    let dates: Vec<NaiveDate> = range.days_between_iter().collect();

    // Should have 5 dates from Jan 1 to Jan 5 (end is exclusive)
    assert_eq!(dates.len(), 5);
    assert_eq!(dates[0], NaiveDate::from_ymd_opt(2023, 1, 1).unwrap());
    assert_eq!(dates[1], NaiveDate::from_ymd_opt(2023, 1, 2).unwrap());
    assert_eq!(dates[2], NaiveDate::from_ymd_opt(2023, 1, 3).unwrap());
    assert_eq!(dates[3], NaiveDate::from_ymd_opt(2023, 1, 4).unwrap());
    assert_eq!(dates[4], NaiveDate::from_ymd_opt(2023, 1, 5).unwrap());
  }

  #[test]
  fn test_empty_range() {
    // Create a range where start == end (empty range)
    let date = NaiveDate::from_ymd_opt(2023, 1, 1).unwrap();
    let range = date..date;

    let dates: Vec<NaiveDate> = range.days_between_iter().collect();
    assert_eq!(dates.len(), 0);
  }

  #[test]
  fn test_single_day_range() {
    // Create a range with just one day
    let start = NaiveDate::from_ymd_opt(2023, 1, 1).unwrap();
    let end = NaiveDate::from_ymd_opt(2023, 1, 2).unwrap();
    let range = start..end;

    let dates: Vec<NaiveDate> = range.days_between_iter().collect();
    assert_eq!(dates.len(), 1);
    assert_eq!(dates[0], start);
  }
}
