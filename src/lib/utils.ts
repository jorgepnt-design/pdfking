import { clsx, type ClassValue } from "clsx";
import { AppError, type CancellationToken } from "./types";

export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}

export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const NUMBER_FORMAT = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "–";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${NUMBER_FORMAT.format(bytes / 1024)} KB`;
  return `${NUMBER_FORMAT.format(bytes / (1024 * 1024))} MB`;
}

export function percentSaved(before: number, after: number): number | null {
  if (!before || before <= 0 || after <= 0 || after >= before) return null;
  return Math.round((1 - after / before) * 100);
}

export function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

export function downloadBytes(
  data: Blob | Uint8Array | ArrayBuffer | string,
  filename: string,
  mime = "application/pdf",
): void {
  const blob =
    data instanceof Blob ? data : new Blob([data as unknown as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Parst Seitenbereichs-Angaben wie „1-3, 5, 9-" in Gruppen von
 * 0-basierten Seitenindizes. Wirft bei ungültiger Eingabe einen AppError.
 */
export function parseRangeGroups(input: string, pageCount: number): number[][] {
  const trimmed = input.trim();
  if (!trimmed)
    throw new AppError(
      "INVALID_TYPE",
      "Bitte gib mindestens einen Seitenbereich an.",
      'Beispiel: „1-3, 5, 8-"',
    );
  const groups: number[][] = [];
  for (const part of trimmed.split(",")) {
    const chunk = part.trim();
    if (!chunk) continue;
    const hasDash = chunk.includes("-");
    const match = /^(\d+)?(?:\s*-\s*(\d+)?)?$/.exec(chunk);
    if (!match || (!hasDash && !match[1])) {
      throw new AppError(
        "INVALID_TYPE",
        `„${chunk}" ist kein gültiger Seitenbereich.`,
        'Erlaubt sind Angaben wie „3", „2-5" oder „7-" (bis zum Ende).',
      );
    }
    let start = match[1] ? parseInt(match[1], 10) : 1;
    let end = hasDash ? (match[2] ? parseInt(match[2], 10) : pageCount) : start;
    start = clamp(start, 1, pageCount);
    end = clamp(end, start, pageCount);
    const group: number[] = [];
    for (let page = start; page <= end; page++) group.push(page - 1);
    if (group.length === 0) continue;
    groups.push(group);
  }
  if (groups.length === 0) {
    throw new AppError("INVALID_TYPE", "Der angegebene Seitenbereich ergibt keine Seiten.");
  }
  return groups;
}

/** Parst eine flache Auswahlliste wie „1,3-5" zu 0-basierten Indizes. */
export function parsePageList(input: string, pageCount: number): number[] {
  return parseRangeGroups(input, pageCount).flat();
}

export class SimpleCancellation implements CancellationToken {
  cancelled = false;

  throwIfCancelled(): void {
    if (this.cancelled) throw new AppError("CANCELLED", "Der Vorgang wurde abgebrochen.");
  }
}

/** Gibt kurz an die UI zurück, damit der Browser rendern kann. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** Wandelt #rrggbb in pdf-lib-Farbwerte (0..1) um. */
export function hexToRgb(hex: string): RgbColor {
  const normalized = hex.replace("#", "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const int = Number.parseInt(full.slice(0, 6).padEnd(6, "0"), 16);
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255,
  };
}

export function sanitizeFilename(name: string): string {
  const base = name
    .replace(/\.[^.]+$/, "")
    .replace(/[^\w\-äöüßÄÖÜ ]+/g, "_")
    .trim();
  return base || "dokument";
}
