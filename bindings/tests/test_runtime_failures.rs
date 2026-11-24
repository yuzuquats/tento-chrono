//! Observable error and reuse contracts for the Boa test harness.
//! No network, external process, timer, or mutable package fixture is needed.
use boa_engine::js_string;
use tento_chrono_bindings::Runtime;

fn assert_working_export(runtime: &mut Runtime) {
    let namespace = runtime
        .eval_module(
            r#"import { NaiveDate } from "./naive-date.js";
               export const result = NaiveDate.fromYmd1Exp(1970, 1, 1).dse;"#,
        )
        .expect("a valid generated module must work after a failed evaluation");
    let value = namespace
        .get(js_string!("result"), &mut runtime.context)
        .expect("result must be readable");
    assert_eq!(value.as_number(), Some(0.0), "epoch export must equal zero");
}

fn assert_failure_then_recovery(source: &str, context: &str) {
    let mut runtime = Runtime::env_test().expect("generated package must load");
    let error = runtime.eval_module(source).expect_err("invalid module must fail");
    assert!(
        error.to_string().contains(context),
        "expected error context {context:?}, got {error:#}"
    );
    // Reuse is supported for a fresh entry module after these failures. This
    // does not promise repair/reload of an already cached failed dependency.
    assert_working_export(&mut runtime);
    assert_working_export(&mut runtime);
}

#[test]
fn nonexistent_explicit_package_root_is_an_error() {
    let absent = std::env::current_exe()
        .expect("test executable path")
        .join("absent-chrono-package-root");
    assert!(!absent.exists(), "fixture must be absent");
    let error = Runtime::new(absent).err().expect("missing root must fail");
    assert!(error.to_string().contains("module loader"), "{error:#}");
    // Construction failed, so recovery consists of constructing a new runtime.
    let mut runtime = Runtime::env_test().expect("real root must still work");
    assert_working_export(&mut runtime);
}

#[test]
fn invalid_javascript_returns_parse_error_and_runtime_recovers() {
    assert_failure_then_recovery("export const result = ;", "parse module");
}

#[test]
fn missing_import_returns_rejection_and_runtime_recovers() {
    assert_failure_then_recovery(
        r#"import "./absent-runtime-failure-fixture-77c1a8.js"; export const result = 42;"#,
        "promise rejected",
    );
}

#[test]
fn synchronous_throw_returns_rejection_and_runtime_recovers() {
    assert_failure_then_recovery(
        r#"throw new Error("synthetic runtime failure");"#,
        "promise rejected",
    );
}

#[test]
fn rejected_await_returns_rejection_and_runtime_recovers() {
    assert_failure_then_recovery(
        r#"await Promise.reject(new Error("synthetic rejected evaluation"));"#,
        "promise rejected",
    );
}

#[test]
fn opaque_throw_returns_rejection_and_runtime_recovers() {
    assert_failure_then_recovery(r#"throw "synthetic opaque rejection";"#, "promise rejected");
}

#[test]
fn unresolved_await_returns_pending_error_and_runtime_recovers() {
    assert_failure_then_recovery(
        "await new Promise(() => {});",
        "module didn't execute",
    );
}
