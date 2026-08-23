import { AppError } from "../types";
import { hexToRgb } from "../utils";
import {
  applyMetadata,
  getDocumentInfo,
  loadPdfDocument,
  saveDocument,
  type MetadataFields,
} from "./loadDocument";
import { PDFDocument, rgb, type SecurityOptions } from "@cantoo/pdf-lib";

export interface EncryptionPermissions {
  printing: "no" | "low" | "high";
  copying: boolean;
  modifying: boolean;
  annotating: boolean;
  fillingForms: boolean;
  contentAccessibility: boolean;
  documentAssembly: boolean;
}

export async function encryptPdf(
  bytes: Uint8Array,
  passwords: { userPassword: string; ownerPassword?: string },
  permissions: EncryptionPermissions,
): Promise<Uint8Array> {
  if (!passwords.userPassword && !passwords.ownerPassword) {
    throw new AppError("INVALID_TYPE", "Bitte lege mindestens ein Passwort fest.");
  }
  const doc = await loadPdfDocument(bytes);

  const securityOptions: SecurityOptions = {
    userPassword: passwords.userPassword || undefined,
    ownerPassword: passwords.ownerPassword || undefined,
    permissions: {
      printing:
        permissions.printing === "high"
          ? "highResolution"
          : permissions.printing === "low"
            ? "lowResolution"
            : false,
      copying: permissions.copying,
      modifying: permissions.modifying,
      annotating: permissions.annotating,
      fillingForms: permissions.fillingForms,
      contentAccessibility: permissions.contentAccessibility,
      documentAssembly: permissions.documentAssembly,
    },
  };

  doc.encrypt(securityOptions);
  return saveDocument(doc);
}

export async function removePasswordProtection(
  bytes: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  const doc = await loadPdfDocument(bytes, password);
  const clean = await PDFDocument.create();
  const pages = await clean.copyPages(doc, doc.getPageIndices());
  pages.forEach((page) => clean.addPage(page));
  const info = getDocumentInfo(doc);
  applyMetadata(clean, {
    title: info.title,
    author: info.author,
    subject: info.subject,
    keywords: info.keywords,
    creator: info.creator,
    producer: info.producer,
  });
  return saveDocument(clean);
}

export async function readAndUpdateMetadata(
  bytes: Uint8Array,
  fields?: MetadataFields,
): Promise<{ info: Awaited<ReturnType<typeof getDocumentInfo>>; bytes: Uint8Array }> {
  const doc = await loadPdfDocument(bytes);
  const info = getDocumentInfo(doc);
  if (fields) {
    applyMetadata(doc, fields);
    return { info, bytes: await saveDocument(doc) };
  }
  return { info, bytes };
}

export async function stripMetadata(bytes: Uint8Array): Promise<Uint8Array> {
  const doc = await loadPdfDocument(bytes);
  applyMetadata(doc, {});
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  return saveDocument(doc);
}

export async function createBlankPdf(
  widthPt: number,
  heightPt: number,
  background?: string,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([widthPt, heightPt]);
  if (background) {
    const color = hexToRgb(background);
    page.drawRectangle({
      x: 0,
      y: 0,
      width: widthPt,
      height: heightPt,
      color: rgb(color.r, color.g, color.b),
    });
  }
  return saveDocument(doc);
}
