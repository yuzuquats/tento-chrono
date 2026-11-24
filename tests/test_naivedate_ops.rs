/// This file contains comprehensive tests for NaiveDate operations in tento-chrono.
///
/// The tests here validate the consistency between JavaScript and Rust implementations
/// of date arithmetic and comparison operations, including:
///
/// 1. Addition operations (test_add_operations):
///    - Adding days, months, and years to dates
///    - Handling special cases like leap years and month-end dates
///    - Testing with positive and negative offsets
///
/// 2. Subtraction operations (test_subtract_operations):
///    - Subtracting days, months, and years from dates
///    - Testing with various ranges and special cases
///    - Validating consistency with the Rust implementation
///
/// 3. Difference calculations (test_difference_operations):
///    - Computing the number of days between dates
///    - Computing the number of months between dates
///    - Testing various date pairs and edge cases
///
/// 4. General operations test (test_operations):
///    - A consolidated test for core date operations
///    - Using a more focused set of test cases
///
/// Each test function is extensively documented to explain its purpose,
/// test cases, and validation approach. Helper functions are included to
/// support the testing of these date operations.
use anyhow::anyhow;
use boa_engine::js_string;
use chrono::Datelike;
use chrono::NaiveDate;
use tento_chrono_bindings::Runtime;

#[cfg(test)]
mod test {
  use chrono::Datelike;
  use chrono::NaiveDate;
  use tento_chrono_bindings::Runtime;

  use super::check_js_add_days;
  use super::check_js_add_months;
  use super::check_js_add_years;
  use super::check_js_difference_in_days;
  use super::check_js_difference_in_months;
  use super::check_js_subtract_days;
  use super::check_js_subtract_months;
  use super::check_js_subtract_years;

  /// Tests date addition operations across multiple dimensions:
  ///
  /// Days:
  /// - Tests adding both positive and negative day offsets (-731 to +731 days)
  /// - Includes critical boundary cases like -/+1 day, -/+7 days (weekly), -/+30/31 days (monthly)
  /// - Includes full year transitions with -/+365/366 days (handles leap years)
  /// - Verifies multi-year transitions with -/+731 days (2 years)
  ///
  /// Months:
  /// - Tests adding both positive and negative month offsets (-48 to +48 months)
  /// - Covers month transitions across years with -/+12, -/+24, -/+36, -/+48 months
  /// - Tests partial year transitions with -/+1, -/+3, -/+6, -/+11 months
  /// - Tests non-standard transitions: -/+13, -/+18 months (crossing year boundaries)
  /// - Checks invalid month-end results (e.g., Jan 31 + 1 month)
  /// - Asserts invalidity when the preserved day does not exist in the target month
  ///
  /// Years:
  /// - Tests adding both positive and negative year offsets (-100 to +100 years)
  /// - Tests short, medium, and long-term year shifts with -/+1, -/+4, -/+10, -/+20, -/+50, -/+100
  /// - Handles leap year edge cases (Feb 29 becomes invalid in non-leap years)
  /// - Verifies results across different test base dates to ensure consistency
  ///
  /// Base Dates:
  /// - Unix epoch (1970-01-01) as anchor reference point
  /// - Leap year date (2000-02-29) to test special leap-year handling
  /// - Non-leap year boundary (2001-02-28) for year transition cases
  /// - Month end (2020-01-31) to test month-end transitions
  /// - Year end (2023-12-31) to test year transition cases
  ///
  /// Each operation is validated by comparing the JavaScript implementation results against
  /// the Rust implementation's expected behavior to ensure cross-implementation consistency.
  #[test]
  pub fn test_add_operations() {
    let mut rt = Runtime::env_test().expect("couldn't construct runtime");

    // Test a comprehensive range of dates with various operations
    let base_dates = [
      NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(), // Unix epoch
      NaiveDate::from_ymd_opt(2000, 2, 29).unwrap(), // leap year
      NaiveDate::from_ymd_opt(2001, 2, 28).unwrap(), // non-leap year
      NaiveDate::from_ymd_opt(2020, 1, 31).unwrap(), // end of month
      NaiveDate::from_ymd_opt(2023, 12, 31).unwrap(), // end of year
    ];

    for base_date in base_dates {
      // Test adding days
      for days in [
        -731, -366, -365, -180, -90, -60, -31, -30, -7, -1, 0, 1, 7, 30, 31, 60, 90, 180, 365, 366,
        731,
      ] {
        let result_date = base_date + chrono::Duration::days(days);
        check_js_add_days(&mut rt, base_date, days, result_date).unwrap();
      }

      // Test adding months
      for months in [
        -48, -36, -24, -18, -13, -12, -11, -6, -3, -2, -1, 0, 1, 2, 3, 6, 11, 12, 13, 18, 24, 36,
        48,
      ] {
        let month = base_date.month() as i32 + months;
        let year_delta = (month - 1).div_euclid(12);
        let new_month = (month - 1).rem_euclid(12) + 1;
        let new_year = base_date.year() + year_delta;

        let day = base_date.day();
        let expected = NaiveDate::from_ymd_opt(new_year, new_month as u32, day);
        check_js_add_months(&mut rt, base_date, months, expected).unwrap();
      }

      // Test adding years
      for years in [-100, -50, -20, -10, -4, -1, 0, 1, 4, 10, 20, 50, 100] {
        let new_year = base_date.year() + years;
        // Calendar shifts preserve the day: non-leap February 29 is invalid.
        let expected = NaiveDate::from_ymd_opt(new_year, base_date.month(), base_date.day());
        check_js_add_years(&mut rt, base_date, years, expected).unwrap();
      }
    }
  }

