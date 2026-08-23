export type ToolCategory =
  "bearbeiten" | "organisieren" | "optimieren" | "konvertieren" | "unterschreiben" | "sicherheit";

export type PrivacyMode = "local" | "server" | "mixed";

export interface AppErrorCodeMap {
  INVALID_TYPE: string;
  TOO_LARGE: string;
  ENCRYPTED_NEEDS_PASSWORD: string;
  WRONG_PASSWORD: string;
  CORRUPT_PDF: string;
  SERVER_NOT_CONFIGURED: string;
  SERVER_ERROR: string;
  CANCELLED: string;
  UNKNOWN: string;
}

export type AppErrorCode = keyof AppErrorCodeMap;

const DEFAULT_MESSAGES: AppErrorCodeMap = {
  INVALID_TYPE: "Diese Datei wird nicht unterstützt.",
  TOO_LARGE: "Die Datei ist zu groß.",
  ENCRYPTED_NEEDS_PASSWORD:
    "Dieses PDF ist passwortgeschützt. Gib das Passwort ein, um fortzufahren.",
  WRONG_PASSWORD: "Das eingegebene Passwort ist nicht korrekt.",
  CORRUPT_PDF: "Die Datei konnte nicht als PDF gelesen werden. Sie ist möglicherweise beschädigt.",
  SERVER_NOT_CONFIGURED:
    "Für diese Funktion ist ein Server erforderlich, der aktuell nicht eingerichtet ist.",
  SERVER_ERROR: "Der Verarbeitungsserver hat einen Fehler gemeldet.",
  CANCELLED: "Der Vorgang wurde abgebrochen.",
  UNKNOWN: "Es ist ein unerwarteter Fehler aufgetreten.",
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly hint?: string;

  constructor(code: AppErrorCode, message?: string, hint?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = "AppError";
    this.code = code;
    this.hint = hint;
  }
}

// ---------- Dokumente & Seiten ----------

export interface LoadedPdf {
  id: string;
  name: string;
  bytes: Uint8Array;
  pageCount: number;
}

export interface PdfDocumentInfo {
  pageCount: number;
  isEncrypted: boolean;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

// ---------- Bearbeitungselemente (Koordinaten in PDF-Punkten, y von oben) ----------

export type FontFamily = "Helvetica" | "TimesRoman" | "Courier";
export type TextAlign = "left" | "center" | "right";

interface BaseElement {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextElement extends BaseElement {
  kind: "text";
  text: string;
  fontFamily: FontFamily;
  bold: boolean;
  fontSize: number;
  color: string;
  align: TextAlign;
}

export interface ImageElement extends BaseElement {
  kind: "image";
  dataUrl: string;
}

export interface RectElement extends BaseElement {
  kind: "rect";
  strokeColor: string;
  fillColor: string | null;
  strokeWidth: number;
  opacity: number;
}

export interface HighlightElement extends BaseElement {
  kind: "highlight";
  color: string;
}

export interface LineElement extends BaseElement {
  kind: "line";
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
  arrow: boolean;
}

export interface InkStrokeElement extends BaseElement {
  kind: "ink";
  points: Array<{ x: number; y: number }>;
  color: string;
  strokeWidth: number;
}

export interface DecorationElement extends BaseElement {
  kind: "underline" | "strike";
  color: string;
}

export type EditorTool =
  | "select"
  | "text"
  | "rect"
  | "line"
  | "arrow"
  | "highlight"
  | "underline"
  | "strike"
  | "ink"
  | "image";

export type EditorElement =
  | TextElement
  | ImageElement
  | RectElement
  | HighlightElement
  | LineElement
  | InkStrokeElement
  | DecorationElement;

export type PageElements = Record<number, EditorElement[]>;

// ---------- Unterschriften ----------

export type SignatureSource = "draw" | "upload" | "name";

export interface StoredSignatureMeta {
  id: string;
  name: string;
  source: SignatureSource;
  createdAt: number;
}

export interface EncryptedPayload {
  ivB64: string;
  cipher: ArrayBuffer;
}

export interface StoredSignature extends StoredSignatureMeta {
  payload: EncryptedPayload;
}

// ---------- Exportoptionen & Komprimierung ----------

export interface ExportOptions {
  fileName: string;
  removeMetadata?: boolean;
}

export type CompressionLevel = "leicht" | "mittel" | "stark";

export interface CompressionOptions {
  level: CompressionLevel;
  removeMetadata: boolean;
  grayscale: boolean;
}

export interface CompressionResult {
  bytes: Uint8Array;
  originalSize: number;
  newSize: number;
  rasterized: boolean;
}

// ---------- Konvertierung ----------

export type ImageExportFormat = "image/png" | "image/jpeg";

export type ServerJobFormat = "pdf-docx-hq" | "docx-pdf" | "pptx-pdf" | "xlsx-pdf";

export interface ServerStatus {
  enabled: boolean;
}

// ---------- Verarbeitungsschritte ----------

export interface ProgressState {
  active: boolean;
  label: string;
  percent: number | null;
}

export interface CancellationToken {
  cancelled: boolean;
  throwIfCancelled(): void;
}
