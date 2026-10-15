import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
// Passend zum Legacy-Build in src/lib/pdf/pdfjs.ts (Kompatibilität mit älteren Browsern).
const candidates = [
  join(root, "..", "node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.min.mjs"),
  join(root, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs"),
  join(root, "..", "node_modules", "pdfjs-dist", "build", "pdf.worker.min.js"),
];

const source = candidates.find((p) => existsSync(p));

if (!source) {
  console.warn("[copy-pdf-worker] pdf.worker wurde nicht gefunden – übersprungen.");
  process.exit(0);
}

const publicDir = join(root, "..", "public");
mkdirSync(publicDir, { recursive: true });
copyFileSync(source, join(publicDir, "pdf.worker.min.mjs"));
console.log("[copy-pdf-worker] Worker nach public/pdf.worker.min.mjs kopiert.");