  /// Tests date subtraction operations across multiple dimensions:
  ///
  /// Days:
  /// - Tests subtracting day counts from 0 up to 731 days (2 years)
  /// - Includes critical boundary cases: 1 day, 7 days (weekly), 30/31 days (monthly)
  /// - Includes full year transitions with 365/366 days (handles leap years)
  /// - Verifies multi-year transitions with 731 days (2 years)
  /// - Tests date arithmetic when crossing year and month boundaries
  ///
  /// Months:
  /// - Tests subtracting month counts from 0 up to 48 months (4 years)
  /// - Covers month transitions across years with 12, 24, 36, 48 months
  /// - Tests partial year transitions with 1, 3, 6, 11 months
  /// - Tests non-standard transitions: 13, 18 months (crossing year boundaries)
  /// - Checks invalid month-end results (e.g., Mar 31 - 1 month)
  /// - Asserts invalidity when the preserved day does not exist in the target month
  ///
  /// Years:
  /// - Tests subtracting year counts from 0 up to 100 years
  /// - Tests short, medium, and long-term year shifts with 1, 4, 10, 20, 50, 100
  /// - Handles leap year edge cases (Feb 29 becomes invalid in non-leap years)
  /// - Verifies results across different test base dates to ensure consistency
  ///
  /// Base Dates:
  /// - Unix epoch (1970-01-01) as anchor reference point
  /// - Leap year date (2000-02-29) to test special leap-year handling
  /// - Non-leap year boundary (2001-02-28) for year transition cases
  /// - Month end (2020-01-31) to test month-end transitions
  /// - Year end (2023-12-31) to test year transition cases
  ///
  /// Each operation is validated by comparing the JavaScript implementation results against
  /// the Rust implementation's expected behavior to ensure cross-implementation consistency.
  ///
  /// Note: In the JavaScript implementation, subtraction is implemented as adding negative
  /// values (e.g., subtractDays is implemented as addDays(-n)).
  #[test]
  pub fn test_subtract_operations() {
    let mut rt = Runtime::env_test().expect("couldn't construct runtime");

    // Test a comprehensive range of dates with various operations
    let base_dates = [
      NaiveDate::from_ymd_opt(1970, 1, 1).unwrap(), // Unix epoch
      NaiveDate::from_ymd_opt(2000, 2, 29).unwrap(), // leap year
      NaiveDate::from_ymd_opt(2001, 2, 28).unwrap(), // non-leap year
      NaiveDate::from_ymd_opt(2020, 1, 31).unwrap(), // end of month
      NaiveDate::from_ymd_opt(2023, 12, 31).unwrap(), // end of year
    ];

    for base_date in base_dates {
      // Test subtracting days
      for days in [731, 366, 365, 180, 90, 60, 31, 30, 7, 1, 0] {
        let result_date = base_date - chrono::Duration::days(days);
        check_js_subtract_days(&mut rt, base_date, days, result_date).unwrap();
      }

      // Test subtracting months
      for months in [48, 36, 24, 18, 13, 12, 11, 6, 3, 2, 1, 0] {
        let month = base_date.month() as i32 - months;
        let year_delta = (month - 1).div_euclid(12);
        let new_month = (month - 1).rem_euclid(12) + 1;
        let new_year = base_date.year() + year_delta;

        let day = base_date.day();
        let expected = NaiveDate::from_ymd_opt(new_year, new_month as u32, day);
        check_js_subtract_months(&mut rt, base_date, months, expected).unwrap();
      }

      // Test subtracting years
      for years in [100, 50, 20, 10, 4, 1, 0] {
        let new_year = base_date.year() - years;
        // Calendar shifts preserve the day: non-leap February 29 is invalid.
        let expected = NaiveDate::from_ymd_opt(new_year, base_date.month(), base_date.day());
        check_js_subtract_years(&mut rt, base_date, years, expected).unwrap();
      }
    }
  }

