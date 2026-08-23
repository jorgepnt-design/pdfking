import type { CompressionLevel, CompressionOptions, CompressionResult } from "../types";
import { SimpleCancellation, yieldToUi } from "../utils";
import { loadPdfDocument, saveDocument } from "./loadDocument";
import { canvasToBytes, loadPdfJsDocument, renderPageToOffscreenCanvas } from "./pdfjs";
import { stripMetadata } from "./security";
import { PDFDocument } from "@cantoo/pdf-lib";

const LEVEL_SETTINGS: Record<
  Exclude<CompressionLevel, "leicht">,
  { dpiScale: number; quality: number }
> = {
  mittel: { dpiScale: 150 / 72, quality: 0.72 },
  stark: { dpiScale: 110 / 72, quality: 0.5 },
};

function applyGrayscale(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let index = 0; index < data.length; index += 4) {
    const gray = Math.round(
      0.299 * data[index] + 0.587 * data[index + 1] + 0.114 * data[index + 2],
    );
    data[index] = gray;
    data[index + 1] = gray;
    data[index + 2] = gray;
  }
  context.putImageData(imageData, 0, 0);
}

/**
 * Komprimiert ein PDF vollständig lokal im Browser.
 *
 * „leicht": Struktur-Optimierung und optionales Entfernen der Metadaten –
 * verlustfrei, spart aber nur wenig Speicherplatz.
 *
 * „mittel"/„stark": Seiten werden als JPEG gerastert und neu zusammengesetzt.
 * Das verringert die Dateigröße deutlich, reduziert aber die Qualität
 * (Text wird zur Grafik und ist nicht mehr durchsuchbar).
 */
export async function compressPdf(
  bytes: Uint8Array,
  options: CompressionOptions,
  onProgress?: (percent: number) => void,
  token = new SimpleCancellation(),
): Promise<CompressionResult> {
  const originalSize = bytes.byteLength;

  if (options.level === "leicht") {
    const prepared = options.removeMetadata ? await stripMetadata(bytes) : bytes;
    const doc = await loadPdfDocument(prepared);
    const saved = await saveDocument(doc);
    return { bytes: saved, originalSize, newSize: saved.byteLength, rasterized: false };
  }

  const settings = LEVEL_SETTINGS[options.level];
  const { doc: jsDoc, destroy } = await loadPdfJsDocument(bytes);
  const target = await PDFDocument.create();
  const pageCount = jsDoc.numPages;

  try {
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      token.throwIfCancelled();
      let canvas = await renderPageToOffscreenCanvas(
        jsDoc,
        pageIndex,
        Math.round(612 * settings.dpiScale),
      );
      if (options.grayscale) applyGrayscale(canvas);
      const jpegBytes = await canvasToBytes(canvas, "image/jpeg", settings.quality);
      canvas.width = 0;
      canvas.height = 0;
      void canvas;
      canvas = null as unknown as HTMLCanvasElement;

      const image = await target.embedJpg(jpegBytes);
      const source = await jsDoc.getPage(pageIndex + 1);
      const base = source.getViewport({ scale: 1 });
      const newPage = target.addPage([base.width, base.height]);
      newPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height });
      onProgress?.(Math.round(((pageIndex + 1) / pageCount) * 95));
      await yieldToUi();
    }

    if (options.removeMetadata) {
      target.setTitle("");
      target.setAuthor("");
      target.setSubject("");
      target.setKeywords([]);
      target.setCreator("");
      target.setProducer("");
    }
    const saved = await target.save({ useObjectStreams: true });
    onProgress?.(100);
    return { bytes: saved, originalSize, newSize: saved.byteLength, rasterized: true };
  } finally {
    await destroy();
  }
}
