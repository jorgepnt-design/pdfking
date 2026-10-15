/**
 * CoroaPDF App-Icon-Generator
 * Zeichnet das kräftige C mit goldener Krone (Vorlage: assets/app-icon.svg)
 * und exportiert alle benötigten Größen als PNG – ohne externe Abhängigkeiten.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "..", "public", "icons");

/* ---------------- PNG-Encoding ---------------- */

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** PNG ohne Alphakanal (RGB) – iOS erwartet Homescreen-Icons ohne Transparenz. */
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const source = (y * width + x) * 4;
      const target = row + 1 + x * 3;
      raw[target] = rgba[source];
      raw[target + 1] = rgba[source + 1];
      raw[target + 2] = rgba[source + 2];
    }
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

/* ---------------- Zeichen-Helfer ---------------- */

const MASTER = 2048;

function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/* ---------------- Layout (Koordinaten im 1024er-Raster, siehe assets/app-icon.svg) ---------------- */

const BG_A = hex("#11a35c");
const BG_B = hex("#064d29");
const WHITE = hex("#ffffff");
const RED = hex("#e52535");
const GOLD_LIGHT = hex("#ffe08a");
const GOLD_DARK = hex("#f0a500");
const GOLD_EDGE = hex("#a86f00");

const S = MASTER;
const U = S / 1024;

// Kräftiges C: Kreisbogen mit Öffnung nach rechts und runden Enden
const C_CX = 491.6 * U;
const C_CY = 600 * U;
const C_R = 215 * U;
const C_HALF = 60 * U;
const C_OPEN = Math.atan2(120, 178.4);
const C_CAPS = [
  [C_CX + C_R * Math.cos(-C_OPEN), C_CY + C_R * Math.sin(-C_OPEN)],
  [C_CX + C_R * Math.cos(C_OPEN), C_CY + C_R * Math.sin(C_OPEN)],
];

// Goldene Krone (Polygon) mit Kronreif, rotem Edelstein und zwei Perlen
const CROWN = [
  [300, 340],
  [280, 170],
  [410, 250],
  [512, 120],
  [614, 250],
  [744, 170],
  [724, 340],
].map(([x, y]) => [x * U, y * U]);
const CROWN_TOP = 120 * U;
const CROWN_BOTTOM = 340 * U;
const BAND = { x0: 300 * U, y0: 330 * U, x1: 724 * U, y1: 370 * U, r: 14 * U };
const OUTLINE = 5 * U;
const JEWEL = { x: 512 * U, y: 230 * U, r: 30 * U };
const PEARLS = [
  { x: 400 * U, y: 300 * U, r: 18 * U },
  { x: 624 * U, y: 300 * U, r: 18 * U },
];

function insidePolygon(px, py, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToPolygon(px, py, polygon) {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    best = Math.min(
      best,
      distanceToSegment(px, py, polygon[j][0], polygon[j][1], polygon[i][0], polygon[i][1]),
    );
  }
  return best;
}

/** Vorzeichenbehafteter Abstand zu einem abgerundeten Rechteck (negativ = innen). */
function roundedRectDistance(px, py, rect) {
  const cx = (rect.x0 + rect.x1) / 2;
  const cy = (rect.y0 + rect.y1) / 2;
  const qx = Math.abs(px - cx) - ((rect.x1 - rect.x0) / 2 - rect.r);
  const qy = Math.abs(py - cy) - ((rect.y1 - rect.y0) / 2 - rect.r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rect.r;
}

function gold(py, top, bottom) {
  return mix(GOLD_LIGHT, GOLD_DARK, Math.max(0, Math.min(1, (py - top) / (bottom - top))));
}

/* ---------------- Master-Rendering (2048², Kanten später geglättet) ---------------- */

const img = Buffer.alloc(MASTER * MASTER * 4);

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;

    // 1) Grüner Verlauf von oben links nach unten rechts
    let col = mix(BG_A, BG_B, (x + y) / (2 * S));

    // 2) Kräftiges weißes C
    const angle = Math.atan2(y - C_CY, x - C_CX);
    const radius = Math.hypot(x - C_CX, y - C_CY);
    const onArc = Math.abs(radius - C_R) < C_HALF && Math.abs(angle) >= C_OPEN;
    const onCap = C_CAPS.some(([cx, cy]) => Math.hypot(x - cx, y - cy) < C_HALF);
    if (onArc || onCap) col = WHITE;

    // 3) Goldene Krone mit dunkler Kontur
    if (insidePolygon(x, y, CROWN)) col = gold(y, CROWN_TOP, CROWN_BOTTOM);
    if (distanceToPolygon(x, y, CROWN) < OUTLINE) col = GOLD_EDGE;

    // 4) Kronreif
    const band = roundedRectDistance(x, y, BAND);
    if (band < OUTLINE) col = band < -OUTLINE ? gold(y, BAND.y0, BAND.y1) : GOLD_EDGE;

    // 5) Roter Edelstein und zwei Perlen
    if (Math.hypot(x - JEWEL.x, y - JEWEL.y) < JEWEL.r) col = RED;
    for (const pearl of PEARLS) {
      if (Math.hypot(x - pearl.x, y - pearl.y) < pearl.r) col = WHITE;
    }

    img[i] = col[0];
    img[i + 1] = col[1];
    img[i + 2] = col[2];
    img[i + 3] = 255;
  }
}