  /// Tests date difference calculations between pairs of dates:
  ///
  /// Test Scenarios:
  /// - Same date (zero difference): Verifies that identical dates return 0 days/months difference
  /// - One day difference: Tests minimal day difference detection
  /// - One month difference: Tests minimal month difference detection
  /// - One year difference: Tests that one year correctly calculates as 12 months
  /// - Leap year edge case: Tests special handling around Feb 28/29 in leap years
  /// - Month boundary: Tests handling of different-length months (Jan 31 to Mar 1)
  /// - Year boundary: Tests differences across year transitions (Dec 31 to Jan 1)
  /// - Long range: Tests calculation of large differences (multiple decades)
  ///
  /// Operations Tested:
  /// 1. differenceInDays:
  ///    - Computes the exact number of days between two dates
  ///    - Accounts for leap years and varying month lengths
  ///    - Handles both positive (future date) and negative (past date) differences
  ///    - Returns a precise integer count
  ///
  /// 2. differenceInMonths:
  ///    - Computes the number of calendar months between two dates
  ///    - Calculates based on year and month components, not exact days
  ///    - Handles both positive (future date) and negative (past date) differences
  ///    - Returns a precise integer count
  ///
  /// Each operation is validated by comparing the JavaScript implementation results against
  /// the Rust implementation's expected behavior using both implementations' internal
  /// calculation methods to ensure cross-implementation consistency.
  #[test]
  pub fn test_difference_operations() {
    let mut rt = Runtime::env_test().expect("couldn't construct runtime");

    let date_pairs = [
      // Same date
      (
        NaiveDate::from_ymd_opt(2023, 5, 15).unwrap(),
        NaiveDate::from_ymd_opt(2023, 5, 15).unwrap(),
      ),
      // One day difference
      (
        NaiveDate::from_ymd_opt(2023, 5, 15).unwrap(),
        NaiveDate::from_ymd_opt(2023, 5, 16).unwrap(),
      ),
      // One month difference
      (
        NaiveDate::from_ymd_opt(2023, 5, 15).unwrap(),
        NaiveDate::from_ymd_opt(2023, 6, 15).unwrap(),
      ),
      // One year difference
      (
        NaiveDate::from_ymd_opt(2023, 5, 15).unwrap(),
        NaiveDate::from_ymd_opt(2024, 5, 15).unwrap(),
      ),
      // Leap year edge case
      (
        NaiveDate::from_ymd_opt(2020, 2, 28).unwrap(),
        NaiveDate::from_ymd_opt(2020, 3, 1).unwrap(),
      ),
      // Month boundary
      (
        NaiveDate::from_ymd_opt(2023, 1, 31).unwrap(),
        NaiveDate::from_ymd_opt(2023, 3, 1).unwrap(),
      ),
      // Year boundary
      (
        NaiveDate::from_ymd_opt(2022, 12, 31).unwrap(),
        NaiveDate::from_ymd_opt(2023, 1, 1).unwrap(),
      ),
      // Long range
      (
        NaiveDate::from_ymd_opt(2000, 1, 1).unwrap(),
        NaiveDate::from_ymd_opt(2023, 12, 31).unwrap(),
      ),
    ];

    for (date1, date2) in date_pairs {
      // Test difference in days
      let days_diff = (date2 - date1).num_days();
      check_js_difference_in_days(&mut rt, date1, date2, days_diff).unwrap();

      // Test difference in months
      let months_diff = calculate_months_between(date1, date2);
      check_js_difference_in_months(&mut rt, date1, date2, months_diff).unwrap();
    }
  }

