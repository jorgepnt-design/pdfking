"use client";

import { useEffect, useState } from "react";
import { Server } from "lucide-react";
import { DownloadButton, ResultCard } from "@/components/shared/result-card";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { FieldLabel, RadioGroupField } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProcessing } from "@/hooks/useProcessing";
import { docxToPdf } from "@/lib/office/docx-to-pdf";
import type { ServerStatus } from "@/lib/types";
import {
  imagesToPdf,
  pdfToHtmlFile,
  pdfToImages,
  pdfToSimpleDocx,
  pdfToTextFile,
  extractImages,
} from "@/lib/pdf/convert";
import { validateImageFile, validatePdfFiles } from "@/lib/validate";
import { formatBytes, sanitizeFilename } from "@/lib/utils";

export default function KonvertierenPage() {
  const processing = useProcessing();
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);

  useEffect(() => {
    fetch("/api/status")
      .then((response) => response.json())
      .then((data: ServerStatus) => setServerStatus(data))
      .catch(() => setServerStatus({ enabled: false }));
  }, []);

  // ---- PDF → Bilder ----
  const [imageSource, setImageSource] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [imageFormat, setImageFormat] = useState<"image/png" | "image/jpeg">("image/png");
  const [dpiScale, setDpiScale] = useState(2);
  const [imagesZip, setImagesZip] = useState<Blob | null>(null);

  const convertToImages = () =>
    processing.run("Seiten werden als Bilder exportiert …", async ({ report, token }) => {
      if (!imageSource) return null;
      const zipBlob = await pdfToImages(
        imageSource.bytes,
        imageFormat,
        { dpiScale, quality: 0.9 },
        report,
        token,
      );
      setImagesZip(zipBlob);
      return zipBlob;
    });

  // ---- Bilder → PDF ----
  const [imageList, setImageList] = useState<File[]>([]);
  const [imagesPdf, setImagesPdf] = useState<Uint8Array | null>(null);

  const addImages = (files: File[]) => {
    for (const file of files) {
      const problem = validateImageFile(file);
      if (problem) {
        void processing.run("", async () => {
          throw problem;
        });
        continue;
      }
      setImageList((current) => [...current, file]);
    }
  };

  const convertImagesToPdf = () =>
    processing.run("Bilder werden zu einem PDF …", async ({ report }) => {
      const bytes = await imagesToPdf(imageList, report);
      setImagesPdf(bytes);
      return bytes;
    });

  // ---- Text/HTML/DOCX Quelle ----
  const [textSource, setTextSource] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [textPreview, setTextPreview] = useState<string>("");
  const [textBlob, setTextBlob] = useState<Blob | null>(null);
  const [htmlBlob, setHtmlBlob] = useState<Blob | null>(null);
  const [docxBusy, setDocxBusy] = useState(false);
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null);

  const openTextSource = async (files: File[]) => {
    processing.clearError();
    const { accepted } = await validatePdfFiles(files);
    if (accepted.length === 0) return;
    const file = accepted[0];
    setTextSource({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    setTextPreview("");
    setTextBlob(null);
    setHtmlBlob(null);
    setDocxBlob(null);
  };

  const extractTextNow = () =>
    processing.run("Text wird extrahiert …", async () => {
      if (!textSource) return null;
      const blob = await pdfToTextFile(textSource.bytes);
      const full = await blob.text();
      setTextPreview(full.slice(0, 3000));
      setTextBlob(blob);
      return blob;
    });

  const exportHtmlNow = () =>
    processing.run("HTML wird erzeugt …", async () => {
      if (!textSource) return null;
      const blob = await pdfToHtmlFile(textSource.bytes, textSource.name);
      setHtmlBlob(blob);
      return blob;
    });

  const exportSimpleDocxNow = async () => {
    if (!textSource || docxBusy) return;
    setDocxBusy(true);
    try {
      await processing.run(
        "PDF-Seiten werden originalgetreu in Word übernommen …",
        async ({ report }) => {
          const blob = await pdfToSimpleDocx(textSource.bytes, report);
          setDocxBlob(blob);
          return blob;
        },
      );
    } catch (error) {
      console.error(error);
    } finally {
      setDocxBusy(false);
    }
  };

  // ---- Office → PDF ----
  const [officeFile, setOfficeFile] = useState<File | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [serverResult, setServerResult] = useState<{
    blob: Blob;
    filename: string;
    mime: string;
  } | null>(null);

  const serverEnabled = serverStatus?.enabled === true;
  const officeIsDocx = officeFile?.name.toLowerCase().endsWith(".docx") === true;

  const runOfficeConversion = () =>
    processing.run("Datei wird an den Server übertragen …", async ({ report }) => {
      if (!serverEnabled) throw new Error("Server nicht eingerichtet");
      if (!officeFile) return null;

      const format = officeFile.name.toLowerCase().endsWith(".docx")
        ? "docx-pdf"
        : officeFile.name.toLowerCase().endsWith(".pptx")
          ? "pptx-pdf"
          : "xlsx-pdf";

      const formData = new FormData();
      formData.append("file", officeFile, officeFile.name);
      report(30);

      const response = await fetch(`/api/convert/${format}`, { method: "POST", body: formData });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { error?: string };
        throw Object.assign(new Error(detail.error ?? `Serverfehler (${response.status})`));
      }
      report(80);
      const blob = await response.blob();
      const resultPayload = {
        blob,
        filename: `${sanitizeFilename(officeFile.name)}.pdf`,
        mime: "application/pdf",
      };
      setServerResult(resultPayload);
      report(100);
      return resultPayload;
    });

  const tryOfficeConversion = () => {
    if (officeFile && officeIsDocx) {
      setServerMessage(null);
      void processing.run("Word-Dokument wird lokal in PDF umgewandelt …", async ({ report }) => {
        const blob = await docxToPdf(officeFile, report);
        setServerResult({
          blob,
          filename: `${sanitizeFilename(officeFile.name.replace(/\.docx$/i, ""))}.pdf`,
          mime: "application/pdf",
        });
        return blob;
      });
      return;
    }
    if (!serverEnabled) {
      setServerMessage(
        "Für diese Konvertierung ist ein Verarbeitungsserver erforderlich, der aktuell nicht eingerichtet ist.",
      );
      return;
    }
    setServerMessage(null);
    void runOfficeConversion();
  };

  const serverBadge = (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100">
      <Server aria-hidden className="h-3 w-3" />
      Server erforderlich{!serverEnabled ? " – nicht eingerichtet" : ""}
    </span>
  );

  return (
    <ToolShell
      title="PDF konvertieren"
      description="Wandle PDFs in Bilder, Text oder HTML um und zurück. Auch DOCX wird komplett lokal in PDF umgewandelt; amber markierte Funktionen benötigen optional einen Server."
      privacy="mixed"
    >
      {processing.error && (
        <div className="mb-6">
          <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
        </div>
      )}

      <Tabs defaultValue="zu-bildern">
        <TabsList>
          <TabsTrigger value="zu-bildern">PDF → Bilder</TabsTrigger>
          <TabsTrigger value="zu-pdf">Bilder → PDF</TabsTrigger>
          <TabsTrigger value="zu-text">PDF → Text</TabsTrigger>
          <TabsTrigger value="zu-html">PDF → HTML</TabsTrigger>
          <TabsTrigger value="zu-docx">PDF → Word</TabsTrigger>
          <TabsTrigger value="office">Office → PDF</TabsTrigger>
        </TabsList>

        {/* ---------- PDF → Bilder ---------- */}
        <TabsContent value="zu-bildern">
          {!imageSource ? (
            <FileDropzone
              onFiles={async (files) => {
                processing.clearError();
                const { accepted } = await validatePdfFiles(files);
                if (accepted.length === 0) return;
                const file = accepted[0];
                setImageSource({
                  name: file.name,
                  bytes: new Uint8Array(await file.arrayBuffer()),
                });
                setImagesZip(null);
              }}
            />
          ) : (
            <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
              <section className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                <RadioGroupField
                  name="img-format"
                  legend="Bildformat"
                  value={imageFormat}
                  onChange={setImageFormat}
                  columns={2}
                  options={[
                    { value: "image/png", label: "PNG", hint: "Verlustfrei" },
                    { value: "image/jpeg", label: "JPG", hint: "Kompakter" },
                  ]}
                />
                <div>
                  <FieldLabel htmlFor="dpi-scale">
                    Auflösung ({Math.round(dpiScale * 72)} dpi)
                  </FieldLabel>
                  <input
                    id="dpi-scale"
                    type="range"
                    min={1}
                    max={4}
                    step={0.5}
                    value={dpiScale}
                    onChange={(event) => setDpiScale(Number(event.target.value))}
                    className="w-full accent-blue-700"
                  />
                </div>
                <Button onClick={convertToImages} disabled={processing.state.active}>
                  Alle Seiten konvertieren (ZIP)
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setImageSource(null);
                    setImagesZip(null);
                  }}
                >
                  Andere Datei wählen
                </Button>
              </section>
              <aside>
                {imagesZip && imageSource && (
                  <ResultCard
                    title="Bilder bereit!"
                    filename={`${sanitizeFilename(imageSource.name)}-seiten.zip`}
                    data={imagesZip}
                    mime="application/zip"
                  />
                )}
              </aside>
            </div>
          )}
        </TabsContent>

        {/* ---------- Bilder → PDF ---------- */}
        <TabsContent value="zu-pdf">
          <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
            <div className="space-y-4">
              {imageList.length > 0 ? (
                <ol className="space-y-1 text-sm" aria-label="Bildreihenfolge">
                  {imageList.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-800"
                    >
                      <span>
                        {index + 1}. {file.name} ({formatBytes(file.size)})
                      </span>
                      <button
                        type="button"
                        aria-label={`${file.name} entfernen`}
                        onClick={() =>
                          setImageList((current) =>
                            current.filter((_, position) => position !== index),
                          )
                        }
                        className="rounded px-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
              <FileDropzone accept="images" multiple compact onFiles={addImages} />
              {imageList.length > 0 ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setImageList([]);
                    setImagesPdf(null);
                  }}
                >
                  Liste leeren
                </Button>
              ) : null}
            </div>
            <aside className="space-y-4">
              <Button
                size="lg"
                className="w-full"
                disabled={imageList.length === 0 || processing.state.active}
                onClick={convertImagesToPdf}
              >
                {imageList.length} Bild(er) zu PDF
              </Button>
              {imagesPdf && (
                <ResultCard
                  title="Fertig!"
                  filename="bilder.pdf"
                  data={imagesPdf}
                  originalSize={imageList.reduce((sum, file) => sum + file.size, 0)}
                />
              )}
            </aside>
          </div>
        </TabsContent>

        {/* ---------- PDF → Text ---------- */}
        <TabsContent value="zu-text">
          {!textSource ? (
            <FileDropzone onFiles={openTextSource} />
          ) : (
            <div className="space-y-4">
              <Button onClick={extractTextNow} disabled={processing.state.active}>
                Text extrahieren
              </Button>
              {textPreview !== "" && (
                <InfoAlert title={`Vorschau (${textSource.name})`}>
                  <pre className="mt-2 max-h-72 overflow-auto font-mono text-xs break-words whitespace-pre-wrap">
                    {textPreview || "[kein Text gefunden – gescanntes Dokument? Nutze OCR]"}
                  </pre>
                </InfoAlert>
              )}
              {textBlob && (
                <DownloadButton
                  data={textBlob}
                  filename={`${sanitizeFilename(textSource.name)}.txt`}
                  mime="text/plain;charset=utf-8"
                >
                  Als .txt herunterladen
                </DownloadButton>
              )}
            </div>
          )}
        </TabsContent>

        {/* ---------- PDF → HTML ---------- */}
        <TabsContent value="zu-html">
          {!textSource ? (
            <FileDropzone onFiles={openTextSource} />
          ) : (
            <div className="space-y-4">
              <InfoAlert title="Hinweis zur Qualität">
                Die HTML-Ausgabe enthält den Text strukturiert pro Seite. Das exakte Layout des
                Originals wird nicht wiedergegeben – ideal zum Weiterlesen und Suchen.
              </InfoAlert>
              <Button onClick={exportHtmlNow} disabled={processing.state.active}>
                HTML erzeugen
              </Button>
              {htmlBlob && (
                <DownloadButton
                  data={htmlBlob}
                  filename={`${sanitizeFilename(textSource.name)}.html`}
                  mime="text/html;charset=utf-8"
                >
                  HTML herunterladen
                </DownloadButton>
              )}
            </div>
          )}
        </TabsContent>

        {/* ---------- PDF → DOCX ---------- */}
        <TabsContent value="zu-docx">
          {!textSource ? (
            <FileDropzone onFiles={openTextSource} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <section className="flex flex-col space-y-3 rounded-xl border-2 border-green-500 p-5 dark:border-green-700">
                <p className="w-fit rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-900/50 dark:text-green-100">
                  Lokal · originalgetreue Ansicht
                </p>
                <h3 className="font-semibold">Layout und Bilder beibehalten</h3>
                <p className="grow text-sm text-slate-600 dark:text-slate-400">
                  Übernimmt jede Seite einschließlich Layout, Bildern, Tabellen und Schriften in das
                  Word-Dokument. Die Seiten sehen wie im PDF aus, sind aber nicht als einzelne
                  Word-Elemente bearbeitbar.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" onClick={exportSimpleDocxNow} disabled={docxBusy}>
                    {docxBusy ? "Wird erstellt …" : "Layoutgetreues DOCX erstellen"}
                  </Button>
                  {docxBlob ? (
                    <DownloadButton
                      data={docxBlob}
                      filename={`${sanitizeFilename(textSource.name)}.docx`}
                      mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      variant="secondary"
                    >
                      Herunterladen
                    </DownloadButton>
                  ) : null}
                </div>
              </section>

              <section className="flex flex-col space-y-3 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                <p className="w-fit">{serverBadge}</p>
                <h3 className="font-semibold">Hohe Qualität (Layout & Bilder)</h3>
                <p className="grow text-sm text-slate-600 dark:text-slate-400">
                  Layoutgetreue DOCX mit Tabellen und Bildern benötigt einen optionalen Serverdienst
                  – deine Datei würde dafür hochgeladen.
                </p>
                {serverEnabled ? (
                  <Button variant="secondary">Auf Server konvertieren</Button>
                ) : (
                  <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Derzeit nicht eingerichtet – nutze die lokale Variante oder richte den Dienst
                    gemäß README ein.
                  </p>
                )}
              </section>

              <div>
                <Button variant="ghost" onClick={() => setTextSource(null)}>
                  Andere Datei wählen
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ---------- Office → PDF ---------- */}
        <TabsContent value="office">
          <div className="max-w-xl space-y-4">
            {serverMessage ? (
              <ErrorAlert
                error={{ message: serverMessage }}
                onDismiss={() => setServerMessage(null)}
              />
            ) : null}
            <FileDropzone
              accept="office"
              onFiles={(files) => {
                setServerMessage(null);
                setServerResult(null);
                setOfficeFile(files[0] ?? null);
              }}
            />
            {officeFile ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-medium">
                  {officeFile.name} ({formatBytes(officeFile.size)})
                </p>
                <Button onClick={tryOfficeConversion}>Zu PDF konvertieren</Button>
                {officeIsDocx ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-900/50 dark:text-green-100">
                    Lokal · kein Upload
                  </span>
                ) : !serverEnabled ? (
                  serverBadge
                ) : null}
              </div>
            ) : null}
            {serverResult && (
              <ResultCard
                title="Konvertierung abgeschlossen"
                filename={serverResult.filename}
                data={serverResult.blob}
                mime={serverResult.mime}
              />
            )}
            <InfoAlert title="Lokale und serverbasierte Umwandlung">
              DOCX wird direkt auf deinem Gerät gerendert und als PDF gespeichert. Das sichtbare
              Layout bleibt dabei erhalten; der Text im Ergebnis ist wie bei einem Scan nicht
              einzeln auswählbar. PPTX und XLSX benötigen für eine zuverlässige Umwandlung weiterhin
              einen eingerichteten Server mit LibreOffice.
            </InfoAlert>
          </div>
        </TabsContent>
      </Tabs>

      <ExtractImagesSection />

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}

