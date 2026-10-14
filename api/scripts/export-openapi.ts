// Writes the generated OpenAPI document to api/openapi.json so the frontend
// can generate its types from it and CI can detect drift.
// Usage: npm run openapi:export
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.env.LOG_LEVEL ??= "silent";

const { createApp } = await import("../src/app.js");

// The spec is derived from route metadata; no handler runs, so no DB is needed.
const app = createApp({} as never);
const res = await app.request("/openapi.json");
if (!res.ok) {
  throw new Error(`openapi.json returned ${res.status}`);
}
const spec = await res.json();

const outPath = fileURLToPath(new URL("../openapi.json", import.meta.url));
writeFileSync(outPath, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`wrote ${outPath} (${Object.keys(spec.paths).length} paths)`);