  /// Helper function to calculate the number of calendar months between two dates.
  ///
  /// This calculation:
  /// - Computes the difference in years and converts to months
  /// - Adds the difference in month components
  /// - Does not account for the specific day of month
  ///
  /// For example:
  /// - From 2023-01-15 to 2023-02-14: 1 month
  /// - From 2022-12-31 to 2023-01-01: 1 month
  /// - From 2022-01-01 to 2023-01-01: 12 months
  fn calculate_months_between(date1: NaiveDate, date2: NaiveDate) -> i32 {
    let year_diff = date2.year() - date1.year();
    let month_diff = date2.month() as i32 - date1.month() as i32;
    year_diff * 12 + month_diff
  }

  /// Tests a consolidated set of core date operations on a focused set of base dates.
  ///
  /// This test focuses on a smaller, more targeted set of operations compared to the
  /// other specialized tests. It serves as a high-level validation of core functionality
  /// with a more limited range of inputs.
  ///
  /// Base Dates:
  /// - 2000-01-01: First day of the millennium
  /// - 2020-02-29: Leap day in a leap year
  /// - 2023-12-31: Last day of a year
  ///
  /// Operations Tested:
  /// 1. Adding Days:
  ///    - Tests day shifts from -365 to +365 days
  ///    - Includes key boundaries: -/+1 day, -/+7 days (weekly), -/+30 days (monthly)
  ///    - Includes full year transitions (-/+365 days)
  ///
  /// 2. Adding Months:
  ///    - Tests month shifts from -24 to +24 months
  ///    - Covers transitions across 1-2 years in both directions
  ///    - Tests partial year transitions: -/+1, -/+6 months
  ///
  /// 3. Adding Years:
  ///    - Tests year shifts from -50 to +50 years
  ///    - Handles leap year edge cases for Feb 29
  ///    - Tests short, medium, and long-term year shifts
  ///
  /// This test complements the more comprehensive specialized tests by providing
  /// a faster, more focused validation of core functionality.
  #[test]
  pub fn test_operations() {
    let mut rt = Runtime::env_test().expect("couldn't construct runtime");

    // Test a range of dates with various operations
    let base_dates = [
      NaiveDate::from_ymd_opt(2000, 1, 1).unwrap(),
      NaiveDate::from_ymd_opt(2020, 2, 29).unwrap(), // leap year
      NaiveDate::from_ymd_opt(2023, 12, 31).unwrap(),
    ];

    for base_date in base_dates {
      // Test adding days
      for days in [-365, -30, -7, -1, 0, 1, 7, 30, 365] {
        let result_date = base_date + chrono::Duration::days(days);
        check_js_add_days(&mut rt, base_date, days, result_date).unwrap();
      }

      // Test adding months
      for months in [-24, -12, -6, -1, 0, 1, 6, 12, 24] {
        let month = base_date.month() as i32 + months;
        let year_delta = (month - 1).div_euclid(12);
        let new_month = (month - 1).rem_euclid(12) + 1;
        let new_year = base_date.year() + year_delta;

        let day = base_date.day();
        let expected = NaiveDate::from_ymd_opt(new_year, new_month as u32, day);
        check_js_add_months(&mut rt, base_date, months, expected).unwrap();
      }

      // Test adding years
      for years in [-50, -10, -1, 0, 1, 10, 50] {
        let new_year = base_date.year() + years;
        // Calendar shifts preserve the day: non-leap February 29 is invalid.
        let expected = NaiveDate::from_ymd_opt(new_year, base_date.month(), base_date.day());
        check_js_add_years(&mut rt, base_date, years, expected).unwrap();
      }
    }
  }
}

