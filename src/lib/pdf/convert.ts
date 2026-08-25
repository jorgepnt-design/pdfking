import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import JSZip from "jszip";
import type { ISectionOptions } from "docx";
import type { ImageExportFormat } from "../types";
import { SimpleCancellation, yieldToUi } from "../utils";
import { saveDocument } from "./loadDocument";
import { canvasToBytes, loadPdfJsDocument, renderPageToOffscreenCanvas } from "./pdfjs";

export interface PageText {
  pageIndex: number;
  text: string;
}

export async function pdfToImages(
  bytes: Uint8Array,
  format: ImageExportFormat,
  options: { dpiScale: number; quality: number },
  onProgress?: (percent: number) => void,
  token = new SimpleCancellation(),
): Promise<Blob> {
  const { doc: jsDoc, destroy } = await loadPdfJsDocument(bytes);
  const zip = new JSZip();
  const extension = format === "image/png" ? "png" : "jpg";

  try {
    for (let pageIndex = 0; pageIndex < jsDoc.numPages; pageIndex++) {
      token.throwIfCancelled();
      const canvas = await renderPageToOffscreenCanvas(
        jsDoc,
        pageIndex,
        Math.round(612 * options.dpiScale),
      );
      const imageBytes = await canvasToBytes(canvas, format, options.quality);
      zip.file(`seite-${String(pageIndex + 1).padStart(3, "0")}.${extension}`, imageBytes);
      onProgress?.(Math.round(((pageIndex + 1) / jsDoc.numPages) * 100));
      await yieldToUi();
    }
  } finally {
    await destroy();
  }
  return zip.generateAsync({ type: "blob" });
}

export async function imagesToPdf(
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const buffer = new Uint8Array(await file.arrayBuffer());
    const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
    const image = isPng ? await doc.embedPng(buffer) : await doc.embedJpg(buffer);
    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
    onProgress?.(Math.round(((index + 1) / files.length) * 100));
    await yieldToUi();
  }
  return saveDocument(doc);
}

export async function extractText(bytes: Uint8Array): Promise<PageText[]> {
  const { doc: jsDoc, destroy } = await loadPdfJsDocument(bytes);
  const pages: PageText[] = [];
  try {
    for (let pageIndex = 0; pageIndex < jsDoc.numPages; pageIndex++) {
      const page = await jsDoc.getPage(pageIndex + 1);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) {
          text += item.str;
          if (item.hasEOL) text += "\n";
        }
      }
      pages.push({ pageIndex, text: text.trim() });
      page.cleanup();
    }
  } finally {
    await destroy();
  }
  return pages;
}

export function pagesToPlainText(pages: PageText[]): string {
  return pages.map((page) => `--- Seite ${page.pageIndex + 1} ---\n${page.text}`).join("\n\n");
}

