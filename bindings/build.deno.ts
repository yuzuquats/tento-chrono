import { walkSync } from "jsr:@std/fs";
import { globToRegExp } from "jsr:@std/path";
import * as esbuild from "https://deno.land/x/esbuild@v0.24.0/mod.js";

const INPUT_DIR = "../chrono";
const OUTPUT_DIR = Deno.env.get("OUTPUT_DIR") || "./pkg";

try {
  const files = Array.from(walkSync(INPUT_DIR, {
    match: [globToRegExp("**/*.ts", { extended: true, globstar: true })],
  })).map((entry) => entry.path)
    .filter((path) => !path.endsWith(".deno.test.ts")).sort();

  if (files.length === 0) throw new Error("No TypeScript entry points");
  // Cargo owns candidate allocation and publication. Never erase a valid package.
  await esbuild.build({
    entryPoints: files,
    outbase: INPUT_DIR,
    outdir: OUTPUT_DIR,
    bundle: true,
    format: "esm",
    plugins: [],
  });
} finally {
  // Build/traversal failures propagate as a nonzero Deno exit.
  esbuild.stop();
}