fn check_js_add_days(
  rt: &mut Runtime,
  base_date: NaiveDate,
  days: i64,
  expected: NaiveDate,
) -> anyhow::Result<()> {
  let year = base_date.year();
  let month = base_date.month();
  let day = base_date.day();

  let namespace = rt
    .eval_module(&format!(
      r#"
        import {{ NaiveDate }} from "./naive-date.js";
        const nd = NaiveDate.fromYmd1Exp({year}, {month}, {day});
        const result = nd.addDays({days});
        export let resultStr = result.rfc3339();
      "#,
    ))
    .map_err(|e| {
      anyhow!("couldn't run module for addDays(y={year}, m={month}, d={day}, days={days}): {e}")
    })?;

  let result = namespace
    .get(js_string!("resultStr"), &mut rt.context)
    .map_err(|e| {
      anyhow!("couldn't get result for addDays(y={year}, m={month}, d={day}, days={days}): {e:?}")
    })?;

  let js_result = result
    .to_string(&mut rt.context)
    .map_err(|e| anyhow!("couldn't convert result to string for addDays(y={year}, m={month}, d={day}, days={days}): {e}"))?
    .to_std_string_lossy();

  let expected_str = expected.format("%Y-%m-%d").to_string();

  if expected_str != js_result {
    return Err(anyhow!(
      "addDays mismatch for base=(y={year}, m={month}, d={day}), days={days}: expected '{expected_str}', got '{js_result}'"
    ));
  }

  Ok(())
}

fn check_js_add_months(
  rt: &mut Runtime,
  base_date: NaiveDate,
  offset: i32,
  expected: Option<NaiveDate>,
) -> anyhow::Result<()> {
  check_js_calendar_shift(rt, base_date, "addMonths", offset, expected)
}

fn check_js_add_years(
  rt: &mut Runtime,
  base_date: NaiveDate,
  offset: i32,
  expected: Option<NaiveDate>,
) -> anyhow::Result<()> {
  check_js_calendar_shift(rt, base_date, "addYears", offset, expected)
}

fn check_js_subtract_days(
  rt: &mut Runtime,
  base_date: NaiveDate,
  days: i64,
  expected: NaiveDate,
) -> anyhow::Result<()> {
  let year = base_date.year();
  let month = base_date.month();
  let day = base_date.day();

  let namespace = rt
    .eval_module(&format!(
      r#"
        import {{ NaiveDate }} from "./naive-date.js";
        const nd = NaiveDate.fromYmd1Exp({year}, {month}, {day});
        // In JavaScript we implement subtraction as adding negative days
        const result = nd.addDays(-{days});
        export let resultStr = result.rfc3339();
      "#,
    ))
    .map_err(|e| {
      anyhow!(
        "couldn't run module for subtractDays(y={year}, m={month}, d={day}, days={days}): {e}"
      )
    })?;

  let result = namespace
    .get(js_string!("resultStr"), &mut rt.context)
    .map_err(|e| {
      anyhow!(
        "couldn't get result for subtractDays(y={year}, m={month}, d={day}, days={days}): {e:?}"
      )
    })?;

  let js_result = result
    .to_string(&mut rt.context)
    .map_err(|e| anyhow!("couldn't convert result to string for subtractDays(y={year}, m={month}, d={day}, days={days}): {e}"))?
    .to_std_string_lossy();

  let expected_str = expected.format("%Y-%m-%d").to_string();

  if expected_str != js_result {
    return Err(anyhow!(
      "subtractDays mismatch for base=(y={year}, m={month}, d={day}), days={days}: expected '{expected_str}', got '{js_result}'"
    ));
  }

  Ok(())
}

fn check_js_subtract_months(
  rt: &mut Runtime,
  base_date: NaiveDate,
  offset: i32,
  expected: Option<NaiveDate>,
) -> anyhow::Result<()> {
  check_js_calendar_shift(rt, base_date, "addMonths", -offset, expected)
}

fn check_js_subtract_years(
  rt: &mut Runtime,
  base_date: NaiveDate,
  offset: i32,
  expected: Option<NaiveDate>,
) -> anyhow::Result<()> {
  check_js_calendar_shift(rt, base_date, "addYears", -offset, expected)
}

fn check_js_difference_in_days(
  rt: &mut Runtime,
  date1: NaiveDate,
  date2: NaiveDate,
  expected_diff: i64,
) -> anyhow::Result<()> {
  let year1 = date1.year();
  let month1 = date1.month();
  let day1 = date1.day();

  let year2 = date2.year();
  let month2 = date2.month();
  let day2 = date2.day();

  let namespace = rt
    .eval_module(&format!(
      r#"
        import {{ NaiveDate }} from "./naive-date.js";
        const date1 = NaiveDate.fromYmd1Exp({year1}, {month1}, {day1});
        const date2 = NaiveDate.fromYmd1Exp({year2}, {month2}, {day2});
        export let diffDays = date2.differenceInDays(date1);
      "#,
    ))
    .map_err(|e| {
      anyhow!("couldn't run module for differenceInDays(date1='{date1}', date2='{date2}'): {e}")
    })?;

  let result = namespace
    .get(js_string!("diffDays"), &mut rt.context)
    .map_err(|e| {
      anyhow!("couldn't get result for differenceInDays(date1='{date1}', date2='{date2}'): {e:?}")
    })?;

  let js_result = result.as_number().ok_or_else(|| {
    anyhow!(
      "couldn't convert result to number for differenceInDays(date1='{date1}', date2='{date2}')"
    )
  })?;

  if (expected_diff as f64 - js_result).abs() > f64::EPSILON {
    return Err(anyhow!(
      "differenceInDays mismatch for date1='{date1}', date2='{date2}': expected '{expected_diff}', got '{js_result}'"
    ));
  }

  Ok(())
}