export async function pdfToTextFile(bytes: Uint8Array): Promise<Blob> {
  const pages = await extractText(bytes);
  return new Blob([pagesToPlainText(pages)], { type: "text/plain;charset=utf-8" });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Erzeugt ein einfaches, sauberes HTML-Dokument (Textstruktur, keine 1:1-Optik). */
export async function pdfToHtmlFile(bytes: Uint8Array, sourceName: string): Promise<Blob> {
  const pages = await extractText(bytes);
  const body = pages
    .map((page) => {
      const paragraphs = page.text
        .split(/\n{2,}|\r\n\r\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `      <p>${escapeHtml(p).replace(/\n/g, "<br />")}</p>`)
        .join("\n");
      return `    <section class="seite" id="seite-${page.pageIndex + 1}">\n      <h2>Seite ${page.pageIndex + 1}</h2>\n${paragraphs || "      <p><em>[kein Text]</em></p>"}\n    </section>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(sourceName)} – konvertiert mit CoroaPDF</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1e293b; }
      .seite { border-bottom: 1px solid #e2e8f0; padding-bottom: 2rem; margin-bottom: 2rem; }
      h2 { font-size: 0.9rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(sourceName)}</h1>
${body}
    <footer><small>Konvertiert mit CoroaPDF – Textstruktur vereinfacht wiedergegeben.</small></footer>
  </body>
</html>`;
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

/**
 * Erzeugt lokal ein ansichtsgetreues DOCX. Jede PDF-Seite wird vollständig gerendert und als
 * hochauflösendes Seitenbild in einen gleich großen Word-Abschnitt gesetzt. So bleiben Schriften,
 * Bilder, Tabellen und Positionen erhalten; die Inhalte sind im DOCX bewusst nicht einzeln editierbar.
 */
export async function pdfToSimpleDocx(
  bytes: Uint8Array,
  onProgress?: (percent: number) => void,
): Promise<Blob> {
  const { Document, ImageRun, Packer, Paragraph } = await import("docx");
  const { doc: jsDoc, destroy } = await loadPdfJsDocument(bytes);
  const sections: ISectionOptions[] = [];
  const marginPt = 14.4; // 0,2 Zoll – verhindert zusätzliche Leerseiten durch den Absatzanker.

  try {
    for (let pageIndex = 0; pageIndex < jsDoc.numPages; pageIndex++) {
      const page = await jsDoc.getPage(pageIndex + 1);
      const viewport = page.getViewport({ scale: 1 });
      page.cleanup();

      const canvas = await renderPageToOffscreenCanvas(jsDoc, pageIndex, 1600);
      const imageBytes = await canvasToBytes(canvas, "image/png");
      const availableWidthPt = Math.max(72, viewport.width - marginPt * 2);
      const availableHeightPt = Math.max(72, viewport.height - marginPt * 2 - 10);
      const scale = Math.min(
        availableWidthPt / viewport.width,
        availableHeightPt / viewport.height,
      );
      const imageWidthPx = Math.round(viewport.width * scale * (96 / 72));
      const imageHeightPx = Math.round(viewport.height * scale * (96 / 72));

      sections.push({
        properties: {
          page: {
            size: {
              width: Math.round(viewport.width * 20),
              height: Math.round(viewport.height * 20),
            },
            margin: {
              top: Math.round(marginPt * 20),
              right: Math.round(marginPt * 20),
              bottom: Math.round(marginPt * 20),
              left: Math.round(marginPt * 20),
            },
          },
        },
        children: [
          new Paragraph({
            spacing: { before: 0, after: 0, line: 1 },
            children: [
              new ImageRun({
                data: imageBytes,
                type: "png",
                transformation: { width: imageWidthPx, height: imageHeightPx },
              }),
            ],
          }),
        ],
      });
      onProgress?.(Math.round(((pageIndex + 1) / jsDoc.numPages) * 90));
      await yieldToUi();
    }
  } finally {
    await destroy();
  }

  const document = new Document({ sections });
  const buffer = await Packer.toBuffer(document);
  onProgress?.(100);
  return new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

/**
 * Extrahiert eingebettete Bilder (best effort, experimentell).
 * Nicht jedes Bildformat/Filter kann gelesen werden – Fehler werden übersprungen.
 */
export async function extractImages(
  bytes: Uint8Array,
  onProgress?: (percent: number) => void,
  token?: SimpleCancellation,
): Promise<Array<{ name: string; blob: Blob }>> {
  const { doc: jsDoc, destroy } = await loadPdfJsDocument(bytes);
  const results: Array<{ name: string; blob: Blob }> = [];
  let counter = 0;

  try {
    for (let pageIndex = 0; pageIndex < jsDoc.numPages; pageIndex++) {
      token?.throwIfCancelled();
      const page = await jsDoc.getPage(pageIndex + 1);
      try {
        const operatorList = await page.getOperatorList();
        const objs = page.objs as unknown as {
          get: (name: string, callback: (value: unknown) => void) => void;
        };
        const seen = new Set<string>();
        for (let i = 0; i < operatorList.fnArray.length; i++) {
          if (operatorList.fnArray[i] !== 85) continue;
          const args = operatorList.argsArray[i] as unknown[];
          const name = String(args[0]);
          if (seen.has(name)) continue;
          seen.add(name);
          try {
            const obj = await new Promise<unknown>((resolve, reject) => {
              const timeout = setTimeout(() => reject(new Error("timeout")), 4000);
              objs.get(name, (value: unknown) => {
                clearTimeout(timeout);
                resolve(value);
              });
            });
            const record = obj as { bitmap?: ImageBitmap; width?: number; height?: number };
            if (!record?.bitmap || typeof document === "undefined") continue;
            const canvas = document.createElement("canvas");
            canvas.width = record.width ?? record.bitmap.width;
            canvas.height = record.height ?? record.bitmap.height;
            const context = canvas.getContext("2d");
            if (!context) continue;
            context.drawImage(record.bitmap, 0, 0);
            const blob = await new Promise<Blob | null>((resolve) =>
              canvas.toBlob(resolve, "image/png"),
            );
            if (blob && blob.size > 1024) {
              counter += 1;
              results.push({ name: `bild-seite-${pageIndex + 1}-${counter}.png`, blob });
            }
            record.bitmap.close?.();
          } catch {
            continue;
          }
        }
      } finally {
        page.cleanup();
      }
      onProgress?.(Math.round(((pageIndex + 1) / jsDoc.numPages) * 100));
      await yieldToUi();
    }
  } finally {
    await destroy();
  }
  return results;
}

/** Fügt eine unsichtbare, durchsuchbare Textebene über ein Seitenbild. */
export async function buildSearchablePdf(
  pageImages: Array<{
    canvas: HTMLCanvasElement;
    words: Array<{ text: string; x: number; y: number; width: number; height: number }>;
  }>,
  pageSizes: Array<{ width: number; height: number }>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  for (let index = 0; index < pageImages.length; index++) {
    const { canvas, words } = pageImages[index];
    const size = pageSizes[index];
    const jpegBytes = await canvasToBytes(canvas, "image/jpeg", 0.85);
    const image = await doc.embedJpg(jpegBytes);
    const page = doc.addPage([size.width, size.height]);
    page.drawImage(image, { x: 0, y: 0, width: size.width, height: size.height });

    const scaleX = size.width / canvas.width;
    const scaleY = size.height / canvas.height;
    for (const word of words) {
      const fontSize = Math.max(4, word.height * scaleY);
      const x = word.x * scaleX;
      const y = size.height - (word.y + word.height) * scaleY;
      try {
        page.drawText(word.text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          opacity: 0,
        });
      } catch {
        continue;
      }
    }
  }
  return saveDocument(doc);
}
