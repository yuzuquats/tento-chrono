use anyhow::anyhow;
use boa_engine::js_string;
use chrono::Datelike;
use chrono::NaiveDate;
use tento_chrono_bindings::Runtime;

#[cfg(test)]
mod test {
  use chrono::NaiveDate;
  use tento_chrono_bindings::Runtime;

  use super::check_js_days_since_epoch;
  use super::check_js_naive_date;
  use super::check_js_rfc3339;

  /// Tests NaiveDate creation from year, month, day values by checking
  /// all valid dates from 1970 to 2050 against the JS implementation
  #[test]
  #[ignore = "takes a long time"]
  pub fn test_from_ymd() {
    for yr in 1970..2050 {
      let mut rt = Runtime::env_test().expect("couldn't construct runtime");
      for mth1 in 1..=12 {
        for day1 in 1..=31 {
          let Some(nd) = NaiveDate::from_ymd_opt(yr, mth1, day1) else {
            continue;
          };
          check_js_naive_date(&mut rt, nd).unwrap();
        }
      }
    }
  }

  /// Tests NaiveDate creation from days since epoch (DSE) by verifying
  /// dates within -10000 to 10000 days from the Unix epoch match in both
  /// Rust and JS implementations
  #[test]
  #[ignore = "takes a long time"]
  pub fn test_from_dse() {
    // Note: Chunk size is necessary because the runtime can only import so
    // many modules
    //
    const CHUNK_SIZE: usize = 1000;
    for chunk_start in (-10000..10000).step_by(CHUNK_SIZE) {
      let mut rt = Runtime::env_test().expect("couldn't construct runtime");
      let chunk_end = (chunk_start + CHUNK_SIZE as i32).min(10000);
      for days in chunk_start..chunk_end {
        // Create a date from days since epoch in the Rust implementation
        // 719163 is days from CE to Unix epoch
        let Some(nd) = NaiveDate::from_num_days_from_ce_opt(719163 + days) else {
          continue;
        };
        check_js_naive_date(&mut rt, nd).unwrap();
      }
    }
  }

  /// Tests RFC3339 date string formatting by verifying output format
  /// consistency between Rust and JS implementations on various dates
  /// including leap years
  #[test]
  #[ignore = "takes too long"]
  pub fn test_formatting() {
    let mut rt = Runtime::env_test().expect("couldn't construct runtime");

    // Test various dates for string formatting (RFC3339)
    let test_dates = [
      NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(),
      NaiveDate::from_ymd_opt(2000, 2, 29).unwrap(),
      NaiveDate::from_ymd_opt(2023, 12, 31).unwrap(),
      NaiveDate::from_ymd_opt(2024, 2, 29).unwrap(),
    ];

    for date in test_dates {
      check_js_rfc3339(&mut rt, date).unwrap();
    }
  }

  /// Tests days_since_epoch calculation by comparing Rust and JS implementations
  #[test]
  #[ignore = "takes too long"]
  pub fn test_days_since_epoch() {
    let mut rt = Runtime::env_test().expect("couldn't construct runtime");

    // Test various dates for days_since_epoch calculation
    let test_dates = [
      NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(), // Should be 0
      NaiveDate::from_ymd_opt(1970, 1, 2).unwrap(), // Should be 1
      NaiveDate::from_ymd_opt(1969, 12, 31).unwrap(), // Should be -1
      NaiveDate::from_ymd_opt(2000, 2, 29).unwrap(), // Leap day
      NaiveDate::from_ymd_opt(2023, 12, 31).unwrap(),
      NaiveDate::from_ymd_opt(2024, 2, 29).unwrap(), // Leap day
    ];

    for date in test_dates {
      check_js_days_since_epoch(&mut rt, date).unwrap();
    }
  }
}

