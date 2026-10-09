import { describe, expect, it } from "vitest";
import { editorPointToPdf } from "../src/lib/pdf/annotate";

describe("Editor-Koordinaten beim PDF-Export", () => {
  it("berücksichtigt die Position der sichtbaren CropBox", () => {
    const pageBox = { x: 100, y: 150, width: 300, height: 400 };

    expect(editorPointToPdf(pageBox, 30, 20)).toEqual({ x: 130, y: 530 });
    expect(editorPointToPdf(pageBox, 0, 400)).toEqual({ x: 100, y: 150 });
  });

  it("rechnet gedrehte Vorschauseiten in PDF-Koordinaten zurück", () => {
    const pageBox = { x: 100, y: 150, width: 300, height: 400 };

    expect(editorPointToPdf(pageBox, 30, 20, 90)).toEqual({ x: 120, y: 180 });
    expect(editorPointToPdf(pageBox, 30, 20, 180)).toEqual({ x: 370, y: 170 });
    expect(editorPointToPdf(pageBox, 30, 20, 270)).toEqual({ x: 380, y: 520 });
  });
});