function ExtractImagesSection() {
  const processing = useProcessing();
  const [source, setSource] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [images, setImages] = useState<Array<{ name: string; blob: Blob }> | null>(null);

  const extract = () =>
    processing.run("Bilder werden extrahiert …", async ({ report, token }) => {
      if (!source) return null;
      const found = await extractImages(source.bytes, report, token as never);
      setImages(found);
      return found;
    });

  return (
    <section className="mt-12 rounded-xl border border-dashed border-slate-300 p-5 dark:border-slate-700">
      <h2 className="font-semibold">
        Bilder aus PDF extrahieren{" "}
        <span className="ml-1 align-middle text-xs font-normal text-slate-500">
          (experimentell)
        </span>
      </h2>
      <p className="mt-1 mb-3 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
        Extrahiert eingebettete Bilder als PNG-Dateien. Nicht jedes Bildformat/Filterkombination
        wird unterstützt – übersprungene Bilder werden einfach ignoriert.
      </p>
      {processing.error ? (
        <div className="mb-3">
          <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
        </div>
      ) : null}
      {!source ? (
        <FileDropzone
          compact
          onFiles={async (files) => {
            processing.clearError();
            const { accepted } = await validatePdfFiles(files);
            if (accepted.length === 0) return;
            const file = accepted[0];
            setSource({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
            setImages(null);
          }}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            Quelle: <strong>{source.name}</strong>
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={extract} disabled={processing.state.active}>
              Extrahieren
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSource(null);
                setImages(null);
              }}
            >
              Zurücksetzen
            </Button>
          </div>
          {images && images.length > 0 ? (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {images.map((image) => (
                <li key={image.name}>
                  <a
                    href={URL.createObjectURL(image.blob)}
                    download={image.name}
                    className="block truncate rounded-lg border border-slate-200 px-2 py-1.5 text-xs hover:border-blue-400 dark:border-slate-700"
                  >
                    🖼️ {image.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {images && images.length === 0 ? (
            <p className="text-sm text-slate-500">Keine extrahierbaren Bilder gefunden.</p>
          ) : null}
        </div>
      )}
      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </section>
  );
}