fn check_js_naive_date(rt: &mut Runtime, naive_date: NaiveDate) -> anyhow::Result<()> {
  let year = naive_date.year();
  let month = naive_date.month();
  let day = naive_date.day();

  let namespace = rt
    .eval_module(&format!(
      r#"
        import {{ NaiveDate }} from "./naive-date.js";
        const nd = NaiveDate.fromYmd1Exp({year}, {month}, {day});
        export let result = nd.rfc3339();
      "#,
    ))
    .map_err(|e| anyhow!("couldn't run module for y={year}, m={month}, d={day}: {e}"))?;

  let result = namespace
    .get(js_string!("result"), &mut rt.context)
    .map_err(|e| anyhow!("couldn't get result for y={year}, m={month}, d={day}: {e:?}"))?;

  let js_result = result
    .to_string(&mut rt.context)
    .map_err(|e| {
      anyhow!("couldn't convert result to string for y={year}, m={month}, d={day}: {e}")
    })?
    .to_std_string_lossy();

  let expected = naive_date.format("%Y-%m-%d").to_string();

  if expected != js_result {
    return Err(anyhow!(
      "Date mismatch for y={year}, m={month}, d={day}: expected '{expected}', got '{js_result}'"
    ));
  }

  Ok(())
}

fn check_js_rfc3339(rt: &mut Runtime, naive_date: NaiveDate) -> anyhow::Result<()> {
  let year = naive_date.year();
  let month = naive_date.month();
  let day = naive_date.day();

  let namespace = rt
    .eval_module(&format!(
      r#"
        import {{ NaiveDate }} from "./naive-date.js";
        const nd = NaiveDate.fromYmd1Exp({year}, {month}, {day});
        export let result = nd.rfc3339();
      "#,
    ))
    .map_err(|e| anyhow!("couldn't run module for rfc3339(y={year}, m={month}, d={day}): {e}"))?;

  let result = namespace
    .get(js_string!("result"), &mut rt.context)
    .map_err(|e| anyhow!("couldn't get result for rfc3339(y={year}, m={month}, d={day}): {e:?}"))?;

  let js_result = result
    .to_string(&mut rt.context)
    .map_err(|e| {
      anyhow!("couldn't convert result to string for rfc3339(y={year}, m={month}, d={day}): {e}")
    })?
    .to_std_string_lossy();

  let expected = naive_date.format("%Y-%m-%d").to_string();

  if expected != js_result {
    return Err(anyhow!(
      "RFC3339 format mismatch for y={year}, m={month}, d={day}: expected '{expected}', got '{js_result}'"
    ));
  }

  Ok(())
}

fn check_js_days_since_epoch(rt: &mut Runtime, naive_date: NaiveDate) -> anyhow::Result<()> {
  use tento_chrono::naive_date_ext::NaiveDateExt;

  let year = naive_date.year();
  let month = naive_date.month();
  let day = naive_date.day();

  // Calculate days since epoch in Rust
  let rust_days_since_epoch = naive_date.days_since_epoch();

  // Calculate days since epoch in JavaScript
  let namespace = rt
    .eval_module(&format!(
      r#"
        import {{ NaiveDate }} from "./naive-date.js";
        const nd = NaiveDate.fromYmd1Exp({year}, {month}, {day});
        export let result = nd.daysSinceEpoch;
      "#,
    ))
    .map_err(|e| {
      anyhow!("couldn't run module for daysSinceEpoch(y={year}, m={month}, d={day}): {e}")
    })?;

  let result = namespace
    .get(js_string!("result"), &mut rt.context)
    .map_err(|e| {
      anyhow!("couldn't get result for daysSinceEpoch(y={year}, m={month}, d={day}): {e:?}")
    })?;

  let js_days_since_epoch = result.to_number(&mut rt.context).map_err(|e| {
    anyhow!(
      "couldn't convert result to number for daysSinceEpoch(y={year}, m={month}, d={day}): {e}"
    )
  })?;

  // Compare the Rust and JavaScript results
  if rust_days_since_epoch as f64 != js_days_since_epoch {
    return Err(anyhow!(
      "days_since_epoch mismatch for y={year}, m={month}, d={day}: Rust={rust_days_since_epoch}, JS={js_days_since_epoch}"
    ));
  }

  Ok(())
}
