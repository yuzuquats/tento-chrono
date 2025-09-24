#[cfg(test)]
mod test {
  use anyhow::anyhow;
  use boa_engine::js_string;
  use tento_chrono_bindings::Runtime;

  #[test]
  #[ignore = "takes too long"]
  pub fn test_basic() -> anyhow::Result<()> {
    let mut rt = Runtime::new()?;

    {
      let namespace = rt.eval_module(
        r#"
        import { NaiveDate } from "./naive-date.js";
        const nd = NaiveDate.fromYmd1(2024, 1, 1);
        export let result = nd.dse;
      "#,
      )?;

      let result = namespace
        .get(js_string!("result"), &mut rt.context)
        .map_err(|e| anyhow!("couldn't get result: {e:?}"))?;
      println!("result = {}", result.display());
    }

    {
      let namespace = rt.eval_module(
        r#"
        import { NaiveDate } from "./naive-date.js";
        const ndp = NaiveDate.Partial.parse("y-2024");
        export let result = ndp.start.rfc3339();
      "#,
      )?;

      let result = namespace
        .get(js_string!("result"), &mut rt.context)
        .map_err(|e| anyhow!("couldn't get result: {e:?}"))?;
      println!("result = {}", result.display());
    }

    {
      let namespace = rt.eval_module(
        r#"
        import { NaiveDate } from "./naive-date.js";
        const ndp = NaiveDate.Partial.parse("y-2024");
        export let result = ndp.start.rfc3339();
      "#,
      )?;

      let result = namespace
        .get(js_string!("result"), &mut rt.context)
        .map_err(|e| anyhow!("couldn't get result: {e:?}"))?;
      println!("result = {}", result.display());
    }

    Ok(())
  }
}
