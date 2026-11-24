use std::{
  env, fs, io,
  path::{Path, PathBuf},
  process::{Command, ExitStatus},
  thread,
  time::{Duration, Instant},
};

const INPUT_DIR: &str = "../chrono";
const RECEIPT: &str = "checksum.txt";

fn main() {
  run().expect("Failed to build tento-chrono bindings");
}

fn run() -> io::Result<()> {
  let output = PathBuf::from(env::var_os("OUT_DIR").expect("OUT_DIR")).join("pkg");
  let sources = sources()?;
  let expected = expected_outputs(&sources)?;
  let identity = identity(&sources)?;
  if valid(&output, &identity, &expected) {
    println!("cargo:warning=[Deno] Skipping rebuild (verified package)");
  } else {
    build(&output, &identity, &expected)?;
  }
  println!("cargo:rustc-env=PKG_DIR={}", output.display());
  // Also detect removed or corrupted generated outputs on the next Cargo invocation.
  println!("cargo:rerun-if-changed={}", output.display());
  Ok(())
}

fn collect(dir: &Path, files: &mut Vec<PathBuf>) -> io::Result<()> {
  println!("cargo:rerun-if-changed={}", dir.display());
  for entry in fs::read_dir(dir)? {
    let entry = entry?;
    let path = entry.path();
    let kind = entry.file_type()?;
    if kind.is_symlink() {
      return Err(io::Error::other(format!(
        "Symlink input is unsupported: {}",
        path.display()
      )));
    }
    if kind.is_dir() {
      collect(&path, files)?;
    } else if path.extension().and_then(|s| s.to_str()) == Some("ts") {
      files.push(path);
    }
  }
  Ok(())
}

fn sources() -> io::Result<Vec<PathBuf>> {
  let mut files = Vec::new();
  collect(Path::new(INPUT_DIR), &mut files)?;
  files.sort();
  if files.is_empty() {
    return Err(io::Error::other("No TypeScript inputs"));
  }
  Ok(files)
}

// Fixed FNV-1a is a deterministic local freshness checksum, not a security signature.
fn digest(parts: impl IntoIterator<Item = Vec<u8>>) -> String {
  let mut hash = 0xcbf29ce484222325u64;
  for part in parts {
    for byte in (part.len() as u64).to_le_bytes().into_iter().chain(part) {
      hash ^= u64::from(byte);
      hash = hash.wrapping_mul(0x100000001b3);
    }
  }
  format!("{hash:016x}")
}

fn identity(sources: &[PathBuf]) -> io::Result<String> {
  let mut parts = vec![b"chrono-bindings-cache-v2".to_vec()];
  for path in sources.iter().cloned().chain(
    [
      "build.rs",
      "build.deno.ts",
      "deno.json",
      "deno.lock",
      "../deno.json",
      "../deno.lock",
    ]
    .map(PathBuf::from),
  ) {
    println!("cargo:rerun-if-changed={}", path.display());
    parts.push(path.to_string_lossy().as_bytes().to_vec());
    parts.push(fs::read(path)?);
  }
  // Deno includes its V8 and TypeScript versions; esbuild and remote dependencies
  // are pinned by the recipe and the frozen bindings lock.
  println!("cargo:rerun-if-env-changed=PATH");
  let tool = Command::new("deno").arg("--version").output()?;
  if !tool.status.success() {
    return Err(io::Error::other("deno --version failed"));
  }
  parts.push(tool.stdout);
  Ok(digest(parts))
}

fn expected_outputs(sources: &[PathBuf]) -> io::Result<Vec<PathBuf>> {
  let mut expected = Vec::new();
  for source in sources {
    if source.to_string_lossy().ends_with(".deno.test.ts") {
      continue;
    }
    expected.push(
      source
        .strip_prefix(INPUT_DIR)
        .map_err(io::Error::other)?
        .with_extension("js"),
    );
  }
  expected.sort();
  Ok(expected)
}

