/**
 * Erkennt Ausfüllstellen in einer gerasterten PDF-Seite: leere Kästchen,
 * Tabellen-/Formularzellen und freie Schreiblinien.
 *
 * Die Analyse arbeitet rein auf Pixeln und funktioniert daher für
 * Vektor-PDFs und gescannte Formulare gleichermaßen. Sie ist bewusst
 * heuristisch: Ergebnisse sind Vorschläge, die im UI ergänzt oder
 * entfernt werden können.
 *
 * Alle zurückgegebenen Koordinaten sind in PDF-Punkten relativ zur
 * sichtbaren Seite (x von links, y von oben) – dieselbe Konvention wie
 * im Editor.
 */

export interface RasterImage {
  width: number;
  height: number;
  /** RGBA, 4 Byte pro Pixel (wie `ImageData.data`). */
  data: Uint8ClampedArray | Uint8Array;
}

export interface FillRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type RasterFieldSource = "kaestchen" | "feld" | "linie";

export interface RasterField extends FillRect {
  kind: "text" | "checkbox";
  source: RasterFieldSource;
}

/** Helligkeit, unter der ein Pixel als „Tinte" gilt. */
const DARK_THRESHOLD = 170;

interface Component {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  count: number;
}

export function toDarkMask(image: RasterImage): Uint8Array {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  for (let index = 0, pixel = 0; pixel < mask.length; pixel++, index += 4) {
    if (data[index + 3] < 128) continue;
    const luminance = 0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2];
    if (luminance < DARK_THRESHOLD) mask[pixel] = 1;
  }
  return mask;
}

/** Markiert zusammenhängende horizontale Tintenläufe ab `minRun` Pixeln (Lücken bis `maxGap`). */
function horizontalRuns(
  dark: Uint8Array,
  width: number,
  height: number,
  minRun: number,
  maxGap: number,
): Uint8Array {
  const out = new Uint8Array(dark.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    let start = -1;
    let last = -1;
    for (let x = 0; x <= width; x++) {
      const isDark = x < width && dark[row + x] === 1;
      if (isDark) {
        if (start < 0 || x - last - 1 > maxGap) {
          if (start >= 0 && last - start + 1 >= minRun) out.fill(1, row + start, row + last + 1);
          start = x;
        }
        last = x;
      } else if (x === width && start >= 0 && last - start + 1 >= minRun) {
        out.fill(1, row + start, row + last + 1);
      }
    }
  }
  return out;
}

function verticalRuns(
  dark: Uint8Array,
  width: number,
  height: number,
  minRun: number,
  maxGap: number,
): Uint8Array {
  const out = new Uint8Array(dark.length);
  for (let x = 0; x < width; x++) {
    let start = -1;
    let last = -1;
    const flush = () => {
      if (start >= 0 && last - start + 1 >= minRun) {
        for (let y = start; y <= last; y++) out[y * width + x] = 1;
      }
    };
    for (let y = 0; y < height; y++) {
      if (dark[y * width + x] !== 1) continue;
      if (start < 0 || y - last - 1 > maxGap) {
        flush();
        start = y;
      }
      last = y;
    }
    flush();
  }
  return out;
}

/** Zusammenhangskomponenten (8er-Nachbarschaft) einer Binärmaske. */
function components(
  mask: Uint8Array,
  width: number,
  height: number,
  value = 1,
  eightConnected = true,
): { labels: Int32Array; list: Component[] } {
  const labels = new Int32Array(mask.length).fill(-1);
  const list: Component[] = [];
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] !== value || labels[start] !== -1) continue;
    const id = list.length;
    const component: Component = {
      x0: width,
      y0: height,
      x1: -1,
      y1: -1,
      count: 0,
    };
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const pixel = stack[--top];
      const x = pixel % width;
      const y = (pixel - x) / width;
      component.count++;
      if (x < component.x0) component.x0 = x;
      if (x > component.x1) component.x1 = x;
      if (y < component.y0) component.y0 = y;
      if (y > component.y1) component.y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          if (!eightConnected && dx !== 0 && dy !== 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (mask[neighbor] !== value || labels[neighbor] !== -1) continue;
          labels[neighbor] = id;
          stack[top++] = neighbor;
        }
      }
    }
    list.push(component);
  }
  return { labels, list };
}

