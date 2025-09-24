import { walkSync } from "jsr:@std/fs";
import { globToRegExp } from "jsr:@std/path";
import * as esbuild from "https://deno.land/x/esbuild@v0.24.0/mod.js";

const INPUT_DIR = "../chrono";
// Get OUTPUT_DIR from environment variable or use default
const OUTPUT_DIR = Deno.env.get("OUTPUT_DIR") || "./pkg";

console.log(`Building Deno files from ${INPUT_DIR} to ${OUTPUT_DIR}`);

const files = Array.from(
  walkSync(INPUT_DIR, {
    match: [
      globToRegExp("**/*.ts", {
        extended: true,
        globstar: true,
      }),
    ],
  }),
).map((ent) => ({
  path: ent.path,
  name: ent.name,
}));

try {
  //
  // 1) Clean build folder
  //
  try {
    await Deno.remove(OUTPUT_DIR, { recursive: true });
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err;
    }
  }

  //
  // 2) Rebuild
  //
  await esbuild.build({
    entryPoints: files
      .filter((f) => !f.path.endsWith(".deno.test.ts"))
      .map((f) => f.path),
    outdir: OUTPUT_DIR,
    bundle: true,
    format: "esm",
    plugins: [],
  });
} catch (e) {
  console.log("Failed to build", e);
}

esbuild.stop();