fn output_receipt(output: &Path, identity: &str, expected: &[PathBuf]) -> io::Result<String> {
  let mut actual = Vec::new();
  fn visit(root: &Path, path: &Path, actual: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(path)? {
      let entry = entry?;
      let path = entry.path();
      let kind = entry.file_type()?;
      if kind.is_dir() {
        visit(root, &path, actual)?;
      } else if kind.is_file() {
        let relative = path.strip_prefix(root).map_err(io::Error::other)?;
        if relative != Path::new(RECEIPT) {
          actual.push(relative.to_owned());
        }
      } else {
        return Err(io::Error::other("Unexpected non-file package entry"));
      }
    }
    Ok(())
  }
  visit(output, output, &mut actual)?;
  actual.sort();
  if actual != expected {
    return Err(io::Error::other(
      "Incomplete or unexpected generated module set",
    ));
  }
  let mut parts = Vec::new();
  for path in expected {
    let bytes = fs::read(output.join(path))?;
    parts.push(path.to_string_lossy().as_bytes().to_vec());
    parts.push(bytes);
  }
  Ok(format!("{identity}\n{}\n", digest(parts)))
}

fn valid(output: &Path, identity: &str, expected: &[PathBuf]) -> bool {
  match (
    output_receipt(output, identity, expected),
    fs::read_to_string(output.join(RECEIPT)),
  ) {
    (Ok(current), Ok(previous)) => current == previous,
    _ => false,
  }
}

fn terminate(child: &mut std::process::Child) -> io::Result<()> {
  // Deno's esbuild service inherits this isolated process group. Inherit output
  // streams rather than capturing pipes that a stalled descendant can hold open.
  #[cfg(unix)]
  {
    let status = Command::new("kill")
      .args(["-KILL", "--", &format!("-{}", child.id())])
      .status()?;
    if !status.success() {
      child.kill()?;
    }
  }
  #[cfg(not(unix))]
  child.kill()?;
  Ok(())
}

fn bounded(command: &mut Command, deadline: Duration) -> io::Result<ExitStatus> {
  #[cfg(unix)]
  {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
  }
  let mut child = command.spawn()?;
  let start = Instant::now();
  loop {
    if let Some(status) = child.try_wait()? {
      // Clear any service descendants even when the parent exited unsuccessfully.
      #[cfg(unix)]
      {
        let _ = Command::new("kill")
          .args(["-KILL", "--", &format!("-{}", child.id())])
          .stdout(std::process::Stdio::null())
          .stderr(std::process::Stdio::null())
          .status();
      }
      return Ok(status);
    }
    if start.elapsed() >= deadline {
      let killed = terminate(&mut child);
      let reaped = child.wait();
      killed?;
      reaped?;
      return Err(io::Error::new(
        io::ErrorKind::TimedOut,
        "Deno build exceeded 60 seconds",
      ));
    }
    thread::sleep(Duration::from_millis(20));
  }
}

