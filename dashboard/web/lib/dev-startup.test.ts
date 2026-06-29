import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

test("dev startup syncs the repo-root uv environment before Next starts", () => {
  const packageJson = JSON.parse(
    readFileSync(join(webRoot, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> };
  const startupScript = readFileSync(
    join(webRoot, "scripts", "dev-startup.sh"),
    "utf8",
  );
  const cacheLockScript = readFileSync(
    join(webRoot, "scripts", "next-cache-lock.sh"),
    "utf8",
  );
  const nextConfig = readFileSync(join(webRoot, "next.config.ts"), "utf8");

  assert.match(packageJson.scripts?.dev ?? "", /dev-startup\.sh/);
  assert.match(startupScript, /uv sync/);
  assert.match(startupScript, /Turbopack\/Next dev probes/);
  assert.match(startupScript, /\$repo_root\/src/);
  assert.match(startupScript, /\$web_root\/node_modules\/@opentelemetry/);
  assert.match(startupScript, /\$web_root\/\.next-internal\/server\/app/);
  assert.match(startupScript, /\$web_root\/node_modules\/next\/node_modules\/@swc/);
  assert.match(startupScript, /\$web_root\/node_modules\/next\/dist\/compiled\/@next\/react-refresh-utils\/internal/);
  assert.match(startupScript, /next-cache-lock\.sh/);
  assert.match(cacheLockScript, /rm -rf "\$cache_dir\/dev"/);
  assert.match(nextConfig, /outputFileTracingExcludes/);
  assert.match(nextConfig, /\.\/next\.config\.ts/);
  assert.match(nextConfig, /\.\/tests\/\*\*/);
});
