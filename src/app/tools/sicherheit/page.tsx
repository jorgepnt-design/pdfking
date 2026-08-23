"use client";

import { useCallback, useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Eraser, Trash2, Undo2 } from "lucide-react";
import { ResultCard } from "@/components/shared/result-card";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert, WarningAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldLabel, Input, RadioGroupField } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProcessing } from "@/hooks/useProcessing";
import type { PdfDocumentInfo } from "@/lib/types";
import {
  encryptPdf,
  readAndUpdateMetadata,
  removePasswordProtection,
  stripMetadata,
  type EncryptionPermissions,
} from "@/lib/pdf/security";
import { type MetadataFields } from "@/lib/pdf/loadDocument";
import { loadPdfJsDocument, renderPageToCanvas } from "@/lib/pdf/pdfjs";
import { redactPages } from "@/lib/pdf/pages";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { formatBytes } from "@/lib/utils";
import { validatePdfFiles } from "@/lib/validate";

export default function SicherheitPage() {
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
      <SicherheitInner />
    </Suspense>
  );
}

function SicherheitInner() {
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "metadaten";

  return (
    <ToolShell
      title="Sicherheit"
      description="Metadaten verwalten, Dokumente verschlüsseln oder entsperren und sensible Inhalte dauerhaft schwärzen."
      privacy="local"
    >
      <Tabs defaultValue={activeTab}>
        <TabsList>
          <TabsTrigger value="metadaten">Metadaten & Infos</TabsTrigger>
          <TabsTrigger value="verschluesseln">Verschlüsseln</TabsTrigger>
          <TabsTrigger value="entsperren">Passwort entfernen</TabsTrigger>
          <TabsTrigger value="schwaerzen">Schwärzen</TabsTrigger>
        </TabsList>
        <TabsContent value="metadaten">
          <MetadataTab />
        </TabsContent>
        <TabsContent value="verschluesseln">
          <EncryptTab />
        </TabsContent>
        <TabsContent value="entsperren">
          <UnlockTab />
        </TabsContent>
        <TabsContent value="schwaerzen">
          <RedactTab />
        </TabsContent>
      </Tabs>
    </ToolShell>
  );
}

/* ================= Metadaten ================= */

function MetadataTab() {
  const processing = useProcessing();
  const [source, setSource] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(
    null,
  );
  const [info, setInfo] = useState<PdfDocumentInfo | null>(null);
  const [fields, setFields] = useState<MetadataFields>({});
  const [savedBytes, setSavedBytes] = useState<Uint8Array | null>(null);

  const openFile = async (files: File[]) => {
    processing.clearError();
    const { accepted } = await validatePdfFiles(files);
    if (accepted.length === 0 || processing.state.active) return;
    const file = accepted[0];
    await processing.run("Datei wird analysiert …", async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      try {
        const { info: documentInfo } = await readAndUpdateMetadata(bytes);
        setSource({ name: file.name, size: file.size, bytes });
        setInfo(documentInfo);
        setFields({
          title: documentInfo.title ?? "",
          author: documentInfo.author ?? "",
          subject: documentInfo.subject ?? "",
          keywords: documentInfo.keywords ?? "",
          creator: documentInfo.creator ?? "",
        });
        setSavedBytes(null);
      } catch {
        throw Object.assign(new Error("Datei konnte nicht gelesen werden."));
      }
    });
  };

  const save = (mode: "bearbeitet" | "entfernen") =>
    processing.run(
      mode === "entfernen" ? "Metadaten werden entfernt …" : "Metadaten werden gespeichert …",
      async () => {
        if (!source) return null;
        let bytes: Uint8Array;
        if (mode === "entfernen") {
          bytes = await stripMetadata(source.bytes);
          setFields({ title: "", author: "", subject: "", keywords: "", creator: "" });
        } else {
          ({ bytes } = await readAndUpdateMetadata(source.bytes, fields));
        }
        setSavedBytes(bytes);
        return bytes;
      },
    );

  return (
    <div className="space-y-6">
      {processing.error ? (
        <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
      ) : null}
      {!source ? (
        <FileDropzone onFiles={openFile} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <h2 className="font-semibold">Dokumentinformationen</h2>
            <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">Datei</dt>
              <dd className="truncate font-medium">{source.name}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Größe</dt>
              <dd>{formatBytes(source.size)}</dd>
              {info ? (
                <>
                  <dt className="text-slate-500 dark:text-slate-400">Seiten</dt>
                  <dd>{info.pageCount}</dd>
                  <dt className="text-slate-500 dark:text-slate-400">Verschlüsselt</dt>
                  <dd>{info.isEncrypted ? "Ja" : "Nein"}</dd>
                  {info.creationDate ? (
                    <>
                      <dt className="text-slate-500 dark:text-slate-400">Erstellt am</dt>
                      <dd>{info.creationDate.toLocaleString("de-DE")}</dd>
                    </>
                  ) : null}
                  {info.producer ? (
                    <>
                      <dt className="text-slate-500 dark:text-slate-400">Producer</dt>
                      <dd className="break-all">{info.producer}</dd>
                    </>
                  ) : null}
                </>
              ) : null}
            </dl>

            <h2 className="pt-2 font-semibold">Bearbeiten</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["title", "Titel"],
                  ["author", "Autor"],
                  ["subject", "Thema"],
                  ["keywords", "Stichwörter"],
                  ["creator", "Anwendung (Creator)"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <FieldLabel htmlFor={`meta-${key}`}>{label}</FieldLabel>
                  <Input
                    id={`meta-${key}`}
                    value={fields[key] ?? ""}
                    onChange={(event) =>
                      setFields((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => save("bearbeitet")} disabled={processing.state.active}>
                Änderungen speichern
              </Button>
              <Button
                variant="destructive"
                onClick={() => save("entfernen")}
                disabled={processing.state.active}
              >
                Alle Metadaten entfernen
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSource(null);
                  setSavedBytes(null);
                }}
              >
                Andere Datei
              </Button>
            </div>
          </section>

          <aside>
            {savedBytes && source && (
              <ResultCard
                title="Gespeichert!"
                filename={`${source.name.replace(/\.pdf$/i, "")}-metadaten.pdf`}
                data={savedBytes}
                originalSize={source.size}
              />
            )}
          </aside>
        </div>
      )}
      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </div>
  );
}

