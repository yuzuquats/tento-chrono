/**
 * Gives a test file a page to run on. The zone loader derives its static
 * origin from the page's own domain and names no server of its own, so a test
 * that drives the served loader under Deno, where there is no page, imports
 * this module first: `import "./page.deno.ts";`. The loader then asks
 * `https://static.example.com`, which those tests answer with a stubbed fetch.
 */
Object.defineProperty(globalThis, "location", {
  configurable: true,
  value: { hostname: "calendar.example.com" },
});