fn build(output: &Path, identity: &str, expected: &[PathBuf]) -> io::Result<()> {
  let parent = output.parent().expect("package parent");
  fs::create_dir_all(parent)?;
  let staging = parent.join(format!("pkg-staging-{}", std::process::id()));
  let backup = parent.join(format!("pkg-previous-{}", std::process::id()));
  // Unique process-owned candidate; never remove another invocation's allocation.
  fs::create_dir(&staging)?;
  let result = (|| {
    let status = bounded(
      Command::new("deno")
        .args([
          "run",
          "--frozen",
          "--cached-only",
          "--no-prompt",
          "--node-modules-dir=none",
          "--allow-all",
          "build.deno.ts",
        ])
        .env("OUTPUT_DIR", &staging),
      Duration::from_secs(60),
    )?;
    if !status.success() {
      return Err(io::Error::other(format!("Deno build failed: {status}")));
    }
    let receipt = output_receipt(&staging, identity, expected)?;
    fs::write(staging.join(RECEIPT), receipt)?;
    let had_previous = output.exists();
    if had_previous {
      fs::rename(output, &backup)?;
    }
    if let Err(error) = fs::rename(&staging, output) {
      if had_previous {
        fs::rename(&backup, output)?;
      }
      return Err(error);
    }
    if had_previous {
      fs::remove_dir_all(&backup)?;
    }
    println!("cargo:warning=[Deno] Built verified package");
    Ok(())
  })();
  if staging.exists() {
    fs::remove_dir_all(staging)?;
  }
  result
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn identity_is_ordered_and_framed() {
    assert_ne!(
      digest([b"a".to_vec(), b"bc".to_vec()]),
      digest([b"ab".to_vec(), b"c".to_vec()])
    );
    assert_ne!(
      digest([b"a".to_vec(), b"b".to_vec()]),
      digest([b"b".to_vec(), b"a".to_vec()])
    );
  }
  #[test]
  fn module_membership_excludes_tests_and_preserves_directories() {
    assert_eq!(
      expected_outputs(&[
        PathBuf::from("../chrono/mod.ts"),
        PathBuf::from("../chrono/units/a.ts"),
        PathBuf::from("../chrono/units/a.deno.test.ts"),
      ])
      .unwrap(),
      vec![PathBuf::from("mod.js"), PathBuf::from("units/a.js")]
    );
  }
}

#[cfg(test)]
mod integrity_tests {
  use super::*;
  #[test]
  fn receipt_rejects_missing_extra_and_corrupt_modules() {
    let root = PathBuf::from(env::var_os("BINDINGS_TEST_TMP").expect("controlled test storage"));
    let output = root.join(format!("integrity-{}", std::process::id()));
    fs::create_dir(&output).unwrap();
    let expected = vec![PathBuf::from("mod.js"), PathBuf::from("types.js")];
    fs::write(output.join("mod.js"), "export const value = 1;").unwrap();
    fs::write(output.join("types.js"), "").unwrap();
    let receipt = output_receipt(&output, "inputs", &expected).unwrap();
    fs::write(output.join(RECEIPT), receipt).unwrap();
    assert!(valid(&output, "inputs", &expected));
    assert!(!valid(&output, "changed recipe", &expected));
    fs::write(output.join("mod.js"), "corrupted").unwrap();
    assert!(!valid(&output, "inputs", &expected));
    fs::remove_file(output.join("types.js")).unwrap();
    assert!(output_receipt(&output, "inputs", &expected).is_err());
    fs::write(output.join("types.js"), "").unwrap();
    fs::write(output.join("unexpected.js"), "").unwrap();
    assert!(output_receipt(&output, "inputs", &expected).is_err());
    fs::remove_dir_all(output).unwrap();
  }
  #[test]
  fn failed_candidate_preserves_previous_package() {
    let root = PathBuf::from(env::var_os("BINDINGS_TEST_TMP").expect("controlled test storage"));
    let output = root.join(format!("previous-{}", std::process::id()));
    fs::create_dir(&output).unwrap();
    fs::write(output.join("keeper.js"), "previous package").unwrap();
    // The real generator succeeds, but the deliberately mismatched required set
    // rejects the candidate before publication.
    assert!(build(&output, "new inputs", &[PathBuf::from("absent.js")]).is_err());
    assert_eq!(
      fs::read_to_string(output.join("keeper.js")).unwrap(),
      "previous package"
    );
    assert_eq!(fs::read_dir(&output).unwrap().count(), 1);
    fs::remove_dir_all(output).unwrap();
  }
  #[cfg(unix)]
  #[test]
  fn subprocess_failure_and_deadline_are_propagated() {
    assert!(
      !bounded(
        Command::new("sh").args(["-c", "exit 7"]),
        Duration::from_secs(1)
      )
      .unwrap()
      .success()
    );
    let start = Instant::now();
    let error = bounded(
      Command::new("sh").args(["-c", "sleep 30 & wait"]),
      Duration::from_millis(100),
    )
    .unwrap_err();
    assert_eq!(error.kind(), io::ErrorKind::TimedOut);
    assert!(start.elapsed() < Duration::from_secs(2));
  }
}
