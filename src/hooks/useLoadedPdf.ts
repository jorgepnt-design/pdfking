"use client";

import { useState } from "react";
import { AppError, type AppErrorCode } from "@/lib/types";
import { probePdfDocument } from "@/lib/pdf/loadDocument";
import { validatePdfFiles } from "@/lib/validate";

export interface LoadedPdfFile {
  name: string;
  size: number;
  bytes: Uint8Array;
}

/**
 * Gemeinsame Ladeprozedur für Werkzeugseiten:
 * validiert Dateien, prüft auf Passwortschutz und hält die Bytes im Speicher.
 */
export function useLoadedPdf() {
  const [file, setFile] = useState<LoadedPdfFile | null>(null);
  const [loadError, setLoadError] = useState<AppError | null>(null);

  const openFiles = async (
    files: File[],
    options?: { allowEncrypted?: boolean },
  ): Promise<boolean> => {
    setLoadError(null);
    const { accepted, rejected } = await validatePdfFiles(files);
    const first = accepted[0];
    if (!first) {
      const problem = rejected[0];
      if (problem) setLoadError(new AppError(problem.code as AppErrorCode, problem.message));
      return false;
    }
    try {
      const bytes = new Uint8Array(await first.arrayBuffer());
      const probe = await probePdfDocument(bytes);
      if (probe.isEncrypted && !options?.allowEncrypted) {
        throw new AppError(
          "ENCRYPTED_NEEDS_PASSWORD",
          undefined,
          "Nutze das Werkzeug „Passwort entfernen“, um es zuerst zu öffnen.",
        );
      }
      setFile({ name: first.name, size: first.size, bytes });
      return true;
    } catch (error) {
      if (error instanceof AppError) setLoadError(error);
      else setLoadError(new AppError("CORRUPT_PDF"));
      return false;
    }
  };

  return { file, setFile, loadError, setLoadError, openFiles };
}
