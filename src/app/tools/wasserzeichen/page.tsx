"use client";

import { useState } from "react";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ResultCard } from "@/components/shared/result-card";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, RadioGroupField } from "@/components/ui/form";
import { useProcessing } from "@/hooks/useProcessing";
import { useLoadedPdf } from "@/hooks/useLoadedPdf";
import { addWatermark } from "@/lib/pdf/pages";

export default function WasserzeichenPage() {
  const processing = useProcessing();
  const loaded = useLoadedPdf();
  const [result, setResult] = useState<Uint8Array | null>(null);

  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState("#94a3b8");
  const [opacityPercent, setOpacityPercent] = useState(20);
  const [rotation, setRotation] = useState(-45);

  const apply = () => {
    if (!loaded.file || !text.trim()) return;
    return processing.run("Wasserzeichen wird eingefügt …", async () => {
      const bytes = await addWatermark(loaded.file!.bytes, {
        text: text.trim(),
        fontSize,
        color,
        opacity: opacityPercent / 100,
        rotationDegrees: rotation,
      });
      setResult(bytes);
      return bytes;
    });
  };

  const outputName = loaded.file
    ? `${loaded.file.name.replace(/\.pdf$/i, "")}-wasserzeichen.pdf`
    : "wasserzeichen.pdf";

  return (
    <ToolShell
      title="Wasserzeichen"
      description="Lege ein Text-Wasserzeichen über alle Seiten – ideal für Entwürfe und Vertraulichkeitshinweise."
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
          <section
            aria-label="Einstellungen"
            className="space-y-5 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
          >
            <div>
              <FieldLabel htmlFor="wm-text">Text</FieldLabel>
              <Input
                id="wm-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="z. B. ENTWURF oder VERTRAULICH"
                maxLength={60}
              />
            </div>

            <div>
              <FieldLabel htmlFor="wm-size">Schriftgröße ({fontSize} pt)</FieldLabel>
              <input
                id="wm-size"
                type="range"
                min={12}
                max={120}
                value={fontSize}
                onChange={(event) => setFontSize(Number(event.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <div>
              <FieldLabel htmlFor="wm-opacity">Deckkraft ({opacityPercent} %)</FieldLabel>
              <input
                id="wm-opacity"
                type="range"
                min={5}
                max={80}
                value={opacityPercent}
                onChange={(event) => setOpacityPercent(Number(event.target.value))}
                className="w-full accent-blue-700"
              />
            </div>

            <RadioGroupField
              name="wm-rotation"
              legend="Winkel"
              value={String(rotation)}
              onChange={(value) => setRotation(Number(value))}
              options={[
                { value: "0", label: "Horizontal" },
                { value: "-45", label: "Diagonal ↗" },
                { value: "-90", label: "Senkrecht" },
              ]}
              columns={3}
            />

            <div className="flex items-center gap-3">
              <FieldLabel htmlFor="wm-color">Farbe</FieldLabel>
              <input
                id="wm-color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-10 w-16 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
              />
            </div>

            <Button size="lg" onClick={apply} disabled={!text.trim() || processing.state.active}>
              Wasserzeichen anwenden
            </Button>
          </section>

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
              Datei: <strong>{loaded.file.name}</strong> · Verarbeitung ausschließlich lokal.
            </p>
          </aside>
        </div>
      )}

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}
