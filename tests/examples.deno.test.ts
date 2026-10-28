/** Every example in `examples/` runs to completion (each checks its own output). */
import { assertEquals } from "@std/assert";

const dir = new URL("../examples/", import.meta.url);

for await (const entry of Deno.readDir(dir)) {
  if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
  Deno.test(`examples/${entry.name}`, async () => {
    const { code, stderr } = await new Deno.Command(Deno.execPath(), {
      args: ["run", "--no-prompt", new URL(entry.name, dir).pathname],
      stdout: "null",
      stderr: "piped",
    }).output();
    assertEquals(code, 0, new TextDecoder().decode(stderr));
  });
}
