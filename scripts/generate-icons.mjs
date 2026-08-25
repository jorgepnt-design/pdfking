/**
 * CoroaPDF App-Icon-Generator
 * Zeichnet das gekrönte C-Monogramm in portugiesischem Grün mit rotem Akzent
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

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/* ---------------- Layout (Anteile der Kantenlänge) ---------------- */

const BG_A = hex("#0b8748");
const BG_B = hex("#075f32");
const WHITE = hex("#ffffff");
const RED = hex("#e52535");

const S = MASTER;

const CX = 0.49 * S;
const CY = 0.56 * S;
const OUTER_R = 0.285 * S;
const INNER_R = 0.165 * S;
const CROWN_BASE_Y = 0.36 * S;
const CROWN_POINTS = [
  [[0.25 * S, CROWN_BASE_Y], [0.25 * S, 0.255 * S], [0.39 * S, CROWN_BASE_Y]],
  [[0.36 * S, CROWN_BASE_Y], [0.49 * S, 0.15 * S], [0.62 * S, CROWN_BASE_Y]],
  [[0.59 * S, CROWN_BASE_Y], [0.73 * S, 0.255 * S], [0.73 * S, CROWN_BASE_Y]],
];

/* ---------------- Master-Rendering (2048², Kanten später geglättet) ---------------- */

const img = Buffer.alloc(MASTER * MASTER * 4);

for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;

    // 1) Portugiesisch grüner Hintergrund
    let col = mix(BG_A, BG_B, (x / S) * 0.45 + (y / S) * 0.55);
    const edge = Math.min(x, y, S - 1 - x, S - 1 - y) / S;
    if (edge < 0.06) {
      col = mix(col, hex("#034a27"), (1 - edge / 0.06) * 0.2);
    }

    // 2) Weißes C mit einer klaren Öffnung rechts
    const radius = Math.hypot(x - CX, y - CY);
    const inRing = radius <= OUTER_R && radius >= INNER_R;
    const inOpening = x > CX + 0.11 * S && Math.abs(y - CY) < 0.145 * S;
    if (inRing && !inOpening) col = WHITE;

    // 3) Drei Kronenspitzen wachsen aus dem oberen C-Bogen
    if (y >= CROWN_BASE_Y - 0.035 * S && y <= CROWN_BASE_Y + 0.025 * S && x > 0.245 * S && x < 0.735 * S) {
      col = WHITE;
    }
    for (const triangle of CROWN_POINTS) {
      if (inTriangle(x, y, triangle[0], triangle[1], triangle[2])) col = WHITE;
    }

    // 4) Roter Akzent verlängert den unteren Endpunkt des C
    if (distanceToSegment(x, y, 0.66 * S, 0.745 * S, 0.79 * S, 0.675 * S) < 0.035 * S) {
      col = RED;
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

mkdirSync(outDir, { recursive: true });
for (const size of [512, 192, 180, 32]) {
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  writeFileSync(join(outDir, name), encodePng(size, size, resample(size)));
  console.log(`[generate-icons] ${name} (${size}×${size}) geschrieben.`);
}
