"use client";

import { useState } from "react";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ResultCard } from "@/components/shared/result-card";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, RadioGroupField, Select } from "@/components/ui/form";
import { useProcessing } from "@/hooks/useProcessing";
import { useLoadedPdf } from "@/hooks/useLoadedPdf";
import { addHeaderFooter, addPageNumbers, type PageNumberOptions } from "@/lib/pdf/pages";

type Position = PageNumberOptions["position"];

const POSITION_OPTIONS: Array<{ value: Position; label: string }> = [
  { value: "unten-mitte", label: "Unten mittig" },
  { value: "unten-links", label: "Unten links" },
  { value: "unten-rechts", label: "Unten rechts" },
  { value: "oben-mitte", label: "Oben mittig" },
  { value: "oben-links", label: "Oben links" },
  { value: "oben-rechts", label: "Oben rechts" },
];

export default function SeitenzahlenPage() {
  const processing = useProcessing();
  const loaded = useLoadedPdf();
  const [result, setResult] = useState<Uint8Array | null>(null);

  const [position, setPosition] = useState<Position>("unten-mitte");
  const [format, setFormat] = useState<PageNumberOptions["format"]>("n");
  const [startAt, setStartAt] = useState(1);
  const [fontSize, setFontSize] = useState(10);
  const [marginMm, setMarginMm] = useState(10);
  const [color, setColor] = useState("#334155");

  const [headerTop, setHeaderTop] = useState({ left: "", center: "", right: "" });
  const [footerText, setFooterText] = useState({ left: "", center: "", right: "" });

  const applyNumbers = () =>
    processing.run("Seitenzahlen werden eingefügt …", async () => {
      const bytes = await addPageNumbers(loaded.file!.bytes, {
        position,
        format,
        startAt,
        fontSize,
        marginMm,
        color,
      });
      setResult(bytes);
      return bytes;
    });

  const applyHeaderFooter = () =>
    processing.run("Kopf- und Fußzeile werden eingefügt …", async () => {
      const bytes = await addHeaderFooter(loaded.file!.bytes, {
        top: headerTop,
        bottom: footerText,
        fontSize,
        marginMm,
        color,
      });
      setResult(bytes);
      return bytes;
    });

  const outputName = loaded.file
    ? `${loaded.file.name.replace(/\.pdf$/i, "")}-seitenzahlen.pdf`
    : "dokument.pdf";

  return (
    <ToolShell
      title="Seitenzahlen & Kopf-/Fußzeilen"
      description="Nummeriere Seiten oder ergänze eigene Kopf- und Fußzeilen. Der Platzhalter {seite} wird automatisch durch die aktuelle Seitennummer ersetzt."
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
        <FileDropzone onFiles={loaded.openFiles} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-8">
            <section
              aria-label="Seitenzahlen"
              className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
            >
              <h2 className="font-semibold">Seitenzahlen</h2>
              <RadioGroupField
                name="sz-position"
                legend="Position"
                value={position}
                onChange={setPosition}
                options={POSITION_OPTIONS}
                columns={3}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <FieldLabel htmlFor="sz-format">Format</FieldLabel>
                  <Select
                    id="sz-format"
                    value={format}
                    onChange={(event) => setFormat(event.target.value as typeof format)}
                  >
                    <option value="n">1, 2, 3 …</option>
                    <option value="n-von-total">1 von 12</option>
                    <option value="seite-n">Seite 1</option>
                  </Select>
                </div>
                <div>
                  <FieldLabel htmlFor="sz-start">Zählen ab</FieldLabel>
                  <Input
                    id="sz-start"
                    type="number"
                    min={1}
                    max={10000}
                    value={startAt}
                    onChange={(event) => setStartAt(Math.max(1, Number(event.target.value) || 1))}
                  />
                </div>
              </div>
              <Button onClick={applyNumbers} disabled={processing.state.active}>
                Seitenzahlen einfügen
              </Button>
            </section>

            <section
              aria-label="Kopf- und Fußzeile"
              className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
            >
              <h2 className="font-semibold">Kopf-/Fußzeile (optional)</h2>
              <InfoAlert>
                Leere Felder bleiben unberücksichtigt. Platzhalter: <code>{"{seite}"}</code> =
                aktuelle Seite, <code>{"{total}"}</code> = Gesamtanzahl.
              </InfoAlert>
              <fieldset className="grid gap-3 sm:grid-cols-3">
                <legend className="mb-1 text-sm font-medium">Kopfzeile (oben)</legend>
                {(["left", "center", "right"] as const).map((key) => (
                  <div key={key}>
                    <FieldLabel htmlFor={`kopf-${key}`}>
                      {key === "left" ? "Links" : key === "center" ? "Mitte" : "Rechts"}
                    </FieldLabel>
                    <Input
                      id={`kopf-${key}`}
                      value={headerTop[key]}
                      onChange={(event) =>
                        setHeaderTop((current) => ({ ...current, [key]: event.target.value }))
                      }
                    />
                  </div>
                ))}
              </fieldset>
              <fieldset className="grid gap-3 sm:grid-cols-3">
                <legend className="mb-1 text-sm font-medium">Fußzeile (unten)</legend>
                {(["left", "center", "right"] as const).map((key) => (
                  <div key={key}>
                    <FieldLabel htmlFor={`fuss-${key}`}>
                      {key === "left" ? "Links" : key === "center" ? "Mitte" : "Rechts"}
                    </FieldLabel>
                    <Input
                      id={`fuss-${key}`}
                      value={footerText[key]}
                      onChange={(event) =>
                        setFooterText((current) => ({ ...current, [key]: event.target.value }))
                      }
                    />
                  </div>
                ))}
              </fieldset>
              <Button
                variant="secondary"
                onClick={applyHeaderFooter}
                disabled={processing.state.active}
              >
                Kopf-/Fußzeile einfügen
              </Button>
            </section>

            <section
              aria-label="Darstellung"
              className="grid gap-4 rounded-xl border border-slate-200 p-5 sm:grid-cols-3 dark:border-slate-800"
            >
              <div>
                <FieldLabel htmlFor="sz-fontsize">Schriftgröße ({fontSize} pt)</FieldLabel>
                <input
                  id="sz-fontsize"
                  type="range"
                  min={6}
                  max={24}
                  value={fontSize}
                  onChange={(event) => setFontSize(Number(event.target.value))}
                  className="w-full accent-blue-700"
                />
              </div>
              <div>
                <FieldLabel htmlFor="sz-margin">Rand ({marginMm} mm)</FieldLabel>
                <input
                  id="sz-margin"
                  type="range"
                  min={5}
                  max={30}
                  value={marginMm}
                  onChange={(event) => setMarginMm(Number(event.target.value))}
                  className="w-full accent-blue-700"
                />
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <FieldLabel htmlFor="sz-color">Farbe</FieldLabel>
                  <input
                    id="sz-color"
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="h-10 w-16 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
                  />
                </div>
              </div>
            </section>
          </div>

          <aside aria-label="Ergebnis" className="space-y-4">
            {result && (
              <ResultCard
                title="Fertig!"
                filename={outputName}
                data={result}
                originalSize={loaded.file.size}
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
              Datei: <strong>{loaded.file.name}</strong>
            </p>
          </aside>
        </div>
      )}

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}
