import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import JSZip from "jszip";
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
    <title>${escapeHtml(sourceName)} – konvertiert mit PDFKing</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; color: #1e293b; }
      .seite { border-bottom: 1px solid #e2e8f0; padding-bottom: 2rem; margin-bottom: 2rem; }
      h2 { font-size: 0.9rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(sourceName)}</h1>
${body}
    <footer><small>Konvertiert mit PDFKing – Textstruktur vereinfacht wiedergegeben.</small></footer>
  </body>
</html>`;
  return new Blob([html], { type: "text/html;charset=utf-8" });
}

/**
 * Lokale PDF-zu-DOCX-Ersatzfunktion: erzeugt ein vereinfachtes Word-Dokument
 * mit der extrahierten Textstruktur (kein Layout, keine Bilder).
 * Für hochwertige Konvertierung steht der optionale Serverdienst bereit.
 */
export async function pdfToSimpleDocx(bytes: Uint8Array): Promise<Blob> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import("docx");
  const pages = await extractText(bytes);

  const children: Array<InstanceType<typeof Paragraph>> = [];
  for (const page of pages) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: `Seite ${page.pageIndex + 1}`, color: "64748B", size: 20 })],
      }),
    );
    for (const paragraph of page.text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)) {
      children.push(new Paragraph({ children: [new TextRun({ text: paragraph, size: 22 })] }));
    }
    if (!page.text) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: "[kein Text auf dieser Seite]", italics: true, color: "94A3B8" }),
          ],
        }),
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
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
