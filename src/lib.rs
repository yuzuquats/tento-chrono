#![feature(coroutines, coroutine_trait, stmt_expr_attributes)]
#![feature(iter_from_coroutine)]

pub mod date_unit;
pub mod datetime_range;
pub mod naive_date_ext;
pub mod naive_date_range;
pub mod partial;
pub mod year;
pub mod year_month;
pub mod year_month_day;

pub use naive_date_range::NaiveDateRangeExt;
pub use partial::{PartialDate, SemanticTime};

use std::str::FromStr;

use anyhow::Context;
use chrono::{DateTime, NaiveDate, NaiveDateTime, Utc};

pub fn naivedate(s: &str) -> NaiveDate {
  NaiveDate::from_str(s)
    .context(format!("couldn't construct dt ({s}"))
    .unwrap()
}

pub fn utc_datetime(nd: NaiveDate) -> DateTime<Utc> {
  let ndt: NaiveDateTime = nd.and_hms_opt(0, 0, 0).expect("Invalid time");
  DateTime::<Utc>::from_naive_utc_and_offset(ndt, Utc)
}

pub fn current_milliseconds() -> u64 {
  let now = std::time::SystemTime::now();
  let duration_since_epoch = now
    .duration_since(std::time::UNIX_EPOCH)
    .expect("Time went backwards");
  duration_since_epoch.as_millis() as u64
}

pub fn partial_date(s: &str) -> PartialDate {
  PartialDate::parse(s).expect("invalid partial date")
}

pub fn semantic_time(s: &str) -> SemanticTime {
  SemanticTime::from_partial(partial_date(s))
}

pub fn datetime(s: &str) -> DateTime<Utc> {
  DateTime::parse_from_rfc3339(s)
    .expect("couldn't parse dt")
    .into()
}
