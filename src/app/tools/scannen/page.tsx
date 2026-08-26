"use client";

import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Crop,
  FileImage,
  Pencil,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ResultCard } from "@/components/shared/result-card";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert } from "@/components/ui/alerts";
import { Button, IconButton } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FieldLabel, Input } from "@/components/ui/form";
import { Slider } from "@/components/ui/slider";
import { useProcessing } from "@/hooks/useProcessing";
import { saveEditorDraft } from "@/lib/editor/draft";
import {
  applyImageAdjustments,
  hasImageAdjustments,
  type ImageAdjustments,
} from "@/lib/image-adjustments";
import { createScanPdf, type PreparedScanPage } from "@/lib/pdf/scan";
import { AppError } from "@/lib/types";
import { validateImageFile } from "@/lib/validate";

type Rotation = 0 | 90 | 180 | 270;

interface ScanPage {
  id: string;
  file: File;
  previewUrl: string;
  rotation: Rotation;
  crop: CropValues;
  adjustments: ImageAdjustments;
}

interface CropValues {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const EMPTY_CROP: CropValues = { top: 0, right: 0, bottom: 0, left: 0 };

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  grayscale: 0,
};

function imageFilter(adjustments: ImageAdjustments): string {
  return `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) grayscale(${adjustments.grayscale}%)`;
}

function defaultFileName(): string {
  const date = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(new Date())
    .replaceAll(".", "-");
  return `Scan-${date}.pdf`;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AppError("INVALID_TYPE", `„${file.name}“ konnte nicht als Bild gelesen werden.`));
    };
    image.src = url;
  });
}

async function renderProcessedPage(
  page: ScanPage,
  canvas: HTMLCanvasElement,
  maxEdge: number,
): Promise<{ width: number; height: number }> {
  const image = await loadImage(page.file);
  const swapped = page.rotation === 90 || page.rotation === 270;
  const sourceWidth = image.naturalWidth;
  const sourceHeight = image.naturalHeight;
  const cropX = Math.round((sourceWidth * page.crop.left) / 100);
  const cropY = Math.round((sourceHeight * page.crop.top) / 100);
  const cropWidth = Math.max(
    1,
    Math.round((sourceWidth * (100 - page.crop.left - page.crop.right)) / 100),
  );
  const cropHeight = Math.max(
    1,
    Math.round((sourceHeight * (100 - page.crop.top - page.crop.bottom)) / 100),
  );
  const outputWidth = swapped ? cropHeight : cropWidth;
  const outputHeight = swapped ? cropWidth : cropHeight;
  const resizeScale = Math.min(1, maxEdge / Math.max(outputWidth, outputHeight));
  const width = Math.max(1, Math.round(outputWidth * resizeScale));
  const height = Math.max(1, Math.round(outputHeight * resizeScale));
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new AppError("UNKNOWN", "Die Aufnahme konnte nicht verarbeitet werden.");

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.translate(width / 2, height / 2);
  context.rotate((page.rotation * Math.PI) / 180);
  const drawnWidth = cropWidth * resizeScale;
  const drawnHeight = cropHeight * resizeScale;
  context.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    -drawnWidth / 2,
    -drawnHeight / 2,
    drawnWidth,
    drawnHeight,
  );

  if (hasImageAdjustments(page.adjustments)) {
    const imageData = context.getImageData(0, 0, width, height);
    applyImageAdjustments(imageData.data, page.adjustments);
    context.putImageData(imageData, 0, 0);
  }

  return { width, height };
}

async function prepareImage(page: ScanPage): Promise<PreparedScanPage> {
  const canvas = document.createElement("canvas");
  const { width, height } = await renderProcessedPage(page, canvas, 2480);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("JPEG konnte nicht erstellt werden."))),
      "image/jpeg",
      0.9,
    ),
  );
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

