// Unified build pipeline for the extension.
//
// Why not a single bundler for everything? The three entry points have
// different runtime constraints:
//  - background.ts runs as an MV3 service worker (type: "module" in the
//    manifest), so ESM output is fine and esbuild bundles it into one
//    dependency-free file.
//  - content.ts runs as a classic content script injected into the
//    Shutterstock page — it CANNOT use import/export at runtime, so esbuild
//    bundles it as a self-contained IIFE.
//  - the side panel is a full React app best served by Vite (HMR-friendly
//    dev workflow, asset hashing, etc).
//
// Running them through one script keeps `npm run build` a single command
// while giving each entry point the bundling behavior it actually needs.

import { build as esbuildBuild, context as esbuildContext } from "esbuild";
import { build as viteBuild } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyFile(src, destRelative) {
  const dest = path.join(dist, destRelative);
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function copyDir(srcDir, destRelative) {
  const dest = path.join(dist, destRelative);
  await fs.cp(srcDir, dest, { recursive: true });
}

const esbuildCommonOptions = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? "inline" : false,
  target: "es2022",
  logLevel: "info",
  define: {
    "import.meta.env.PROD": watch ? "false" : "true"
  }
};

async function buildBackground() {
  const options = {
    ...esbuildCommonOptions,
    entryPoints: [path.join(root, "src/background/background.ts")],
    outfile: path.join(dist, "src/background/background.js"),
    format: "esm",
    platform: "browser"
  };
  if (watch) {
    const ctx = await esbuildContext(options);
    await ctx.watch();
    return ctx;
  }
  await esbuildBuild(options);
  return null;
}

async function buildContent() {
  const options = {
    ...esbuildCommonOptions,
    entryPoints: [path.join(root, "src/content/content.ts")],
    outfile: path.join(dist, "src/content/content.js"),
    format: "iife",
    platform: "browser"
  };
  if (watch) {
    const ctx = await esbuildContext(options);
    await ctx.watch();
    return ctx;
  }
  await esbuildBuild(options);
  return null;
}

async function buildSidePanel() {
  await viteBuild({
    root,
    build: {
      watch: watch ? {} : undefined
    }
  });
}

async function copyStaticAssets() {
  await copyFile(path.join(root, "manifest.json"), "manifest.json");
  await copyFile(path.join(root, "src/content/content.css"), "src/content/content.css");
  await copyDir(path.join(root, "public"), "public");

  const readmeExists = await fs
    .access(path.join(root, "README.md"))
    .then(() => true)
    .catch(() => false);
  if (readmeExists) {
    await copyFile(path.join(root, "README.md"), "README.md");
  }
}

async function main() {
  await ensureDir(dist);
  console.log(`\n▶ Building Shutterstock AI Metadata Studio (${watch ? "watch" : "production"} mode)\n`);

  await Promise.all([buildBackground(), buildContent(), buildSidePanel()]);
  await copyStaticAssets();

  console.log("\n✔ Build complete. Load the `dist/` folder as an unpacked extension in chrome://extensions.\n");

  if (watch) {
    console.log("Watching for changes… (side panel via Vite, background/content via esbuild)\n");
  }
}

main().catch((err) => {
  console.error("Build failed:", err);
  process.exit(1);
});
