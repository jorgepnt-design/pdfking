/**
 * CoroaPDF App-Icon-Generator
 * Zeichnet das Logo prozedural (Blauverlauf + Dokument mit Falte + goldene Krone)
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

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
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

/** Signierte Distanz zu einem abgerundeten Rechteck (negativ = innen). */
function sdRoundBox(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

/** Punkt im Dreieck? (Baryzentrisch) */
function inTriangle(px, py, a, b, c) {
  const s1 = cross(a, b, px, py);
  const s2 = cross(b, c, px, py);
  const s3 = cross(c, a, px, py);
  const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
  const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
  return !(hasNeg && hasPos);
}

function cross(p, q, x, y) {
  return (q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (x - p[0]);
}

/* ---------------- Layout (Anteile der Kantenlänge) ---------------- */

const BG_A = hex("#4285f8");
const BG_B = hex("#1633c4");
const PAGE = hex("#ffffff");
const PAGE_EDGE = hex("#dbe6ff");
const FLAP = hex("#c3d7ff");
const SHADOW = [12, 22, 80];
const GOLD_TOP = hex("#ffe27a");
const GOLD_BOT = hex("#f59e0b");

const S = MASTER;

// Dokument
const PX0 = 0.235 * S;
const PX1 = 0.785 * S;
const PY0 = 0.21 * S;
const PY1 = 0.89 * S;
const PR = 0.05 * S;
const FOLD = 0.085 * S;
const foldX = PX1 - FOLD;
const foldY = PY0 + FOLD;

// Krone
const CX = 0.51 * S;
const BAND_CY = 0.505 * S;
const BAND_HW = 0.165 * S;
const BAND_HH = 0.03 * S;
const BAND_R = 0.018 * S;
const BASE_Y = BAND_CY - BAND_HH;
const SPIKES = [
  { apex: [CX - 0.12 * S, 0.395 * S], xl: CX - 0.168 * S, xr: CX - 0.062 * S },
  { apex: [CX, 0.36 * S], xl: CX - 0.072 * S, xr: CX + 0.072 * S },
  { apex: [CX + 0.12 * S, 0.395 * S], xl: CX + 0.062 * S, xr: CX + 0.168 * S }
];
const BALL_R = 0.027 * S;

function goldColor(py) {
  const t = Math.min(1, Math.max(0, (py - 0.34 * S) / (0.19 * S)));
  return mix(GOLD_TOP, GOLD_BOT, t);
}

/* ---------------- Master-Rendering (2048², Kanten später geglättet) ---------------- */

const img = Buffer.alloc(MASTER * MASTER * 4);

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;

    // 1) Diagonaler Hintergrundverlauf + Randabdunklung
    let col = mix(BG_A, BG_B, (x / S) * 0.45 + (y / S) * 0.55);
    const edge = Math.min(x, y, S - 1 - x, S - 1 - y) / S;
    if (edge < 0.06) {
      col = mix(col, hex("#101d63"), (1 - edge / 0.06) * 0.25);
    }

    // 2) Weicher Schatten hinter dem Dokument
    const shD = sdRoundBox(x, y, CX + 0.014 * S, 0.597 * S, (PX1 - PX0) / 2, (PY1 - PY0) / 2, PR);
    if (shD < 0.05 * S) {
      const a = Math.max(0, 1 - shD / (0.05 * S)) ** 2 * 0.42;
      col = mix(col, SHADOW, a);
    }

    // 3) Dokument (obere rechte Ecke gefaltet abgeschnitten)
    const dPage = sdRoundBox(x, y, (PX0 + PX1) / 2, (PY0 + PY1) / 2, (PX1 - PX0) / 2, (PY1 - PY0) / 2, PR);
    const inCut = x > foldX && y < foldY && x - foldX > foldY - y;
    if (dPage < 0 && !inCut) {
      col = PAGE;
      if (y > PY1 - 0.006 * S && dPage > -0.006 * S) col = mix(PAGE, PAGE_EDGE, 0.8);
    }

    // Hundeohr-Klappe über der gefalteten Ecke
    if (
      x >= foldX &&
      x <= PX1 &&
      y >= PY0 &&
      y <= foldY &&
      x - foldX >= foldY - y
    ) {
      col = FLAP;
    }

    // 4) Krone
    let crown = false;
    if (sdRoundBox(x, y, CX, BAND_CY, BAND_HW, BAND_HH, BAND_R) < 0) crown = true;
    if (!crown) {
      for (const sp of SPIKES) {
        if (inTriangle(x, y, [sp.xl, BASE_Y], [sp.xr, BASE_Y], sp.apex)) {
          crown = true;
          break;
        }
      }
    }
    if (!crown) {
      for (const sp of SPIKES) {
        if ((x - sp.apex[0]) ** 2 + (y - sp.apex[1]) ** 2 < BALL_R * BALL_R) {
          crown = true;
          break;
        }
      }
    }
    if (crown) col = goldColor(y);

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

mkdirSync(outDir, { recursive: true });
for (const size of [512, 192, 180, 32]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  writeFileSync(join(outDir, name), encodePng(size, size, resample(size)));
  console.log(`[generate-icons] ${name} (${size}×${size}) geschrieben.`);
}
