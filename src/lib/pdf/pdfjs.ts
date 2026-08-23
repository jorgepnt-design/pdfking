"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";

type PdfJsLib = typeof import("pdfjs-dist");

let libPromise: Promise<PdfJsLib> | null = null;

export async function getPdfJs(): Promise<PdfJsLib> {
  if (!libPromise) {
    libPromise = import("pdfjs-dist").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return lib;
    });
  }
  return libPromise;
}

/**
 * Lädt ein PDF für die Anzeige. Wichtig: Die Bytes werden kopiert,
 * da PDF.js den übergebenen Puffer "detacht" – das Original bleibt nutzbar.
 * Die Zerstörung erfolgt über den Loading Task (`destroy`).
 */
export interface LoadedPdfJs {
  doc: PDFDocumentProxy;
  destroy: () => Promise<void>;
}

export async function loadPdfJsDocument(bytes: Uint8Array): Promise<LoadedPdfJs> {
  const lib = await getPdfJs();
  const task = lib.getDocument({ data: new Uint8Array(bytes) });
  const doc = await task.promise;
  return {
    doc,
    destroy: () => task.destroy(),
  };
}

export interface RenderedPageInfo {
  widthPt: number;
  heightPt: number;
}

export async function renderPageToCanvas(
  doc: PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  rotation = 0,
): Promise<RenderedPageInfo> {
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const scale = (cssWidth / base.width) * dpr;
  const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas-2D-Kontext nicht verfügbar.");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
  await page.render({ canvas, canvasContext: context, viewport }).promise;
  page.cleanup();
  return { widthPt: base.width, heightPt: base.height };
}

export async function renderPageToOffscreenCanvas(
  doc: PDFDocumentProxy,
  pageIndex: number,
  targetWidthPx: number,
): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageIndex + 1);
  const base = page.getViewport({ scale: 1 });
  const scale = targetWidthPx / base.width;
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
  return canvas;
}

export function canvasToBytes(
  canvas: HTMLCanvasElement,
  mime: "image/png" | "image/jpeg",
  quality = 0.92,
): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          reject(new Error("Canvas konnte nicht exportiert werden."));
          return;
        }
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      mime,
      quality,
    );
  });
}