function ScanPagePreview({ page, pageNumber }: { page: ScanPage; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    const preview = document.createElement("canvas");
    void renderProcessedPage(page, preview, 900)
      .then(() => {
        if (cancelled) return;
        canvas.width = preview.width;
        canvas.height = preview.height;
        canvas.getContext("2d")?.drawImage(preview, 0, 0);
      })
      .catch(() => {
        if (!cancelled) {
          const context = canvas.getContext("2d");
          context?.clearRect(0, 0, canvas.width, canvas.height);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Bearbeitete Vorschau Seite ${pageNumber}`}
      className="max-h-full max-w-full object-contain"
    />
  );
}

export default function ScannenPage() {
  const router = useRouter();
  const processing = useProcessing();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const pagesRef = useRef<ScanPage[]>([]);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [fileName, setFileName] = useState(defaultFileName);
  const [result, setResult] = useState<Uint8Array | null>(null);
  const [cropPageId, setCropPageId] = useState<string | null>(null);

  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(
    () => () => {
      pagesRef.current.forEach((page) => URL.revokeObjectURL(page.previewUrl));
    },
    [],
  );

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const additions: ScanPage[] = [];
    for (const file of Array.from(files)) {
      const problem = validateImageFile(file);
      if (problem) {
        void processing.run("", async () => {
          throw problem;
        });
        continue;
      }
      additions.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        rotation: 0,
        crop: { ...EMPTY_CROP },
        adjustments: { ...DEFAULT_ADJUSTMENTS },
      });
    }
    setPages((current) => [...current, ...additions]);
    setResult(null);
  };

  const updatePages = (next: ScanPage[]) => {
    setPages(next);
    setResult(null);
  };

  const removePage = (id: string) => {
    const page = pages.find((item) => item.id === id);
    if (page) URL.revokeObjectURL(page.previewUrl);
    updatePages(pages.filter((item) => item.id !== id));
  };

  const movePage = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= pages.length) return;
    const next = [...pages];
    [next[index], next[target]] = [next[target], next[index]];
    updatePages(next);
  };

  const rotatePage = (id: string) => {
    updatePages(
      pages.map((page) =>
        page.id === id ? { ...page, rotation: ((page.rotation + 90) % 360) as Rotation } : page,
      ),
    );
  };

  const cropPage = pages.find((page) => page.id === cropPageId) ?? null;

  const updateCrop = (edge: keyof CropValues, value: number) => {
    if (!cropPageId) return;
    updatePages(
      pages.map((page) =>
        page.id === cropPageId ? { ...page, crop: { ...page.crop, [edge]: value } } : page,
      ),
    );
  };

  const updateAdjustment = (key: keyof ImageAdjustments, value: number) => {
    if (!cropPageId) return;
    updatePages(
      pages.map((page) =>
        page.id === cropPageId
          ? { ...page, adjustments: { ...page.adjustments, [key]: value } }
          : page,
      ),
    );
  };

  const buildPdf = async (): Promise<Uint8Array | null> => {
    if (!pages.length) return null;
    return processing.run("Scan wird als PDF erstellt …", async ({ report, token }) => {
      const prepared: PreparedScanPage[] = [];
      for (let index = 0; index < pages.length; index++) {
        if (token.cancelled) throw new AppError("CANCELLED");
        report(Math.round((index / pages.length) * 60), `Seite ${index + 1} wird vorbereitet …`);
        prepared.push(await prepareImage(pages[index]));
      }
      const bytes = await createScanPdf(prepared, (percent) =>
        report(60 + Math.round(percent * 0.4), "PDF wird erstellt …"),
      );
      setResult(bytes);
      return bytes;
    });
  };

  const openInEditor = async () => {
    const bytes = result ?? (await buildPdf());
    if (!bytes) return;
    await processing.run("PDF-Editor wird geöffnet …", async () => {
      const safeName = fileName.trim().toLowerCase().endsWith(".pdf")
        ? fileName.trim()
        : `${fileName.trim() || "Scan"}.pdf`;
      await saveEditorDraft({
        pdfBytes: bytes,
        pdfName: safeName,
        pdfSize: bytes.byteLength,
        pageIndex: 0,
        pages: {},
        updatedAt: Date.now(),
      });
      sessionStorage.setItem("pdfking.editor.resume", "1");
      router.push("/tools/bearbeiten?resume=1");
      return true;
    });
  };

  const outputName = fileName.trim().toLowerCase().endsWith(".pdf")
    ? fileName.trim()
    : `${fileName.trim() || "Scan"}.pdf`;

  return (
    <ToolShell
      title="Dokument scannen"
      description="Fotografiere Dokumente oder wähle Bilder aus und erstelle daraus eine bearbeitbare PDF."
      privacy="local"
      wide
    >
      {processing.error ? (
        <div className="mb-6">
          <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
        </div>
      ) : null}

      <InfoAlert title="Aufnahmen bleiben auf deinem Gerät">
        Kameraaufnahmen und PDF werden ausschließlich lokal in deinem Browser verarbeitet.
      </InfoAlert>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label="Dokument mit Kamera fotografieren"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/png,image/jpeg,.png,.jpg,.jpeg"
        multiple
        className="hidden"
        aria-label="Bilder auswählen"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Button size="lg" onClick={() => cameraInputRef.current?.click()}>
          <Camera aria-hidden className="h-5 w-5" />
          Dokument fotografieren
        </Button>
        <Button size="lg" variant="secondary" onClick={() => galleryInputRef.current?.click()}>
          <FileImage aria-hidden className="h-5 w-5" />
          Bilder auswählen
        </Button>
      </div>

      {pages.length ? (
        <section className="mt-8" aria-labelledby="scan-pages-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 id="scan-pages-title" className="text-lg font-semibold dark:text-white">
              Seiten ({pages.length})
            </h2>
            <Button variant="secondary" size="sm" onClick={() => cameraInputRef.current?.click()}>
              <Plus aria-hidden className="h-4 w-4" /> Weitere Seite
            </Button>
          </div>
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page, index) => (
              <li
                key={page.id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex aspect-[3/4] items-center justify-center overflow-hidden bg-slate-100 p-3 dark:bg-slate-950">
                  <ScanPagePreview page={page} pageNumber={index + 1} />
                </div>
                <div className="flex items-center justify-between gap-2 p-3">
                  <span className="min-w-0 truncate text-sm font-semibold">
                    Seite {index + 1}
                    {Object.values(page.crop).some((value) => value > 0) ? (
                      <span className="ml-1 text-xs font-normal text-blue-700 dark:text-blue-400">
                        · zugeschnitten
                      </span>
                    ) : null}
                  </span>
                  <div className="flex items-center">
                    <IconButton
                      label="Seite nach vorne verschieben"
                      disabled={index === 0}
                      onClick={() => movePage(index, -1)}
                    >
                      <ArrowUp aria-hidden className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label="Seite nach hinten verschieben"
                      disabled={index === pages.length - 1}
                      onClick={() => movePage(index, 1)}
                    >
                      <ArrowDown aria-hidden className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Seite drehen" onClick={() => rotatePage(page.id)}>
                      <RotateCw aria-hidden className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      label="Seite zuschneiden und Bild anpassen"
                      onClick={() => setCropPageId(page.id)}
                    >
                      <Crop aria-hidden className="h-4 w-4" />
                    </IconButton>
                    <IconButton label="Seite löschen" onClick={() => removePage(page.id)}>
                      <Trash2 aria-hidden className="h-4 w-4 text-red-600" />
                    </IconButton>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <FieldLabel htmlFor="scan-name">Dateiname</FieldLabel>
            <Input
              id="scan-name"
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
            />
            <div className="mt-4 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" onClick={() => void buildPdf()}>
                PDF erstellen
              </Button>
              <Button size="lg" variant="secondary" onClick={() => void openInEditor()}>
                <Pencil aria-hidden className="h-4 w-4" />
                Als PDF erstellen und bearbeiten
              </Button>
            </div>
          </div>
        </section>
      ) : (
        <div className="mt-8 rounded-xl border-2 border-dashed border-slate-300 p-10 text-center text-slate-500 dark:border-slate-700 dark:text-slate-400">
          Noch keine Seite aufgenommen. Fotografiere die erste Seite oder wähle ein Bild aus.
        </div>
      )}

      {result ? (
        <div className="mt-6">
          <ResultCard title="Scan-PDF ist fertig" filename={outputName} data={result}>
            <Button variant="secondary" onClick={() => void openInEditor()}>
              <Pencil aria-hidden className="h-4 w-4" /> PDF bearbeiten
            </Button>
          </ResultCard>
        </div>
      ) : null}

      <Dialog open={Boolean(cropPage)} onOpenChange={(open) => !open && setCropPageId(null)}>
        <DialogContent title="Zuschneiden & Bild verbessern" className="max-w-2xl">
          {cropPage ? (
            <div className="space-y-5">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Verschiebe die Regler, bis nur noch der gewünschte Dokumentbereich innerhalb des
                blauen Rahmens liegt.
              </p>
              <div className="relative mx-auto max-h-[45vh] w-fit overflow-hidden bg-slate-100 dark:bg-slate-950">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cropPage.previewUrl}
                  alt="Vorschau für den Zuschnitt"
                  className="block max-h-[45vh] max-w-full"
                  style={{ filter: imageFilter(cropPage.adjustments) }}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute border-2 border-blue-600 shadow-[0_0_0_9999px_rgba(15,23,42,0.55)]"
                  style={{
                    top: `${cropPage.crop.top}%`,
                    right: `${cropPage.crop.right}%`,
                    bottom: `${cropPage.crop.bottom}%`,
                    left: `${cropPage.crop.left}%`,
                  }}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {(
                  [
                    ["top", "Oben"],
                    ["bottom", "Unten"],
                    ["left", "Links"],
                    ["right", "Rechts"],
                  ] as const
                ).map(([edge, label]) => (
                  <div key={edge}>
                    <FieldLabel htmlFor={`crop-${edge}`}>
                      {label}: {cropPage.crop[edge]} %
                    </FieldLabel>
                    <Slider
                      id={`crop-${edge}`}
                      min={0}
                      max={40}
                      step={1}
                      value={[cropPage.crop[edge]]}
                      onValueChange={([value]) => updateCrop(edge, value)}
                    />
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-200 pt-5 dark:border-slate-700">
                <h3 className="mb-4 font-semibold dark:text-white">Bild verbessern</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  {(
                    [
                      ["brightness", "Helligkeit", 50, 150],
                      ["contrast", "Kontrast", 50, 180],
                      ["saturation", "Farbsättigung", 0, 180],
                      ["grayscale", "Graustufen", 0, 100],
                    ] as const
                  ).map(([key, label, min, max]) => (
                    <div key={key}>
                      <FieldLabel htmlFor={`adjust-${key}`}>
                        {label}: {cropPage.adjustments[key]} %
                      </FieldLabel>
                      <Slider
                        id={`adjust-${key}`}
                        min={min}
                        max={max}
                        step={1}
                        value={[cropPage.adjustments[key]]}
                        onValueChange={([value]) => updateAdjustment(key, value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!cropPageId) return;
                    updatePages(
                      pages.map((page) =>
                        page.id === cropPageId
                          ? {
                              ...page,
                              crop: { ...EMPTY_CROP },
                              adjustments: { ...DEFAULT_ADJUSTMENTS },
                            }
                          : page,
                      ),
                    );
                  }}
                >
                  Alles zurücksetzen
                </Button>
                <Button onClick={() => setCropPageId(null)}>Änderungen übernehmen</Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}
