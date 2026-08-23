"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ResultCard } from "@/components/shared/result-card";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input, RadioGroupField } from "@/components/ui/form";
import { useProcessing } from "@/hooks/useProcessing";
import { useLoadedPdf } from "@/hooks/useLoadedPdf";
import { addWatermark } from "@/lib/pdf/pages";
import { loadPdfJsDocument, renderPageToCanvas } from "@/lib/pdf/pdfjs";
import { validateImageFile } from "@/lib/validate";

type WatermarkKind = "text" | "image";

interface WatermarkImage {
  name: string;
  bytes: Uint8Array;
  dataUrl: string;
  type: "image/png" | "image/jpeg";
}

export default function WasserzeichenPage() {
  const processing = useProcessing();
  const loaded = useLoadedPdf();
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [kind, setKind] = useState<WatermarkKind>("text");
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState("#94a3b8");
  const [image, setImage] = useState<WatermarkImage | null>(null);
  const [imageScalePercent, setImageScalePercent] = useState(35);
  const [opacityPercent, setOpacityPercent] = useState(20);
  const [rotation, setRotation] = useState(-45);
  const [previewDoc, setPreviewDoc] = useState<PDFDocumentProxy | null>(null);
  const [previewPage, setPreviewPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | undefined;

    if (!loaded.file) {
      return;
    }

    void loadPdfJsDocument(loaded.file.bytes)
      .then((pdf) => {
        destroy = pdf.destroy;
        if (cancelled) return pdf.destroy();
        setPreviewDoc(pdf.doc);
        setPreviewPage(0);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      void destroy?.();
    };
  }, [loaded.file]);

  const handleImage = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      void processing.run("", async () => {
        throw problem;
      });
      return;
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("Bild konnte nicht gelesen werden."));
      reader.readAsDataURL(file);
    });
    setImage({
      name: file.name,
      bytes,
      dataUrl,
      type: file.type === "image/png" || /\.png$/i.test(file.name) ? "image/png" : "image/jpeg",
    });
    setResult(null);
  };

  const canApply = kind === "text" ? Boolean(text.trim()) : image !== null;

  const apply = () => {
    if (!loaded.file || !canApply) return;
    return processing.run("Wasserzeichen wird eingefügt …", async () => {
      const shared = { opacity: opacityPercent / 100, rotationDegrees: rotation };
      const bytes = await addWatermark(
        loaded.file!.bytes,
        kind === "text"
          ? { kind: "text", text: text.trim(), fontSize, color, ...shared }
          : {
              kind: "image",
              imageBytes: image!.bytes,
              imageType: image!.type,
              scalePercent: imageScalePercent,
              ...shared,
            },
      );
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
      description="Füge Text oder ein Bild als Wasserzeichen ein und prüfe das Ergebnis direkt in der Vorschau."
      privacy="local"
      wide
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
        <div className="grid gap-6 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <section
            aria-label="Einstellungen"
            className="space-y-5 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
          >
            <RadioGroupField
              name="wm-kind"
              legend="Art des Wasserzeichens"
              value={kind}
              onChange={(value) => {
                setKind(value);
                setResult(null);
              }}
              options={[
                { value: "text", label: "Text" },
                { value: "image", label: "Bild / Logo" },
              ]}
              columns={2}
            />

            {kind === "text" ? (
              <>
                <div>
                  <FieldLabel htmlFor="wm-text">Text</FieldLabel>
                  <Input
                    id="wm-text"
                    value={text}
                    onChange={(event) => {
                      setText(event.target.value);
                      setResult(null);
                    }}
                    placeholder="z. B. ENTWURF"
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
                    onChange={(event) => {
                      setFontSize(Number(event.target.value));
                      setResult(null);
                    }}
                    className="w-full accent-blue-700"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <FieldLabel htmlFor="wm-color" className="mb-0">
                    Farbe
                  </FieldLabel>
                  <input
                    id="wm-color"
                    type="color"
                    value={color}
                    onChange={(event) => {
                      setColor(event.target.value);
                      setResult(null);
                    }}
                    className="h-10 w-16 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
                  />
                </div>
              </>
            ) : (
              <>
                <div>
                  <FieldLabel>PNG- oder JPG-Bild</FieldLabel>
                  <FileDropzone accept="images" onFiles={handleImage} compact />
                </div>
                {image ? (
                  <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.dataUrl}
                      alt="Gewähltes Wasserzeichen"
                      className="h-14 w-20 rounded bg-white object-contain p-1"
                    />
                    <span className="min-w-0 truncate text-sm font-medium">{image.name}</span>
                  </div>
                ) : null}
                <div>
                  <FieldLabel htmlFor="wm-image-size">
                    Bildgröße ({imageScalePercent} % der Seitenbreite)
                  </FieldLabel>
                  <input
                    id="wm-image-size"
                    type="range"
                    min={5}
                    max={100}
                    value={imageScalePercent}
                    onChange={(event) => {
                      setImageScalePercent(Number(event.target.value));
                      setResult(null);
                    }}
                    className="w-full accent-blue-700"
                  />
                </div>
              </>
            )}

            <div>
              <FieldLabel htmlFor="wm-opacity">Deckkraft ({opacityPercent} %)</FieldLabel>
              <input
                id="wm-opacity"
                type="range"
                min={5}
                max={100}
                value={opacityPercent}
                onChange={(event) => {
                  setOpacityPercent(Number(event.target.value));
                  setResult(null);
                }}
                className="w-full accent-blue-700"
              />
            </div>

            <RadioGroupField
              name="wm-rotation"
              legend="Winkel"
              value={String(rotation)}
              onChange={(value) => {
                setRotation(Number(value));
                setResult(null);
              }}
              options={[
                { value: "0", label: "Horizontal" },
                { value: "-45", label: "Diagonal ↗" },
                { value: "-90", label: "Senkrecht" },
              ]}
              columns={3}
            />

            <Button size="lg" onClick={apply} disabled={!canApply || processing.state.active}>
              Wasserzeichen anwenden
            </Button>

            <Button
              variant="secondary"
              onClick={() => {
                loaded.setFile(null);
                setResult(null);
                setImage(null);
              }}
            >
              Andere PDF wählen
            </Button>
          </section>

          <aside aria-label="Vorschau und Ergebnis" className="min-w-0 space-y-4">
            <WatermarkPreview
              doc={previewDoc}
              pageIndex={previewPage}
              onPageChange={setPreviewPage}
              kind={kind}
              text={text}
              fontSize={fontSize}
              color={color}
              imageUrl={image?.dataUrl ?? null}
              imageScalePercent={imageScalePercent}
              opacity={opacityPercent / 100}
              rotation={rotation}
            />

            {result ? (
              <ResultCard
                title="Fertig!"
                filename={outputName}
                data={result}
                originalSize={loaded.file.size}
              />
            ) : (
              <InfoAlert title="Live-Vorschau">
                Die Vorschau zeigt die gewählte Seite. Beim Anwenden wird das Wasserzeichen auf alle
                Seiten geschrieben.
              </InfoAlert>
            )}

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

function WatermarkPreview({
  doc,
  pageIndex,
  onPageChange,
  kind,
  text,
  fontSize,
  color,
  imageUrl,
  imageScalePercent,
  opacity,
  rotation,
}: {
  doc: PDFDocumentProxy | null;
  pageIndex: number;
  onPageChange: (page: number) => void;
  kind: WatermarkKind;
  text: string;
  fontSize: number;
  color: string;
  imageUrl: string | null;
  imageScalePercent: number;
  opacity: number;
  rotation: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewSize, setPreviewSize] = useState({ width: 0, height: 0, scale: 1 });

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!doc || !host || !canvas) return;
    let cancelled = false;

    void renderPageToCanvas(doc, pageIndex, canvas, Math.min(760, host.clientWidth - 2))
      .then((page) => {
        if (cancelled) return;
        setPreviewSize({
          width: canvas.clientWidth,
          height: canvas.clientHeight,
          scale: canvas.clientWidth / page.widthPt,
        });
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [doc, pageIndex]);

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Vorschau</h2>
        {doc ? (
          <div className="flex items-center gap-2 text-sm">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(Math.max(0, pageIndex - 1))}
              disabled={pageIndex === 0}
            >
              ←
            </Button>
            <span>
              Seite {pageIndex + 1} / {doc.numPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onPageChange(Math.min(doc.numPages - 1, pageIndex + 1))}
              disabled={pageIndex >= doc.numPages - 1}
            >
              →
            </Button>
          </div>
        ) : null}
      </div>

      <div
        ref={hostRef}
        className="flex min-h-80 items-start justify-center overflow-auto rounded-lg bg-slate-100 p-3 dark:bg-slate-900"
      >
        <div
          className="relative shrink-0 overflow-hidden bg-white shadow-md"
          style={{ width: previewSize.width || undefined, height: previewSize.height || undefined }}
        >
          <canvas
            key={pageIndex}
            ref={canvasRef}
            className="block"
            aria-label={`Vorschau Seite ${pageIndex + 1}`}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            {kind === "text" && text.trim() ? (
              <span
                className="font-bold whitespace-nowrap"
                style={{
                  color,
                  fontSize: fontSize * previewSize.scale,
                  opacity,
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: "center",
                }}
              >
                {text.trim()}
              </span>
            ) : null}
            {kind === "image" && imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageUrl}
                alt="Wasserzeichen-Vorschau"
                className="max-h-full object-contain"
                style={{
                  width: `${imageScalePercent}%`,
                  opacity,
                  transform: `rotate(${rotation}deg)`,
                  transformOrigin: "center",
                }}
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
