"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Minus, Move, Plus, X } from "lucide-react";
import { ResultCard } from "@/components/shared/result-card";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { useProcessing } from "@/hooks/useProcessing";
import {
  createManualField,
  defaultFontSize,
  detectPageFillFields,
  exportFilledPdf,
  fieldFontSize,
  firstBaseline,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  applyFontSizeToAll,
  clampFontSize,
  loadPreferredFontSize,
  savePreferredFontSize,
  withFontSize,
  type FillField,
  type FillValues,
  type PageSize,
} from "@/lib/pdf/fill-fields";
import { getPdfJs, loadPdfJsDocument } from "@/lib/pdf/pdfjs";
import { cn } from "@/lib/utils";

interface Source {
  name: string;
  size: number;
  bytes: Uint8Array;
}

/** Schlüssel, unter dem der Wert eines Felds gespeichert wird. */
function valueKey(field: FillField): string {
  return field.acro ? field.acro.name : field.id;
}

export default function FormularePage() {
  const processing = useProcessing();
  const [source, setSource] = useState<Source | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageSizes, setPageSizes] = useState<PageSize[]>([]);
  const [fields, setFields] = useState<FillField[]>([]);
  const [values, setValues] = useState<FillValues>({});
  const [pageIndex, setPageIndex] = useState(0);
  const [addMode, setAddMode] = useState(false);
  const [flatten, setFlatten] = useState(false);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preferredFontSize, setPreferredFontSize] = useState<number | null>(null);
  const destroyRef = useRef<(() => Promise<void>) | null>(null);
  const manualCounter = useRef(0);

  useEffect(
    () => () => {
      void destroyRef.current?.().catch(() => undefined);
    },
    [],
  );

  const reset = () => {
    void destroyRef.current?.().catch(() => undefined);
    destroyRef.current = null;
    setSource(null);
    setDoc(null);
    setFields([]);
    setValues({});
    setPageSizes([]);
    setResultBytes(null);
    setAddMode(false);
  };

  const openFile = async (files: File[]) => {
    if (processing.state.active) return;
    processing.clearError();
    const { validatePdfFiles } = await import("@/lib/validate");
    const { accepted } = await validatePdfFiles(files);
    if (accepted.length === 0) return;
    const file = accepted[0];

    await processing.run("Ausfüllstellen werden gesucht …", async ({ report, token }) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loaded = await loadPdfJsDocument(bytes);
      try {
        const nextFields: FillField[] = [];
        const nextValues: FillValues = {};
        const sizes: PageSize[] = [];
        for (let index = 0; index < loaded.doc.numPages; index++) {
          token.throwIfCancelled();
          report(
            Math.round((index / loaded.doc.numPages) * 100),
            `Seite ${index + 1} von ${loaded.doc.numPages} wird analysiert …`,
          );
          const result = await detectPageFillFields(loaded.doc, index);
          nextFields.push(...result.fields);
          Object.assign(nextValues, result.values);
          sizes.push(result.size);
        }
        void destroyRef.current?.().catch(() => undefined);
        destroyRef.current = loaded.destroy;
        manualCounter.current = 0;
        // Zuletzt gewählte Schriftgröße auch für dieses Dokument verwenden.
        const fontSize = loadPreferredFontSize();
        setPreferredFontSize(fontSize);
        setSource({ name: file.name, size: file.size, bytes });
        setDoc(loaded.doc);
        setPageSizes(sizes);
        setFields(fontSize ? applyFontSizeToAll(nextFields, fontSize) : nextFields);
        setValues(nextValues);
        setPageIndex(0);
        setResultBytes(null);
        setAddMode(false);
      } catch (error) {
        await loaded.destroy();
        throw error;
      }
    });
  };

  const updateValue = (field: FillField, value: string | boolean) => {
    setValues((current) => ({ ...current, [valueKey(field)]: value }));
    setResultBytes(null);
  };

  const removeField = (field: FillField) => {
    setFields((current) => current.filter((entry) => entry.id !== field.id));
    setValues((current) => {
      const next = { ...current };
      delete next[field.id];
      return next;
    });
    setResultBytes(null);
  };

  const updateField = (id: string, update: (field: FillField) => FillField) => {
    setFields((current) => current.map((field) => (field.id === id ? update(field) : field)));
    setResultBytes(null);
  };

  /** Eine geänderte Schriftgröße gilt für alle Felder und bleibt gespeichert. */
  const changeFontSize = (fontSize: number) => {
    const size = clampFontSize(fontSize);
    setPreferredFontSize(size);
    savePreferredFontSize(size);
    setFields((current) => applyFontSizeToAll(current, size));
    setResultBytes(null);
  };

  const addField = (
    rect: { x: number; y: number; width: number; height: number },
    onLine: boolean,
  ) => {
    manualCounter.current += 1;
    const created = createManualField(pageIndex, rect, manualCounter.current, onLine);
    const field = preferredFontSize ? withFontSize(created, preferredFontSize) : created;
    setFields((current) => [...current, field]);
    setFocusId(field.id);
    setAddMode(false);
  };

  const save = () =>
    processing.run("PDF wird ausgefüllt …", async () => {
      if (!source) return null;
      const bytes = await exportFilledPdf(source.bytes, fields, values, {
        flattenForm: flatten,
      });
      setResultBytes(bytes);
      return bytes;
    });

  const pageCount = doc?.numPages ?? 0;
  const pageFields = fields.filter((field) => field.pageIndex === pageIndex);
  const acroCount = fields.filter((field) => field.source === "formular").length;
  const detectedCount = fields.filter((field) => field.source === "erkannt").length;
  const filledCount = fields.filter((field) => {
    const value = values[valueKey(field)];
    if (field.kind === "radio") return value === field.acro?.buttonValue;
    return value === true || (typeof value === "string" && value.trim() !== "");
  }).length;

  return (
    <ToolShell
      title="PDF-Formulare ausfüllen"
      description="Erkennt automatisch, wo etwas eingetragen werden muss – Formularfelder, Kästchen, Tabellenzellen und Schreiblinien – und du tippst direkt auf der Seite. Alles lokal im Browser."
      privacy="local"
    >
      {processing.error ? (
        <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
      ) : null}

      {!source || !doc ? (
        <FileDropzone onFiles={openFile} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <section aria-label="Seite zum Ausfüllen" className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
                disabled={pageIndex === 0}
                aria-label="Vorherige Seite"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
              </Button>
              <span aria-live="polite" className="text-sm font-medium">
                Seite {pageIndex + 1} von {pageCount}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}
                disabled={pageIndex >= pageCount - 1}
                aria-label="Nächste Seite"
              >
                <ChevronRight aria-hidden className="h-4 w-4" />
              </Button>
              <Button
                variant={addMode ? "primary" : "secondary"}
                size="sm"
                aria-pressed={addMode}
                onClick={() => setAddMode((value) => !value)}
              >
                <Plus aria-hidden className="h-4 w-4" />
                {addMode ? "Feld aufziehen …" : "Feld hinzufügen"}
              </Button>
            </div>
            {addMode ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Ziehe auf der Seite ein Rechteck auf oder klicke an die Stelle, an der du schreiben
                möchtest.
              </p>
            ) : null}

            <FillPageView
              key={pageIndex}
              doc={doc}
              pageIndex={pageIndex}
              size={pageSizes[pageIndex]}
              fields={pageFields}
              values={values}
              addMode={addMode}
              focusId={focusId}
              onFocused={() => setFocusId(null)}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onChange={updateValue}
              onUpdate={updateField}
              onFontSize={changeFontSize}
              onRemove={removeField}
              onAdd={addField}
            />
          </section>

          <aside className="space-y-4">
            <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <h2 className="font-semibold">
                {fields.length === 0
                  ? "Keine Ausfüllstellen erkannt"
                  : `${fields.length} Ausfüllstelle${fields.length === 1 ? "" : "n"}`}
              </h2>
              {fields.length > 0 ? (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {acroCount > 0 ? `${acroCount} Formularfeld${acroCount === 1 ? "" : "er"}` : null}
                  {acroCount > 0 && detectedCount > 0 ? " · " : null}
                  {detectedCount > 0 ? `${detectedCount} automatisch erkannt` : null}
                  {` · ${filledCount} ausgefüllt`}
                </p>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Mit „Feld hinzufügen“ kannst du selbst festlegen, wo Text eingetragen wird.
                </p>
              )}
              {pageFields.length > 0 ? (
                <ul
                  className="max-h-64 space-y-1 overflow-y-auto text-sm"
                  aria-label="Felder auf dieser Seite"
                >
                  {pageFields.map((field) => (
                    <li key={field.id}>
                      <button
                        type="button"
                        className="w-full truncate rounded px-2 py-1 text-left hover:bg-slate-100 focus-visible:outline-2 dark:hover:bg-slate-800"
                        onClick={() => setFocusId(field.id)}
                      >
                        {field.label}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <InfoAlert title="Bitte prüfen">
              Die Erkennung ist automatisch und kann Stellen übersehen oder zu viel markieren.
              Klicke in ein Feld, um es über die Leiste darüber zu verschieben (Griff ziehen oder
              Pfeiltasten), die Schriftgröße für alle Felder zu ändern oder es mit ✕ zu entfernen.
              Eingetragener Text wird beim Speichern fest ins PDF geschrieben.
            </InfoAlert>

            {acroCount > 0 ? (
              <Checkbox
                label="Formularfelder nach dem Speichern abflachen (nicht mehr änderbar)"
                checked={flatten}
                onChange={(event) => setFlatten(event.target.checked)}
              />
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={processing.state.active}>
                Ausgefülltes PDF erstellen
              </Button>
              <Button variant="ghost" onClick={reset}>
                Andere Datei
              </Button>
            </div>

            {resultBytes ? (
              <ResultCard
                title="PDF ausgefüllt!"
                filename={`${source.name.replace(/\.pdf$/i, "")}-ausgefuellt.pdf`}
                data={resultBytes}
                originalSize={source.size}
              />
            ) : null}
          </aside>
        </div>
      )}

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}

interface FillPageViewProps {
  doc: PDFDocumentProxy;
  pageIndex: number;
  size: PageSize;
  fields: FillField[];
  values: FillValues;
  addMode: boolean;
  focusId: string | null;
  onFocused: () => void;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (field: FillField, value: string | boolean) => void;
  onUpdate: (id: string, update: (field: FillField) => FillField) => void;
  onFontSize: (fontSize: number) => void;
  onRemove: (field: FillField) => void;
  onAdd: (rect: { x: number; y: number; width: number; height: number }, onLine: boolean) => void;
}

function FillPageView({
  doc,
  pageIndex,
  size,
  fields,
  values,
  addMode,
  focusId,
  onFocused,
  selectedId,
  onSelect,
  onChange,
  onUpdate,
  onFontSize,
  onRemove,
  onAdd,
}: FillPageViewProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const [cssWidth, setCssWidth] = useState(0);
  const [draft, setDraft] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => {
      setCssWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || cssWidth <= 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    void (async () => {
      const lib = await getPdfJs();
      const page = await doc.getPage(pageIndex + 1);
      if (cancelled) return;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: (cssWidth / size.width) * dpr });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const context = canvas.getContext("2d");
      if (!context) return;
      task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        annotationMode: lib.AnnotationMode.ENABLE_FORMS,
      });
      try {
        await task.promise;
      } catch {
        // Rendern abgebrochen (Seitenwechsel oder Größenänderung)
      } finally {
        page.cleanup();
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, pageIndex, cssWidth, size.width]);

  useEffect(() => {
    if (!focusId) return;
    const element = overlayRef.current?.querySelector<HTMLElement>(`[data-field-id="${focusId}"]`);
    if (element) {
      element.focus();
      element.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    onFocused();
  }, [focusId, onFocused]);

  const k = cssWidth > 0 ? cssWidth / size.width : 0;
  const cssHeight = size.height * k;
  const selected = fields.find((field) => field.id === selectedId) ?? null;

  const toPagePoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(size.width, Math.max(0, (event.clientX - bounds.left) / k)),
      y: Math.min(size.height, Math.max(0, (event.clientY - bounds.top) / k)),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!addMode) {
      // Klick auf eine freie Stelle hebt die Auswahl auf.
      if (event.target === event.currentTarget) onSelect(null);
      return;
    }
    if (k === 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = toPagePoint(event);
    dragRef.current = point;
    setDraft({ ...point, width: 0, height: 0 });
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = dragRef.current;
    if (!start) return;
    const point = toPagePoint(event);
    setDraft({
      x: Math.min(start.x, point.x),
      y: Math.min(start.y, point.y),
      width: Math.abs(point.x - start.x),
      height: Math.abs(point.y - start.y),
    });
  };

  const onPointerUp = () => {
    const start = dragRef.current;
    dragRef.current = null;
    const rect = draft;
    setDraft(null);
    if (!start || !rect) return;
    if (rect.width < 12 || rect.height < 8) {
      // Einfacher Klick: Die Klickhöhe wird zur Schreiblinie des neuen Felds.
      const width = Math.min(160, size.width - start.x);
      const height = 18;
      onAdd({ x: start.x, y: Math.max(0, start.y - height), width, height }, true);
      return;
    }
    onAdd(rect, false);
  };

  const focusNext = (current: HTMLElement) => {
    const inputs = Array.from(
      overlayRef.current?.querySelectorAll<HTMLElement>("[data-field-id]") ?? [],
    );
    const next = inputs[inputs.indexOf(current) + 1];
    next?.focus();
  };

  const moveBy = (field: FillField, dx: number, dy: number) =>
    onUpdate(field.id, (current) => ({
      ...current,
      x: Math.min(size.width - current.width, Math.max(0, current.x + dx)),
      y: Math.min(size.height - current.height, Math.max(0, current.y + dy)),
    }));

  return (
    <div ref={hostRef} className="w-full">
      <div
        className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700"
        style={{ width: cssWidth || "100%", height: cssHeight || undefined }}
      >
        <canvas ref={canvasRef} className="block h-full w-full" aria-hidden />
        <div
          ref={overlayRef}
          className={cn("absolute inset-0", addMode && "cursor-crosshair")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(event) => {
            if (event.key === "Escape") onSelect(null);
          }}
        >
          {k > 0
            ? fields.map((field) => (
                <FieldInput
                  key={field.id}
                  field={field}
                  value={values[valueKey(field)]}
                  scale={k}
                  disabled={addMode}
                  selected={field.id === selectedId}
                  onSelect={() => onSelect(field.id)}
                  onChange={(value) => onChange(field, value)}
                  onEnter={focusNext}
                />
              ))
            : null}
          {k > 0 && selected && !selected.acro && !addMode ? (
            <FieldToolbar
              field={selected}
              scale={k}
              pageHeight={size.height}
              onMove={(dx, dy) => moveBy(selected, dx, dy)}
              onFontSize={onFontSize}
              onRemove={() => {
                onSelect(null);
                onRemove(selected);
              }}
            />
          ) : null}
          {draft ? (
            <div
              className="pointer-events-none absolute border-2 border-dashed border-sky-500 bg-sky-200/30"
              style={{
                left: draft.x * k,
                top: draft.y * k,
                width: draft.width * k,
                height: draft.height * k,
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface FieldToolbarProps {
  field: FillField;
  scale: number;
  pageHeight: number;
  onMove: (dx: number, dy: number) => void;
  onFontSize: (fontSize: number) => void;
  onRemove: () => void;
}

const TOOLBAR_HEIGHT = 32;

/** Leiste über dem ausgewählten Feld: verschieben, Schriftgröße, entfernen. */
function FieldToolbar({
  field,
  scale,
  pageHeight,
  onMove,
  onFontSize,
  onRemove,
}: FieldToolbarProps) {
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const top = field.y * scale - TOOLBAR_HEIGHT - 4;
  const below = top < 0 && (field.y + field.height) * scale + TOOLBAR_HEIGHT < pageHeight * scale;
  const fontSize = fieldFontSize(field);
  const buttonClass =
    "flex h-7 min-w-7 items-center justify-center rounded px-1 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40";
  // Klicks in der Leiste sollen das Eingabefeld nicht verlassen.
  const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

  return (
    <div
      role="toolbar"
      aria-label={`Feld „${field.label}“ bearbeiten`}
      className="absolute z-20 flex items-center gap-0.5 rounded-md bg-slate-800 px-1 text-xs text-white shadow-lg"
      style={{
        left: Math.max(0, field.x * scale),
        top: below ? (field.y + field.height) * scale + 4 : Math.max(0, top),
        height: TOOLBAR_HEIGHT,
      }}
      onMouseDown={keepFocus}
    >
      <button
        type="button"
        className={cn(buttonClass, "cursor-move touch-none")}
        aria-label="Feld verschieben (ziehen oder Pfeiltasten)"
        title="Ziehen zum Verschieben – oder Pfeiltasten (mit Umschalt in größeren Schritten)"
        onPointerDown={(event) => {
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          const start = dragRef.current;
          if (!start) return;
          const dx = (event.clientX - start.x) / scale;
          const dy = (event.clientY - start.y) / scale;
          if (dx === 0 && dy === 0) return;
          dragRef.current = { x: event.clientX, y: event.clientY };
          onMove(dx, dy);
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
          };
          const move = moves[event.key];
          if (!move) return;
          event.preventDefault();
          onMove(...move);
        }}
      >
        <Move aria-hidden className="h-4 w-4" />
      </button>
      {field.kind === "text" ? (
        <>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-white/30" />
          <button
            type="button"
            className={buttonClass}
            aria-label="Schrift verkleinern (alle Felder)"
            title="Schrift verkleinern – gilt für alle Felder"
            disabled={fontSize <= MIN_FONT_SIZE}
            onClick={() => onFontSize(fontSize - 1)}
          >
            <Minus aria-hidden className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-12 text-center tabular-nums" aria-live="polite">
            {Number.isInteger(fontSize) ? fontSize : fontSize.toFixed(1)} pt
          </span>
          <button
            type="button"
            className={buttonClass}
            aria-label="Schrift vergrößern (alle Felder)"
            title="Schrift vergrößern – gilt für alle Felder"
            disabled={fontSize >= MAX_FONT_SIZE}
            onClick={() => onFontSize(fontSize + 1)}
          >
            <Plus aria-hidden className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}
      <span aria-hidden className="mx-0.5 h-4 w-px bg-white/30" />
      <button
        type="button"
        className={buttonClass}
        aria-label={`„${field.label}“ entfernen`}
        title="Feld entfernen"
        onClick={onRemove}
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </div>
  );
}

interface FieldInputProps {
  field: FillField;
  value: string | boolean | undefined;
  scale: number;
  disabled: boolean;
  selected: boolean;
  onSelect: () => void;
  onChange: (value: string | boolean) => void;
  onEnter: (current: HTMLElement) => void;
}

/** Schriftart der Eingabe – gleiche Metrik wie Helvetica im exportierten PDF. */
const FIELD_FONT = "Helvetica, Arial, sans-serif";
/** Grundlinie innerhalb einer Zeile mit line-height 1.2 (Helvetica/Arial-Metrik). */
const BASELINE_IN_LINE = 0.9465;

function FieldInput({
  field,
  value,
  scale,
  disabled,
  selected,
  onSelect,
  onChange,
  onEnter,
}: FieldInputProps) {
  const readOnly = field.acro?.readOnly === true;
  const style = {
    left: field.x * scale,
    top: field.y * scale,
    width: field.width * scale,
    height: field.height * scale,
  };
  const common = {
    "data-field-id": field.id,
    "aria-label": field.label,
    title: field.label,
    disabled: disabled || readOnly,
    onFocus: onSelect,
  };
  const frameClass = cn(
    "rounded-[2px] border border-sky-500/70 bg-sky-100/50 text-slate-900",
    "focus-within:border-sky-600 focus-within:bg-white/80 focus-within:ring-2 focus-within:ring-sky-500/40",
    selected && "border-sky-600 ring-2 ring-sky-500/40",
  );
  const controlClass = "outline-none disabled:cursor-not-allowed";
  const fontSize = fieldFontSize(field);

  let control;
  if (field.kind === "checkbox") {
    const checked = value === true;
    control = (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        {...common}
        className={cn(
          controlClass,
          "flex h-full w-full items-center justify-center p-0 leading-none font-bold",
        )}
        style={{ fontSize: Math.min(field.width, field.height) * 0.85 * scale }}
        onClick={() => onChange(!checked)}
      >
        {checked ? "✕" : ""}
      </button>
    );
  } else if (field.kind === "radio") {
    const checked = value === field.acro?.buttonValue;
    control = (
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        {...common}
        className={cn(controlClass, "flex h-full w-full items-center justify-center p-0")}
        onClick={() => onChange(field.acro?.buttonValue ?? "")}
      >
        {checked ? <span className="h-1/2 w-1/2 rounded-full bg-slate-900" /> : null}
      </button>
    );
  } else if (field.kind === "choice") {
    control = (
      <select
        {...common}
        className={cn(controlClass, "h-full w-full bg-transparent p-0")}
        style={{ fontSize: defaultFontSize(field, false) * scale }}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">–</option>
        {(field.acro?.options ?? []).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  } else if (field.multiline) {
    control = (
      <textarea
        {...common}
        className={cn(controlClass, "h-full w-full resize-none bg-transparent")}
        style={{
          fontSize: fontSize * scale,
          fontFamily: FIELD_FONT,
          lineHeight: 1.25,
          padding: 2 * scale,
        }}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else {
    // Die Eingabezeile so legen, dass ihre Grundlinie genau dort liegt, wo der
    // Text im PDF landet – bei Schreiblinien also direkt auf der Linie.
    const lineTop = firstBaseline(field, fontSize) - BASELINE_IN_LINE * fontSize;
    control = (
      <input
        type="text"
        {...common}
        className={cn(controlClass, "absolute inset-x-0 bg-transparent")}
        style={{
          top: lineTop * scale,
          height: fontSize * 1.2 * scale,
          fontSize: fontSize * scale,
          fontFamily: FIELD_FONT,
          lineHeight: 1.2,
          padding: `0 ${2 * scale}px`,
        }}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter(event.currentTarget);
          }
        }}
      />
    );
  }

  return (
    <div className={cn("absolute", frameClass)} style={style}>
      {control}
    </div>
  );
}
