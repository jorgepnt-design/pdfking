import { describe, expect, it } from "vitest";
import { detectFillAreas, type RasterImage } from "../src/lib/pdf/fill-detection";

const SCALE = 2; // Pixel pro PDF-Punkt

/** Weiße Testseite in PDF-Punkten; Zeichenfunktionen arbeiten ebenfalls in Punkten. */
function page(widthPt = 300, heightPt = 300) {
  const width = widthPt * SCALE;
  const height = heightPt * SCALE;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const image: RasterImage = { width, height, data };
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let py = Math.round(y * SCALE); py < Math.round((y + h) * SCALE); py++) {
      for (let px = Math.round(x * SCALE); px < Math.round((x + w) * SCALE); px++) {
        const index = (py * width + px) * 4;
        data[index] = data[index + 1] = data[index + 2] = 0;
      }
    }
  };
  return {
    image,
    hLine: (x: number, y: number, w: number) => fill(x, y, w, 1),
    vLine: (x: number, y: number, h: number) => fill(x, y, 1, h),
    box: (x: number, y: number, w: number, h: number) => {
      fill(x, y, w, 1);
      fill(x, y + h - 1, w, 1);
      fill(x, y, 1, h);
      fill(x + w - 1, y, 1, h);
    },
    /** Grobe „Textzeile" aus einzelnen Buchstabenblöcken. */
    text: (x: number, y: number, chars: number) => {
      for (let index = 0; index < chars; index++) fill(x + index * 7, y, 5, 8);
    },
  };
}

describe("detectFillAreas", () => {
  it("erkennt eine freie Schreiblinie und legt das Feld darüber", () => {
    const p = page();
    p.text(20, 92, 6);
    p.hLine(70, 100, 150);
    const fields = detectFillAreas(p.image, SCALE);
    expect(fields).toHaveLength(1);
    const [field] = fields;
    expect(field.kind).toBe("text");
    expect(field.source).toBe("linie");
    expect(field.x).toBeCloseTo(70, 0);
    expect(field.width).toBeCloseTo(150, 0);
    expect(field.y + field.height).toBeLessThanOrEqual(100);
    expect(field.height).toBeGreaterThanOrEqual(7);
  });

  it("ignoriert unterstrichenen Text", () => {
    const p = page();
    for (let index = 0; index < 8; index++) p.text(40, 90, 22);
    p.hLine(40, 99, 150);
    expect(detectFillAreas(p.image, SCALE)).toHaveLength(0);
  });

  it("erkennt ein leeres Kästchen zum Ausfüllen", () => {
    const p = page();
    p.box(40, 40, 200, 30);
    const fields = detectFillAreas(p.image, SCALE);
    expect(fields).toHaveLength(1);
    expect(fields[0].source).toBe("feld");
    expect(fields[0].width).toBeGreaterThan(190);
    // Rahmen und Innenabstand werden abgezogen.
    expect(fields[0].height).toBeGreaterThan(22);
  });

  it("nutzt bei beschrifteten Kästen den freien Bereich unter der Beschriftung", () => {
    const p = page();
    p.box(40, 40, 200, 40);
    p.text(44, 43, 5);
    const fields = detectFillAreas(p.image, SCALE);
    expect(fields).toHaveLength(1);
    expect(fields[0].y).toBeGreaterThan(51);
    expect(fields[0].y + fields[0].height).toBeLessThanOrEqual(80);
  });

  it("findet Tabellenzellen, aber keine Felder in Zellen mit Inhalt", () => {
    const p = page();
    // 2 Spalten × 2 Zeilen, linke Spalte beschriftet
    p.hLine(20, 20, 260);
    p.hLine(20, 45, 260);
    p.hLine(20, 70, 260);
    p.vLine(20, 20, 51);
    p.vLine(120, 20, 51);
    p.vLine(279, 20, 51);
    p.text(24, 28, 12);
    p.text(24, 53, 12);
    const fields = detectFillAreas(p.image, SCALE);
    expect(fields).toHaveLength(2);
    for (const field of fields) {
      expect(field.x).toBeGreaterThan(120);
      expect(field.source).toBe("feld");
    }
  });

  it("erkennt Ankreuzkästchen, aber keine runden Zeichen", () => {
    const p = page();
    p.box(30, 30, 10, 10);
    p.box(30, 60, 12, 12);
    // gefülltes Quadrat (Aufzählungszeichen) darf kein Kästchen sein
    for (let row = 0; row < 10; row++) p.hLine(80, 30 + row, 10);
    const fields = detectFillAreas(p.image, SCALE);
    const checkboxes = fields.filter((field) => field.kind === "checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0].x).toBeCloseTo(30, 0);
  });

  it("verkraftet leicht schräg gescannte Linien", () => {
    const p = page();
    for (let step = 0; step < 150; step++) {
      p.hLine(60 + step, 150 + Math.floor(step / 60), 1);
    }
    const fields = detectFillAreas(p.image, SCALE);
    expect(fields).toHaveLength(1);
    expect(fields[0].source).toBe("linie");
  });

  it("liefert für eine leere Seite nichts", () => {
    expect(detectFillAreas(page().image, SCALE)).toEqual([]);
  });
});
