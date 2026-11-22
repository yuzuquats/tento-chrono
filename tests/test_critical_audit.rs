use chrono::{NaiveDate, Duration, Datelike};
use tento_chrono::{PartialDate, year_month::YearMonth};

#[test]
fn year_month_reads_both_shapes_and_keeps_object_output() {
  let ym = YearMonth { yr: 2024, mth1: 2 };
  let object = serde_json::json!({"yr":2024,"mth1":2});
  assert_eq!(serde_json::to_value(&ym).unwrap(), object);
  assert_eq!(serde_json::from_value::<YearMonth>(object).unwrap(), ym);
  assert_eq!(serde_json::from_str::<YearMonth>("\"2024-02\"").unwrap(), ym);
  for s in [r#"{"yr":2024,"mth1":0}"#, r#"{"yr":2024,"mth1":13}"#, r#"{"yr":2024}"#] {
    assert!(serde_json::from_str::<YearMonth>(s).is_err());
  }
}

#[test]
fn weeks_at_max_are_inclusive_and_exhausted() {
  for days in 0..14 {
    let start = NaiveDate::MAX - Duration::days(days);
    let mut iter = PartialDate::iter_weeks(start..NaiveDate::MAX);
    let weeks: Vec<_> = iter.by_ref().take(5).collect();
    assert!(!weeks.is_empty());
    assert!(weeks.len() <= 3);
    assert!(iter.next().is_none());
    assert!(iter.next().is_none());
  }
  let last_monday = NaiveDate::MAX - Duration::days(NaiveDate::MAX.weekday().num_days_from_monday() as i64);
  let mut terminal = PartialDate::iter_weeks(last_monday..last_monday);
  assert!(terminal.next().is_some());
  assert!(terminal.next().is_none());
  assert!(terminal.next().is_none());
  let monday = NaiveDate::from_ymd_opt(2024, 6, 3).unwrap();
  assert_eq!(PartialDate::iter_weeks(monday..monday).count(), 1);
  assert_eq!(PartialDate::iter_weeks(monday..monday + Duration::days(7)).count(), 2);
  assert!(PartialDate::iter_weeks(NaiveDate::MIN..NaiveDate::MIN).next().is_some());
}