/* ================= Verschlüsseln ================= */

const DEFAULT_PERMISSIONS: EncryptionPermissions = {
  printing: "high",
  copying: true,
  modifying: false,
  annotating: true,
  fillingForms: true,
  contentAccessibility: true,
  documentAssembly: false,
};

function EncryptTab() {
  const processing = useProcessing();
  const [source, setSource] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(
    null,
  );
  const [userPassword, setUserPassword] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [permissions, setPermissions] = useState<EncryptionPermissions>(DEFAULT_PERMISSIONS);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);

  const encrypt = () =>
    processing.run("PDF wird verschlüsselt …", async () => {
      if (!source) return null;
      if (!userPassword && !ownerPassword) return null;
      const bytes = await encryptPdf(
        source.bytes,
        { userPassword, ownerPassword: ownerPassword || undefined },
        permissions,
      );
      setResultBytes(bytes);
      setUserPassword("");
      setOwnerPassword("");
      return bytes;
    });

  return (
    <div className="space-y-6">
      {processing.error ? (
        <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
      ) : null}

      <WarningAlert title="Passwort unbedingt merken">
        Ohne das richtige Passwort ist der Inhalt nicht wiederherstellbar – auch PDFKing kann
        verschlüsselte Dateien nicht ohne Passwort öffnen.
      </WarningAlert>

      {!source ? (
        <FileDropzone
          onFiles={async (files) => {
            if (processing.state.active) return;
            processing.clearError();
            const { accepted } = await validatePdfFiles(files);
            if (accepted.length === 0) return;
            const file = accepted[0];
            setSource({
              name: file.name,
              size: file.size,
              bytes: new Uint8Array(await file.arrayBuffer()),
            });
            setResultBytes(null);
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <section className="space-y-5 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Datei: <strong>{source.name}</strong> · Verfahren: <strong>AES-256</strong> (ISO
              32000-2)
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="enc-user">Passwort zum Öffnen (User)</FieldLabel>
                <Input
                  id="enc-user"
                  type="password"
                  autoComplete="new-password"
                  value={userPassword}
                  onChange={(event) => setUserPassword(event.target.value)}
                />
              </div>
              <div>
                <FieldLabel htmlFor="enc-owner">
                  Berechtigungs-Passwort (Owner, optional)
                </FieldLabel>
                <Input
                  id="enc-owner"
                  type="password"
                  autoComplete="new-password"
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                />
              </div>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium">Berechtigungen</legend>
              <RadioGroupField
                name="perm-printing"
                legend="Drucken"
                value={permissions.printing}
                onChange={(value) => setPermissions((current) => ({ ...current, printing: value }))}
                columns={3}
                options={[
                  { value: "no", label: "Nicht erlaubt" },
                  { value: "low", label: "Niedrige Qualität" },
                  { value: "high", label: "Volle Qualität" },
                ]}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Checkbox
                  label="Text/Bilder kopieren"
                  checked={permissions.copying}
                  onChange={(event) =>
                    setPermissions((c) => ({ ...c, copying: event.target.checked }))
                  }
                />
                <Checkbox
                  label="Dokument ändern"
                  checked={permissions.modifying}
                  onChange={(event) =>
                    setPermissions((c) => ({ ...c, modifying: event.target.checked }))
                  }
                />
                <Checkbox
                  label="Kommentare/Annotationen"
                  checked={permissions.annotating}
                  onChange={(event) =>
                    setPermissions((c) => ({ ...c, annotating: event.target.checked }))
                  }
                />
                <Checkbox
                  label="Formulare ausfüllen"
                  checked={permissions.fillingForms}
                  onChange={(event) =>
                    setPermissions((c) => ({ ...c, fillingForms: event.target.checked }))
                  }
                />
                <Checkbox
                  label="Barrierefreiheit erlauben"
                  checked={permissions.contentAccessibility}
                  onChange={(event) =>
                    setPermissions((c) => ({ ...c, contentAccessibility: event.target.checked }))
                  }
                />
                <Checkbox
                  label="Seiten zusammenstellen"
                  checked={permissions.documentAssembly}
                  onChange={(event) =>
                    setPermissions((c) => ({ ...c, documentAssembly: event.target.checked }))
                  }
                />
              </div>
            </fieldset>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={encrypt}
                disabled={(!userPassword && !ownerPassword) || processing.state.active}
              >
                Verschlüsseln & speichern
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSource(null);
                  setResultBytes(null);
                }}
              >
                Andere Datei
              </Button>
            </div>
          </section>

          <aside>
            {resultBytes && source && (
              <ResultCard
                title="Verschlüsselt!"
                filename={`${source.name.replace(/\.pdf$/i, "")}-geschuetzt.pdf`}
                data={resultBytes}
                originalSize={source.size}
              />
            )}
          </aside>
        </div>
      )}
      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </div>
  );
}

