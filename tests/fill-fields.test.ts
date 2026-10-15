// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "@cantoo/pdf-lib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { exportFilledPdf, findLabel, type FillField } from "../src/lib/pdf/fill-fields";

const text = (value: string, x: number, y: number, width: number, height = 10) => ({
  text: value,
  x,
  y,
  width,
  height,
});

describe("findLabel", () => {
  it("nimmt die Beschriftung links auf gleicher Höhe", () => {
    const field = { x: 140, y: 90, width: 300, height: 18 };
    expect(findLabel(field, [text("Vorname:", 50, 96, 50), text("Titel", 50, 40, 30)])).toBe(
      "Vorname",
    );
  });

  it("findet Beschriftungen rechts von Ankreuzkästchen", () => {
    const field = { x: 50, y: 100, width: 10, height: 10 };
    expect(findLabel(field, [text("Newsletter abonnieren", 66, 100, 110)])).toBe(
      "Newsletter abonnieren",
    );
  });

  it("nutzt Text unter einer Unterschriftslinie", () => {
    const field = { x: 280, y: 300, width: 170, height: 18 };
    expect(findLabel(field, [text("Unterschrift", 280, 322, 40, 8)])).toBe("Unterschrift");
  });

  it("liefert null ohne passende Beschriftung", () => {
    expect(findLabel({ x: 0, y: 0, width: 10, height: 10 }, [])).toBeNull();
  });
});

describe("exportFilledPdf", () => {
  const field = (overrides: Partial<FillField>): FillField => ({
    id: "f1",
    pageIndex: 0,
    x: 100,
    y: 100,
    width: 200,
    height: 18,
    kind: "text",
    source: "erkannt",
    label: "Name",
    multiline: false,
    ...overrides,
  });

  async function pageText(bytes: Uint8Array) {
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    return content.items
      .filter((item) => "str" in item && item.str.trim())
      .map((item) => {
        const entry = item as { str: string; transform: number[] };
        const [, , , , x, y] = pdfjs.Util.transform(viewport.transform, entry.transform);
        return { str: entry.str, x, y };
      });
  }

  it("schreibt Text und Kreuze an die Feldposition", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    const source = await doc.save();

    const output = await exportFilledPdf(
      source,
      [field({}), field({ id: "c1", kind: "checkbox", x: 50, y: 200, width: 10, height: 10 })],
      { f1: "Max Mustermann", c1: true },
      { flattenForm: false },
    );
    const items = await pageText(output);
    const name = items.find((item) => item.str === "Max Mustermann");
    expect(name).toBeDefined();
    expect(name!.x).toBeCloseTo(102, 0);
    // Grundlinie innerhalb des Felds, nahe der Unterkante (Schreiblinie)
    expect(name!.y).toBeGreaterThan(100);
    expect(name!.y).toBeLessThanOrEqual(118);
    const cross = items.find((item) => item.str === "X");
    expect(cross).toBeDefined();
    expect(cross!.y).toBeGreaterThan(200);
    expect(cross!.y).toBeLessThanOrEqual(210);
  });

  it("verkleinert zu lange Texte, statt über das Feld hinauszuschreiben", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    const longText = "Sehr lange Eingabe, die eigentlich nicht in das Feld passt";
    const output = await exportFilledPdf(
      await doc.save(),
      [field({ width: 120 })],
      { f1: longText },
      { flattenForm: false },
    );
    const content = await (
      await (await pdfjs.getDocument({ data: output }).promise).getPage(1)
    ).getTextContent();
    const lines = content.items.filter(
      (entry): entry is (typeof content.items)[number] & { str: string; width: number } =>
        "str" in entry && entry.str.trim() !== "",
    );
    expect(lines.map((line) => line.str).join(" ")).toBe(longText);
    for (const line of lines) expect(line.width).toBeLessThanOrEqual(120);
  });

  it("setzt Werte echter Formularfelder", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([400, 400]);
    const form = doc.getForm();
    form.createTextField("kundennummer").addToPage(page, { x: 50, y: 50, width: 100, height: 20 });
    const output = await exportFilledPdf(
      await doc.save(),
      [field({ id: "a1", source: "formular", acro: { name: "kundennummer", readOnly: false } })],
      { kundennummer: "4711" },
      { flattenForm: false },
    );
    const result = await PDFDocument.load(output);
    expect(result.getForm().getTextField("kundennummer").getText()).toBe("4711");
  });

  it("lässt das PDF unverändert, wenn nichts eingetragen wurde", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([400, 400]);
    const source = await doc.save();
    const output = await exportFilledPdf(source, [field({})], {}, { flattenForm: false });
    expect(output).toBe(source);
  });
});
