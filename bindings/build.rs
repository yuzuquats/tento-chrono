use std::fs::OpenOptions;
use std::{
  collections::hash_map::DefaultHasher,
  env,
  fs::{self},
  hash::{Hash, Hasher},
  io::Write,
  path::{Path, PathBuf},
  process::Command,
};

const INPUT_DIR: &str = "../chrono";

fn main() {
  let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
  let package_location = PathBuf::from(env::var("LONA_JS_CHRONO_OUTPUT_JS").unwrap());

  println!(
    "cargo:warning=Building tento-chrono bindings to {}",
    out_dir.display()
  );
  println!(
    "cargo:warning=tento-chrono/package_location: {}",
    package_location.display()
  );

  let mut file = OpenOptions::new()
    .write(true)
    .create(true)
    .truncate(true)
    .open(package_location)
    .unwrap();
  let output_dir = out_dir.join("pkg");

  println!("cargo:rerun-if-changed=build.rs");
  println!("cargo:rerun-if-changed=build.deno.ts");

  add_ts_files_as_dependencies();
  if should_rebuild_js_files(&output_dir) {
    build_pkg_directory(&output_dir);
  } else {
    println!("cargo:warning=[Deno] Skipping rebuild");
  }
  file
    .write_all(output_dir.to_str().expect("output dir not str").as_bytes())
    .expect("couldn't write output_dir");

  println!("cargo:rustc-env=PKG_DIR={}", output_dir.display());
}

fn add_ts_files_as_dependencies() {
  let input_path = Path::new(INPUT_DIR);
  if !input_path.exists() || !input_path.is_dir() {
    return;
  }
  visit_ts_files(input_path);
}

fn visit_ts_files(dir: &Path) {
  let Ok(entries) = std::fs::read_dir(dir) else {
    return;
  };
  for entry in entries.filter_map(Result::ok) {
    let path = entry.path();
    if path.is_dir() {
      visit_ts_files(&path);
    } else if path.extension().and_then(|s| s.to_str()) == Some("ts") {
      println!(
        "cargo:rerun-if-changed={}",
        path.to_str().expect("file not stringable")
      );
    }
  }
}

fn should_rebuild_js_files(output_dir: &PathBuf) -> bool {
  if !output_dir.exists() {
    println!(
      "cargo:warning=Output directory doesn't exist, rebuilding JS files {:?}",
      output_dir.to_str()
    );
    return true;
  }

  let has_files = fs::read_dir(output_dir)
    .map(|entries| {
      entries
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|s| s.to_str()) == Some("js"))
        .count()
        > 0
    })
    .unwrap_or(false);
  if !has_files {
    println!("cargo:warning=No JS files found in output directory, rebuilding");
    return true;
  }

  let checksum_file = output_dir.join("checksum.txt");
  if !checksum_file.exists() {
    println!("cargo:warning=Checksum file not found, rebuilding JS files");
    return true;
  }

  let Ok(previous_checksum) = fs::read_to_string(&checksum_file) else {
    println!("cargo:warning=Failed to read checksum file, rebuilding JS files");
    return true;
  };

  let current_checksum = calculate_ts_checksum();
  println!(
    "cargo:warning=Comparing Checksums curr='{current_checksum}' prev='{previous_checksum}' prev-file='{}'",
    checksum_file.display()
  );
  if current_checksum != previous_checksum {
    println!("cargo:warning=TS files have changed, rebuilding JS files");
    return true;
  }

  // If we've made it here, the output directory exists, has JS files, and checksums match
  false
}

// Build the pkg directory using Deno
fn build_pkg_directory(output_dir: &PathBuf) {
  println!(
    "cargo:warning=[Deno] Building bindings in {} to {}",
    INPUT_DIR,
    output_dir.display()
  );

  // Clean existing pkg directory if it exists
  if output_dir.exists() {
    println!("cargo:warning=[Deno] Cleaning existing pkg directory");
    fs::remove_dir_all(output_dir).expect("Failed to remove existing pkg directory");
  }

  // Create a new pkg directory
  fs::create_dir_all(output_dir).expect("Failed to create pkg directory");

  // Set custom OUTPUT_DIR environment variable for the Deno script
  let output_dir_str = output_dir.to_string_lossy().to_string();

  // Run the Deno script - don't capture output to show progress in real-time
  println!("cargo:warning=[Deno] Running Deno build script");

  let status = Command::new("deno")
    .args([
      "run",
      "--node-modules-dir=auto",
      "--allow-all",
      "build.deno.ts",
    ])
    .env("OUTPUT_DIR", &output_dir_str)
    .status()
    .expect("Failed to run Deno script");

  if !status.success() {
    panic!("Deno script failed with status {}", status);
  }

  // Make sure the pkg directory contains files
  let has_files = fs::read_dir(output_dir)
    .map(|entries| entries.count() > 0)
    .unwrap_or(false);

  if !has_files {
    panic!("Deno build script didn't create any files in pkg directory");
  }

  // Calculate and write checksum of TS files to track changes
  let checksum = calculate_ts_checksum();
  let checksum_file = output_dir.join("checksum.txt");
  fs::write(&checksum_file, &checksum).expect("Failed to write checksum file");
  println!(
    "cargo:rerun-if-changed={}",
    checksum_file.to_str().expect("file not stringable")
  );
  println!(
    "cargo:warning=[Deno] Wrote checksum '{checksum}' to {:?}",
    checksum_file.display()
  );

  println!(
    "cargo:warning=[Deno] Successfully built JS files in {}",
    output_dir.display()
  );
}

// Function to calculate a hash/checksum of all TS files
fn calculate_ts_checksum() -> String {
  let mut hasher = DefaultHasher::new();
  let input_path = Path::new(INPUT_DIR);

  if !input_path.exists() || !input_path.is_dir() {
    return "empty".to_string();
  }

  let mut ts_files = Vec::new();
  collect_ts_files(input_path, &mut ts_files);

  // Sort to ensure consistent order
  ts_files.sort();

  for file_path in ts_files {
    // Hash the file path
    file_path.hash(&mut hasher);

    // Read and hash the file contents
    if let Ok(content) = fs::read(&file_path) {
      content.hash(&mut hasher);
    }
  }

  format!("{:x}", hasher.finish())
}

// Helper to collect all TS files recursively
fn collect_ts_files(dir: &Path, result: &mut Vec<PathBuf>) {
  if let Ok(entries) = fs::read_dir(dir) {
    for entry in entries.filter_map(Result::ok) {
      let path = entry.path();
      if path.is_dir() {
        collect_ts_files(&path, result);
      } else if path.extension().and_then(|s| s.to_str()) == Some("ts") {
        result.push(path);
      }
    }
  }
}