/* ================= Entsperren ================= */

function UnlockTab() {
  const processing = useProcessing();
  const [source, setSource] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);

  const unlock = () =>
    processing.run("Passwort wird entfernt …", async () => {
      if (!source || !password) return null;
      const bytes = await removePasswordProtection(source.bytes, password);
      setResultBytes(bytes);
      setPassword("");
      return bytes;
    });

  return (
    <div className="space-y-6">
      {processing.error ? (
        <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
      ) : null}

      <InfoAlert title="Rechtlicher Hinweis">
        Entferne den Schutz nur bei Dokumenten, für die du die Berechtigung besitzt (z. B. eigenes
        vergessenes Passwort). Das korrekte Passwort wird benötigt.
      </InfoAlert>

      {!source ? (
        <FileDropzone
          onFiles={async (files) => {
            if (processing.state.active) return;
            processing.clearError();
            const { accepted } = await validatePdfFiles(files);
            if (accepted.length === 0) return;
            const file = accepted[0];
            setSource({
              name: file.name,
              size: file.size,
              bytes: new Uint8Array(await file.arrayBuffer()),
            });
            setResultBytes(null);
          }}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Datei: <strong>{source.name}</strong>
            </p>
            <div>
              <FieldLabel htmlFor="unlock-password">Aktuelles Passwort</FieldLabel>
              <Input
                id="unlock-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="off"
                onKeyDown={(event) => event.key === "Enter" && unlock()}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={unlock} disabled={!password || processing.state.active}>
                Schutz entfernen
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSource(null);
                  setResultBytes(null);
                }}
              >
                Andere Datei
              </Button>
            </div>
          </section>
          <aside>
            {resultBytes && source && (
              <ResultCard
                title="Schutz entfernt!"
                filename={`${source.name.replace(/\.pdf$/i, "")}-offen.pdf`}
                data={resultBytes}
                originalSize={source.size}
              />
            )}
          </aside>
        </div>
      )}
      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </div>
  );
}

