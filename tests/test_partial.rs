#[cfg(test)]
mod test {
  use anyhow::anyhow;
  use boa_engine::js_string;
  use chrono::NaiveDate;
  use tento_chrono::{partial::PartialDate, year_month::YearMonth};
  use tento_chrono_bindings::Runtime;

  #[test]
  pub fn test_year_ctr() {
    let mut rt = Runtime::env_test().expect("couldn't construct runtime");
    for yr in 1970..2050 {
      check_js_partial_date(&mut rt, PartialDate::Y(yr));
    }
  }

  #[test]
  pub fn test_year_month_ctr() {
    let mut rt = Runtime::env_test().expect("couldn't construct runtime");
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
      let mut rt = Runtime::env_test().expect("couldn't construct runtime");
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
      let mut rt = Runtime::env_test().expect("couldn't construct runtime");
      for week in 1..53 {
        let Some(_) = NaiveDate::from_isoywd_opt(yr, week, chrono::Weekday::Mon) else {
          continue;
        };
        check_js_partial_date(&mut rt, PartialDate::Yw { yr, week });
      }
    }
  }

  #[test]
  fn signed_and_zero_year_exchange() {
    let mut rt = Runtime::env_test().expect("runtime");
    for yr in [-262143_i32, -44, -1, 0, 1, 2024, 262142] {
      for text in [format!("y-{yr}"), format!("ym-{yr}-3"),
                   format!("ymd-{yr}-3-15"), format!("yw-{yr}-10")] {
        let partial = PartialDate::parse(&text).expect("shared valid date");
        let wire = serde_json::to_string(&partial).unwrap();
        let namespace = rt.eval_module(&format!(r#"
          import {{ PartialDate }} from "./units/partial-date.js";
          const value = PartialDate.parse({wire}).exp();
          export const result = Math.abs(value.yr) > 2024 ? value.toString() : `${{value.toString()}}|${{value.start.dse}}|${{value.end.dse}}`;
        "#)).expect("exchange module");
        let result = namespace.get(js_string!("result"), &mut rt.context).unwrap()
          .to_string(&mut rt.context).unwrap().to_std_string_lossy();
        let epoch = NaiveDate::from_ymd_opt(1970, 1, 1).unwrap();
        let fields: Vec<_> = result.split('|').collect();
        assert_eq!(PartialDate::parse(fields[0]).unwrap().to_string(), partial.to_string());
        if yr.abs() <= 2024 {
          assert_eq!(fields[1].parse::<i64>().unwrap(), partial.start().unwrap().signed_duration_since(epoch).num_days());
          assert_eq!(fields[2].parse::<i64>().unwrap(), partial.end().signed_duration_since(epoch).num_days());
        }
      }
    }
    // Existing start/end comparison is valid away from terminal chrono bounds.
    for text in ["ym-0-2", "ymd-0-2-29", "ym-+2024-02"] {
      check_js_partial_date(&mut rt, PartialDate::parse(text).unwrap());
    }
  }

  fn check_js_partial_date(rt: &mut Runtime, partial: PartialDate) {
    let partial_ser_rs = partial.to_string();

    // Check Start
    {
      let namespace = rt
        .eval_module(&format!(
          r#"
        import {{ PartialDate }} from "./units/partial-date.js";
        const ndp = PartialDate.parse("{partial_ser_rs}").exp();
        export let result = ndp.start.rfc3339();
      "#,
        ))
        .expect("couldn't run module");

      let result = namespace
        .get(js_string!("result"), &mut rt.context)
        .map_err(|e| anyhow!("couldn't get result: {e:?}"))
        .expect("couldn't get result");

      assert_eq!(
        partial.start().expect("a real date").to_string(),
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
        import {{ PartialDate }} from "./units/partial-date.js";
        const ndp = PartialDate.parse("{partial_ser_rs}").exp();
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
