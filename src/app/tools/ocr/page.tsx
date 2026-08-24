"use client";

import { useState } from "react";
import { DownloadButton, ResultCard } from "@/components/shared/result-card";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { RadioGroupField } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProcessing } from "@/hooks/useProcessing";
import type { OcrPageResult } from "@/lib/pdf/ocr";
import { makeSearchablePdf, runOcr } from "@/lib/pdf/ocr";
import type { CancellationToken } from "@/lib/types";
import { sanitizeFilename } from "@/lib/utils";
import { validatePdfFiles } from "@/lib/validate";

type OutputMode = "text" | "searchable" | "both";

export default function OcrPage() {
  const processing = useProcessing();
  const [source, setSource] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(
    null,
  );
  const [language, setLanguage] = useState("deu");
  const [mode, setMode] = useState<OutputMode>("both");

  const [ocrResults, setOcrResults] = useState<OcrPageResult[] | null>(null);
  const [searchableBytes, setSearchableBytes] = useState<Uint8Array | null>(null);

  const openFile = async (files: File[]) => {
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
    setOcrResults(null);
    setSearchableBytes(null);
  };

  const start = () =>
    processing.run("OCR wird gestartet …", async ({ report, token }) => {
      if (!source) return null;
      const results = await runOcr(
        source.bytes,
        language,
        (percent, label) => report(percent, label),
        token as CancellationToken,
      );

      if (mode !== "text") {
        report(100, "Durchsuchbares PDF wird erstellt …");
        await new Promise((resolve) => setTimeout(resolve, 50));
        const bytes = await makeSearchablePdf(source.bytes, results, 1600, () => undefined, token);
        setSearchableBytes(bytes);
      }
      setOcrResults(results);
      return results;
    });

  const plainText = ocrResults
    ? ocrResults.map((page) => `--- Seite ${page.pageIndex + 1} ---\n${page.text}`).join("\n\n")
    : "";

  return (
    <ToolShell
      title="OCR – Text erkennen & durchsuchbar machen"
      description="Erkennt Text in gescannten Dokumenten mithilfe von WebAssembly – direkt in deinem Browser. Deutsch, Englisch, Französisch und Portugiesisch werden unterstützt."
      privacy="local"
    >
      {processing.error ? (
        <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
      ) : null}

      <InfoAlert title="Einmalige Internetverbindung">
        Die OCR-Sprachdaten (~10–15 MB) werden beim ersten Einsatz aus einem öffentlichen CDN
        geladen und vom Browser gespeichert. Deine Dokumente verlassen dabei nicht dein Gerät – die
        Erkennung selbst läuft lokal.
      </InfoAlert>

      {!source ? (
        <div className="mt-6">
          <FileDropzone onFiles={openFile} />
        </div>
      ) : (
        <div className="mt-6 space-y-5">
          <section className="grid gap-4 rounded-xl border border-slate-200 p-5 sm:grid-cols-2 dark:border-slate-800">
            <RadioGroupField
              name="ocr-language"
              legend="Sprache"
              value={language}
              onChange={setLanguage}
              columns={2}
              options={[
                { value: "deu", label: "Deutsch" },
                { value: "eng", label: "Englisch" },
                { value: "deu+eng", label: "Deutsch + Englisch" },
                { value: "fra", label: "Französisch" },
                { value: "por", label: "Portugiesisch" },
              ]}
            />
            <RadioGroupField
              name="ocr-mode"
              legend="Ausgabe"
              value={mode}
              onChange={setMode}
              columns={1}
              options={[
                { value: "text", label: "Nur Text extrahieren" },
                { value: "searchable", label: "Durchsuchbares PDF erstellen" },
                { value: "both", label: "Beides" },
              ]}
            />
          </section>

          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={start} disabled={processing.state.active}>
              OCR starten ({source.name})
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setSource(null);
                setOcrResults(null);
              }}
            >
              Andere Datei
            </Button>
          </div>
        </div>
      )}

      {ocrResults && (
        <Tabs defaultValue="text" className="mt-8">
          <TabsList>
            <TabsTrigger value="text">Erkannter Text</TabsTrigger>
            {searchableBytes ? <TabsTrigger value="pdf">Durchsuchbares PDF</TabsTrigger> : null}
          </TabsList>
          <TabsContent value="text">
            <pre className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs break-words whitespace-pre-wrap dark:border-slate-800 dark:bg-slate-900">
              {plainText || "[Kein Text erkannt]"}
            </pre>
            <div className="mt-3">
              <DownloadButton
                data={new Blob([plainText], { type: "text/plain;charset=utf-8" })}
                filename={`${sanitizeFilename(source?.name ?? "dokument")}-ocr.txt`}
                mime="text/plain;charset=utf-8"
              >
                Text herunterladen (.txt)
              </DownloadButton>
            </div>
          </TabsContent>
          {searchableBytes ? (
            <TabsContent value="pdf">
              {source ? (
                <ResultCard
                  title="Durchsuchbares PDF erstellt!"
                  filename={`${sanitizeFilename(source.name)}-durchsuchbar.pdf`}
                  data={searchableBytes}
                  originalSize={source.size}
                >
                  <p className="text-xs">
                    Die Originalseite bleibt als Bild erhalten; eine unsichtbare Textebene macht das
                    Dokument durchsuchbar.
                  </p>
                </ResultCard>
              ) : null}
            </TabsContent>
          ) : null}
        </Tabs>
      )}

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}