/* ================= Schwärzen ================= */

interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function RedactTab() {
  const processing = useProcessing();
  const [source, setSource] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(
    null,
  );
  const [jsDoc, setJsDoc] = useState<PDFDocumentProxy | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rectsPerPage, setRectsPerPage] = useState<Record<number, NormalizedRect[]>>({});
  const [previewRect, setPreviewRect] = useState<NormalizedRect | null>(null);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);

  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const destroyRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(
    () => () => {
      destroyRef.current?.().catch(() => undefined);
    },
    [],
  );

  const openFile = async (files: File[]) => {
    if (processing.state.active) return;
    processing.clearError();
    const { accepted } = await validatePdfFiles(files);
    if (accepted.length === 0) return;
    const file = accepted[0];
    await processing.run("Datei wird geladen …", async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const loaded = await loadPdfJsDocument(bytes);
      setSource({ name: file.name, size: file.size, bytes });
      setJsDoc(loaded.doc);
      destroyRef.current = loaded.destroy;
      setPageIndex(0);
      setRectsPerPage({});
      setResultBytes(null);
    });
  };

  // Basisseite rendern
  const [hostSize, setHostSize] = useState({ width: 1, height: 1 });
  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!jsDoc || !canvas || !host) return;
    let cancelled = false;
    const measure = () => {
      setHostSize({ width: host.clientWidth || 1, height: host.clientHeight || 1 });
    };
    const render = async () => {
      await renderPageToCanvas(jsDoc, pageIndex, canvas, host.clientWidth - 2);
      void cancelled;
    };
    const raf = requestAnimationFrame(() => {
      measure();
      void render();
    });
    const observer = new ResizeObserver(() => {
      measure();
      void render();
    });
    observer.observe(host);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [jsDoc, pageIndex]);

  // Schwarze Kästen als Overlay-Divs zeichnen
  const rects = rectsPerPage[pageIndex] ?? [];

  const relativePoint = useCallback(
    (event: React.PointerEvent<HTMLDivElement>): { x: number; y: number } | null => {
      const host = hostRef.current;
      if (!host) return null;
      const bounds = host.getBoundingClientRect();
      return {
        x: Math.min(Math.max(0, event.clientX - bounds.left), bounds.width),
        y: Math.min(Math.max(0, event.clientY - bounds.top), bounds.height),
      };
    },
    [],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const point = relativePoint(event);
    if (!point) return;
    dragStartRef.current = point;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const current = relativePoint(event);
    if (!current) return;
    const start = dragStartRef.current;
    setPreviewRect({
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
    });
  };

  const onPointerUp = () => {
    const preview = previewRect;
    dragStartRef.current = null;
    setPreviewRect(null);
    if (!preview || preview.width < 5 || preview.height < 5) return;
    const host = hostRef.current;
    if (!host) return;
    const normalized: NormalizedRect = {
      x: preview.x / host.clientWidth,
      y: preview.y / host.clientHeight,
      width: preview.width / host.clientWidth,
      height: preview.height / host.clientHeight,
    };
    setRectsPerPage((current) => ({
      ...current,
      [pageIndex]: [...(current[pageIndex] ?? []), normalized],
    }));
  };

  const undoLast = () =>
    setRectsPerPage((current) => {
      const list = current[pageIndex];
      if (!list?.length) return current;
      return { ...current, [pageIndex]: list.slice(0, -1) };
    });

  const clearPage = () => setRectsPerPage((current) => ({ ...current, [pageIndex]: [] }));

  const totalRects = Object.values(rectsPerPage).reduce((sum, list) => sum + list.length, 0);
  const pageCount = jsDoc?.numPages ?? 0;

  const applyRedaction = () =>
    processing.run("Seiten werden dauerhaft geschwärzt …", async ({ report, token }) => {
      if (!jsDoc || !source) return null;
      if (totalRects === 0) return null;

      // Normalisierte Koordinaten in PDF-Punkte umrechnen
      const rectsInPoints: Record<
        number,
        Array<{ x: number; y: number; width: number; height: number }>
      > = {};
      for (const [indexKey, list] of Object.entries(rectsPerPage)) {
        if (list.length === 0) continue;
        const numericIndex = Number(indexKey);
        const page = await jsDoc.getPage(numericIndex + 1);
        const viewport = page.getViewport({ scale: 1 });
        page.cleanup();
        rectsInPoints[numericIndex] = list.map((rect) => ({
          x: rect.x * viewport.width,
          y: rect.y * viewport.height,
          width: rect.width * viewport.width,
          height: rect.height * viewport.height,
        }));
      }

      const bytes = await redactPages(jsDoc, rectsInPoints, 1800, report, token);
      setResultBytes(bytes);
      return bytes;
    });

  return (
    <div className="space-y-6">
      {processing.error ? (
        <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
      ) : null}

      <WarningAlert title="Wirklich dauerhaft">
        Beim Export werden betroffene Seiten als Bild neu aufgebaut – nachdem die Bereiche schwarz
        übermalt wurden. Der Inhalt unter dem Kasten existiert in der neuen Datei nicht mehr und ist
        nicht wiederherstellbar.
      </WarningAlert>

      {!source ? (
        <FileDropzone onFiles={openFile} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
                disabled={pageIndex === 0}
              >
                ← Zurück
              </Button>
              <span aria-live="polite" className="text-sm font-medium">
                Seite {pageIndex + 1} von {pageCount}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPageIndex((index) => Math.min(pageCount - 1, index + 1))}
                disabled={pageIndex >= pageCount - 1}
              >
                Weiter →
              </Button>
              <span className="flex-1" />
              <span className="text-xs text-slate-500">{totalRects} Markierung(en)</span>
            </div>

            <div
              ref={hostRef}
              className="relative overflow-hidden rounded-xl border border-slate-200 bg-white select-none dark:border-slate-700 dark:bg-slate-900"
            >
              <canvas ref={canvasRef} className="block w-full" aria-hidden />
              <div
                className="absolute inset-0 cursor-crosshair touch-none"
                role="application"
                aria-label={`Zeichenfläche Seite ${pageIndex + 1}: Ziehe Rechtecke über zu schwärzende Bereiche`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
              >
                {rects.map((rect, index) => (
                  <div
                    key={index}
                    aria-hidden
                    className="pointer-events-none absolute bg-black"
                    style={{
                      left: `${rect.x * 100}%`,
                      top: `${rect.y * 100}%`,
                      width: `${rect.width * 100}%`,
                      height: `${rect.height * 100}%`,
                    }}
                  />
                ))}
                {previewRect ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute border-2 border-dashed border-red-600"
                    style={{
                      left: `${(previewRect.x / hostSize.width) * 100}%`,
                      top: `${(previewRect.y / hostSize.height) * 100}%`,
                      width: `${(previewRect.width / hostSize.width) * 100}%`,
                      height: `${(previewRect.height / hostSize.height) * 100}%`,
                    }}
                  />
                ) : null}
              </div>
            </div>
            <p className="text-xs text-slate-500">
              Tipp: Ziehe mit Maus oder Finger Rechtecke über Namen, Beträge o. Ä. „Rückgängig“
              entfernt den letzten Kasten.
            </p>
          </div>

          <aside className="space-y-3">
            <Button
              className="w-full"
              onClick={applyRedaction}
              disabled={totalRects === 0 || processing.state.active}
            >
              <Eraser aria-hidden className="mr-1.5 h-4 w-4" /> Dauerhaft schwärzen
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              onClick={undoLast}
              disabled={rects.length === 0}
            >
              <Undo2 aria-hidden className="mr-1.5 h-4 w-4" /> Letztes Rechteck zurück
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={clearPage}
              disabled={rects.length === 0}
            >
              <Trash2 aria-hidden className="mr-1.5 h-4 w-4" /> Seite säubern
            </Button>
            {resultBytes && source && (
              <ResultCard
                title="Geschwärzt!"
                filename={`${source.name.replace(/\.pdf$/i, "")}-geschwaerzt.pdf`}
                data={resultBytes}
                originalSize={source.size}
              />
            )}
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setSource(null);
                setJsDoc(null);
                setResultBytes(null);
              }}
            >
              Andere Datei wählen
            </Button>
          </aside>
        </div>
      )}
      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </div>
  );
}
