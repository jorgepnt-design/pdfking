import { degrees, PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import type { CancellationToken } from "../types";
import { hexToRgb, mmToPt, SimpleCancellation, yieldToUi } from "../utils";
import { loadPdfDocument, saveDocument } from "./loadDocument";

export const A4_PORTRAIT: [number, number] = [595.28, 841.89];
export const LETTER_PORTRAIT: [number, number] = [612, 792];

/** Kopiert Seiten in einer neuen Reihenfolge und setzt absolute Rotationen. */
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
    page.setRotation(degrees(items[index].rotation));
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
  const loadedSources = new Map<string, PDFDocument>();

  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    let source = loadedSources.get(item.docId);
    if (!source) {
      const bytes = sources.get(item.docId);
      if (!bytes) throw new Error(`Quelldokument ${item.docId} nicht gefunden.`);
      source = await loadPdfDocument(bytes);
      loadedSources.set(item.docId, source);
    }
    const [copiedPage] = await target.copyPages(source, [item.pageIndex]);
    copiedPage.setRotation(degrees(item.rotation % 360));
    target.addPage(copiedPage);
    if (index % 10 === 0) {
      onProgress?.(Math.round((index / Math.max(1, items.length)) * 100));
      await yieldToUi();
    }
  }
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
    const { width, height } = page.getSize();
    const textWidth = font.widthOfTextAtSize(label, options.fontSize);
    let x = margin;
    if (options.position.endsWith("mitte")) x = (width - textWidth) / 2;
    if (options.position.endsWith("rechts")) x = width - margin - textWidth;
    const y = options.position.startsWith("oben") ? height - margin - options.fontSize : margin;
    page.drawText(label, {
      x,
      y,
      size: options.fontSize,
      font,
      color: rgb(color.r, color.g, color.b),
    });
  });
  return saveDocument(doc);
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
    const { width, height } = page.getSize();
    const rows: Array<{ spec: HeaderFooterOptions["top"]; y: number }> = [
      { spec: options.top, y: height - margin - options.fontSize },
      { spec: options.bottom, y: margin },
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
        page.drawText(text, {
          x: xFor(textWidth),
          y: row.y,
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
    const pdfRotationDegrees = -options.rotationDegrees;
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
      const requestedWidth = visibleBox.width * (options.scalePercent / 100);
      const requestedHeight = requestedWidth * (image.height / image.width);
      const fitFactor = Math.min(1, visibleBox.height / requestedHeight);
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
 * Rastert betroffene Seiten vollständig und ersetzt den Inhalt.
 * Dadurch werden geschwärzte Inhalte physisch aus der Datei entfernt.
 */
export async function redactPages(
  jsDoc: import("pdfjs-dist").PDFDocumentProxy,
  rectsPerPage: Record<number, Array<{ x: number; y: number; width: number; height: number }>>,
  renderWidthPx: number,
  onProgress?: (percent: number) => void,
  token: CancellationToken = new SimpleCancellation(),
): Promise<Uint8Array> {
  const target = await PDFDocument.create();
  const affectedPages = Object.keys(rectsPerPage)
    .map(Number)
    .filter((pageIndex) => rectsPerPage[pageIndex]?.length > 0)
    .sort((a, b) => a - b);

  if (affectedPages.length === 0) {
    throw new Error(
      "Keine Schwärzungen vorhanden. Ziehe zuerst Rechtecke über die sensiblen Bereiche.",
    );
  }

  let done = 0;
  for (const pageIndex of affectedPages) {
    token.throwIfCancelled();
    const page = await jsDoc.getPage(pageIndex + 1);
    const base = page.getViewport({ scale: 1 });
    const scale = renderWidthPx / base.width;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas-2D-Kontext nicht verfügbar.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: context, viewport }).promise;

    context.fillStyle = "#000000";
    for (const rect of rectsPerPage[pageIndex]) {
      context.fillRect(rect.x * scale, rect.y * scale, rect.width * scale, rect.height * scale);
    }
    page.cleanup();

    const jpegBytes = await new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            reject(new Error("Rendern fehlgeschlagen."));
            return;
          }
          resolve(new Uint8Array(await blob.arrayBuffer()));
        },
        "image/jpeg",
        0.92,
      );
    });

    const image = await target.embedJpg(jpegBytes);
    const newPage = target.addPage([base.width, base.height]);
    newPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
    done += 1;
    onProgress?.(Math.round((done / affectedPages.length) * 100));
    await yieldToUi();
  }
  return saveDocument(target);
}
