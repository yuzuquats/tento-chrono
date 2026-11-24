use chrono::NaiveDate;
use tento_chrono::{PartialDate, SemanticTime, year_month::YearMonth};

#[test]
fn signed_dates_roundtrip_without_changing_object_serialization() {
  for text in [
    "y--44",
    "ym--44-3",
    "ymd--44-3-15",
    "yw--44-1",
    "y-0",
    "ym-+2024-02",
  ] {
    let value = PartialDate::parse(text).unwrap();
    assert!(PartialDate::parse(&value.to_string()).unwrap() == value);
    let encoded = serde_json::to_string(&value).unwrap();
    assert!(serde_json::from_str::<PartialDate>(&encoded).unwrap() == value);
  }
  let month = YearMonth::parse("-44-03").unwrap();
  assert_eq!(month.to_string(), "-44-03");
  assert_eq!(
    serde_json::to_value(&month).unwrap(),
    serde_json::json!({"yr": -44, "mth1": 3})
  );
  assert_eq!(
    serde_json::from_str::<YearMonth>(r#""-44-03""#).unwrap(),
    month
  );
  assert!(serde_json::from_str::<SemanticTime>(r#""ym--44-03""#).is_ok());
}

#[test]
fn exact_fields_and_real_dates_are_required() {
  for text in [
    "2024-01-extra",
    "2024-01-",
    "-44-01-01",
    "2024-",
    "2024-0",
    "2024-13",
  ] {
    assert!(YearMonth::parse(text).is_err(), "{text}");
  }
  for text in [
    "y-2024-",
    "ym-2024-02-",
    "ymd-2024-02-29-",
    "yw-2024-1-",
    "ymd-2023-2-29",
    "yw-2021-53",
    "y--",
    "ym--44--3",
  ] {
    assert!(PartialDate::parse(text).is_err(), "{text}");
  }
}

#[test]
fn checked_month_steps_expose_boundaries_and_preserve_ordinary_behavior() {
  let dec = YearMonth { yr: -1, mth1: 12 };
  assert_eq!(dec.checked_succ(), Some(YearMonth { yr: 0, mth1: 1 }));
  assert_eq!(dec.succ().pred(), dec);
  let first = YearMonth {
    yr: i32::MIN,
    mth1: 1,
  };
  let last = YearMonth {
    yr: i32::MAX,
    mth1: 12,
  };
  assert_eq!(first.checked_pred(), None);
  assert_eq!(last.checked_succ(), None);
  assert!(std::panic::catch_unwind(|| first.pred()).is_err());
  assert!(std::panic::catch_unwind(|| last.succ()).is_err());
  for month in [0, 13, u32::MAX] {
    let bad = YearMonth {
      yr: 2024,
      mth1: month,
    };
    assert_eq!(bad.checked_succ(), None);
    assert_eq!(bad.checked_pred(), None);
    assert_eq!(bad.dates(), None);
  }
}

#[test]
fn end_fallback_is_independent_of_arithmetic_overflow() {
  for date in [
    PartialDate::Y(i32::MAX),
    PartialDate::Ym(YearMonth {
      yr: i32::MAX,
      mth1: 12,
    }),
    PartialDate::Ym(YearMonth {
      yr: 2024,
      mth1: u32::MAX,
    }),
    PartialDate::Yw {
      yr: i32::MAX,
      week: u32::MAX,
    },
  ] {
    assert_eq!(date.end(), NaiveDate::MAX);
  }
  assert_eq!(
    PartialDate::Yw {
      yr: 2024,
      week: u32::MAX
    }
    .end(),
    NaiveDate::from_isoywd_opt(2025, 1, chrono::Weekday::Mon).unwrap()
  );
  for (value, end) in [
    ("y-2024", "2025-01-01"),
    ("ym-2024-12", "2025-01-01"),
    ("ymd-2024-2-29", "2024-03-01"),
    ("yw-2020-53", "2021-01-04"),
  ] {
    assert_eq!(PartialDate::parse(value).unwrap().end().to_string(), end);
  }
}