function countDark(
  dark: Uint8Array,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  let total = 0;
  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) total += dark[row + x];
  }
  return total;
}

function intersectionArea(a: FillRect, b: FillRect): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** true, wenn sich zwei Bereiche deutlich überlappen. */
export function overlapsSignificantly(a: FillRect, b: FillRect, ratio = 0.4): boolean {
  const overlap = intersectionArea(a, b);
  if (overlap === 0) return false;
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return overlap / smaller > ratio;
}

/**
 * Sucht kleine, leere, quadratische Umrandungen (Ankreuzkästchen).
 */
function detectCheckboxes(
  dark: Uint8Array,
  width: number,
  height: number,
  scale: number,
): FillRect[] {
  const { list } = components(dark, width, height);
  const minSide = 6 * scale;
  const maxSide = 22 * scale;
  const results: FillRect[] = [];
  for (const component of list) {
    const w = component.x1 - component.x0 + 1;
    const h = component.y1 - component.y0 + 1;
    if (w < minSide || h < minSide || w > maxSide || h > maxSide) continue;
    if (w / h < 0.75 || w / h > 1.33) continue;

    const band = Math.max(1, Math.round(Math.min(w, h) * 0.15));
    const sideCoverage = (horizontal: boolean, from: number) => {
      const length = horizontal ? w : h;
      let covered = 0;
      for (let step = 0; step < length; step++) {
        let hit = false;
        for (let offset = 0; offset < band && !hit; offset++) {
          const x = horizontal ? component.x0 + step : from + offset;
          const y = horizontal ? from + offset : component.y0 + step;
          hit = dark[y * width + x] === 1;
        }
        if (hit) covered++;
      }
      return covered / length;
    };
    const sides = [
      sideCoverage(true, component.y0),
      sideCoverage(true, component.y1 - band + 1),
      sideCoverage(false, component.x0),
      sideCoverage(false, component.x1 - band + 1),
    ];
    if (sides.some((coverage) => coverage < 0.85)) continue;

    const insetX = Math.round(w * 0.3);
    const insetY = Math.round(h * 0.3);
    const inner = countDark(
      dark,
      width,
      component.x0 + insetX,
      component.y0 + insetY,
      component.x1 - insetX,
      component.y1 - insetY,
    );
    const innerArea = (w - 2 * insetX) * (h - 2 * insetY);
    if (innerArea <= 0 || inner / innerArea > 0.3) continue;

    results.push({
      x: component.x0 / scale,
      y: component.y0 / scale,
      width: w / scale,
      height: h / scale,
    });
  }
  return results;
}

