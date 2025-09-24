use std::ops::Coroutine;

use super::{
  date_unit::{DateUnit, DateUnitType},
  year_month::YearMonth,
};
use lona_utils::math::{FloorDiv, FloorMod};

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
      let md = mth.floor_mod(12);
      let div = mth.floor_div(12);
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

  pub fn add(&self, du: &DateUnit) -> YearMonthDay {
    match du.ty {
      DateUnitType::Years => YearMonthDay {
        yr: self.yr + du.value,
        mth1: self.mth1,
        day1: self.day1,
      },
      DateUnitType::Months => self.add_months(du.value),
      DateUnitType::Days => todo!(),
      DateUnitType::Weeks => todo!(),
    }
  }

  pub fn succ(self, step: DateUnit) -> impl Coroutine<Yield = YearMonthDay, Return = ()> {
    #[coroutine]
    move || {
      let mut curr = self;
      loop {
        let next = curr.add(&step);
        yield curr;
        curr = next;
      }
    }
  }
}
