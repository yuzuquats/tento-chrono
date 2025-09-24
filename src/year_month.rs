use std::{
  fmt::{self, Display},
  ops::{Coroutine, Range},
};

use anyhow::anyhow;
use chrono::{Datelike, Month, NaiveDate};
use serde::{
  Deserialize, Deserializer, Serialize,
  de::{self, Visitor},
};
use utoipa::ToSchema;

use super::{date_unit::DateUnit, year_month_day::YearMonthDay};

#[derive(Clone, Debug, ToSchema, Serialize, PartialEq, Eq, Hash)]
pub struct YearMonth {
  pub yr: i32,
  pub mth1: u32,
}

impl YearMonth {
  pub fn parse(s: &str) -> anyhow::Result<YearMonth> {
    let parts: Vec<&str> = s.split("-").collect();
    let Some(yr) = parts.get(0).map(|y| y.parse().ok()).flatten() else {
      return Err(anyhow!("Year can't be parsed, got: '{:?}'", parts.get(0)));
    };

    let Some(mth1) = parts.get(1).map(|m| m.parse().ok()).flatten() else {
      return Err(anyhow!("Month can't be parsed, got: '{:?}'", parts.get(1)));
    };

    Ok(YearMonth { yr, mth1 })
  }

  pub fn month(&self) -> Month {
    Month::try_from(self.mth1 as u8).expect("month out of range")
  }

  pub fn to_string(&self) -> String {
    format!("{}-{:>02}", self.yr, self.mth1)
  }

  pub fn start_of_month(&self) -> YearMonthDay {
    YearMonthDay {
      yr: self.yr,
      mth1: self.mth1,
      day1: 1,
    }
  }

  pub fn from_nd(nd: NaiveDate) -> YearMonth {
    YearMonth {
      yr: nd.year(),
      mth1: nd.month0() + 1,
    }
  }

  /// Convert to a NaiveDate representing the first day of this month
  pub fn to_nd(&self) -> NaiveDate {
    NaiveDate::from_ymd_opt(self.yr, self.mth1, 1).unwrap()
  }

  /// Get the next month
  pub fn succ(&self) -> YearMonth {
    if self.mth1 == 12 {
      YearMonth {
        yr: self.yr + 1,
        mth1: 1,
      }
    } else {
      YearMonth {
        yr: self.yr,
        mth1: self.mth1 + 1,
      }
    }
  }

  /// Get the previous month
  pub fn pred(&self) -> YearMonth {
    if self.mth1 == 1 {
      YearMonth {
        yr: self.yr - 1,
        mth1: 12,
      }
    } else {
      YearMonth {
        yr: self.yr,
        mth1: self.mth1 - 1,
      }
    }
  }

  pub fn dates(&self) -> Range<NaiveDate> {
    let start = self.to_nd();
    let end = self.succ().to_nd();
    start..end
  }

  pub fn months(self, num_months: i32) -> impl Coroutine<Yield = YearMonth, Return = ()> {
    #[coroutine]
    move || {
      let co = self.start_of_month().succ(DateUnit {
        value: num_months,
        ty: super::date_unit::DateUnitType::Months,
      });
      for ymd in std::iter::from_coroutine(co) {
        yield ymd.ym()
      }
    }
  }
}

impl Display for YearMonth {
  fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
    f.write_str(&self.to_string())
  }
}

impl PartialOrd for YearMonth {
  fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
    Some(self.cmp(other))
  }
}

impl Ord for YearMonth {
  fn cmp(&self, other: &Self) -> std::cmp::Ordering {
    // First compare years
    match self.yr.cmp(&other.yr) {
      std::cmp::Ordering::Equal => {
        // If years are equal, compare months
        self.mth1.cmp(&other.mth1)
      }
      ordering => ordering,
    }
  }
}

impl From<NaiveDate> for YearMonth {
  fn from(value: NaiveDate) -> Self {
    YearMonth {
      yr: value.year(),
      mth1: value.month0() + 1,
    }
  }
}

impl<'de> Deserialize<'de> for YearMonth {
  fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
  where
    D: Deserializer<'de>,
  {
    deserializer.deserialize_str(YearMonthVisitor)
  }
}

struct YearMonthVisitor;

impl<'de> Visitor<'de> for YearMonthVisitor {
  type Value = YearMonth;

  fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
    f.write_str("a string in the format 'YYYY-MM'")
  }

  fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
  where
    E: de::Error,
  {
    YearMonth::parse(value).map_err(de::Error::custom)
  }
}

#[cfg(test)]
mod test {
  use super::YearMonth;
  use chrono::Datelike;

  #[test]
  pub fn test_basic() {
    let co = YearMonth { yr: 2023, mth1: 12 }.months(1);
    let yms: Vec<YearMonth> = std::iter::from_coroutine(co).take(14).collect();
    println!("{yms:#?}");
  }

  #[test]
  pub fn test_serialize() {
    let s = YearMonth { yr: 2024, mth1: 1 }.to_string();
    assert_eq!(s, "2024-01");
  }

  #[test]
  pub fn test_succ() {
    let ym = YearMonth { yr: 2024, mth1: 10 };
    let next = ym.succ();
    assert_eq!(next.yr, 2024);
    assert_eq!(next.mth1, 11);

    let dec = YearMonth { yr: 2024, mth1: 12 };
    let jan = dec.succ();
    assert_eq!(jan.yr, 2025);
    assert_eq!(jan.mth1, 1);
  }

  #[test]
  pub fn test_pred() {
    let ym = YearMonth { yr: 2024, mth1: 10 };
    let prev = ym.pred();
    assert_eq!(prev.yr, 2024);
    assert_eq!(prev.mth1, 9);

    let jan = YearMonth { yr: 2024, mth1: 1 };
    let dec = jan.pred();
    assert_eq!(dec.yr, 2023);
    assert_eq!(dec.mth1, 12);
  }

  #[test]
  pub fn test_to_nd() {
    let ym = YearMonth { yr: 2024, mth1: 2 };
    let nd = ym.to_nd();
    assert_eq!(nd.year(), 2024);
    assert_eq!(nd.month(), 2);
    assert_eq!(nd.day(), 1);
  }

  #[test]
  pub fn test_comparison() {
    let ym1 = YearMonth { yr: 2024, mth1: 1 };
    let ym2 = YearMonth { yr: 2024, mth1: 2 };
    let ym3 = YearMonth { yr: 2025, mth1: 1 };

    // Test PartialEq
    assert_eq!(ym1, YearMonth { yr: 2024, mth1: 1 });
    assert_ne!(ym1, ym2);

    // Test Ord/PartialOrd
    assert!(ym1 < ym2);
    assert!(ym2 < ym3);
    assert!(ym1 < ym3);
    assert!(ym3 > ym2);
    assert!(ym2 > ym1);

    // Test comparison across years
    assert!(YearMonth { yr: 2023, mth1: 12 } < YearMonth { yr: 2024, mth1: 1 });
    assert!(YearMonth { yr: 2025, mth1: 1 } > YearMonth { yr: 2024, mth1: 12 });
  }
}
