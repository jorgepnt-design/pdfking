import { PDFDocument } from "@cantoo/pdf-lib";
import { AppError, type PdfDocumentInfo } from "../types";

export function mapPdfLibError(error: unknown): AppError {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (message.includes("password")) {
    return new AppError(
      "WRONG_PASSWORD",
      undefined,
      "Prüfe das Passwort (Groß-/Kleinschreibung) und versuche es erneut.",
    );
  }
  if (message.includes("encrypted")) {
    return new AppError("ENCRYPTED_NEEDS_PASSWORD");
  }
  if (
    message.includes("parse") ||
    message.includes("expected") ||
    message.includes("invalid object") ||
    message.includes("corrupt") ||
    message.includes("failed")
  ) {
    return new AppError("CORRUPT_PDF");
  }
  return new AppError("UNKNOWN", error instanceof Error ? error.message : undefined);
}

export async function loadPdfDocument(bytes: Uint8Array, password?: string): Promise<PDFDocument> {
  try {
    if (password !== undefined) {
      return await PDFDocument.load(bytes, { password, updateMetadata: false });
    }
    return await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: false });
  } catch (error) {
    throw mapPdfLibError(error);
  }
}

export async function probePdfDocument(
  bytes: Uint8Array,
): Promise<{ isEncrypted: boolean; doc: PDFDocument | null }> {
  try {
    const doc = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    return { isEncrypted: doc.isEncrypted, doc: doc.isEncrypted ? null : doc };
  } catch {
    return { isEncrypted: false, doc: null };
  }
}

export function getDocumentInfo(doc: PDFDocument): PdfDocumentInfo {
  return {
    pageCount: doc.getPageCount(),
    isEncrypted: doc.isEncrypted,
    title: doc.getTitle() ?? undefined,
    author: doc.getAuthor() ?? undefined,
    subject: doc.getSubject() ?? undefined,
    keywords: doc.getKeywords() ?? undefined,
    creator: doc.getCreator() ?? undefined,
    producer: doc.getProducer() ?? undefined,
    creationDate: doc.getCreationDate() ?? undefined,
    modificationDate: doc.getModificationDate() ?? undefined,
  };
}

export interface MetadataFields {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
}

export function applyMetadata(doc: PDFDocument, fields: MetadataFields): void {
  doc.setTitle(fields.title ?? "");
  doc.setAuthor(fields.author ?? "");
  doc.setSubject(fields.subject ?? "");
  doc.setKeywords(
    (fields.keywords ?? "")
      .split(/[;,]/)
      .map((k) => k.trim())
      .filter(Boolean),
  );
  doc.setCreator(fields.creator ?? "");
  doc.setProducer(fields.producer ?? "");
}

export async function saveDocument(doc: PDFDocument): Promise<Uint8Array> {
  try {
    return await doc.save({ useObjectStreams: true });
  } catch (error) {
    throw mapPdfLibError(error);
  }
}
