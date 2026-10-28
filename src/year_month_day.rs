use std::ops::Coroutine;

use chrono::{Datelike, NaiveDate};

use super::{
  date_unit::{DateUnit, DateUnitType},
  year_month::YearMonth,
};

pub struct YearMonthDay {
  pub yr: i32,
  pub mth1: u32,
  pub day1: u32,
}

impl YearMonthDay {
  pub fn ym(&self) -> YearMonth {
    YearMonth {
      yr: self.yr,
      mth1: self.mth1,
    }
  }

  pub fn add_months(&self, mths: i32) -> YearMonthDay {
    let mut yr = self.yr;
    let mut mth = mths + self.mth1 as i32;
    if mth > 12 || mth <= 0 {
      let md = mth.rem_euclid(12);
      let div = mth.div_euclid(12);
      yr += div;
      if md == 0 {
        mth = 12;
        yr -= 1;
      } else {
        mth = md;
      }
    }
    YearMonthDay {
      yr,
      mth1: mth as u32,
      day1: self.day1,
    }
  }

  /// `self` moved by `du`. Years and months keep the day of month, even past
  /// the new month's end (Jan 31 + 1 month is Feb 31: a recurrence rule
  /// skips it). Days and weeks step through real dates, so they need `self`
  /// to be one: `None` when it is not, or the result leaves chrono's range.
  pub fn add(&self, du: &DateUnit) -> Option<YearMonthDay> {
    match du.ty {
      DateUnitType::Years => Some(YearMonthDay {
        yr: self.yr.checked_add(du.value)?,
        mth1: self.mth1,
        day1: self.day1,
      }),
      DateUnitType::Months => Some(self.add_months(du.value)),
      DateUnitType::Days => self.add_days(i64::from(du.value)),
      DateUnitType::Weeks => self.add_days(i64::from(du.value) * 7),
    }
  }

  /// The real date `self` names, if any.
  pub fn to_nd(&self) -> Option<NaiveDate> {
    NaiveDate::from_ymd_opt(self.yr, self.mth1, self.day1)
  }

  fn add_days(&self, days: i64) -> Option<YearMonthDay> {
    let nd = self.to_nd()?.checked_add_signed(chrono::TimeDelta::try_days(days)?)?;
    Some(YearMonthDay { yr: nd.year(), mth1: nd.month(), day1: nd.day() })
  }

  pub fn succ(self, step: DateUnit) -> impl Coroutine<Yield = YearMonthDay, Return = ()> {
    #[coroutine]
    move || {
      let mut curr = self;
      loop {
        let next = curr.add(&step);
        yield curr;
        match next {
          Some(next) => curr = next,
          None => return,
        }
      }
    }
  }
}
