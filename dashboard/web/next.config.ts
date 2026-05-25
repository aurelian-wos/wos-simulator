import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

const pollIntervalMs = Number(process.env.NEXT_WATCH_POLL_INTERVAL_MS ?? 0);
const distDir = process.env.NEXT_DIST_DIR ?? ".next";
const repoRoot = path.resolve(__dirname, "../..");
const v3SourceRoot = fs.existsSync(path.resolve(__dirname, "../../src"))
  ? path.resolve(__dirname, "../../src")
  : path.resolve(__dirname, "../../v3/src");
const v3DistRoot = fs.existsSync(path.resolve(__dirname, "../../dist"))
  ? path.resolve(__dirname, "../../dist")
  : path.resolve(__dirname, "../../v3/dist");
const v3AliasRoot = process.env.NEXT_V3_DIST === "1" ? v3DistRoot : v3SourceRoot;
const v3TurbopackAliases: NonNullable<NonNullable<NextConfig["turbopack"]>["resolveAlias"]> = process.env.NEXT_V3_DIST === "1"
  ? {
      "@v3/config": "../../v3/dist/config.js",
      "@v3/simulator": "../../v3/dist/simulator.js",
      "@v3/types": "../../v3/dist/types.js",
      "@v3": "../../v3/dist",
    }
  : {
      "@v3": "../../v3/src",
    };

const nextConfig: NextConfig = {
  distDir,
  serverExternalPackages: ["better-sqlite3"],
  allowedDevOrigins: [
    "wos-sim.ratme.org",
    "localhost",
    "localhost:3000",
    "127.0.0.1",
    "127.0.0.1:3000",
  ],
  // Prevent Next.js from walking up to the home-directory package-lock.json
  // and misidentifying the workspace root.
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
    resolveAlias: v3TurbopackAliases,
  },
  ...(pollIntervalMs > 0
    ? {
        watchOptions: {
          pollIntervalMs,
        },
      }
    : {}),
  // This is a purely dynamic app; skip static prerender of all pages.
  // Avoids the Next.js 15.x bug where /_not-found prerender fails with
  // "Cannot read properties of null (reading 'useOptimistic')" when the
  // layout contains Link components.
  experimental: {
    // Force all pages to be dynamically rendered at request time.
    // This bypasses the broken /_not-found static prerender in Next.js 15.5.x.
  },
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@v3": v3AliasRoot,
    };
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".js"],
    };
    return config;
  },
};

export default nextConfig;
