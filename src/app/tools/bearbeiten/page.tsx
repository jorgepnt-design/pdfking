"use client";

import Link from "next/link";
import {
  ArrowRight,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  PenLine,
  Plus,
  Redo2,
  Square,
  Strikethrough,
  Trash2,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ResultCard } from "@/components/shared/result-card";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert } from "@/components/ui/alerts";
import { Button, IconButton } from "@/components/ui/button";
import { FieldLabel, Select } from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useProcessing } from "@/hooks/useProcessing";
import {
  createHighlightElement,
  createDecorationElement,
  createImageElement,
  createInkElement,
  createLineElement,
  createRectElement,
  createTextElement,
  DEFAULT_EDITOR_STYLE,
  HistoryStore,
  moveElement,
  resizeImageElement,
  type ImageResizeHandle,
  type EditorStyleDefaults,
} from "@/lib/editor/model";
import { flattenEditorElements } from "@/lib/pdf/annotate";
import { loadPdfJsDocument, renderPageToCanvas } from "@/lib/pdf/pdfjs";
import { decryptFromStorage, isSessionUnlocked } from "@/lib/signatures/session";
import { arrayBufferToDataUrl } from "@/lib/signatures/encoding";
import { listSignatures, loadSignaturePayload } from "@/lib/signatures/store";
import type { EditorElement, EditorTool, FontFamily, PageElements, TextAlign } from "@/lib/types";
import { validateImageFile, validatePdfFiles } from "@/lib/validate";

const TOOL_ITEMS: Array<{
  id: EditorTool;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: "select", label: "Auswählen & verschieben", icon: MousePointer2 },
  { id: "text", label: "Textfeld einfügen", icon: Type },
  { id: "highlight", label: "Text hervorheben", icon: Highlighter },
  { id: "rect", label: "Rechteck", icon: Square },
  { id: "line", label: "Linie", icon: Minus },
  { id: "arrow", label: "Pfeil", icon: ArrowRight },
  { id: "ink", label: "Freihand zeichnen", icon: PenLine },
  { id: "underline", label: "Unterstreichen", icon: Underline },
  { id: "strike", label: "Durchstreichen", icon: Strikethrough },
  { id: "image", label: "Bild / Unterschrift einfügen", icon: ImagePlus },
];

export default function BearbeitenPage() {
  return (
    <TooltipProvider>
      <EditorInner />
    </TooltipProvider>
  );
}

