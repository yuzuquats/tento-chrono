#[derive(Clone, PartialEq, Debug)]
pub enum DateUnitType {
  Years,
  Months,
  Days,
  Weeks,
}

pub struct DateUnit {
  pub value: i32,
  pub ty: DateUnitType,
}
