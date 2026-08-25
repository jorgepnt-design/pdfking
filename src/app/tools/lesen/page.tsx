"use client";

import {
  ChevronLeft,
  ChevronRight,
  Download,
  Expand,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { useLoadedPdf } from "@/hooks/useLoadedPdf";
import { loadPdfJsDocument, renderPageToCanvas } from "@/lib/pdf/pdfjs";

interface LaunchFileHandle {
  getFile: () => Promise<File>;
}

declare global {
  interface Window {
    launchQueue?: {
      setConsumer: (consumer: (params: { files: LaunchFileHandle[] }) => void) => void;
    };
  }
}

export default function PdfReaderPage() {
  const loaded = useLoadedPdf();
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(0);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [viewerWidth, setViewerWidth] = useState(760);
  const [rendering, setRendering] = useState(false);
  const [viewerError, setViewerError] = useState<Error | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const openFilesRef = useRef(loaded.openFiles);
  const renderQueueRef = useRef<Promise<void>>(Promise.resolve());

  openFilesRef.current = loaded.openFiles;

  useEffect(() => {
    if (!window.launchQueue) return;
    window.launchQueue.setConsumer((params) => {
      const handle = params.files[0];
      if (!handle) return;
      void handle.getFile().then((file) => openFilesRef.current([file]));
    });
  }, []);

  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewerWidth(Math.max(280, Math.floor(entry.contentRect.width - 32)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loaded.file]);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;
    setDocument(null);
    setViewerError(null);
    if (!loaded.file) return;

    void loadPdfJsDocument(loaded.file.bytes)
      .then((pdf) => {
        destroy = pdf.destroy;
        if (cancelled) return pdf.destroy();
        setDocument(pdf.doc);
        setPage(0);
        setZoom(100);
        setRotation(0);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setViewerError(
            error instanceof Error ? error : new Error("PDF konnte nicht angezeigt werden."),
          );
        }
      });

    return () => {
      cancelled = true;
      void destroy?.();
    };
  }, [loaded.file]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!document || !canvas) return;
    let cancelled = false;
    setRendering(true);
    renderQueueRef.current = renderQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (cancelled) return;
        await renderPageToCanvas(document, page, canvas, viewerWidth * (zoom / 100), rotation);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setViewerError(
            error instanceof Error ? error : new Error("Seite konnte nicht angezeigt werden."),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });
    return () => {
      cancelled = true;
    };
  }, [document, page, rotation, viewerWidth, zoom]);

  const download = useCallback(() => {
    if (!loaded.file) return;
    const blob = new Blob([new Uint8Array(loaded.file.bytes)], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = loaded.file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [loaded.file]);

  const reset = () => {
    loaded.setFile(null);
    loaded.setLoadError(null);
    setDocument(null);
    setViewerError(null);
  };

  return (
    <ToolShell
      title="PDF Reader"
      description="Öffne und lies PDF-Dateien direkt in CoroaPDF – mit Zoom, Drehung und Vollbild."
      privacy="local"
      wide
    >
      {(loaded.loadError || viewerError) && (
        <div className="mb-6">
          <ErrorAlert
            error={(loaded.loadError ?? viewerError)!}
            onDismiss={() => {
              loaded.setLoadError(null);
              setViewerError(null);
            }}
          />
        </div>
      )}

      {!loaded.file ? (
        <div className="space-y-5">
          <InfoAlert title="PDF direkt öffnen">
            Auf unterstützten Geräten kann eine installierte CoroaPDF-App als PDF-Anwendung gewählt
            werden. Auf dem iPhone öffnest du zuerst CoroaPDF und wählst die PDF hier aus, da iOS
            Web-Apps nicht als automatischen PDF-Standard zulässt.
          </InfoAlert>
          <FileDropzone onFiles={loaded.openFiles} />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                {loaded.file.name}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {document
                  ? `${document.numPages} Seite${document.numPages === 1 ? "" : "n"}`
                  : "Wird geladen …"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={reset}>
                Andere PDF
              </Button>
              <Button variant="secondary" onClick={download}>
                <Download aria-hidden className="h-4 w-4" /> Herunterladen
              </Button>
            </div>
          </div>

          <div className="sticky top-2 z-10 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
            <Button
              variant="secondary"
              aria-label="Vorherige Seite"
              disabled={!document || page === 0}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft aria-hidden className="h-4 w-4" />
            </Button>
            <span className="min-w-24 text-center text-sm font-medium">
              Seite {page + 1} / {document?.numPages ?? 1}
            </span>
            <Button
              variant="secondary"
              aria-label="Nächste Seite"
              disabled={!document || page >= document.numPages - 1}
              onClick={() =>
                setPage((value) => Math.min((document?.numPages ?? 1) - 1, value + 1))
              }
            >
              <ChevronRight aria-hidden className="h-4 w-4" />
            </Button>
            <span className="mx-1 hidden h-7 w-px bg-slate-200 sm:block dark:bg-slate-700" />
            <Button
              variant="secondary"
              aria-label="Verkleinern"
              disabled={zoom <= 50}
              onClick={() => setZoom((value) => Math.max(50, value - 25))}
            >
              <ZoomOut aria-hidden className="h-4 w-4" />
            </Button>
            <span className="min-w-14 text-center text-sm font-medium">{zoom} %</span>
            <Button
              variant="secondary"
              aria-label="Vergrößern"
              disabled={zoom >= 250}
              onClick={() => setZoom((value) => Math.min(250, value + 25))}
            >
              <ZoomIn aria-hidden className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              aria-label="Seite drehen"
              onClick={() => setRotation((value) => (value + 90) % 360)}
            >
              <RotateCw aria-hidden className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              aria-label="Vollbild"
              onClick={() => void viewerRef.current?.requestFullscreen?.()}
            >
              <Expand aria-hidden className="h-4 w-4" />
            </Button>
          </div>

          <div
            ref={viewerRef}
            className="relative min-h-[60vh] overflow-auto rounded-xl bg-slate-200 p-4 text-center dark:bg-slate-950"
          >
            {rendering && (
              <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-slate-900/80 px-3 py-1 text-xs text-white">
                Seite wird geladen …
              </div>
            )}
            <canvas
              ref={canvasRef}
              className="mx-auto bg-white shadow-xl"
              aria-label={`PDF-Seite ${page + 1}`}
            />
          </div>
        </div>
      )}
    </ToolShell>
  );
}
