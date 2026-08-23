"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import JSZip from "jszip";
import { FilePlus2, PackageOpen } from "lucide-react";
import { FileDropzone } from "@/components/shared/file-dropzone";
import {
  PageThumbGrid,
  createThumbItem,
  type ThumbDoc,
  type ThumbItem,
} from "@/components/shared/page-thumb-grid";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ResultCard } from "@/components/shared/result-card";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert, WarningAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, RadioGroupField } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProcessing } from "@/hooks/useProcessing";
import { AppError } from "@/lib/types";
import {
  buildMultiSourcePdf,
  cropPages,
  extractPages,
  insertBlankPage,
  mergePdfs,
  resizePages,
  splitPdfByGroups,
} from "@/lib/pdf/pages";
import { loadPdfJsDocument } from "@/lib/pdf/pdfjs";
import { formatBytes, parseRangeGroups } from "@/lib/utils";
import { validatePdfFiles } from "@/lib/validate";
import type { LoadedPdfFile } from "@/hooks/useLoadedPdf";

interface SourceDoc extends LoadedPdfFile {
  id: string;
}

async function fileToSource(file: File): Promise<SourceDoc> {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    size: file.size,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

export default function OrganisierenPage() {
  return (
    <Suspense
      fallback={
        <div
          className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6"
          role="status"
          aria-live="polite"
        >
          <p className="text-slate-500 dark:text-slate-400">Wird geladen …</p>
        </div>
      }
    >
      <OrganisierenInner />
    </Suspense>
  );
}

function OrganisierenInner() {
  const searchParams = useSearchParams();
  const processing = useProcessing();

  // ---- Tab: Sortieren / Extrahieren ----
  const [docs, setDocs] = useState<SourceDoc[]>([]);
  const [thumbDocs, setThumbDocs] = useState<ThumbDoc[]>([]);
  const [items, setItems] = useState<ThumbItem[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [organizeResult, setOrganizeResult] = useState<{
    bytes: Uint8Array;
    label: string;
    originalSize: number;
  } | null>(null);
  const [pageErrors, setPageErrors] = useState<AppError | null>(null);

  // ---- Tab: Zusammenfügen ----
  const [mergeFiles, setMergeFiles] = useState<
    Array<{ id: string; name: string; size: number; bytes: Uint8Array; valid: boolean }>
  >([]);
  const [mergeResult, setMergeResult] = useState<Uint8Array | null>(null);

  // ---- Tab: Aufteilen ----
  const [splitFile, setSplitFile] = useState<LoadedPdfFile | null>(null);
  const [splitInput, setSplitInput] = useState("1-3");
  const [splitResults, setSplitResults] = useState<Array<{
    name: string;
    bytes: Uint8Array;
  }> | null>(null);

  // ---- Tab: Format ----
  const [formatFile, setFormatFile] = useState<LoadedPdfFile | null>(null);
  const [cropMargins, setCropMargins] = useState({ left: 0, right: 0, top: 0, bottom: 0 });
  const [cropResult, setCropResult] = useState<Uint8Array | null>(null);
  const [resizeTarget, setResizeTarget] = useState<"A4" | "Letter">("A4");
  const [resizeMarginMm, setResizeMarginMm] = useState(10);
  const [resizeResult, setResizeResult] = useState<Uint8Array | null>(null);

  const activeTab = searchParams.get("tab") ?? "sortieren";

  useEffect(() => {
    return () => thumbDocs.forEach((doc) => doc.release?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openForOrganize = async (files: File[]) => {
    setPageErrors(null);
    const { accepted, rejected } = await validatePdfFiles(files);
    if (rejected.length > 0) {
      setPageErrors(new AppError(rejected[0].code as never, rejected[0].message));
      return;
    }
    await processing.run("Dateien werden geöffnet …", async ({ report }) => {
      let done = 0;
      for (const file of accepted) {
        const source = await fileToSource(file);
        try {
          const { doc: jsDoc, destroy } = await loadPdfJsDocument(source.bytes);
          setDocs((current) => [...current, source]);
          setThumbDocs((current) => [
            ...current,
            { id: source.id, name: source.name, jsDoc, release: destroy },
          ]);
          setItems((current) => [
            ...current,
            ...Array.from({ length: jsDoc.numPages }, (_, pageIndex) =>
              createThumbItem(source.id, pageIndex),
            ),
          ]);
        } catch {
          setPageErrors(new AppError("CORRUPT_PDF", `„${file.name}" konnte nicht gelesen werden.`));
        }
        done += 1;
        report(Math.round((done / accepted.length) * 100));
      }
    });
  };

  const toggleSelect = (key: string) => {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const rotateItem = (key: string, delta: number) =>
    setItems((current) =>
      current.map((item) =>
        item.key === key ? { ...item, rotation: (item.rotation + delta + 360) % 360 } : item,
      ),
    );

  const duplicateItem = (key: string) =>
    setItems((current) => {
      const index = current.findIndex((item) => item.key === key);
      if (index < 0) return current;
      const copy = { ...current[index], key: crypto.randomUUID() };
      return [...current.slice(0, index + 1), copy, ...current.slice(index + 1)];
    });

  const deleteItem = (key: string) => {
    setItems((current) => current.filter((item) => item.key !== key));
    setSelectedKeys((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  const reorderItem = (fromKey: string, toKey: string) =>
    setItems((current) => {
      const fromIndex = current.findIndex((item) => item.key === fromKey);
      const toIndex = current.findIndex((item) => item.key === toKey);
      if (fromIndex < 0 || toIndex < 0) return current;
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });

  const selectedIndicesByDoc = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const item of items) {
      if (!selectedKeys.has(item.key)) continue;
      map.set(item.docId, [...(map.get(item.docId) ?? []), item.pageIndex]);
    }
    return map;
  }, [items, selectedKeys]);

  const applyOrganizedExport = (mode: "alle" | "auswahl") =>
    processing.run("PDF wird erstellt …", async ({ report }) => {
      const relevant =
        mode === "auswahl" ? items.filter((item) => selectedKeys.has(item.key)) : items;
      if (relevant.length === 0) throw new AppError("INVALID_TYPE", "Keine Seiten vorhanden.");
      if (docs.length === 0) throw new AppError("INVALID_TYPE", "Keine Dateien geladen.");

      const sources = new Map<string, Uint8Array>();
      for (const doc of docs) sources.set(doc.id, doc.bytes);

      const bytes = await buildMultiSourcePdf(
        sources,
        relevant.map((item) => ({
          docId: item.docId,
          pageIndex: item.pageIndex,
          rotation: item.rotation,
        })),
        report,
      );

      const resultPayload = {
        bytes,
        label: mode === "auswahl" ? `${relevant.length} Seiten exportiert` : "Dokument gespeichert",
        originalSize: docs.reduce((sum, doc) => sum + doc.size, 0),
      };
      setOrganizeResult(resultPayload);
      return resultPayload;
    });

  const extractSelection = () =>
    processing.run("Ausgewählte Seiten werden extrahiert …", async () => {
      const firstEntry = selectedIndicesByDoc.entries().next();
      if (firstEntry.done) throw new AppError("INVALID_TYPE", "Bitte wähle zuerst Seiten aus.");
      const [docId, indices] = firstEntry.value;
      const doc = docs.find((candidate) => candidate.id === docId)!;
      const bytes = await extractPages(doc.bytes, indices);
      setOrganizeResult({
        bytes,
        label: `${indices.length} Seiten extrahiert`,
        originalSize: doc.size,
      });
      return bytes;
    });

  const addBlankAfterSelection = () =>
    processing.run("Leerseite wird eingefügt …", async () => {
      const lastSelected = items.find((item) => selectedKeys.has(item.key));
      const docId = lastSelected?.docId ?? docs[0]?.id;
      const doc = docs.find((candidate) => candidate.id === docId);
      if (!doc) throw new AppError("INVALID_TYPE", "Bitte lade zuerst eine Datei.");
      const afterIndex = lastSelected?.pageIndex ?? -1;
      const bytes = await insertBlankPage(doc.bytes, afterIndex);

      // UI synchron halten: Dokument neu laden
      const oldEntry = thumbDocs.find((entry) => entry.id === doc.id);
      const { doc: jsDoc, destroy } = await loadPdfJsDocument(bytes);
      setThumbDocs((current) => [
        ...current.filter((entry) => entry.id !== doc.id),
        { id: doc.id, name: doc.name, jsDoc, release: destroy },
      ]);
      oldEntry?.release?.();
      setItems((current) => [
        ...current.filter((item) => item.docId !== doc.id),
        ...Array.from({ length: jsDoc.numPages }, (_, pageIndex) =>
          createThumbItem(doc.id, pageIndex),
        ),
      ]);
      setOrganizeResult({ bytes, label: "Leerseite eingefügt", originalSize: doc.size });
      return bytes;
    });

  const runMerge = () =>
    processing.run("Dateien werden zusammengefügt …", async () => {
      const valid = mergeFiles.filter((file) => file.valid);
      if (valid.length < 2)
        throw new AppError("INVALID_TYPE", "Bitte füge mindestens zwei gültige PDF-Dateien hinzu.");
      const bytes = await mergePdfs(
        valid.map(({ bytes: fileBytes, name }) => ({ bytes: fileBytes, name })),
      );
      setMergeResult(bytes);
      return bytes;
    });

  const moveMergeFile = (index: number, direction: -1 | 1) =>
    setMergeFiles((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const removeMergeFile = (id: string) =>
    setMergeFiles((current) => current.filter((file) => file.id !== id));

  const addMergeFiles = async (files: File[]) => {
    const { accepted, rejected } = await validatePdfFiles(files);
    if (rejected.length > 0)
      setPageErrors(new AppError(rejected[0].code as never, rejected[0].message));
    interface MergeAddition {
      id: string;
      name: string;
      size: number;
      bytes: Uint8Array;
      valid: boolean;
    }
    const additions: MergeAddition[] = [];
    for (const file of accepted) {
      const source = await fileToSource(file);
      let valid = false;
      try {
        const loaded = await loadPdfJsDocument(source.bytes);
        await loaded.destroy();
        valid = true;
      } catch {
        valid = false;
      }
      additions.push({ ...source, valid });
    }
    setMergeFiles((current) => [...current, ...additions]);
  };

  const [splitPageCount, setSplitPageCount] = useState<number | null>(null);

  const parsedSplitGroups = useMemo(() => {
    if (!splitFile || !splitPageCount) return null;
    try {
      return parseRangeGroups(splitInput, splitPageCount);
    } catch {
      return null;
    }
  }, [splitInput, splitFile, splitPageCount]);

  const openSplitFile = async (files: File[]) => {
    const { accepted } = await validatePdfFiles(files);
    if (accepted.length === 0) return;
    const source = await fileToSource(accepted[0]);
    try {
      const { doc: jsDoc, destroy } = await loadPdfJsDocument(source.bytes);
      setSplitPageCount(jsDoc.numPages);
      setSplitFile({ name: source.name, size: source.size, bytes: source.bytes });
      setSplitResults(null);
      setSplitInput(`1-${Math.min(jsDoc.numPages, 3)}`);
      await destroy();
    } catch {
      setPageErrors(new AppError("CORRUPT_PDF"));
    }
  };

  const runSplit = () =>
    processing.run("PDF wird aufgeteilt …", async () => {
      if (!splitFile || !parsedSplitGroups)
        throw new AppError("INVALID_TYPE", "Ungültige Seitenbereiche.");
      const results = await splitPdfByGroups(splitFile.bytes, parsedSplitGroups);
      setSplitResults(results);
      return results;
    });

  const downloadAllParts = async () => {
    if (!splitResults) return;
    const zip = new JSZip();
    splitResults.forEach((part) => zip.file(part.name, part.bytes));
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${splitFile!.name.replace(/\.pdf$/i, "")}-teile.zip`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const openFormatFile = async (files: File[]) => {
    const { accepted } = await validatePdfFiles(files);
    if (accepted.length === 0) return;
    const source = await fileToSource(accepted[0]);
    setFormatFile({ name: source.name, size: source.size, bytes: source.bytes });
    setCropResult(null);
    setResizeResult(null);
  };

  const runCrop = () =>
    processing.run("Seiten werden zugeschnitten …", async () => {
      if (!formatFile) return null;
      const anyMarginSet = Object.values(cropMargins).some((value) => value > 0);
      if (!anyMarginSet)
        throw new AppError("INVALID_TYPE", "Gib mindestens einen Rand an, um zu zuschneiden.");
      const bytes = await cropPages(formatFile.bytes, cropMargins);
      setCropResult(bytes);
      return bytes;
    });

  const runResize = () =>
    processing.run("Seitengröße wird angepasst …", async () => {
      if (!formatFile) return null;
      const bytes = await resizePages(formatFile.bytes, resizeTarget, resizeMarginMm);
      setResizeResult(bytes);
      return bytes;
    });

  const resetOrganize = () => {
    thumbDocs.forEach((doc) => doc.release?.());
    setDocs([]);
    setThumbDocs([]);
    setItems([]);
    setSelectedKeys(new Set());
    setOrganizeResult(null);
  };

  const selectedCount = selectedKeys.size;

  const toolbarButtonClass =
    "inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-xs font-medium hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:hover:bg-slate-800";

  return (
    <ToolShell
      title="PDF organisieren"
      description="Seiten drehen, sortieren, duplizieren, löschen und extrahieren. Mehrere Dokumente kombinieren oder in Teile zerlegen – alles lokal."
      privacy="local"
    >
      {(pageErrors || processing.error) && (
        <div className="mb-6">
          <ErrorAlert
            error={(processing.error ?? pageErrors)!}
            onDismiss={() => {
              processing.clearError();
              setPageErrors(null);
            }}
          />
        </div>
      )}

      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="sortieren">Sortieren & Bearbeiten</TabsTrigger>
          <TabsTrigger value="zusammenfuegen">Zusammenfügen</TabsTrigger>
          <TabsTrigger value="aufteilen">Aufteilen</TabsTrigger>
          <TabsTrigger value="format">Zuschneiden & Größe</TabsTrigger>
        </TabsList>

        {/* ---------------- Sortieren ---------------- */}
        <TabsContent value="sortieren">
          {items.length === 0 ? (
            <>
              <FileDropzone multiple onFiles={openForOrganize} />
              <div className="mt-4">
                <InfoAlert title="Tipp">
                  Du kannst mehrere Dateien gleichzeitig öffnen und ihre Seiten in einer Ansicht neu
                  anordnen.
                </InfoAlert>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <span className="mr-2 text-sm text-slate-600 dark:text-slate-400">
                  {items.length} Seiten · {selectedCount} ausgewählt
                </span>
                <button
                  type="button"
                  className={toolbarButtonClass}
                  onClick={extractSelection}
                  disabled={selectedCount === 0 || processing.state.active}
                >
                  Auswahl extrahieren
                </button>
                <button
                  type="button"
                  className={toolbarButtonClass}
                  onClick={() => applyOrganizedExport("auswahl")}
                  disabled={selectedCount === 0 || processing.state.active}
                >
                  Auswahl als PDF
                </button>
                <button
                  type="button"
                  className={toolbarButtonClass}
                  onClick={addBlankAfterSelection}
                  disabled={processing.state.active}
                >
                  <FilePlus2 aria-hidden className="h-3.5 w-3.5" /> Leerseite einfügen
                </button>
                <button
                  type="button"
                  className={toolbarButtonClass}
                  onClick={() =>
                    setSelectedKeys(
                      selectedCount === items.length
                        ? new Set()
                        : new Set(items.map((item) => item.key)),
                    )
                  }
                >
                  {selectedCount === items.length ? "Auswahl aufheben" : "Alle auswählen"}
                </button>
                <button type="button" className={toolbarButtonClass} onClick={resetOrganize}>
                  Zurücksetzen
                </button>
                <span className="flex-1" />
                <Button
                  onClick={() => applyOrganizedExport("alle")}
                  disabled={processing.state.active || items.length === 0}
                >
                  <PackageOpen aria-hidden className="h-4 w-4" /> Als PDF speichern
                </Button>
              </div>

              <WarningAlert>
                Beim Speichern wird die Reihenfolge, Rotation und Auswahl exakt so übernommen, wie
                du sie hier siehst. Die Originaldatei bleibt unverändert.
              </WarningAlert>

              <PageThumbGrid
                docs={thumbDocs}
                items={items}
                selectedKeys={selectedKeys}
                onToggleSelect={toggleSelect}
                onRotate={rotateItem}
                onDelete={deleteItem}
                onDuplicate={duplicateItem}
                onReorder={reorderItem}
              />

              {organizeResult && (
                <ResultCard
                  title={organizeResult.label}
                  filename={`${docs[0]?.name.replace(/\.pdf$/i, "") ?? "dokument"}-bearbeitet.pdf`}
                  data={organizeResult.bytes}
                  originalSize={organizeResult.originalSize}
                />
              )}
            </div>
          )}
        </TabsContent>

        {/* ---------------- Zusammenfügen ---------------- */}
        <TabsContent value="zusammenfuegen">
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-4">
              <ol className="space-y-2" aria-label="Dateireihenfolge">
                {mergeFiles.map((file, index) => (
                  <li
                    key={file.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <span
                      aria-hidden
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-slate-500">
                        {formatBytes(file.size)}
                        {file.valid ? "" : " · ungültig"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        aria-label={`${file.name} nach oben`}
                        className={toolbarButtonClass}
                        onClick={() => moveMergeFile(index, -1)}
                        disabled={index === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`${file.name} nach unten`}
                        className={toolbarButtonClass}
                        onClick={() => moveMergeFile(index, 1)}
                        disabled={index === mergeFiles.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`${file.name} entfernen`}
                        className={toolbarButtonClass}
                        onClick={() => removeMergeFile(file.id)}
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              <FileDropzone multiple compact onFiles={addMergeFiles} />
            </div>
            <aside className="space-y-4">
              <Button
                size="lg"
                className="w-full"
                onClick={runMerge}
                disabled={
                  mergeFiles.filter((file) => file.valid).length < 2 || processing.state.active
                }
              >
                {mergeFiles.length} Dateien zusammenfügen
              </Button>
              {mergeResult && (
                <ResultCard
                  title="Zusammengeführt!"
                  filename="zusammengefuegt.pdf"
                  data={mergeResult}
                />
              )}
            </aside>
          </div>
        </TabsContent>

        {/* ---------------- Aufteilen ---------------- */}
        <TabsContent value="aufteilen">
          {!splitFile ? (
            <FileDropzone onFiles={openSplitFile} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
              <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                <FieldLabel htmlFor="split-ranges">Seitenbereiche</FieldLabel>
                <Input
                  id="split-ranges"
                  value={splitInput}
                  onChange={(event) => setSplitInput(event.target.value)}
                  placeholder='z. B. „1-3, 5, 8-"'
                  aria-describedby="split-hint"
                />
                <p id="split-hint" className="text-xs text-slate-500">
                  Jeder Bereich (durch Komma getrennt) wird eine eigene PDF-Datei. Das Dokument hat{" "}
                  <strong>{splitPageCount}</strong> Seiten.
                </p>
                <div className="flex flex-wrap gap-2">
                  {parsedSplitGroups?.map((group, index) => (
                    <span
                      key={index}
                      className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                    >
                      Teil {index + 1}: Seite(n) {group.map((page) => page + 1).join(", ")}
                    </span>
                  ))}
                </div>
                <Button onClick={runSplit} disabled={!parsedSplitGroups || processing.state.active}>
                  Aufteilen
                </Button>
                <Button variant="ghost" onClick={() => setSplitFile(null)}>
                  Andere Datei wählen
                </Button>
              </section>
              <aside className="space-y-4">
                {splitResults && (
                  <>
                    <InfoAlert title={`${splitResults.length} Teile erstellt`}>
                      Lade die Teile einzeln oder als ZIP-Archiv herunter.
                    </InfoAlert>
                    <Button variant="secondary" className="w-full" onClick={downloadAllParts}>
                      Alle Teile als ZIP herunterladen
                    </Button>
                    <ul className="space-y-2">
                      {splitResults.map((part, index) => (
                        <li key={part.name}>
                          <ResultCard
                            title={`Teil ${index + 1}`}
                            filename={part.name}
                            data={part.bytes}
                            originalSize={Math.round(splitFile.size / splitResults.length)}
                          />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </aside>
            </div>
          )}
        </TabsContent>

        {/* ---------------- Zuschneiden & Größe ---------------- */}
        <TabsContent value="format">
          {!formatFile ? (
            <FileDropzone onFiles={openFormatFile} />
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                <h2 className="font-semibold">Seitenränder zuschneiden</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Schneidet von allen Seiten gleichmäßig Rand ab (Millimeter).
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {(["left", "right", "top", "bottom"] as const).map((side) => (
                    <div key={side}>
                      <FieldLabel htmlFor={`crop-${side}`}>
                        {{ left: "Links", right: "Rechts", top: "Oben", bottom: "Unten" }[side]}{" "}
                        (mm)
                      </FieldLabel>
                      <Input
                        id={`crop-${side}`}
                        type="number"
                        min={0}
                        max={200}
                        value={cropMargins[side]}
                        onChange={(event) =>
                          setCropMargins((current) => ({
                            ...current,
                            [side]: Math.max(0, Number(event.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
                <Button onClick={runCrop} disabled={processing.state.active}>
                  Zuschneiden
                </Button>
                {cropResult && (
                  <ResultCard
                    title="Zugeschnitten!"
                    filename={`${formatFile.name.replace(/\.pdf$/i, "")}-zugeschnitten.pdf`}
                    data={cropResult}
                    originalSize={formatFile.size}
                  />
                )}
              </section>

              <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                <h2 className="font-semibold">Seitengröße anpassen</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Skaliert alle Seiten proportional auf das Zielformat (Inhalt bleibt erhalten).
                </p>
                <RadioGroupField
                  name="resize-target"
                  legend="Zielformat"
                  value={resizeTarget}
                  onChange={setResizeTarget}
                  options={[
                    { value: "A4", label: "A4 (210 × 297 mm)" },
                    { value: "Letter", label: "Letter (216 × 279 mm)" },
                  ]}
                  columns={2}
                />
                <div>
                  <FieldLabel htmlFor="resize-margin">Rand ({resizeMarginMm} mm)</FieldLabel>
                  <input
                    id="resize-margin"
                    type="range"
                    min={0}
                    max={40}
                    value={resizeMarginMm}
                    onChange={(event) => setResizeMarginMm(Number(event.target.value))}
                    className="w-full accent-blue-700"
                  />
                </div>
                <Button variant="secondary" onClick={runResize} disabled={processing.state.active}>
                  Anpassen
                </Button>
                {resizeResult && (
                  <ResultCard
                    title="Größe angepasst!"
                    filename={`${formatFile.name.replace(/\.pdf$/i, "")}-${resizeTarget.toLowerCase()}.pdf`}
                    data={resizeResult}
                    originalSize={formatFile.size}
                  />
                )}
              </section>

              <div className="lg:col-span-2">
                <Button variant="ghost" onClick={() => setFormatFile(null)}>
                  Andere Datei wählen
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}
