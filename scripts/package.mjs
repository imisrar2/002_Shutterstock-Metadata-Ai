// Zips the built `dist/` folder into a Chrome-Web-Store-ready archive.
// Uses the system `zip` binary (available on macOS/Linux; on Windows, run
// this via WSL/Git Bash, or simply zip the `dist` folder manually).

import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "dist");
const outFile = path.join(root, "shutterstock-ai-metadata-studio.zip");

if (!fs.existsSync(dist)) {
  console.error('dist/ not found. Run "npm run build" first.');
  process.exit(1);
}

if (fs.existsSync(outFile)) {
  fs.rmSync(outFile);
}

execSync(`cd "${dist}" && zip -r "${outFile}" . -x ".*"`, { stdio: "inherit" });

console.log(`\n✔ Packaged extension: ${outFile}\n`);
