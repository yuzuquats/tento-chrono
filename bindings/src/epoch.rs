use arbitrary::Arbitrary;
use chrono::{DateTime, NaiveDate};
use std::time::{SystemTime, UNIX_EPOCH};
use std::{fmt::Display, ops::Deref};

pub struct MsSinceEpoch(i64);

pub const EPOCH_3000Y_1M_1D: MsSinceEpoch = MsSinceEpoch(32503708800000);

impl MsSinceEpoch {
  pub fn as_naive_date(&self) -> Option<NaiveDate> {
    let Some(dt) = DateTime::from_timestamp_millis(self.0) else {
      return None;
    };
    Some(dt.naive_utc().date())
  }

  pub fn now() -> MsSinceEpoch {
    MsSinceEpoch(
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("Time went backwards")
        .as_millis() as i64,
    )
  }
}

impl<'a> Arbitrary<'a> for MsSinceEpoch {
  fn arbitrary(u: &mut arbitrary::Unstructured<'a>) -> arbitrary::Result<Self> {
    let random_ms: i64 = u.int_in_range(0..=EPOCH_3000Y_1M_1D.0)?;
    Ok(MsSinceEpoch(random_ms))
  }
}

impl Deref for MsSinceEpoch {
  type Target = i64;

  fn deref(&self) -> &Self::Target {
    &self.0
  }
}

impl Display for MsSinceEpoch {
  fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
    write!(f, "{}", self.0)
  }
}
