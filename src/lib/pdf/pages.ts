import { degrees, PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import type { CancellationToken } from "../types";
import { hexToRgb, mmToPt, SimpleCancellation, yieldToUi } from "../utils";
import { editorPointToPdf } from "./annotate";
import { loadPdfDocument, saveDocument } from "./loadDocument";
import { canvasToBytes } from "./pdfjs";

export const A4_PORTRAIT: [number, number] = [595.28, 841.89];
export const LETTER_PORTRAIT: [number, number] = [612, 792];

function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Dreht eine kopierte Seite um `delta` Grad zusätzlich zur bereits im PDF
 * hinterlegten /Rotate-Angabe. Die Vorschau zeigt Seiten inklusive ihrer
 * ursprünglichen Drehung an – der Export muss daher relativ drehen.
 */
function rotatePageBy(page: ReturnType<PDFDocument["getPage"]>, delta: number): void {
  page.setRotation(degrees(normalizeAngle(page.getRotation().angle + delta)));
}

/** Kopiert Seiten in einer neuen Reihenfolge und dreht sie relativ zur Originaldrehung. */
export async function buildOrganizedPdf(
  sourceBytes: Uint8Array,
  items: Array<{ pageIndex: number; rotation: number }>,
): Promise<Uint8Array> {
  const source = await loadPdfDocument(sourceBytes);
  const target = await PDFDocument.create();
  const copied = await target.copyPages(
    source,
    items.map((item) => item.pageIndex),
  );
  copied.forEach((page, index) => {
    rotatePageBy(page, items[index].rotation);
    target.addPage(page);
  });
  return saveDocument(target);
}

/**
 * Baut aus mehreren Quelldokumenten ein neues PDF in exakt der
 * angegebenen Reihenfolge (inkl. Rotation und Duplikaten).
 */
export async function buildMultiSourcePdf(
  sources: Map<string, Uint8Array>,
  items: Array<{ docId: string; pageIndex: number; rotation: number }>,
  onProgress?: (percent: number) => void,
): Promise<Uint8Array> {
  const target = await PDFDocument.create();

  // Pro Quelldokument nur einmal kopieren: So werden gemeinsam genutzte
  // Ressourcen (Schriften, Bilder) nicht für jede Seite erneut eingebettet.
  const positionsByDoc = new Map<string, number[]>();
  items.forEach((item, position) => {
    positionsByDoc.set(item.docId, [...(positionsByDoc.get(item.docId) ?? []), position]);
  });

  const copiedPages: Array<ReturnType<PDFDocument["getPage"]>> = new Array(items.length);
  let processedDocs = 0;
  for (const [docId, positions] of positionsByDoc) {
    const bytes = sources.get(docId);
    if (!bytes) throw new Error(`Quelldokument ${docId} nicht gefunden.`);
    const source = await loadPdfDocument(bytes);
    const copied = await target.copyPages(
      source,
      positions.map((position) => items[position].pageIndex),
    );
    copied.forEach((page, index) => {
      const position = positions[index];
      rotatePageBy(page, items[position].rotation);
      copiedPages[position] = page;
    });
    processedDocs += 1;
    onProgress?.(Math.round((processedDocs / positionsByDoc.size) * 90));
    await yieldToUi();
  }

  for (const page of copiedPages) target.addPage(page);
  onProgress?.(100);
  return saveDocument(target);
}

export async function mergePdfs(
  files: Array<{ bytes: Uint8Array; name: string }>,
): Promise<Uint8Array> {
  if (files.length < 2)
    throw new Error("Für das Zusammenfügen sind mindestens zwei Dateien erforderlich.");
  const target = await PDFDocument.create();
  for (const file of files) {
    const source = await loadPdfDocument(file.bytes);
    const pages = await target.copyPages(source, source.getPageIndices());
    pages.forEach((page) => target.addPage(page));
  }
  return saveDocument(target);
}

export async function splitPdfByGroups(
  bytes: Uint8Array,
  groups: number[][],
): Promise<Array<{ name: string; bytes: Uint8Array }>> {
  const source = await loadPdfDocument(bytes);
  const results: Array<{ name: string; bytes: Uint8Array }> = [];
  for (let index = 0; index < groups.length; index++) {
    const group = groups[index];
    if (group.length === 0) continue;
    const doc = await PDFDocument.create();
    const pages = await doc.copyPages(source, group);
    pages.forEach((page) => doc.addPage(page));
    results.push({
      name: `teil-${String(index + 1).padStart(2, "0")}.pdf`,
      bytes: await saveDocument(doc),
    });
  }
  return results;
}

export async function extractPages(bytes: Uint8Array, pageIndices: number[]): Promise<Uint8Array> {
  const source = await loadPdfDocument(bytes);
  const doc = await PDFDocument.create();
  const pages = await doc.copyPages(source, pageIndices);
  pages.forEach((page) => doc.addPage(page));
  return saveDocument(doc);
}

export async function insertBlankPage(
  bytes: Uint8Array,
  afterPageIndex: number,
  size: [number, number] = A4_PORTRAIT,
): Promise<Uint8Array> {
  const doc = await loadPdfDocument(bytes);
  const index = Math.min(Math.max(afterPageIndex + 1, 0), doc.getPageCount());
  doc.insertPage(index, size);
  return saveDocument(doc);
}

export interface PageNumberOptions {
  position:
    "unten-links" | "unten-mitte" | "unten-rechts" | "oben-links" | "oben-mitte" | "oben-rechts";
  format: "n" | "n-von-total" | "seite-n";
  startAt: number;
  fontSize: number;
  marginMm: number;
  color: string;
}

function formatNumberLabel(options: PageNumberOptions, current: number, total: number): string {
  switch (options.format) {
    case "n-von-total":
      return `${current} von ${total}`;
    case "seite-n":
      return `Seite ${current}`;
    default:
      return String(current);
  }
}

export async function addPageNumbers(
  bytes: Uint8Array,
  options: PageNumberOptions,
): Promise<Uint8Array> {
  const doc = await loadPdfDocument(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const color = hexToRgb(options.color);
  const margin = mmToPt(options.marginMm);
  const total = doc.getPageCount();

  doc.getPages().forEach((page, index) => {
    const label = formatNumberLabel(options, options.startAt + index, total);
    const { width, height } = visiblePageSize(page);
    const textWidth = font.widthOfTextAtSize(label, options.fontSize);
    let x = margin;
    if (options.position.endsWith("mitte")) x = (width - textWidth) / 2;
    if (options.position.endsWith("rechts")) x = width - margin - textWidth;
    const baselineFromTop = options.position.startsWith("oben")
      ? margin + options.fontSize
      : height - margin;
    drawVisibleText(page, label, x, baselineFromTop, {
      size: options.fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
    });
  });
  return saveDocument(doc);
}

type PdfPage = ReturnType<PDFDocument["getPage"]>;

/** Größe der Seite, wie sie angezeigt wird (CropBox, inkl. /Rotate). */
function visiblePageSize(page: PdfPage): { width: number; height: number } {
  const box = page.getCropBox();
  const rotation = normalizeAngle(page.getRotation().angle);
  return rotation === 90 || rotation === 270
    ? { width: box.height, height: box.width }
    : { width: box.width, height: box.height };
}

/**
 * Zeichnet Text in Anzeige-Koordinaten (x von links, Grundlinie von oben),
 * sodass er auch auf gedrehten oder zugeschnittenen Seiten aufrecht und an der
 * sichtbaren Position erscheint.
 */
function drawVisibleText(
  page: PdfPage,
  text: string,
  x: number,
  baselineFromTop: number,
  style: Omit<NonNullable<Parameters<PdfPage["drawText"]>[1]>, "x" | "y" | "rotate">,
): void {
  const rotation = normalizeAngle(page.getRotation().angle) as 0 | 90 | 180 | 270;
  const point = editorPointToPdf(page.getCropBox(), x, baselineFromTop, rotation);
  page.drawText(text, { ...style, ...point, rotate: degrees(rotation) });
}

export interface HeaderFooterOptions {
  top?: { left?: string; center?: string; right?: string };
  bottom?: { left?: string; center?: string; right?: string };
  fontSize: number;
  marginMm: number;
  color: string;
}

const PAGE_TOKEN = /\{seite\}|\{n\}/gi;

export async function addHeaderFooter(
  bytes: Uint8Array,
  options: HeaderFooterOptions,
): Promise<Uint8Array> {
  const doc = await loadPdfDocument(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const color = hexToRgb(options.color);
  const margin = mmToPt(options.marginMm);
  const total = doc.getPageCount();

  doc.getPages().forEach((page, index) => {
    const { width, height } = visiblePageSize(page);
    const rows: Array<{ spec: HeaderFooterOptions["top"]; y: number }> = [
      { spec: options.top, y: margin + options.fontSize },
      { spec: options.bottom, y: height - margin },
    ];
    for (const row of rows) {
      if (!row.spec) continue;
      const entries: Array<[string | undefined, (textWidth: number) => number]> = [
        [row.spec.left, () => margin],
        [row.spec.center, (textWidth) => (width - textWidth) / 2],
        [row.spec.right, (textWidth) => width - margin - textWidth],
      ];
      for (const [rawText, xFor] of entries) {
        if (!rawText) continue;
        const text = rawText
          .replace(PAGE_TOKEN, String(index + 1))
          .replace(/\{total\}/gi, String(total));
        const textWidth = font.widthOfTextAtSize(text, options.fontSize);
        drawVisibleText(page, text, xFor(textWidth), row.y, {
          size: options.fontSize,
          font,
          color: rgb(color.r, color.g, color.b),
        });
      }
    }
  });
  return saveDocument(doc);
}

interface WatermarkBaseOptions {
  opacity: number;
  rotationDegrees: number;
}

export interface TextWatermarkOptions extends WatermarkBaseOptions {
  kind: "text";
  text: string;
  fontSize: number;
  color: string;
}

export interface ImageWatermarkOptions extends WatermarkBaseOptions {
  kind: "image";
  imageBytes: Uint8Array;
  imageType: "image/png" | "image/jpeg";
  scalePercent: number;
}

export type WatermarkOptions = TextWatermarkOptions | ImageWatermarkOptions;

function centeredRotatedPosition(
  pageBox: { x: number; y: number; width: number; height: number },
  contentWidth: number,
  contentHeight: number,
  rotationDegrees: number,
): { x: number; y: number } {
  const radians = (rotationDegrees * Math.PI) / 180;
  const centerX = (contentWidth / 2) * Math.cos(radians) - (contentHeight / 2) * Math.sin(radians);
  const centerY = (contentWidth / 2) * Math.sin(radians) + (contentHeight / 2) * Math.cos(radians);
  return {
    x: pageBox.x + pageBox.width / 2 - centerX,
    y: pageBox.y + pageBox.height / 2 - centerY,
  };
}

export async function addWatermark(
  bytes: Uint8Array,
  options: WatermarkOptions,
): Promise<Uint8Array> {
  const doc = await loadPdfDocument(bytes);
  const font = options.kind === "text" ? await doc.embedFont(StandardFonts.HelveticaBold) : null;
  const color = options.kind === "text" ? hexToRgb(options.color) : null;
  const image =
    options.kind === "image"
      ? options.imageType === "image/png"
        ? await doc.embedPng(options.imageBytes)
        : await doc.embedJpg(options.imageBytes)
      : null;

  for (const page of doc.getPages()) {
    // PDF.js rendert den sichtbaren CropBox-Bereich. Der Export muss denselben Rahmen verwenden,
    // da CropBox und MediaBox bei Scans, Kontoauszügen und zugeschnittenen PDFs oft abweichen.
    const visibleBox = page.getCropBox();
    // CSS dreht wegen der nach unten laufenden Y-Achse in die entgegengesetzte Richtung
    // zum PDF-Koordinatensystem. Für einen identischen visuellen Winkel wird das Vorzeichen
    // beim Export daher umgekehrt.
    // Bei Seiten mit /Rotate wird zusätzlich deren Drehung addiert, damit das
    // Wasserzeichen in der Anzeige denselben Winkel hat wie in der Vorschau.
    const pdfRotationDegrees = normalizeAngle(page.getRotation().angle) - options.rotationDegrees;
    const visibleSize = visiblePageSize(page);
    if (options.kind === "text" && font && color) {
      const textWidth = font.widthOfTextAtSize(options.text, options.fontSize);
      const position = centeredRotatedPosition(
        visibleBox,
        textWidth,
        options.fontSize,
        pdfRotationDegrees,
      );
      page.drawText(options.text, {
        ...position,
        size: options.fontSize,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity: options.opacity,
        rotate: degrees(pdfRotationDegrees),
      });
    }

    if (options.kind === "image" && image) {
      const requestedWidth = visibleSize.width * (options.scalePercent / 100);
      const requestedHeight = requestedWidth * (image.height / image.width);
      const fitFactor = Math.min(1, visibleSize.height / requestedHeight);
      const imageWidth = requestedWidth * fitFactor;
      const imageHeight = requestedHeight * fitFactor;
      const position = centeredRotatedPosition(
        visibleBox,
        imageWidth,
        imageHeight,
        pdfRotationDegrees,
      );
      page.drawImage(image, {
        ...position,
        width: imageWidth,
        height: imageHeight,
        opacity: options.opacity,
        rotate: degrees(pdfRotationDegrees),
      });
    }
  }
  return saveDocument(doc);
}

export interface CropMarginsMm {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export async function cropPages(bytes: Uint8Array, margins: CropMarginsMm): Promise<Uint8Array> {
  const doc = await loadPdfDocument(bytes);
  let croppedPages = 0;
  for (const page of doc.getPages()) {
    const media = page.getMediaBox();
    const left = mmToPt(margins.left);
    const right = mmToPt(margins.right);
    const top = mmToPt(margins.top);
    const bottom = mmToPt(margins.bottom);
    const newWidth = media.width - left - right;
    const newHeight = media.height - top - bottom;
    if (newWidth <= 10 || newHeight <= 10) continue;
    page.setCropBox(media.x + left, media.y + bottom, newWidth, newHeight);
    croppedPages += 1;
  }
  if (croppedPages === 0)
    throw new Error("Die angegebenen Ränder sind zu groß für dieses Dokument.");
  return saveDocument(doc);
}

export async function resizePages(
  bytes: Uint8Array,
  target: "A4" | "Letter",
  marginMm: number,
): Promise<Uint8Array> {
  const source = await loadPdfDocument(bytes);
  const targetSize = target === "A4" ? A4_PORTRAIT : LETTER_PORTRAIT;
  const doc = await PDFDocument.create();
  const margin = mmToPt(marginMm);

  for (const originalPage of source.getPages()) {
    const embedded = await doc.embedPage(originalPage);
    const originalBox = originalPage.getMediaBox();
    const availableWidth = targetSize[0] - margin * 2;
    const availableHeight = targetSize[1] - margin * 2;
    const scale = Math.min(
      availableWidth / originalBox.width,
      availableHeight / originalBox.height,
    );
    const scaledWidth = originalBox.width * scale;
    const scaledHeight = originalBox.height * scale;
    const page = doc.addPage(targetSize);
    page.drawPage(embedded, {
      x: (targetSize[0] - scaledWidth) / 2,
      y: (targetSize[1] - scaledHeight) / 2,
      width: scaledWidth,
      height: scaledHeight,
    });
  }
  return saveDocument(doc);
}

/**
 * Rastert die betroffenen Seiten vollständig und ersetzt deren Inhalt.
 * Dadurch werden geschwärzte Inhalte physisch aus der Datei entfernt.
 * Alle übrigen Seiten werden unverändert in der ursprünglichen Reihenfolge übernommen.
 */
export async function redactPages(
  sourceBytes: Uint8Array,
  jsDoc: import("pdfjs-dist").PDFDocumentProxy,
  rectsPerPage: Record<number, Array<{ x: number; y: number; width: number; height: number }>>,
  renderWidthPx: number,
  onProgress?: (percent: number) => void,
  token: CancellationToken = new SimpleCancellation(),
): Promise<Uint8Array> {
  const affectedPages = new Set(
    Object.keys(rectsPerPage)
      .map(Number)
      .filter((pageIndex) => rectsPerPage[pageIndex]?.length > 0),
  );

  if (affectedPages.size === 0) {
    throw new Error(
      "Keine Schwärzungen vorhanden. Ziehe zuerst Rechtecke über die sensiblen Bereiche.",
    );
  }

  const target = await PDFDocument.create();
  const pageCount = jsDoc.numPages;

  // Unveränderte Seiten in einem Schritt kopieren. Lässt sich das Original mit
  // pdf-lib nicht öffnen (z. B. verschlüsselt), werden ersatzweise alle Seiten
  // gerastert – so geht keine Seite verloren.
  const keptIndices = Array.from({ length: pageCount }, (_, index) => index).filter(
    (index) => !affectedPages.has(index),
  );
  const keptPages = new Map<number, PdfPage>();
  if (keptIndices.length > 0) {
    try {
      const source = await loadPdfDocument(sourceBytes);
      const copied = await target.copyPages(source, keptIndices);
      copied.forEach((page, index) => keptPages.set(keptIndices[index], page));
    } catch {
      keptPages.clear();
    }
  }

  const pagesToRasterize = pageCount - keptPages.size;
  let done = 0;
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    token.throwIfCancelled();
    const kept = keptPages.get(pageIndex);
    if (kept) {
      target.addPage(kept);
      continue;
    }

    const page = await jsDoc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = renderWidthPx / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas-2D-Kontext nicht verfügbar.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;

      context.fillStyle = "#000000";
      for (const rect of rectsPerPage[pageIndex] ?? []) {
        context.fillRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
      }
      page.cleanup();

      const jpegBytes = await canvasToBytes(canvas, "image/jpeg", 0.92);
      const image = await target.embedJpg(jpegBytes);
      const newPage = target.addPage([base.width, base.height]);
      newPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
    done += 1;
    onProgress?.(Math.round((done / pagesToRasterize) * 100));
    await yieldToUi();
  }
  return saveDocument(target);
}
