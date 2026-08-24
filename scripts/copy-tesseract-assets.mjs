import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");
const workerSource = join(projectRoot, "node_modules", "tesseract.js", "dist", "worker.min.js");
const coreSourceDir = join(projectRoot, "node_modules", "tesseract.js-core");
const targetDir = join(projectRoot, "public", "tesseract");
const coreTargetDir = join(targetDir, "core");

if (!existsSync(workerSource) || !existsSync(coreSourceDir)) {
  console.warn("[copy-tesseract-assets] Tesseract-Dateien wurden nicht gefunden – übersprungen.");
  process.exit(0);
}

mkdirSync(coreTargetDir, { recursive: true });
copyFileSync(workerSource, join(targetDir, "worker.min.js"));

for (const file of readdirSync(coreSourceDir)) {
  if (!/^tesseract-core.*\.(?:js|wasm)$/.test(file)) continue;
  copyFileSync(join(coreSourceDir, file), join(coreTargetDir, file));
}

console.log("[copy-tesseract-assets] OCR-Worker und WebAssembly-Kern nach public kopiert.");
