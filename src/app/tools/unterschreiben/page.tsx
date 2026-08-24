"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Eraser, LockKeyhole, LockOpen, PenTool, Trash2 } from "lucide-react";
import Link from "next/link";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert, WarningAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { FieldLabel, Input } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProcessing } from "@/hooks/useProcessing";
import type { StoredSignatureMeta, SignatureSource } from "@/lib/types";
import {
  clearSignatures,
  deleteSignature,
  listSignatures,
  loadSignaturePayload,
  saveSignature,
} from "@/lib/signatures/store";
import {
  arrayBufferToDataUrl,
  makeWhiteBackgroundTransparent,
  renderNameSignature,
} from "@/lib/signatures/encoding";
import {
  decryptFromStorage,
  encryptForStorage,
  isSessionUnlocked,
  lockSignatureStore,
  unlockSignatureStore,
} from "@/lib/signatures/session";
import { uid } from "@/lib/utils";
import { validateImageFile } from "@/lib/validate";

export default function UnterschreibenPage() {
  const processing = useProcessing();
  const [returnToEditor, setReturnToEditor] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [signatures, setSignatures] = useState<StoredSignatureMeta[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [nameInput, setNameInput] = useState("");

  // Zeichnen
  const padRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);
  const [penColor, setPenColor] = useState("#0f172a");
  const [penWidth, setPenWidth] = useState(3);

  const refreshList = useCallback(async () => {
    if (!isSessionUnlocked()) return;
    const metas = await listSignatures();
    setSignatures(metas);
    const nextPreviews: Record<string, string> = {};
    for (const meta of metas) {
      try {
        const record = await loadSignaturePayload(meta.id);
        if (!record) continue;
        const plainBuffer = await decryptFromStorage(record.payload);
        nextPreviews[meta.id] = arrayBufferToDataUrl(plainBuffer);
      } catch {
        nextPreviews[meta.id] = "";
      }
    }
    setPreviews(nextPreviews);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setUnlocked(isSessionUnlocked()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setReturnToEditor(new URLSearchParams(window.location.search).get("returnTo") === "editor");
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const timer = window.setTimeout(() => void refreshList(), 0);
    return () => window.clearTimeout(timer);
  }, [unlocked, refreshList]);

  const unlock = async () => {
    processing.clearError();
    await processing.run("Speicher wird entschlüsselt …", async () => {
      await unlockSignatureStore(passphrase);
      setUnlocked(true);
      setPassphrase("");
      return true;
    });
  };

  const lock = () => {
    lockSignatureStore();
    setUnlocked(false);
  };

  const persist = async (dataUrl: string, name: string, source: SignatureSource) => {
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    const payload = await encryptForStorage(bytes.buffer as ArrayBuffer);
    const record = {
      id: uid(),
      name: name.trim() || "Unterschrift",
      source,
      createdAt: Date.now(),
      payload,
    };
    await saveSignature(record);
    await refreshList();
  };

  // ---- Zeichenfläche ----
  const pointerPos = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = padRef.current;
    if (!canvas) return null;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  };

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = padRef.current;
    const context = canvas?.getContext("2d");
    const point = pointerPos(event);
    if (!canvas || !context || !point) return;
    drawingRef.current = true;
    hasDrawnRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    context.strokeStyle = penColor;
    const cssWidth = canvas.getBoundingClientRect().width || canvas.width;
    context.lineWidth = Math.max(1.5, penWidth * (canvas.width / cssWidth));
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.1, point.y);
    context.stroke();
  };

  const moveStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const context = padRef.current?.getContext("2d");
    const point = pointerPos(event);
    if (!context || !point) return;
    context.lineTo(point.x, point.y);
    context.stroke();
  };

  const endStroke = () => {
    drawingRef.current = false;
  };

  const clearPad = () => {
    const canvas = padRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  };

  const saveDrawing = async () => {
    const canvas = padRef.current;
    if (!canvas || !hasDrawnRef.current) return;
    await processing.run("Unterschrift wird verschlüsselt gespeichert …", async () => {
      await persist(canvas.toDataURL("image/png"), "Gezeichnete Unterschrift", "draw");
      clearPad();
      return true;
    });
  };

  const handleUpload = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      void processing.run("", async () => {
        throw problem;
      });
      return;
    }
    await processing.run("Hintergrund wird transparent gemacht …", async () => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
        reader.readAsDataURL(file);
      });
      const cleaned = await makeWhiteBackgroundTransparent(dataUrl);
      await persist(cleaned, file.name.replace(/\.[^.]+$/, ""), "upload");
      return true;
    });
  };

  const saveNameSignature = async () => {
    if (!nameInput.trim()) return;
    await processing.run("Unterschrift wird erzeugt …", async () => {
      const dataUrl = renderNameSignature(nameInput.trim());
      await persist(dataUrl, nameInput.trim(), "name");
      setNameInput("");
      return true;
    });
  };

  const removeOne = async (id: string) =>
    processing.run("Wird gelöscht …", async () => {
      await deleteSignature(id);
      await refreshList();
      return true;
    });

  const removeAll = async () =>
    processing.run("Alle Unterschriften werden gelöscht …", async () => {
      await clearSignatures();
      await refreshList();
      return true;
    });

  return (
    <ToolShell
      title="Unterschriften verwalten"
      description="Zeichne, lade oder generiere deine Unterschrift. Sie wird ausschließlich lokal und AES-verschlüsselt in deinem Browser gespeichert."
      privacy="local"
    >
      {returnToEditor ? (
        <Link
          href="/tools/bearbeiten?resume=1"
          className="mb-5 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Zurück zum PDF
        </Link>
      ) : null}
      {processing.error ? (
        <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
      ) : null}

      <WarningAlert title="Rechtlicher Hinweis">
        PDFKing fügt eine <strong>sichtbare</strong> Unterschrift in das Dokument ein. Das ist keine
        qualifizierte elektronische Signatur (QES) im Sinne der eIDAS-Verordnung und ersetzt keine
        kryptografische Signatur.
      </WarningAlert>

      {!unlocked ? (
        <section className="mx-auto mt-8 max-w-md space-y-4 rounded-xl border border-slate-200 p-6 dark:border-slate-800">
          <h2 className="flex items-center gap-2 font-semibold">
            <LockKeyhole aria-hidden className="h-5 w-5 text-blue-700 dark:text-blue-400" />
            Unterschriftenspeicher entsperren
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Deine Unterschriften werden mit einer Passphrase verschlüsselt, die niemals gespeichert
            wird. Vergiss sie nicht – ohne sie sind bereits gespeicherte Unterschriften nicht
            wiederherstellbar.
          </p>
          <div>
            <FieldLabel htmlFor="passphrase">Passphrase</FieldLabel>
            <Input
              id="passphrase"
              type="password"
              value={passphrase}
              autoComplete="off"
              onChange={(event) => setPassphrase(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && unlock()}
            />
            <p id="passphrase-hint" className="mt-1 text-xs text-slate-500">
              Erste Nutzung? Denk dir eine aus – sie verschlüsselt ab jetzt alle Unterschriften.
            </p>
          </div>
          <Button
            className="w-full"
            onClick={unlock}
            disabled={!passphrase || processing.state.active}
          >
            <LockOpen aria-hidden className="mr-1.5 h-4 w-4" /> Entsperren
          </Button>
        </section>
      ) : (
        <div className="space-y-8">
          {/* Gespeicherte Unterschriften */}
          <section
            aria-label="Gespeicherte Unterschriften"
            className="space-y-3 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Gespeichert ({signatures.length})</h2>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={lock}>
                  Sperren
                </Button>
                {signatures.length > 0 ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void removeAll()}
                    disabled={processing.state.active}
                  >
                    <Trash2 aria-hidden className="mr-1 h-3.5 w-3.5" /> Alle löschen
                  </Button>
                ) : null}
              </div>
            </div>

            {signatures.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Noch keine Unterschrift gespeichert. Erstelle unten eine.
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {signatures.map((signature) => (
                  <li
                    key={signature.id}
                    className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"
                  >
                    <div className="flex h-24 items-center justify-center rounded-lg bg-white p-2 dark:bg-white">
                      {previews[signature.id] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previews[signature.id]}
                          alt={`Vorschau ${signature.name}`}
                          className="max-h-full max-w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-red-600">Entschlüsselung fehlgeschlagen</span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{signature.name}</p>
                      <button
                        type="button"
                        aria-label={`${signature.name} löschen`}
                        onClick={() => void removeOne(signature.id)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                      >
                        <Trash2 aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400">
                      {signature.source === "draw"
                        ? "Gezeichnet"
                        : signature.source === "upload"
                          ? "Hochgeladen"
                          : "Aus Name"}{" "}
                      · {new Date(signature.createdAt).toLocaleDateString("de-DE")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Neue Unterschrift */}
          <Tabs defaultValue="zeichnen">
            <TabsList>
              <TabsTrigger value="zeichnen">
                <PenTool aria-hidden className="h-4 w-4" /> Zeichnen
              </TabsTrigger>
              <TabsTrigger value="hochladen">Bild hochladen</TabsTrigger>
              <TabsTrigger value="name">Aus Name erzeugen</TabsTrigger>
            </TabsList>

            <TabsContent value="zeichnen">
              <div className="space-y-3 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                <label htmlFor="sig-pad-label" className="block text-sm font-medium">
                  Mit Maus, Finger oder Stift zeichnen:
                </label>
                <div id="sig-pad-label" className="sr-only">
                  Zeichenfläche für Unterschrift
                </div>
                <div className="overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white dark:border-slate-600">
                  <canvas
                    ref={padRef}
                    width={900}
                    height={300}
                    role="img"
                    aria-label="Zeichenfläche"
                    className="block h-44 w-full cursor-crosshair touch-none sm:h-56"
                    onPointerDown={startStroke}
                    onPointerMove={moveStroke}
                    onPointerUp={endStroke}
                    onPointerLeave={endStroke}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <FieldLabel htmlFor="pen-color" className="mb-0">
                      Farbe
                    </FieldLabel>
                    <input
                      id="pen-color"
                      type="color"
                      value={penColor}
                      onChange={(event) => setPenColor(event.target.value)}
                      className="h-9 w-12 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <FieldLabel htmlFor="pen-width" className="mb-0">
                      Stärke ({penWidth} px)
                    </FieldLabel>
                    <input
                      id="pen-width"
                      type="range"
                      min={1}
                      max={8}
                      value={penWidth}
                      onChange={(event) => setPenWidth(Number(event.target.value))}
                      className="accent-blue-700"
                    />
                  </div>
                  <span className="flex-1" />
                  <Button variant="secondary" onClick={clearPad}>
                    <Eraser aria-hidden className="mr-1.5 h-4 w-4" /> Leeren
                  </Button>
                  <Button onClick={saveDrawing}>Verschlüsselt speichern</Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="hochladen">
              <div className="space-y-3 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                <InfoAlert title="Automatische Transparenz">
                  Der weiße Hintergrund hochgeladener Bilder wird automatisch entfernt, damit die
                  Unterschrift sauber im Dokument liegt.
                </InfoAlert>
                <FileDropzone accept="images" onFiles={handleUpload} compact />
              </div>
            </TabsContent>

            <TabsContent value="name">
              <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-5 dark:border-slate-800">
                <div className="grow">
                  <FieldLabel htmlFor="sig-name">Dein Name</FieldLabel>
                  <Input
                    id="sig-name"
                    value={nameInput}
                    onChange={(event) => setNameInput(event.target.value)}
                    placeholder="z. B. Max Mustermann"
                    maxLength={40}
                  />
                </div>
                <Button onClick={saveNameSignature} disabled={!nameInput.trim()}>
                  In Schreibschrift erzeugen & speichern
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          <InfoAlert title="Nächster Schritt">
            Öffne{" "}
            <Link href="/tools/bearbeiten?tool=signatur" className="font-semibold underline">
              „PDF bearbeiten“
            </Link>
            , wähle dort das Signatur-Werkzeug und platziere deine Unterschrift per Klick im
            Dokument.
          </InfoAlert>
        </div>
      )}

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}
