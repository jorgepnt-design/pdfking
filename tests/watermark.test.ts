import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import { addWatermark } from "../src/lib/pdf/pages";

async function createPdf(): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.addPage([300, 400]);
  return document.save();
}

describe("Wasserzeichen", () => {
  it("fügt ein Text-Wasserzeichen ein", async () => {
    const result = await addWatermark(await createPdf(), {
      kind: "text",
      text: "ENTWURF",
      fontSize: 42,
      color: "#64748b",
      opacity: 0.25,
      rotationDegrees: -45,
    });

    const document = await PDFDocument.load(result);
    expect(document.getPageCount()).toBe(1);
  });

  it("fügt ein PNG als Wasserzeichen ein", async () => {
    const png = new Uint8Array(
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    );
    const result = await addWatermark(await createPdf(), {
      kind: "image",
      imageBytes: png,
      imageType: "image/png",
      scalePercent: 40,
      opacity: 0.3,
      rotationDegrees: 0,
    });

    const document = await PDFDocument.load(result);
    expect(document.getPageCount()).toBe(1);
  });

  it("berücksichtigt einen versetzten sichtbaren Seitenbereich", async () => {
    const source = await PDFDocument.create();
    const page = source.addPage([600, 800]);
    page.setCropBox(100, 150, 300, 400);

    const result = await addWatermark(await source.save(), {
      kind: "text",
      text: "MITTE",
      fontSize: 36,
      color: "#64748b",
      opacity: 0.25,
      rotationDegrees: -45,
    });

    const document = await PDFDocument.load(result);
    expect(document.getPage(0).getCropBox()).toEqual({ x: 100, y: 150, width: 300, height: 400 });
  });
});
