"use client";

import { AppError, type CancellationToken } from "../types";
import { SimpleCancellation, yieldToUi } from "../utils";
import { loadPdfJsDocument } from "./pdfjs";
import { buildSearchablePdf } from "./convert";

export interface OcrWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrPageResult {
  pageIndex: number;
  text: string;
  words: OcrWord[];
}

interface TesseractWordLike {
  text?: string;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

interface TesseractProgress {
  status?: string;
  progress?: number;
}

const OCR_STATUS_LABELS: Record<string, string> = {
  "loading tesseract core": "OCR-Kern wird geladen …",
  "initializing tesseract": "OCR-Kern wird initialisiert …",
  "loading language traineddata": "Sprachdaten werden geladen …",
  "initializing api": "Spracherkennung wird vorbereitet …",
};

async function createOcrWorker(
  lang: string,
  onProgress?: (percent: number, label: string) => void,
) {
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  try {
    const { createWorker } = await import("tesseract.js");
    const languages = lang.includes("+") ? lang.split("+") : lang;
    const workerPromise = createWorker(languages, 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      logger: (message: TesseractProgress) => {
        const label = OCR_STATUS_LABELS[message.status ?? ""];
        if (!label) return;
        const detail = Math.round(Math.max(0, Math.min(1, message.progress ?? 0)) * 8);
        onProgress?.(Math.max(1, detail), label);
      },
    });
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        reject(new Error("OCR-Start hat das Zeitlimit überschritten."));
      }, 120_000);
    });
    workerPromise.then((worker) => timedOut && void worker.terminate()).catch(() => undefined);
    return await Promise.race([workerPromise, timeout]);
  } catch (error) {
    console.error("OCR-Worker konnte nicht gestartet werden:", error);
    throw new AppError(
      "UNKNOWN",
      "Die OCR-Komponenten konnten nicht geladen werden.",
      "Bitte prüfe deine Internetverbindung und lade die Seite neu. Beim ersten Start können die Sprachdaten je nach Verbindung bis zu zwei Minuten benötigen.",
    );
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

/**
 * OCR vollständig im Browser über WebAssembly.
 * Hinweis: Die Sprachdaten werden einmalig aus dem Internet geladen
 * und danach vom Browser gecacht. Die Dokumentinhalte verlassen das Gerät nicht.
 */
export async function runOcr(
  pdfBytes: Uint8Array,
  language: string,
  onProgress?: (percent: number, label: string) => void,
  token: CancellationToken = new SimpleCancellation(),
): Promise<OcrPageResult[]> {
  onProgress?.(1, "OCR-Komponenten werden geladen …");
  const worker = await createOcrWorker(language, onProgress);
  const { doc: jsDoc, destroy } = await loadPdfJsDocument(pdfBytes);
  const results: OcrPageResult[] = [];

  try {
    for (let pageIndex = 0; pageIndex < jsDoc.numPages; pageIndex++) {
      token.throwIfCancelled();
      onProgress?.(
        10 + Math.round((pageIndex / jsDoc.numPages) * 90),
        `Seite ${pageIndex + 1} wird erkannt …`,
      );

      const page = await jsDoc.getPage(pageIndex + 1);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.max(2, 1600 / base.width);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas-2D-Kontext nicht verfügbar.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: context, viewport }).promise;
      page.cleanup();

      const result = (await worker.recognize(
        canvas,
        {},
        { text: true, blocks: false },
      )) as unknown as {
        data: { text: string; words?: TesseractWordLike[] };
      };
      const words: OcrWord[] = [];
      for (const word of result.data.words ?? []) {
        if (!word.text?.trim() || !word.bbox) continue;
        words.push({
          text: word.text,
          x: word.bbox.x0 / scale,
          y: word.bbox.y0 / scale,
          width: (word.bbox.x1 - word.bbox.x0) / scale,
          height: (word.bbox.y1 - word.bbox.y0) / scale,
        });
      }
      results.push({ pageIndex, text: result.data.text.trim(), words });
      canvas.width = 0;

      onProgress?.(
        10 + Math.round(((pageIndex + 1) / jsDoc.numPages) * 90),
        `Seite ${pageIndex + 1} von ${jsDoc.numPages} abgeschlossen`,
      );
      await yieldToUi();
    }
  } finally {
    await worker.terminate();
    await destroy();
  }
  return results;
}

export async function makeSearchablePdf(
  pdfBytes: Uint8Array,
  ocrResults: OcrPageResult[],
  renderWidthPx: number,
  onProgress?: (percent: number) => void,
  token: CancellationToken = new SimpleCancellation(),
): Promise<Uint8Array> {
  const { doc: jsDoc, destroy } = await loadPdfJsDocument(pdfBytes);
  const images: Array<{ canvas: HTMLCanvasElement; words: OcrWord[] }> = [];
  const sizes: Array<{ width: number; height: number }> = [];

  try {
    for (let index = 0; index < jsDoc.numPages; index++) {
      token.throwIfCancelled();
      const page = await jsDoc.getPage(index + 1);
      const base = page.getViewport({ scale: 1 });
      sizes.push({ width: base.width, height: base.height });

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
      page.cleanup();

      images.push({
        canvas,
        words: ocrResults.find((result) => result.pageIndex === index)?.words ?? [],
      });
      onProgress?.(Math.round(((index + 1) / jsDoc.numPages) * 100));
    }
    return await buildSearchablePdf(images, sizes);
  } finally {
    for (const image of images) image.canvas.width = 0;
    await destroy();
  }
}
