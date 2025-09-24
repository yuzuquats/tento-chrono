use chrono::{Datelike, NaiveDate};

pub trait NaiveDateExt {
  fn days_since_epoch(&self) -> i32;
}

impl NaiveDateExt for NaiveDate {
  fn days_since_epoch(&self) -> i32 {
    let days_from_ce = self.num_days_from_ce();
    // 719163 is days from CE (0001-01-01) to Unix epoch (1970-01-01)
    days_from_ce - 719163
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use chrono::NaiveDate;

  #[test]
  fn test_days_since_epoch() {
    // Test cases with known values
    let test_cases = [
      // (date, expected_days_since_epoch)
      (NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(), 0),
      (NaiveDate::from_ymd_opt(1970, 1, 2).unwrap(), 1),
      (NaiveDate::from_ymd_opt(1969, 12, 31).unwrap(), -1),
      (NaiveDate::from_ymd_opt(2000, 1, 1).unwrap(), 10957), // 30 years * 365 + 7 leap days
      (NaiveDate::from_ymd_opt(2023, 1, 1).unwrap(), 19358), // 53 years * 365 + 13 leap days
    ];

    for (date, expected) in test_cases {
      let actual = date.days_since_epoch();
      assert_eq!(
        actual, expected,
        "Failed for date {}: expected {}, got {}",
        date, expected, actual
      );
    }
  }
}
