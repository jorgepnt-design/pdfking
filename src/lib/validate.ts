import { AppError } from "./types";

export const MAX_UPLOAD_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 100);

/** Prüft die PDF-Magischen Bytes ("%PDF-") im Kopf der Datei. */
export function isPdfBuffer(buffer: Uint8Array): boolean {
  const head = buffer.subarray(0, 1024);
  const text = new TextDecoder("latin1").decode(head);
  return text.includes("%PDF-");
}

async function sniffHeader(file: File, length = 1024): Promise<Uint8Array> {
  const slice = file.slice(0, length);
  return new Uint8Array(await slice.arrayBuffer());
}

export interface ValidationResult {
  accepted: File[];
  rejected: Array<{ file: File; code: import("./types").AppErrorCode; message: string }>;
}

function tooLargeMessage(file: File): string {
  return `„${file.name}" ist zu groß (Maximum: ${MAX_UPLOAD_MB} MB).`;
}

export async function validatePdfFiles(files: File[]): Promise<ValidationResult> {
  const accepted: File[] = [];
  const rejected: ValidationResult["rejected"] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".pdf") && file.type !== "application/pdf") {
      rejected.push({
        file,
        code: "INVALID_TYPE",
        message: `„${file.name}" ist keine PDF-Datei. Bitte wähle Dateien im Format .pdf.`,
      });
      continue;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      rejected.push({ file, code: "TOO_LARGE", message: tooLargeMessage(file) });
      continue;
    }
    try {
      const header = await sniffHeader(file);
      if (!isPdfBuffer(header)) {
        rejected.push({
          file,
          code: "CORRUPT_PDF",
          message: `„${file.name}" hat keine gültige PDF-Struktur und konnte nicht geöffnet werden. Ist die Datei beschädigt?`,
        });
        continue;
      }
    } catch {
      rejected.push({
        file,
        code: "UNKNOWN",
        message: `„${file.name}" konnte nicht gelesen werden.`,
      });
      continue;
    }
    accepted.push(file);
  }
  return { accepted, rejected };
}

const IMAGE_TYPES = ["image/png", "image/jpeg"] as const;

export function validateImageFile(file: File): AppError | null {
  const okType = (IMAGE_TYPES as readonly string[]).includes(file.type);
  const okExt = /\.(png|jpe?g)$/i.test(file.name);
  if (!okType && !okExt) {
    return new AppError(
      "INVALID_TYPE",
      `„${file.name}" wird nicht unterstützt. Erlaubt sind PNG- und JPG-Bilder.`,
    );
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return new AppError("TOO_LARGE", tooLargeMessage(file));
  }
  return null;
}

export function assertValidPdfName(file: File): void {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".pdf") && file.type !== "application/pdf") {
    throw new AppError(
      "INVALID_TYPE",
      `„${file.name}" ist keine PDF-Datei.`,
      "Bitte wähle eine Datei im Format .pdf.",
    );
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new AppError(
      "TOO_LARGE",
      tooLargeMessage(file),
      "Komprimiere die Datei und versuche es erneut.",
    );
  }
}