function EditorInner() {
  const processing = useProcessing();

  // Dokumentzustand
  const [jsDoc, setJsDoc] = useState<PDFDocumentProxy | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [pdfSize, setPdfSize] = useState(0);
  const pdfBytesRef = useRef<Uint8Array | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  // Editor-Zustand
  const [tool, setTool] = useState<EditorTool>("select");
  const [pages, setPages] = useState<PageElements>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [style, setStyle] = useState<EditorStyleDefaults>(DEFAULT_EDITOR_STYLE);
  const historyRef = useRef(new HistoryStore<PageElements>());
  const [historyFlags, setHistoryFlags] = useState({ canUndo: false, canRedo: false });
  const [, forceRender] = useState(0);

  const syncHistoryFlags = useCallback(() => {
    setHistoryFlags({ canUndo: historyRef.current.canUndo, canRedo: historyRef.current.canRedo });
  }, []);

  // Interaktion
  const overlayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const documentViewportRef = useRef<HTMLDivElement>(null);
  const [documentViewportWidth, setDocumentViewportWidth] = useState(760);
  const dragRef = useRef<{
    mode: "create" | "move" | "resize" | "ink";
    id?: string;
    startPoint?: { x: number; y: number };
    original?: EditorElement;
    resizeHandle?: ImageResizeHandle;
    lastPoint?: { x: number; y: number };
  } | null>(null);
  const [draftRect, setDraftRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Bild/Signatur platzieren
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; aspectRatio: number } | null>(
    null,
  );
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signatures, setSignatures] = useState<
    Array<{ id: string; name: string; dataUrl: string }>
  >([]);
  const [signaturesUnlocked, setSignaturesUnlocked] = useState(true);
  const destroyRef = useRef<(() => Promise<void>) | null>(null);

  // Export
  const [exportedBytes, setExportedBytes] = useState<Uint8Array | null>(null);

  useEffect(
    () => () => {
      destroyRef.current?.().catch(() => undefined);
    },
    [],
  );

  useEffect(() => {
    const viewport = documentViewportRef.current;
    if (!jsDoc || !viewport || typeof ResizeObserver === "undefined") return;

    const updateWidth = () => {
      // 2rem entsprechen dem horizontalen Innenabstand der Vorschaufläche.
      setDocumentViewportWidth(Math.max(240, viewport.clientWidth - 32));
    };
    updateWidth();

    const observer = new ResizeObserver(updateWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [jsDoc]);

  const openFile = async (files: File[]) => {
    if (processing.state.active) return;
    processing.clearError();
    const { accepted, rejected } = await validatePdfFiles(files);
    if (rejected.length > 0 && accepted.length === 0) return;
    const file = accepted[0];
    await processing.run("PDF wird geladen …", async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loaded = await loadPdfJsDocument(bytes);
      pdfBytesRef.current = bytes;
      const previousDestroy = destroyRef.current;
      setJsDoc(loaded.doc);
      destroyRef.current = loaded.destroy;
      previousDestroy?.().catch(() => undefined);
      setPdfName(file.name);
      setPdfSize(file.size);
      setPageIndex(0);
      setPages({});
      setSelectedId(null);
      setExportedBytes(null);
      historyRef.current.reset();
      forceRender((value) => value + 1);
      syncHistoryFlags();
    });
  };

  // Seitenmaße laden
  useEffect(() => {
    if (!jsDoc) return;
    let cancelled = false;
    void (async () => {
      try {
        const page = await jsDoc.getPage(pageIndex + 1);
        const viewport = page.getViewport({ scale: 1 });
        if (!cancelled) setPageSize({ width: viewport.width, height: viewport.height });
        page.cleanup();
      } catch {
        /* Seite nicht verfügbar */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jsDoc, pageIndex]);

  // Signatur-Vorwahl per URL (?tool=signatur) – Effect folgt unterhalb der Definition.
  const openSignaturePicker = async () => {
    if (!isSessionUnlocked()) {
      setSignaturesUnlocked(false);
      setSignDialogOpen(true);
      return;
    }
    setSignaturesUnlocked(true);
    await processing.run("Unterschriften werden geladen …", async () => {
      const metas = await listSignatures();
      const loaded: Array<{ id: string; name: string; dataUrl: string }> = [];
      for (const meta of metas) {
        const record = await loadSignaturePayload(meta.id);
        if (!record) continue;
        try {
          const buffer = await decryptFromStorage(record.payload);
          loaded.push({ id: meta.id, name: meta.name, dataUrl: arrayBufferToDataUrl(buffer) });
        } catch {
          continue;
        }
      }
      setSignatures(loaded);
      setSignDialogOpen(true);
      return true;
    });
  };

  useEffect(() => {
    if (!jsDoc) return;
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tool") === "signatur") {
        void openSignaturePicker();
      }
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jsDoc]);

  const pickSignature = async (dataUrl: string) => {
    const ratio = await new Promise<number>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth / Math.max(1, image.naturalHeight));
      image.onerror = () => resolve(3);
      image.src = dataUrl;
    });
    setPendingImage({ dataUrl, aspectRatio: ratio });
    setTool("image");
    setSignDialogOpen(false);
  };

  const handleImageUpload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      void processing.run("", async () => {
        throw problem;
      });
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      reader.readAsDataURL(file);
    });
    await pickSignature(dataUrl);
  };

  // ---------- Historie ----------
  const pagesRef = useRef<PageElements>({});
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  const commit = useCallback(
    (updater: (current: PageElements) => PageElements) => {
      const current = pagesRef.current;
      const next = updater(current);
      historyRef.current.push(next);
      pagesRef.current = next;
      setPages(next);
      forceRender((value) => value + 1);
      syncHistoryFlags();
    },
    [syncHistoryFlags],
  );

  const undo = useCallback(() => {
    const previous = historyRef.current.undo();
    if (previous === null) return;
    pagesRef.current = previous;
    setPages(previous);
    setSelectedId(null);
    forceRender((value) => value + 1);
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const redo = useCallback(() => {
    const next = historyRef.current.redo();
    if (next === null) return;
    pagesRef.current = next;
    setPages(next);
    setSelectedId(null);
    forceRender((value) => value + 1);
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  // Tastaturkürzel
  const deleteSelected = () => {
    if (!selectedId) return;
    commit((current) => ({
      ...current,
      [pageIndex]: (current[pageIndex] ?? []).filter((element) => element.id !== selectedId),
    }));
    setSelectedId(null);
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing =
        target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
      if (!typing && (event.key === "Delete" || event.key === "Backspace") && selectedId) {
        event.preventDefault();
        deleteSelected();
      }
      if (!typing && event.key === "Escape") {
        setTool("select");
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ---------- Zeigerinteraktion ----------
  const toPoint = (event: React.PointerEvent): { x: number; y: number } | null => {
    const overlay = overlayRef.current;
    if (!overlay || !pageSize) return null;
    const bounds = overlay.getBoundingClientRect();
    const scaleX = pageSize.width / bounds.width;
    const scaleY = pageSize.height / bounds.height;
    return {
      x: Math.min(Math.max(0, event.clientX - bounds.left) * scaleX, pageSize.width),
      y: Math.min(Math.max(0, event.clientY - bounds.top) * scaleY, pageSize.height),
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pageSize) return;
    const point = toPoint(event);
    if (!point) return;

    if (tool === "select") {
      const target = event.target as HTMLElement;
      const targetId = target.closest("[data-elem]")?.getAttribute("data-elem");
      const resizeHandle = target
        .closest("[data-resize-handle]")
        ?.getAttribute("data-resize-handle") as ImageResizeHandle | null;
      if (targetId) {
        const element = (pages[pageIndex] ?? []).find((candidate) => candidate.id === targetId);
        if (element) {
          setSelectedId(targetId);
          historyRef.current.push(pages);
          dragRef.current = {
            mode: resizeHandle && element.kind === "image" ? "resize" : "move",
            id: targetId,
            startPoint: point,
            original: structuredClone(element),
            resizeHandle: resizeHandle ?? undefined,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      } else {
        setSelectedId(null);
      }
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    historyRef.current.push(pages);

    switch (tool) {
      case "text": {
        const element = createTextElement(pageIndex, point.x, point.y, style);
        commit((current) => ({
          ...current,
          [pageIndex]: [...(current[pageIndex] ?? []), element],
        }));
        setSelectedId(element.id);
        break;
      }
      case "image": {
        if (!pendingImage) return;
        const element = createImageElement(
          pageIndex,
          point.x,
          point.y,
          pendingImage.dataUrl,
          pendingImage.aspectRatio,
        );
        commit((current) => ({
          ...current,
          [pageIndex]: [...(current[pageIndex] ?? []), element],
        }));
        setSelectedId(element.id);
        setTool("select");
        break;
      }
      case "ink": {
        const element = createInkElement(pageIndex, point, style);
        commit((current) => ({
          ...current,
          [pageIndex]: [...(current[pageIndex] ?? []), element],
        }));
        dragRef.current = { mode: "ink", id: element.id, lastPoint: point };
        break;
      }
      case "line":
      case "arrow": {
        dragRef.current = { mode: "create", startPoint: point };
        setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
        break;
      }
      case "rect":
      case "highlight":
      case "underline":
      case "strike": {
        dragRef.current = { mode: "create", startPoint: point };
        setDraftRect({ x: point.x, y: point.y, width: 0, height: 0 });
        break;
      }
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const point = toPoint(event);
    if (!point) return;

    if (drag.mode === "ink" && drag.id) {
      setPages((current) => ({
        ...current,
        [pageIndex]: (current[pageIndex] ?? []).map((element) =>
          element.id === drag.id && element.kind === "ink"
            ? {
                ...element,
                points: [...element.points, point],
                width: Math.max(point.x - element.x, 0),
                height: Math.max(point.y - element.y, 0),
              }
            : element,
        ),
      }));
      return;
    }

    if (drag.mode === "move" && drag.startPoint && drag.original) {
      const dx = point.x - drag.startPoint.x;
      const dy = point.y - drag.startPoint.y;
      setPages((current) => ({
        ...current,
        [pageIndex]: (current[pageIndex] ?? []).map((element) =>
          element.id === drag.id ? moveElement(structuredClone(drag.original!), dx, dy) : element,
        ),
      }));
      return;
    }

    if (
      drag.mode === "resize" &&
      drag.startPoint &&
      drag.original?.kind === "image" &&
      drag.resizeHandle &&
      pageSize
    ) {
      const dx = point.x - drag.startPoint.x;
      const dy = point.y - drag.startPoint.y;
      const resized = resizeImageElement(
        drag.original,
        drag.resizeHandle,
        dx,
        dy,
        pageSize.width,
        pageSize.height,
      );
      setPages((current) => ({
        ...current,
        [pageIndex]: (current[pageIndex] ?? []).map((element) =>
          element.id === drag.id ? resized : element,
        ),
      }));
      return;
    }

    if (drag.mode === "create" && drag.startPoint) {
      const start = drag.startPoint;
      setDraftRect({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      });
    }
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;

    if (drag?.mode === "create" && drag.startPoint) {
      const point = toPoint(event);
      if (!point || !draftRect || draftRect.width < 4) {
        setDraftRect(null);
        return;
      }
      let element: EditorElement;
      switch (tool) {
        case "rect":
          element = createRectElement(pageIndex, draftRect.x, draftRect.y, style);
          element.width = draftRect.width;
          element.height = draftRect.height;
          break;
        case "highlight":
          element = createHighlightElement(pageIndex, draftRect.x, draftRect.y);
          element.width = draftRect.width;
          element.height = draftRect.height;
          break;
        case "underline":
        case "strike":
          element = createDecorationElement(pageIndex, draftRect.x, draftRect.y, tool, style);
          element.width = draftRect.width;
          break;
        case "line":
        case "arrow": {
          element = createLineElement(
            pageIndex,
            drag.startPoint.x,
            drag.startPoint.y,
            tool === "arrow",
            style,
          );
          element.x2 = point.x;
          element.y2 = point.y;
          element.width = Math.abs(point.x - drag.startPoint.x);
          break;
        }
        default:
          setDraftRect(null);
          return;
      }
      commit((current) => ({ ...current, [pageIndex]: [...(current[pageIndex] ?? []), element] }));
      setSelectedId(element.id);
      setDraftRect(null);
    }

    if (drag?.mode === "move" || drag?.mode === "resize") {
      forceRender((value) => value + 1);
      syncHistoryFlags();
    }
  };

  // ---------- Export ----------
  const exportPdf = () =>
    processing.run("Änderungen werden ins PDF übertragen …", async ({ report }) => {
      if (!pdfBytesRef.current) return null;
      const bytes = await flattenEditorElements(pdfBytesRef.current, pages, report);
      setExportedBytes(bytes);
      return bytes;
    });

  const updateSelected = (
    patch: Partial<Extract<EditorElement, { kind: "text" }>> & Record<string, unknown>,
  ) => {
    if (!selectedId) return;
    setPages((current) => ({
      ...current,
      [pageIndex]: (current[pageIndex] ?? []).map((element) =>
        element.id === selectedId ? ({ ...element, ...patch } as EditorElement) : element,
      ),
    }));
  };

  const pageElements = useMemo(() => pages[pageIndex] ?? [], [pages, pageIndex]);
  const selected = pageElements.find((element) => element.id === selectedId) ?? null;
  const { canUndo, canRedo } = historyFlags;

  // ---------- Render ----------
  if (!jsDoc) {
    return (
      <ToolShell
        title="PDF bearbeiten"
        description="Füge Texte, Bilder, Formen, Markierungen und Freihand hinzu – mit Vorschau, Rückgängig-Funktion und direktem Export."
        privacy="local"
        wide
      >
        <FileDropzone onFiles={openFile} />
        <div className="mt-4">
          <InfoAlert title="Vollständig lokal">
            Der Editor arbeitet komplett im Browser. Beim Export werden deine Ergänzungen dauerhaft
            in die PDF-Datei „eingebrannt“.
          </InfoAlert>
        </div>
        <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
      </ToolShell>
    );
  }

  const displayWidth = pageSize ? Math.min(760, documentViewportWidth) * zoom : 600;

  return (
    <ToolShell
      title="PDF bearbeiten"
      description={`Dokument: ${pdfName} · ${jsDoc.numPages} Seiten · alle Änderungen bleiben lokal.`}
      privacy="local"
      wide
    >
      {processing.error ? (
        <div className="mb-4">
          <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[11rem_minmax(0,1fr)_13rem] xl:grid-cols-[12rem_minmax(0,1fr)_14rem]">
        {/* Werkzeugleiste */}
        <aside
          aria-label="Werkzeuge"
          className="order-2 flex flex-row flex-wrap gap-1 rounded-xl border border-slate-200 p-2 lg:order-1 lg:flex-col dark:border-slate-800"
        >
          {TOOL_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if (item.id === "image" && !pendingImage) {
                  void openSignaturePicker();
                  return;
                }
                setTool(item.id);
              }}
              aria-pressed={tool === item.id}
              title={item.label}
              className={
                tool === item.id
                  ? "flex items-center gap-2 rounded-lg bg-blue-700 px-2.5 py-2 text-xs font-medium text-white"
                  : "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => document.getElementById("editor-image-input")?.click()}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ImagePlus className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Eigenes Bild hochladen</span>
          </button>
          <input
            id="editor-image-input"
            type="file"
            accept="image/png,image/jpeg"
            className="sr-only"
            onChange={(event) => {
              void handleImageUpload(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />

          <div className="mx-1 hidden border-t border-slate-200 lg:block dark:border-slate-700" />
          <IconButton label="Rückgängig (Strg+Z)" onClick={undo} disabled={!canUndo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Wiederherstellen (Strg+Y)" onClick={redo} disabled={!canRedo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>

          {pendingImage ? (
            <p className="rounded-lg bg-blue-50 px-2 py-1.5 text-[11px] leading-snug text-blue-900 dark:bg-blue-950 dark:text-blue-100">
              Bild bereit – klicke auf die Seite zum Platzieren.
            </p>
          ) : null}
        </aside>

        {/* Zeichenfläche */}
        <section aria-label="Dokumentseite" className="order-1 min-w-0 space-y-3 lg:order-2">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
              disabled={pageIndex === 0}
            >
              ←
            </Button>
            <span className="text-sm font-medium">
              Seite {pageIndex + 1} / {jsDoc.numPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPageIndex((index) => Math.min(jsDoc.numPages - 1, index + 1))}
              disabled={pageIndex >= jsDoc.numPages - 1}
            >
              →
            </Button>
            <span className="mx-2 h-5 w-px bg-slate-300 dark:bg-slate-600" />
            <IconButton
              label="Verkleinern"
              onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
            >
              <Minus className="h-4 w-4" />
            </IconButton>
            <span className="w-12 text-center text-sm">{Math.round(zoom * 100)} %</span>
            <IconButton
              label="Vergrößern"
              onClick={() => setZoom((value) => Math.min(2.5, value + 0.25))}
            >
              <Plus className="h-4 w-4" />
            </IconButton>
          </div>

          <div
            ref={documentViewportRef}
            className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 p-4 dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="relative mx-auto shadow-md" style={{ width: displayWidth }}>
              <canvas
                ref={canvasRef}
                className="block w-full"
                aria-label={`Seite ${pageIndex + 1}`}
              />
              {/* Canvas rendern */}
              <CanvasRenderer
                jsDoc={jsDoc}
                pageIndex={pageIndex}
                canvasRef={canvasRef}
                width={displayWidth}
              />
              {/* Overlay */}
              <div
                ref={overlayRef}
                role="application"
                aria-label={`Bearbeitungsebene Seite ${pageIndex + 1}. Aktives Werkzeug: ${TOOL_ITEMS.find((item) => item.id === tool)?.label}`}
                className={
                  "absolute inset-0 " + (tool === "select" ? "" : "cursor-crosshair touch-none")
                }
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                <ElementsLayer
                  elements={pageElements}
                  scale={pageSize ? displayWidth / pageSize.width : 1}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
                {draftRect ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute border-2 border-dashed border-blue-600 bg-blue-500/10"
                    style={{
                      left: `${draftRect.x * (displayWidth / (pageSize?.width ?? 1))}px`,
                      top: `${draftRect.y * (displayWidth / (pageSize?.width ?? 1))}px`,
                      width: `${draftRect.width * (displayWidth / (pageSize?.width ?? 1))}px`,
                      height: `${draftRect.height * (displayWidth / (pageSize?.width ?? 1))}px`,
                    }}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* Eigenschaften */}
        <aside
          aria-label="Eigenschaften"
          className="order-3 space-y-4 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
        >
          <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
            {selected ? `Ausgewählt: ${elementLabel(selected)}` : "Standardstil"}
          </h2>

          {selected?.kind === "image" ? (
            <InfoAlert title="Größe ändern">
              Ziehe einen der blauen Eckpunkte. Das Seitenverhältnis der Unterschrift bleibt dabei
              erhalten.
            </InfoAlert>
          ) : null}

          {selected?.kind === "text" ? (
            <>
              <div>
                <FieldLabel htmlFor="prop-text">Inhalt</FieldLabel>
                <textarea
                  id="prop-text"
                  value={selected.text}
                  onChange={(event) => updateSelected({ text: event.target.value })}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 bg-white p-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 dark:border-slate-600 dark:bg-slate-900"
                />
              </div>
              <div>
                <FieldLabel htmlFor="prop-font">Schriftart</FieldLabel>
                <Select
                  id="prop-font"
                  value={selected.fontFamily}
                  onChange={(event) =>
                    updateSelected({ fontFamily: event.target.value as FontFamily })
                  }
                >
                  <option value="Helvetica">Helvetica / Sans</option>
                  <option value="TimesRoman">Times / Serif</option>
                  <option value="Courier">Courier / Monospace</option>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.bold}
                  onChange={(event) => updateSelected({ bold: event.target.checked })}
                  className="h-4 w-4 accent-blue-700"
                />
                Fett
              </label>
              <div>
                <FieldLabel htmlFor="prop-align">Ausrichtung</FieldLabel>
                <Select
                  id="prop-align"
                  value={selected.align}
                  onChange={(event) => updateSelected({ align: event.target.value as TextAlign })}
                >
                  <option value="left">Linksbündig</option>
                  <option value="center">Zentriert</option>
                  <option value="right">Rechtsbündig</option>
                </Select>
              </div>
            </>
          ) : null}

          {(tool === "text" || selected?.kind === "text") && (
            <div>
              <FieldLabel htmlFor="prop-size">Schriftgröße</FieldLabel>
              <Slider
                id="prop-size"
                min={6}
                max={72}
                step={1}
                value={[selected?.kind === "text" ? selected.fontSize : style.fontSize]}
                onValueChange={([value]) =>
                  selected?.kind === "text"
                    ? updateSelected({ fontSize: value })
                    : setStyle((current) => ({ ...current, fontSize: value }))
                }
              />
              <span className="text-xs text-slate-500">
                {selected?.kind === "text" ? selected.fontSize : style.fontSize} pt
              </span>
            </div>
          )}

          {(selected?.kind === "rect" ||
            selected?.kind === "line" ||
            selected?.kind === "ink" ||
            selected?.kind === "underline" ||
            selected?.kind === "strike" ||
            tool !== "select") && (
            <div>
              <FieldLabel htmlFor="prop-color">Farbe</FieldLabel>
              <input
                id="prop-color"
                type="color"
                value={colorOf(selected, style)}
                onChange={(event) => {
                  const value = event.target.value;
                  if (selected) {
                    if (selected.kind === "text") updateSelected({ color: value });
                    else if (selected.kind === "rect") updateSelected({ strokeColor: value });
                    else if (
                      selected.kind === "line" ||
                      selected.kind === "ink" ||
                      selected.kind === "underline" ||
                      selected.kind === "strike"
                    )
                      updateSelected({ color: value });
                    else if (selected.kind === "highlight") updateSelected({ color: value });
                  } else {
                    setStyle((current) => ({ ...current, color: value }));
                  }
                }}
                className="h-10 w-full cursor-pointer rounded border border-slate-300 dark:border-slate-600"
              />
            </div>
          )}

          {(selected?.kind === "rect" ||
            selected?.kind === "line" ||
            selected?.kind === "ink" ||
            !selected) && (
            <div>
              <FieldLabel htmlFor="prop-stroke">Strichstärke</FieldLabel>
              <Slider
                id="prop-stroke"
                min={1}
                max={12}
                step={1}
                value={[
                  selected?.kind === "rect"
                    ? selected.strokeWidth
                    : selected?.kind === "line" || selected?.kind === "ink"
                      ? selected.strokeWidth
                      : style.strokeWidth,
                ]}
                onValueChange={([value]) => {
                  if (
                    selected &&
                    (selected.kind === "rect" ||
                      selected.kind === "line" ||
                      selected.kind === "ink")
                  ) {
                    updateSelected({ strokeWidth: value });
                  } else {
                    setStyle((current) => ({ ...current, strokeWidth: value }));
                  }
                }}
              />
            </div>
          )}

          {selected ? (
            <Button variant="destructive" className="w-full" onClick={deleteSelected}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Element löschen
            </Button>
          ) : null}

          {!signaturesUnlocked ? null : null}

          <hr className="border-slate-200 dark:border-slate-700" />
          <Button
            className="w-full"
            onClick={exportPdf}
            disabled={processing.state.active || Object.keys(pages).length === 0}
          >
            Als PDF exportieren
          </Button>
          <Link
            href="/tools/unterschreiben"
            className="block text-center text-xs font-medium text-blue-700 hover:underline dark:text-blue-400"
          >
            Unterschriften verwalten →
          </Link>

          {exportedBytes && (
            <ResultCard
              title="Export fertig!"
              filename={`${pdfName.replace(/\.pdf$/i, "")}-bearbeitet.pdf`}
              data={exportedBytes}
              originalSize={pdfSize}
            />
          )}
        </aside>
      </div>

      {/* Signatur-Auswahl */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent
          title="Bild oder Unterschrift einfügen"
          description="Wähle eine gespeicherte Unterschrift oder lade ein eigenes Bild hoch."
        >
          {signaturesUnlocked ? (
            <div className="space-y-4">
              {signatures.length > 0 ? (
                <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {signatures.map((signature) => (
                    <li key={signature.id}>
                      <button
                        type="button"
                        onClick={() => void pickSignature(signature.dataUrl)}
                        className="w-full rounded-xl border border-slate-200 p-2 transition hover:border-blue-600 dark:border-slate-700"
                      >
                        <span className="flex h-20 items-center justify-center overflow-hidden rounded bg-white">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={signature.dataUrl}
                            alt={signature.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </span>
                        <span className="mt-1 block truncate text-xs">{signature.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <InfoAlert>Noch keine Unterschriften gespeichert.</InfoAlert>
              )}
              <button
                type="button"
                onClick={() => document.getElementById("editor-image-input")?.click()}
                className="w-full rounded-xl border-2 border-dashed border-slate-300 p-4 text-sm font-medium text-slate-600 hover:border-blue-500 dark:border-slate-600 dark:text-slate-300"
              >
                Eigenes PNG/JPG hochladen …
              </button>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p>Dein Unterschriftenspeicher ist gesperrt.</p>
              <Link
                href="/tools/unterschreiben"
                className="inline-flex h-10 items-center rounded-lg bg-blue-700 px-4 font-semibold text-white hover:bg-blue-800"
              >
                Zum Entsperren / Erstellen
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}

/* ================= Hilfskomponenten ================= */

function CanvasRenderer({
  jsDoc,
  pageIndex,
  canvasRef,
  width,
}: {
  jsDoc: PDFDocumentProxy;
  pageIndex: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  width: number;
}) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    void renderPageToCanvas(jsDoc, pageIndex, canvas, width)
      .then(() => {
        void cancelled;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [jsDoc, pageIndex, width, canvasRef]);
  return null;
}

function elementLabel(element: EditorElement): string {
  switch (element.kind) {
    case "text":
      return "Text";
    case "image":
      return "Bild";
    case "rect":
      return "Rechteck";
    case "highlight":
      return "Markierung";
    case "line":
      return element.arrow ? "Pfeil" : "Linie";
    case "ink":
      return "Freihand";
    case "underline":
      return "Unterstrichen";
    case "strike":
      return "Durchgestrichen";
  }
}

function colorOf(element: EditorElement | null, style: EditorStyleDefaults): string {
  if (!element) return style.color;
  if (
    element.kind === "text" ||
    element.kind === "line" ||
    element.kind === "ink" ||
    element.kind === "underline" ||
    element.kind === "strike" ||
    element.kind === "highlight"
  ) {
    return element.color;
  }
  if (element.kind === "rect") return element.strokeColor;
  return style.color;
}

const FONT_CSS: Record<FontFamily, string> = {
  Helvetica: "Helvetica, Arial, sans-serif",
  TimesRoman: "'Times New Roman', Times, serif",
  Courier: "'Courier New', Courier, monospace",
};

function ElementsLayer({
  elements,
  scale,
  selectedId,
  onSelect,
}: {
  elements: EditorElement[];
  scale: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {elements.map((element) => {
        const isSelected = element.id === selectedId;
        const ring = isSelected ? "outline outline-2 outline-offset-1 outline-blue-600" : "";
        const commonProps = {
          "data-elem": element.id,
          onPointerDown: () => onSelect(element.id),
          className: `absolute ${ring}`,
        };

        switch (element.kind) {
          case "text":
            return (
              <div
                key={element.id}
                {...commonProps}
                contentEditable={false}
                style={{
                  left: element.x * scale,
                  top: element.y * scale,
                  width: element.width * scale,
                  minHeight: element.height * scale,
                  fontSize: element.fontSize * scale,
                  lineHeight: 1.25,
                  fontFamily: FONT_CSS[element.fontFamily],
                  fontWeight: element.bold ? 700 : 400,
                  color: element.color,
                  textAlign: element.align,
                  whiteSpace: "pre-wrap",
                  cursor: "move",
                  padding: 0,
                }}
              >
                {element.text}
              </div>
            );
          case "image":
            return (
              <div
                key={element.id}
                {...commonProps}
                style={{
                  left: element.x * scale,
                  top: element.y * scale,
                  width: element.width * scale,
                  height: element.height * scale,
                  cursor: "move",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={element.dataUrl}
                  alt="Eingefügtes Bild"
                  draggable={false}
                  className="pointer-events-none block h-full w-full select-none"
                />
                {isSelected
                  ? (["nw", "ne", "sw", "se"] as const).map((handle) => (
                      <span
                        key={handle}
                        data-resize-handle={handle}
                        aria-hidden
                        className={`absolute h-3.5 w-3.5 touch-none rounded-full border-2 border-white bg-blue-700 shadow ${
                          handle === "nw"
                            ? "-top-2 -left-2 cursor-nwse-resize"
                            : handle === "ne"
                              ? "-top-2 -right-2 cursor-nesw-resize"
                              : handle === "sw"
                                ? "-bottom-2 -left-2 cursor-nesw-resize"
                                : "-right-2 -bottom-2 cursor-nwse-resize"
                        }`}
                      />
                    ))
                  : null}
              </div>
            );
          case "rect":
            return (
              <div
                key={element.id}
                {...commonProps}
                style={{
                  left: element.x * scale,
                  top: element.y * scale,
                  width: element.width * scale,
                  height: element.height * scale,
                  borderWidth: element.strokeWidth * scale,
                  borderStyle: "solid",
                  borderColor: element.strokeColor,
                  backgroundColor: element.fillColor ?? "transparent",
                  opacity: element.opacity,
                  cursor: "move",
                }}
              />
            );
          case "highlight":
            return (
              <div
                key={element.id}
                {...commonProps}
                style={{
                  left: element.x * scale,
                  top: element.y * scale,
                  width: element.width * scale,
                  height: element.height * scale,
                  backgroundColor: element.color,
                  opacity: 0.35,
                  cursor: "move",
                }}
              />
            );
          case "underline":
          case "strike": {
            const thickness = Math.max(1, element.height * scale);
            return (
              <div
                key={element.id}
                {...commonProps}
                style={{
                  left: element.x * scale,
                  top:
                    (element.kind === "strike" ? element.y + element.height / 2 : element.y) *
                    scale,
                  width: element.width * scale,
                  height: thickness,
                  backgroundColor: element.color,
                  cursor: "move",
                }}
              />
            );
          }
          case "line": {
            const minX = Math.min(element.x, element.x2);
            const minY = Math.min(element.y, element.y2);
            const width = Math.max(Math.abs(element.x2 - element.x), 1);
            const height = Math.max(Math.abs(element.y2 - element.y), 1);
            const x1 = ((element.x - minX) / width) * width * scale || 0;
            const y1 = ((element.y - minY) / height) * height * scale || 0;
            const x2 = ((element.x2 - minX) / width) * width * scale || 0;
            const y2 = ((element.y2 - minY) / height) * height * scale || 0;
            return (
              <svg
                key={element.id}
                {...commonProps}
                style={{
                  left: minX * scale,
                  top: minY * scale,
                  width: width * scale + 2,
                  height: height * scale + 2,
                  overflow: "visible",
                  cursor: "move",
                }}
              >
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={element.color}
                  strokeWidth={Math.max(1, element.strokeWidth * scale)}
                  strokeLinecap="round"
                />
                {element.arrow ? (
                  <polygon
                    points={arrowHeadPoints(
                      x1,
                      y1,
                      x2,
                      y2,
                      Math.max(10, element.strokeWidth * scale * 3),
                    )}
                    fill={element.color}
                  />
                ) : null}
              </svg>
            );
          }
          case "ink": {
            const xs = element.points.map((point) => point.x);
            const ys = element.points.map((point) => point.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const width = Math.max(Math.max(...xs) - minX, 1);
            const height = Math.max(Math.max(...ys) - minY, 1);
            const path = element.points
              .map(
                (point, index) =>
                  `${index === 0 ? "M" : "L"} ${(point.x - minX) * scale} ${(point.y - minY) * scale}`,
              )
              .join(" ");
            return (
              <svg
                key={element.id}
                {...commonProps}
                style={{
                  left: minX * scale,
                  top: minY * scale,
                  width: width * scale + 2,
                  height: height * scale + 2,
                  overflow: "visible",
                  cursor: "move",
                }}
              >
                <path
                  d={path}
                  fill="none"
                  stroke={element.color}
                  strokeWidth={Math.max(1, element.strokeWidth * scale)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            );
          }
        }
      })}
    </>
  );
}

function arrowHeadPoints(x1: number, y1: number, x2: number, y2: number, length: number): string {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const spread = Math.PI / 7;
  const a = [
    x2 + length * Math.cos(angle + Math.PI - spread),
    y2 + length * Math.sin(angle + Math.PI - spread),
  ];
  const b = [
    x2 + length * Math.cos(angle + Math.PI + spread),
    y2 + length * Math.sin(angle + Math.PI + spread),
  ];
  return `${x2},${y2} ${a[0]},${a[1]} ${b[0]},${b[1]}`;
}
