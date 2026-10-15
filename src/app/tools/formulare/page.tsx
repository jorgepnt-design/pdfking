"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
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
        setSource({ name: file.name, size: file.size, bytes });
        setDoc(loaded.doc);
        setPageSizes(sizes);
        setFields(nextFields);
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

  const addField = (rect: { x: number; y: number; width: number; height: number }) => {
    manualCounter.current += 1;
    const field = createManualField(pageIndex, rect, manualCounter.current);
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
              onChange={updateValue}
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
              Überflüssige Felder entfernst du mit ✕. Eingetragener Text wird beim Speichern fest
              ins PDF geschrieben.
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
  onChange: (field: FillField, value: string | boolean) => void;
  onRemove: (field: FillField) => void;
  onAdd: (rect: { x: number; y: number; width: number; height: number }) => void;
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
  onChange,
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

  const toPagePoint = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(size.width, Math.max(0, (event.clientX - bounds.left) / k)),
      y: Math.min(size.height, Math.max(0, (event.clientY - bounds.top) / k)),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!addMode || k === 0) return;
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
      // Einfacher Klick: Standardfeld mit der Klickposition als Grundlinie
      const width = Math.min(160, size.width - start.x);
      const height = 18;
      onAdd({ x: start.x, y: Math.max(0, start.y - height + 4), width, height });
      return;
    }
    onAdd(rect);
  };

  const focusNext = (current: HTMLElement) => {
    const inputs = Array.from(
      overlayRef.current?.querySelectorAll<HTMLElement>("[data-field-id]") ?? [],
    );
    const next = inputs[inputs.indexOf(current) + 1];
    next?.focus();
  };

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
        >
          {k > 0
            ? fields.map((field) => (
                <FieldInput
                  key={field.id}
                  field={field}
                  value={values[valueKey(field)]}
                  scale={k}
                  disabled={addMode}
                  onChange={(value) => onChange(field, value)}
                  onRemove={() => onRemove(field)}
                  onEnter={focusNext}
                />
              ))
            : null}
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

interface FieldInputProps {
  field: FillField;
  value: string | boolean | undefined;
  scale: number;
  disabled: boolean;
  onChange: (value: string | boolean) => void;
  onRemove: () => void;
  onEnter: (current: HTMLElement) => void;
}

function FieldInput({
  field,
  value,
  scale,
  disabled,
  onChange,
  onRemove,
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
  };
  const fieldClass =
    "h-full w-full rounded-[2px] border border-sky-500/70 bg-sky-100/50 text-slate-900 outline-none focus:border-sky-600 focus:bg-white/90 focus:ring-2 focus:ring-sky-500/40 disabled:cursor-not-allowed";

  let control;
  if (field.kind === "checkbox") {
    const checked = value === true;
    control = (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        {...common}
        className={cn(fieldClass, "flex items-center justify-center p-0 leading-none font-bold")}
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
        className={cn(fieldClass, "flex items-center justify-center rounded-full p-0")}
        onClick={() => onChange(field.acro?.buttonValue ?? "")}
      >
        {checked ? <span className="h-1/2 w-1/2 rounded-full bg-slate-900" /> : null}
      </button>
    );
  } else if (field.kind === "choice") {
    control = (
      <select
        {...common}
        className={cn(fieldClass, "p-0")}
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
        className={cn(fieldClass, "resize-none leading-tight")}
        style={{ fontSize: defaultFontSize(field, true) * scale, padding: 2 * scale }}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  } else {
    control = (
      <input
        type="text"
        {...common}
        className={fieldClass}
        style={{ fontSize: defaultFontSize(field, false) * scale, padding: `0 ${2 * scale}px` }}
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
    <div className="group absolute" style={style}>
      {control}
      {!field.acro && !disabled ? (
        <button
          type="button"
          aria-label={`„${field.label}" entfernen`}
          title="Feld entfernen"
          className="absolute top-1/2 left-full z-10 ml-1 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-slate-700 text-white shadow group-focus-within:flex group-hover:flex"
          onClick={onRemove}
        >
          <X aria-hidden className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}