/* ---------------- Herunterrechnen (Area-Average = Kantenglättung) ---------------- */

function resample(dstSize) {
  const out = Buffer.alloc(dstSize * dstSize * 4);
  const ratio = MASTER / dstSize;
  for (let dy = 0; dy < dstSize; dy++) {
    const sy0 = dy * ratio;
    const sy1 = sy0 + ratio;
    for (let dx = 0; dx < dstSize; dx++) {
      const sx0 = dx * ratio;
      const sx1 = sx0 + ratio;
      let r = 0;
      let g = 0;
      let b = 0;
      let wsum = 0;
      for (let sy = Math.floor(sy0); sy < Math.min(MASTER, Math.ceil(sy1)); sy++) {
        const wy = Math.min(sy + 1, sy1) - Math.max(sy, sy0);
        if (wy <= 0) continue;
        for (let sx = Math.floor(sx0); sx < Math.min(MASTER, Math.ceil(sx1)); sx++) {
          const wx = Math.min(sx + 1, sx1) - Math.max(sx, sx0);
          if (wx <= 0) continue;
          const si = (sy * MASTER + sx) * 4;
          const w = wx * wy;
          r += img[si] * w;
          g += img[si + 1] * w;
          b += img[si + 2] * w;
          wsum += w;
        }
      }
      const di = (dy * dstSize + dx) * 4;
      out[di] = Math.round(r / wsum);
      out[di + 1] = Math.round(g / wsum);
      out[di + 2] = Math.round(b / wsum);
      out[di + 3] = 255;
    }
  }
  return out;
}

/** ICO-Container mit eingebettetem PNG (von allen aktuellen Browsern unterstützt). */
function encodeIco(size, png) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

const publicDir = join(outDir, "..");
mkdirSync(outDir, { recursive: true });

// Eindeutige Dateinamen ohne „?v=…“: iOS hält Homescreen-Icons teils unabhängig
// vom Query-String im Cache. Bei einem neuen Design hier die Namen ändern.
const OUTPUTS = [
  { size: 1024, name: "coroa-home-2026-1024.png" },
  { size: 512, name: "coroa-home-2026-512.png" },
  { size: 192, name: "coroa-home-2026-192.png" },
  { size: 180, name: "coroa-home-2026-apple-180.png" },
  { size: 167, name: "coroa-home-2026-apple-167.png" },
  { size: 152, name: "coroa-home-2026-apple-152.png" },
  { size: 32, name: "coroa-home-2026-32.png" },
];

for (const { size, name } of OUTPUTS) {
  const png = encodePng(size, size, resample(size));
  writeFileSync(join(outDir, name), png);
  console.log(`[generate-icons] ${name} (${size}×${size}) geschrieben.`);

  // iOS fragt das Homescreen-Icon teils fest unter diesen Pfaden im
  // Hauptverzeichnis ab. Fehlen sie, zeigt das iPhone kein Symbol.
  if (size === 180) {
    for (const rootName of ["apple-touch-icon.png", "apple-touch-icon-precomposed.png"]) {
      writeFileSync(join(publicDir, rootName), png);
      console.log(`[generate-icons] /${rootName} geschrieben.`);
    }
  }
  if (size === 32) {
    writeFileSync(join(publicDir, "favicon.ico"), encodeIco(size, png));
    console.log("[generate-icons] /favicon.ico geschrieben.");
  }
}
