import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, "..", "public", "icons");

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
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 5x7-Pixelfont für "P" und "K"
const FONT = {
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
};

function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const bg = [37, 99, 235, 255];
  const fg = [255, 255, 255, 255];
  const radius = size * 0.18;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.min(x, size - 1 - x);
      const dy = Math.min(y, size - 1 - y);
      const cornerDistX = radius - dx;
      const cornerDistY = radius - dy;
      const inside = dx >= radius || dy >= radius || Math.hypot(cornerDistX, cornerDistY) <= radius;
      if (!inside) continue;
      const i = (y * size + x) * 4;
      rgba[i] = bg[0];
      rgba[i + 1] = bg[1];
      rgba[i + 2] = bg[2];
      rgba[i + 3] = bg[3];
    }
  }

  const glyphW = 5;
  const glyphH = 7;
  const gap = 2;
  const totalUnitsW = glyphW * 2 + gap;
  const scale = Math.floor((size * 0.5) / glyphH);
  const totalPxW = totalUnitsW * scale;
  const startX = Math.floor((size - totalPxW) / 2);
  const startY = Math.floor((size - glyphH * scale) / 2);

  const letters = ["P", "K"];
  let offsetX = startX;
  for (const ch of letters) {
    const rows = FONT[ch];
    for (let ry = 0; ry < rows.length; ry++) {
      for (let rx = 0; rx < rows[ry].length; rx++) {
        if (rows[ry][rx] !== "1") continue;
        for (let py = 0; py < scale; py++) {
          for (let px = 0; px < scale; px++) {
            const x = offsetX + rx * scale + px;
            const y = startY + ry * scale + py;
            if (x < 0 || y < 0 || x >= size || y >= size) continue;
            const i = (y * size + x) * 4;
            rgba[i] = fg[0];
            rgba[i + 1] = fg[1];
            rgba[i + 2] = fg[2];
            rgba[i + 3] = fg[3];
          }
        }
      }
    }
    offsetX += (glyphW + gap) * scale;
  }
  return encodePng(size, size, rgba);
}

mkdirSync(outDir, { recursive: true });
for (const size of [32, 192, 512]) {
  writeFileSync(join(outDir, `icon-${size}.png`), drawIcon(size));
}
console.log("[generate-icons] Icons erzeugt:", outDir);