interface LineSegment {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function detectLines(
  dark: Uint8Array,
  width: number,
  height: number,
  scale: number,
  horizontal: boolean,
): { mask: Uint8Array; lines: LineSegment[] } {
  const minRun = Math.round(8 * scale);
  const maxGap = Math.max(1, Math.round(0.75 * scale));
  const runs = horizontal
    ? horizontalRuns(dark, width, height, minRun, maxGap)
    : verticalRuns(dark, width, height, minRun, maxGap);
  const { labels, list } = components(runs, width, height);
  const minLength = (horizontal ? 30 : 10) * scale;
  const keep = new Uint8Array(list.length);
  const lines: LineSegment[] = [];

  list.forEach((component, id) => {
    const length = horizontal ? component.x1 - component.x0 + 1 : component.y1 - component.y0 + 1;
    const thickness = horizontal
      ? component.y1 - component.y0 + 1
      : component.x1 - component.x0 + 1;
    if (length < minLength) return;
    // Dicke begrenzen; leichte Schräglage (Scans) ist erlaubt.
    if (thickness > 4 * scale + length * 0.035) return;
    // Die Linie muss ihre Länge nahezu lückenlos abdecken.
    if (component.count < length * 0.9) return;
    keep[id] = 1;
    lines.push({ x0: component.x0, y0: component.y0, x1: component.x1, y1: component.y1 });
  });

  const mask = new Uint8Array(dark.length);
  for (let pixel = 0; pixel < labels.length; pixel++) {
    const id = labels[pixel];
    if (id >= 0 && keep[id]) mask[pixel] = 1;
  }
  return { mask, lines };
}

function dilate(mask: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] !== 1) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < width) out[ny * width + nx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * Findet von Linien umschlossene Bereiche (Kästen, Tabellenzellen) und
 * liefert jeweils den freien Teil, in den geschrieben werden kann.
 */
function detectBoxes(
  dark: Uint8Array,
  lineMask: Uint8Array,
  width: number,
  height: number,
  scale: number,
): FillRect[] {
  const walls = dilate(lineMask, width, height);
  const { labels, list } = components(walls, width, height, 0, false);
  // Tinte nur innerhalb der umschlossenen Fläche zählen (mit Abstand zum Rahmen).
  // So stören schräg gescannte Rahmen nicht, die in das Begrenzungsrechteck ragen.
  const nearWall = dilate(dilate(walls, width, height), width, height);
  const regionInk = (id: number, x0: number, y0: number, x1: number, y1: number) => {
    let total = 0;
    for (let y = y0; y <= y1; y++) {
      const row = y * width;
      for (let x = x0; x <= x1; x++) {
        const pixel = row + x;
        if (dark[pixel] === 1 && labels[pixel] === id && nearWall[pixel] === 0) total++;
      }
    }
    return total;
  };
  const pageArea = width * height;
  const noise = (length: number) => Math.max(1, Math.round(length * 0.004));
  const emptyCells: Component[] = [];
  const candidates: Array<{ rect: FillRect; region: Component; partial: boolean }> = [];

  for (const [id, region] of list.entries()) {
    if (region.x0 === 0 || region.y0 === 0 || region.x1 === width - 1 || region.y1 === height - 1) {
      continue; // nicht umschlossen
    }
    const w = region.x1 - region.x0 + 1;
    const h = region.y1 - region.y0 + 1;
    if (w < 12 * scale || h < 8 * scale) continue;
    if (region.count < w * h * 0.8) continue; // nicht rechteckig
    if (w * h > pageArea * 0.5) continue; // Seitenrahmen

    const inset = Math.round(1.5 * scale);
    const x0 = region.x0 + inset;
    const y0 = region.y0 + inset;
    const x1 = region.x1 - inset;
    const y1 = region.y1 - inset;
    if (x1 <= x0 || y1 <= y0) continue;
    const innerW = x1 - x0 + 1;
    const innerH = y1 - y0 + 1;
    const ink = regionInk(id, x0, y0, x1, y1);

    // Schon eine kleine Beschriftung zählt als Inhalt; nur Rauschen gilt als leer.
    if (ink <= Math.max(2, innerW * innerH * 0.0008)) {
      emptyCells.push(region);
      candidates.push({
        rect: { x: x0 / scale, y: y0 / scale, width: innerW / scale, height: innerH / scale },
        region,
        partial: false,
      });
      continue;
    }
    if (innerH > 200 * scale) continue; // großer Rahmen um Fließtext

    // Freier Streifen unten (Beschriftung oben im Kasten) …
    let emptyBottom = 0;
    for (let y = y1; y >= y0; y--) {
      if (regionInk(id, x0, y, x1, y) > noise(innerW)) break;
      emptyBottom++;
    }
    if (emptyBottom >= 9 * scale && emptyBottom >= innerH * 0.35) {
      const pad = Math.round(1 * scale);
      const top = y1 - emptyBottom + 1 + pad;
      candidates.push({
        rect: {
          x: x0 / scale,
          y: top / scale,
          width: innerW / scale,
          height: (y1 - top + 1) / scale,
        },
        region,
        partial: true,
      });
      continue;
    }

    // … oder rechts (Beschriftung links im Kasten).
    let emptyRight = 0;
    for (let x = x1; x >= x0; x--) {
      if (regionInk(id, x, y0, x, y1) > noise(innerH)) break;
      emptyRight++;
    }
    if (emptyRight >= 30 * scale && emptyRight >= innerW * 0.35) {
      const pad = Math.round(2 * scale);
      const left = x1 - emptyRight + 1 + pad;
      candidates.push({
        rect: {
          x: left / scale,
          y: y0 / scale,
          width: (x1 - left + 1) / scale,
          height: innerH / scale,
        },
        region,
        partial: true,
      });
    }
  }

  // Beschriftungszellen in Tabellen: Liegt direkt rechts oder unterhalb eine leere
  // Zelle, gehört die Eingabe dorthin – nicht in den Rest der Beschriftungszelle.
  const gap = 6 * scale;
  const hasEmptyNeighbor = (region: Component) =>
    emptyCells.some((cell) => {
      const rowOverlap = Math.min(cell.y1, region.y1) - Math.max(cell.y0, region.y0);
      const colOverlap = Math.min(cell.x1, region.x1) - Math.max(cell.x0, region.x0);
      const right =
        cell.x0 > region.x1 &&
        cell.x0 - region.x1 <= gap &&
        rowOverlap > 0.5 * (region.y1 - region.y0);
      const below =
        cell.y0 > region.y1 &&
        cell.y0 - region.y1 <= gap &&
        colOverlap > 0.5 * (region.x1 - region.x0);
      return right || below;
    });

  return candidates
    .filter((candidate) => !candidate.partial || !hasEmptyNeighbor(candidate.region))
    .map((candidate) => candidate.rect);
}

/**
 * Freistehende Schreiblinien („Unterschrift ______"): waagerechte Linien ohne
 * angrenzende senkrechte Linien, über denen genug Platz frei ist.
 */
function detectWritingLines(
  dark: Uint8Array,
  width: number,
  scale: number,
  horizontal: LineSegment[],
  vertical: LineSegment[],
): FillRect[] {
  const tolerance = 2 * scale;
  const results: FillRect[] = [];
  for (const line of horizontal) {
    const touchesFrame = vertical.some(
      (v) =>
        v.x1 >= line.x0 - tolerance &&
        v.x0 <= line.x1 + tolerance &&
        v.y1 >= line.y0 - tolerance &&
        v.y0 <= line.y1 + tolerance,
    );
    if (touchesFrame) continue;

    const lineWidth = line.x1 - line.x0 + 1;
    const allowed = Math.max(1, Math.round(lineWidth * 0.01));
    const startY = line.y0 - Math.round(1.5 * scale);
    const maxHeight = Math.round(20 * scale);
    let empty = 0;
    for (let y = startY; y >= 0 && empty < maxHeight; y--) {
      if (countDark(dark, width, line.x0, y, line.x1, y) > allowed) break;
      empty++;
    }
    if (empty < 7 * scale) continue;

    const fieldHeight = Math.min(empty, Math.round(18 * scale));
    results.push({
      x: line.x0 / scale,
      y: (line.y0 - fieldHeight) / scale,
      width: lineWidth / scale,
      height: fieldHeight / scale,
    });
  }
  return results;
}

/**
 * Hauptfunktion: analysiert eine gerasterte Seite.
 * @param scale Pixel pro PDF-Punkt der übergebenen Rastergrafik.
 */
export function detectFillAreas(image: RasterImage, scale: number): RasterField[] {
  const { width, height } = image;
  if (width === 0 || height === 0) return [];
  const dark = toDarkMask(image);

  const checkboxes = detectCheckboxes(dark, width, height, scale);
  const horizontal = detectLines(dark, width, height, scale, true);
  const vertical = detectLines(dark, width, height, scale, false);
  const lineMask = new Uint8Array(dark.length);
  for (let pixel = 0; pixel < lineMask.length; pixel++) {
    lineMask[pixel] = horizontal.mask[pixel] | vertical.mask[pixel];
  }
  const boxes = detectBoxes(dark, lineMask, width, height, scale);
  const writingLines = detectWritingLines(dark, width, scale, horizontal.lines, vertical.lines);

  const fields: RasterField[] = [];
  const add = (rect: FillRect, kind: RasterField["kind"], source: RasterFieldSource) => {
    if (fields.some((existing) => overlapsSignificantly(existing, rect))) return;
    fields.push({ ...rect, kind, source });
  };
  checkboxes.forEach((rect) => add(rect, "checkbox", "kaestchen"));
  boxes.forEach((rect) => add(rect, "text", "feld"));
  writingLines.forEach((rect) => add(rect, "text", "linie"));

  return fields.sort((a, b) => a.y - b.y || a.x - b.x);
}
