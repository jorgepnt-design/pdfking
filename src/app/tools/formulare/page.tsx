"use client";

import { useState } from "react";
import { ResultCard } from "@/components/shared/result-card";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ProcessingOverlay } from "@/components/shared/processing-overlay";
import { ToolShell } from "@/components/shared/tool-shell";
import { ErrorAlert, InfoAlert } from "@/components/ui/alerts";
import { Button } from "@/components/ui/button";
import { Checkbox, FieldLabel, Input, Select } from "@/components/ui/form";
import { useProcessing } from "@/hooks/useProcessing";
import type { FormFieldInfo } from "@/lib/pdf/forms";
import { detectFormFields, fillForm } from "@/lib/pdf/forms";
import type { FormValues } from "@/lib/pdf/forms";

export default function FormularePage() {
  const processing = useProcessing();
  const [source, setSource] = useState<{ name: string; size: number; bytes: Uint8Array } | null>(
    null,
  );
  const [fields, setFields] = useState<FormFieldInfo[]>([]);
  const [values, setValues] = useState<FormValues>({});
  const [flatten, setFlatten] = useState(false);
  const [resultBytes, setResultBytes] = useState<Uint8Array | null>(null);

  const openFile = async (files: File[]) => {
    if (processing.state.active) return;
    processing.clearError();
    const loadedFile = await validateFiles(files);
    if (!loadedFile) return;
    await processing.run("Formularfelder werden gesucht …", async () => {
      const detected = await detectFormFields(loadedFile.bytes);
      setSource({ name: loadedFile.name, size: loadedFile.size, bytes: loadedFile.bytes });
      setFields(detected.fields.filter((field) => field.type !== "button"));
      const initial: FormValues = {};
      for (const field of detected.fields) {
        if (field.type === "checkbox") initial[field.name] = field.value === true;
        else if (field.value !== null && typeof field.value !== "boolean")
          initial[field.name] = String(field.value);
      }
      setValues(initial);
      setResultBytes(null);
    });
  };

  async function validateFiles(files: File[]) {
    const { validatePdfFiles } = await import("@/lib/validate");
    const { accepted } = await validatePdfFiles(files);
    if (accepted.length === 0) return null;
    const file = accepted[0];
    return { name: file.name, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) };
  }

  const save = () =>
    processing.run("Formular wird gespeichert …", async () => {
      if (!source) return null;
      const bytes = await fillForm(source.bytes, values, flatten);
      setResultBytes(bytes);
      return bytes;
    });

  const updateValue = (name: string, value: string | boolean) =>
    setValues((current) => ({ ...current, [name]: value }));

  return (
    <ToolShell
      title="PDF-Formulare ausfüllen"
      description="Erkennt ausfüllbare Felder (AcroForms) und ermöglicht das direkte Ausfüllen im Browser – ohne Upload."
      privacy="local"
    >
      {processing.error ? (
        <ErrorAlert error={processing.error} onDismiss={processing.clearError} />
      ) : null}

      {!source ? (
        <FileDropzone onFiles={openFile} />
      ) : fields.length === 0 ? (
        <div className="space-y-4">
          <InfoAlert title="Keine ausfüllbaren Felder gefunden">
            „{source.name}“ enthält kein interaktives PDF-Formular (AcroForm). Gescannte oder
            nicht-interaktive Formulare kannst du mit dem Werkzeug „PDF bearbeiten“ manuell
            beschriften.
          </InfoAlert>
          <Button variant="ghost" onClick={() => setSource(null)}>
            Andere Datei wählen
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
          <section
            className="space-y-4 rounded-xl border border-slate-200 p-5 dark:border-slate-800"
            aria-label="Formularfelder"
          >
            <h2 className="font-semibold">{fields.length} Feld(er) gefunden</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => {
                const value = values[field.name];
                switch (field.type) {
                  case "text":
                    return (
                      <div key={field.name}>
                        <FieldLabel htmlFor={`field-${field.name}`}>{field.name}</FieldLabel>
                        <Input
                          id={`field-${field.name}`}
                          value={(value as string) ?? ""}
                          disabled={field.readOnly}
                          onChange={(event) => updateValue(field.name, event.target.value)}
                        />
                      </div>
                    );
                  case "checkbox":
                    return (
                      <Checkbox
                        key={field.name}
                        label={field.name}
                        checked={value === true || (value === undefined && field.value === true)}
                        onChange={(event) => updateValue(field.name, event.target.checked)}
                      />
                    );
                  case "dropdown":
                  case "optionlist":
                  case "radio":
                    return (
                      <div key={field.name}>
                        <FieldLabel htmlFor={`field-${field.name}`}>{field.name}</FieldLabel>
                        <Select
                          id={`field-${field.name}`}
                          value={(value as string) ?? ""}
                          onChange={(event) => updateValue(field.name, event.target.value)}
                        >
                          <option value="">– nichts gewählt –</option>
                          {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Select>
                      </div>
                    );
                  default:
                    return (
                      <p key={field.name} className="text-sm text-slate-500">
                        „{field.name}“ wird nicht unterstützt.
                      </p>
                    );
                }
              })}
            </div>

            <Checkbox
              label="Formular nach dem Speichern abflachen (nicht mehr änderbar)"
              checked={flatten}
              onChange={(event) => setFlatten(event.target.checked)}
            />

            <div className="flex flex-wrap gap-2">
              <Button onClick={save} disabled={processing.state.active}>
                Speichern
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
                title="Formular gespeichert!"
                filename={`${source.name.replace(/\.pdf$/i, "")}-ausgefuellt.pdf`}
                data={resultBytes}
                originalSize={source.size}
              />
            )}
          </aside>
        </div>
      )}

      <ProcessingOverlay state={processing.state} onCancel={processing.cancel} />
    </ToolShell>
  );
}
