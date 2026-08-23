"use client";

import { useState } from "react";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ResultCard } from "@/components/shared/result-card";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert, WarningAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { Checkbox, RadioGroupField } from "@/components/ui/form";
import { useProcessing } from "@/hooks/useProcessing";
import { useLoadedPdf } from "@/hooks/useLoadedPdf";
import type { CompressionLevel } from "@/lib/types";
import { compressPdf } from "@/lib/pdf/compress";

export default function KomprimierenPage() {
  const processing = useProcessing();
  const loaded = useLoadedPdf();

  const [level, setLevel] = useState<CompressionLevel>("mittel");
  const [removeMetadata, setRemoveMetadata] = useState(false);
  const [grayscale, setGrayscale] = useState(false);
  const [result, setResult] = useState<{
    bytes: Uint8Array;
    originalSize: number;
    newSize: number;
  } | null>(null);

  const compress = () =>
    processing.run("PDF wird komprimiert …", async ({ report, token }) => {
      if (!loaded.file) return null;
      const compressionResult = await compressPdf(
        loaded.file.bytes,
        { level, removeMetadata, grayscale },
        (percent) => report(percent),
        token,
      );
      setResult({
        bytes: compressionResult.bytes,
        originalSize: compressionResult.originalSize,
        newSize: compressionResult.newSize,
      });
      return compressionResult;
    });

  const outputName = loaded.file
    ? `${loaded.file.name.replace(/\.pdf$/i, "")}-komprimiert.pdf`
    : "komprimiert.pdf";

  return (
    <ToolShell
      title="PDF verkleinern"
      description="Wähle eine Komprimierungsstufe – die neue Dateigröße wird vor dem Download angezeigt. Deine Originaldatei bleibt unverändert."
      privacy="local"
    >
      {(loaded.loadError || processing.error) && (
        <div className="mb-6">
          <ErrorAlert
            error={(processing.error ?? loaded.loadError)!}
            onDismiss={() => {
              processing.clearError();
              loaded.setLoadError(null);
            }}
          />
        </div>
      )}

      {!loaded.file ? (
        <>
          <FileDropzone onFiles={loaded.openFiles} />
          <div className="mt-4">
            <InfoAlert title="So funktioniert es">
              Die Verarbeitung läuft vollständig in deinem Browser. Starke Komprimierung wandelt
              Seiten in Bilder um – das macht die Datei deutlich kleiner, reduziert aber die
              Qualität.
            </InfoAlert>
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <section
            aria-label="Komprimierungseinstellungen"
            className="space-y-6 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
          >
            <RadioGroupField
              name="level"
              legend="Komprimierungsstufe"
              value={level}
              onChange={setLevel}
              columns={3}
              options={[
                {
                  value: "leicht",
                  label: "Leicht",
                  hint: "Verlustfrei. Optimiert Struktur & Metadaten – spart wenig Platz.",
                },
                {
                  value: "mittel",
                  label: "Mittel (empfohlen)",
                  hint: "Guter Kompromiss: ca. 150 dpi Bildqualität.",
                },
                {
                  value: "stark",
                  label: "Stark",
                  hint: "Kleinste Datei, sichtbar geringere Qualität (~110 dpi).",
                },
              ]}
            />

            {(level === "mittel" || level === "stark") && (
              <WarningAlert
                title={
                  level === "stark" ? "Deutlicher Qualitätsverlust möglich" : "Qualitätshinweis"
                }
              >
                Bei dieser Stufe werden Seiten als Bild neu aufgebaut. Text ist danach nicht mehr
                durchsuchbar und wirkt je nach Dokument leicht unschärfer. Prüfe das Ergebnis vor
                der Weiterverwendung.
              </WarningAlert>
            )}

            <div className="flex flex-col gap-2">
              <Checkbox
                label="Metadaten entfernen (Titel, Autor, Erstellungsdatum …)"
                checked={removeMetadata}
                onChange={(event) => setRemoveMetadata(event.target.checked)}
              />
              {(level === "mittel" || level === "stark") && (
                <Checkbox
                  label="In Graustufen umwandeln (spart zusätzlich Speicherplatz)"
                  checked={grayscale}
                  onChange={(event) => setGrayscale(event.target.checked)}
                />
              )}
            </div>

            <Button size="lg" onClick={compress} disabled={processing.state.active}>
              Jetzt komprimieren
            </Button>
          </section>

          <aside aria-label="Ergebnis" className="space-y-4">
            {result && (
              <ResultCard
                title="Komprimierung abgeschlossen"
                filename={outputName}
                data={result.bytes}
                originalSize={result.originalSize}
                note={
                  result.newSize >= result.originalSize ? (
                    <p className="mt-1 text-xs text-green-800 dark:text-green-200">
                      Tipp: Diese Datei ließ sich kaum verkleinern – probiere die Stufe „Stark“.
                    </p>
                  ) : undefined
                }
              />
            )}
            <Button
              variant="secondary"
              onClick={() => {
                loaded.setFile(null);
                setResult(null);
              }}
            >
              Andere Datei wählen
            </Button>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Datei: <strong>{loaded.file.name}</strong> · Original bleibt unverändert erhalten.
            </p>
          </aside>
        </div>
      )}

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}
