#[cfg(test)]
mod test {
  use anyhow::anyhow;
  use boa_engine::js_string;
  use chrono::NaiveDate;
  use tento_chrono::{partial::PartialDate, year_month::YearMonth};
  use tento_chrono_bindings::Runtime;

  #[test]
  #[ignore = "takes a long time"]
  pub fn test_year_ctr() {
    let mut rt = Runtime::new_from_env().expect("couldn't construct runtime");
    for yr in 1970..2050 {
      check_js_partial_date(&mut rt, PartialDate::Y(yr));
    }
  }

  #[test]
  #[ignore = "takes a long time"]
  pub fn test_year_month_ctr() {
    let mut rt = Runtime::new_from_env().expect("couldn't construct runtime");
    for yr in 1970..2050 {
      for mth1 in 1..12 {
        check_js_partial_date(&mut rt, PartialDate::Ym(YearMonth { yr, mth1 }));
      }
    }
  }

  #[test]
  #[ignore = "takes a long time"]
  pub fn test_year_month_day_ctr() {
    for yr in 1970..2050 {
      let mut rt = Runtime::new_from_env().expect("couldn't construct runtime");
      for mth1 in 1..12 {
        for day1 in 1..31 {
          let Some(nd) = NaiveDate::from_ymd_opt(yr, mth1, day1) else {
            continue;
          };
          check_js_partial_date(&mut rt, PartialDate::Ymd(nd));
        }
      }
    }
  }

  #[test]
  #[ignore = "takes a long time"]
  pub fn test_year_week_ctr() {
    for yr in 1970..2050 {
      let mut rt = Runtime::new_from_env().expect("couldn't construct runtime");
      for week in 1..53 {
        let Some(_) = NaiveDate::from_isoywd_opt(yr, week, chrono::Weekday::Mon) else {
          continue;
        };
        check_js_partial_date(&mut rt, PartialDate::Yw { yr, week });
      }
    }
  }

  fn check_js_partial_date(rt: &mut Runtime, partial: PartialDate) {
    let partial_ser_rs = partial.to_string();

    // Check Start
    {
      let namespace = rt
        .eval_module(&format!(
          r#"
        import {{ NaiveDate }} from "./naive-date.js";
        const ndp = NaiveDate.Partial.parse("{partial_ser_rs}");
        export let result = ndp.start.rfc3339();
      "#,
        ))
        .expect("couldn't run module");

      let result = namespace
        .get(js_string!("result"), &mut rt.context)
        .map_err(|e| anyhow!("couldn't get result: {e:?}"))
        .expect("couldn't get result");

      assert_eq!(
        partial.start().to_string(),
        result
          .to_string(&mut rt.context)
          .expect("couldn't get string")
          .to_std_string_lossy()
      );
    }

    // Check End
    {
      let namespace = rt
        .eval_module(&format!(
          r#"
        import {{ NaiveDate }} from "./naive-date.js";
        const ndp = NaiveDate.Partial.parse("{partial_ser_rs}");
        export let result = ndp.end.rfc3339();
      "#,
        ))
        .expect("couldn't run module");

      let result = namespace
        .get(js_string!("result"), &mut rt.context)
        .map_err(|e| anyhow!("couldn't get result: {e:?}"))
        .expect("couldn't get result");

      assert_eq!(
        partial.end().to_string(),
        result
          .to_string(&mut rt.context)
          .expect("couldn't get string")
          .to_std_string_lossy()
      );
    }
  }
}