fn check_js_difference_in_months(
  rt: &mut Runtime,
  date1: NaiveDate,
  date2: NaiveDate,
  expected_diff: i32,
) -> anyhow::Result<()> {
  let year1 = date1.year();
  let month1 = date1.month();
  let day1 = date1.day();

  let year2 = date2.year();
  let month2 = date2.month();
  let day2 = date2.day();

  let namespace = rt
    .eval_module(&format!(
      r#"
        import {{ NaiveDate }} from "./naive-date.js";
        const date1 = NaiveDate.fromYmd1Exp({year1}, {month1}, {day1});
        const date2 = NaiveDate.fromYmd1Exp({year2}, {month2}, {day2});
        export let diffMonths = date2.differenceInMonths(date1);
      "#,
    ))
    .map_err(|e| {
      anyhow!("couldn't run module for differenceInMonths(date1='{date1}', date2='{date2}'): {e}")
    })?;

  let result = namespace
    .get(js_string!("diffMonths"), &mut rt.context)
    .map_err(|e| {
      anyhow!("couldn't get result for differenceInMonths(date1='{date1}', date2='{date2}'): {e:?}")
    })?;

  let js_result = result.as_number().ok_or_else(|| {
    anyhow!(
      "couldn't convert result to number for differenceInMonths(date1='{date1}', date2='{date2}')"
    )
  })?;

  if (expected_diff as f64 - js_result).abs() > f64::EPSILON {
    return Err(anyhow!(
      "differenceInMonths mismatch for date1='{date1}', date2='{date2}': expected '{expected_diff}', got '{js_result}'"
    ));
  }

  Ok(())
}

// The wire format remains RFC3339; validity is compared before reading it.
fn check_js_calendar_shift(
  rt: &mut Runtime,
  base_date: NaiveDate,
  method: &str,
  offset: i32,
  expected: Option<NaiveDate>,
) -> anyhow::Result<()> {
  let (year, month, day) = (base_date.year(), base_date.month(), base_date.day());
  let namespace = rt
    .eval_module(&format!(
      r#"
    import {{ NaiveDate }} from "./naive-date.js";
    const result = NaiveDate.fromYmd1Exp({year}, {month}, {day}).{method}({offset});
    export const resultStr = result.isValid() ? result.rfc3339() : "invalid";
  "#
    ))
    .map_err(|e| anyhow!("{method}({base_date}, {offset}) evaluation failed: {e}"))?;
  let actual = namespace
    .get(js_string!("resultStr"), &mut rt.context)
    .map_err(|e| anyhow!("{method} result unavailable: {e:?}"))?
    .to_string(&mut rt.context)
    .map_err(|e| anyhow!("{method} result conversion failed: {e}"))?
    .to_std_string_lossy();
  let expected = expected
    .map(|date| date.format("%Y-%m-%d").to_string())
    .unwrap_or_else(|| "invalid".to_owned());
  anyhow::ensure!(
    actual == expected,
    "{method} mismatch for {base_date}, offset={offset}: expected {expected}, got {actual}"
  );
  Ok(())
}

#[test]
#[should_panic(expected = "controlled parity mismatch")]
fn parity_mismatch_is_observable() {
  let mut rt = Runtime::env_test().expect("couldn't construct runtime");
  let base = NaiveDate::from_ymd_opt(2000, 1, 1).unwrap();
  let deliberately_wrong = NaiveDate::from_ymd_opt(2000, 3, 1);
  check_js_add_months(&mut rt, base, 1, deliberately_wrong).expect("controlled parity mismatch");
}
