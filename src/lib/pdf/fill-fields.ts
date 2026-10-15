"use client";

import { PDFDocument, StandardFonts } from "@cantoo/pdf-lib";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { AppError, type PageElements, type TextElement } from "../types";
import { TEXT_LINE_HEIGHT_FACTOR } from "../editor/model";
import { uid } from "../utils";
import { flattenEditorElements } from "./annotate";
import { detectFillAreas, overlapsSignificantly, type FillRect } from "./fill-detection";
import { fillForm, type FormValues } from "./forms";
import { getPdfJs } from "./pdfjs";

export type FillFieldKind = "text" | "checkbox" | "choice" | "radio";
export type FillFieldSource = "formular" | "erkannt" | "manuell";

export interface FillField extends FillRect {
  id: string;
  pageIndex: number;
  kind: FillFieldKind;
  source: FillFieldSource;
  label: string;
  multiline: boolean;
  /** Text sitzt auf der Unterkante (Schreiblinie) statt mittig im Feld. */
  onLine: boolean;
  /** Vom Nutzer gewählte Schriftgröße in Punkt; sonst automatisch. */
  fontSize?: number;
  /** Nur bei echten PDF-Formularfeldern (AcroForm). */
  acro?: {
    name: string;
    readOnly: boolean;
    options?: Array<{ value: string; label: string }>;
    /** Exportwert dieses Optionsfelds bzw. „An"-Wert des Kontrollkästchens. */
    buttonValue?: string;
  };
}

export type FillValues = Record<string, string | boolean>;

export interface PageSize {
  width: number;
  height: number;
}

const WIDGET_ANNOTATION = 20;

interface WidgetData {
  annotationType: number;
  fieldType?: string;
  fieldName?: string;
  fieldValue?: unknown;
  rect: number[];
  hidden?: boolean;
  readOnly?: boolean;
  checkBox?: boolean;
  radioButton?: boolean;
  pushButton?: boolean;
  buttonValue?: string | null;
  exportValue?: string;
  multiLine?: boolean;
  combo?: boolean;
  alternativeText?: string;
  options?: Array<{ exportValue: string; displayValue: string }>;
}

interface TextBox extends FillRect {
  text: string;
}

function normalizeRect(rect: number[]): FillRect {
  const [x1, y1, x2, y2] = rect;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

async function readAcroFields(
  page: PDFPageProxy,
  pageIndex: number,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
): Promise<{ fields: FillField[]; values: FillValues }> {
  const annotations = (await page.getAnnotations({ intent: "display" })) as WidgetData[];
  const fields: FillField[] = [];
  const values: FillValues = {};

  for (const widget of annotations) {
    if (widget.annotationType !== WIDGET_ANNOTATION || widget.hidden || !widget.fieldName) {
      continue;
    }
    const [x1, y1, x2, y2] = widget.rect;
    const rect = normalizeRect([
      ...(viewport.convertToViewportPoint(x1, y1) as number[]),
      ...(viewport.convertToViewportPoint(x2, y2) as number[]),
    ]);
    const base = {
      id: uid(),
      pageIndex,
      ...rect,
      source: "formular" as const,
      label: widget.alternativeText || widget.fieldName,
      multiline: false,
      onLine: false,
    };
    const name = widget.fieldName;
    const readOnly = widget.readOnly === true;

    if (widget.fieldType === "Tx") {
      fields.push({
        ...base,
        kind: "text",
        multiline: widget.multiLine === true,
        acro: { name, readOnly },
      });
      if (typeof widget.fieldValue === "string") values[name] = widget.fieldValue;
    } else if (widget.fieldType === "Btn" && widget.checkBox) {
      fields.push({
        ...base,
        kind: "checkbox",
        acro: { name, readOnly, buttonValue: widget.exportValue },
      });
      values[name] = typeof widget.fieldValue === "string" && widget.fieldValue !== "Off";
    } else if (widget.fieldType === "Btn" && widget.radioButton && widget.buttonValue) {
      fields.push({
        ...base,
        kind: "radio",
        acro: { name, readOnly, buttonValue: widget.buttonValue },
      });
      if (typeof widget.fieldValue === "string" && widget.fieldValue !== "Off") {
        values[name] = widget.fieldValue;
      }
    } else if (widget.fieldType === "Ch") {
      fields.push({
        ...base,
        kind: "choice",
        acro: {
          name,
          readOnly,
          options: (widget.options ?? []).map((option) => ({
            value: option.exportValue,
            label: option.displayValue,
          })),
        },
      });
      const selected = Array.isArray(widget.fieldValue) ? widget.fieldValue[0] : widget.fieldValue;
      if (typeof selected === "string") values[name] = selected;
    }
  }
  return { fields, values };
}

async function readTextBoxes(
  page: PDFPageProxy,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
): Promise<TextBox[]> {
  // Beschriftungen nur für ungedrehte Seiten auswerten – reicht für die Zuordnung.
  if (viewport.rotation % 360 !== 0) return [];
  const lib = await getPdfJs();
  const content = await page.getTextContent();
  const boxes: TextBox[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const [, , , d, e, f] = lib.Util.transform(viewport.transform, item.transform);
    const height = Math.abs(d) || item.height || 10;
    boxes.push({ text: item.str.trim(), x: e, y: f - height, width: item.width, height });
  }
  return boxes;
}

function cleanLabel(text: string): string {
  return text
    .replace(/^\((.*)\)$/u, "$1")
    .replace(/[_.…:]+$/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

/** Sucht eine Beschriftung links, rechts (Kästchen), über oder unter dem Feld. */
export function findLabel(field: FillRect, boxes: TextBox[]): string | null {
  const centerY = field.y + field.height / 2;
  let best: { text: string; distance: number } | null = null;
  const consider = (text: string, distance: number) => {
    const label = cleanLabel(text);
    if (label.length < 2) return;
    if (!best || distance < best.distance) best = { text: label, distance };
  };
  for (const box of boxes) {
    const boxRight = box.x + box.width;
    const boxCenterY = box.y + box.height / 2;
    // links daneben, ungefähr auf gleicher Höhe
    if (
      boxRight <= field.x + 4 &&
      field.x - boxRight < 160 &&
      Math.abs(boxCenterY - centerY) < Math.max(8, field.height / 2 + 4)
    ) {
      consider(box.text, field.x - boxRight);
    }
    // Hinweise in Klammern wie „(Anschrift)" stehen unter ihrer Linie.
    const isHint = /^\(.*\)$/u.test(box.text);
    // direkt darüber
    const gapAbove = field.y - (box.y + box.height);
    if (gapAbove >= -2 && gapAbove < 14 && box.x < field.x + field.width && boxRight > field.x) {
      consider(box.text, gapAbove + (isHint ? 60 : 20));
    }
    // rechts daneben – typisch für Ankreuzkästchen („☐ Newsletter abonnieren")
    if (
      field.width <= 25 &&
      box.x >= field.x + field.width - 2 &&
      box.x - (field.x + field.width) < 20 &&
      Math.abs(boxCenterY - centerY) < Math.max(8, field.height)
    ) {
      consider(box.text, box.x - (field.x + field.width));
    }
    // darunter (z. B. „Ort, Datum" unter einer Unterschriftslinie)
    const gapBelow = box.y - (field.y + field.height);
    if (gapBelow >= 0 && gapBelow < 12 && box.x < field.x + field.width && boxRight > field.x) {
      consider(box.text, gapBelow + (isHint ? 0 : 40));
    }
  }
  return (best as { text: string } | null)?.text ?? null;
}

const DETECTION_MAX_PIXELS = 2600;

async function rasterizeForDetection(
  page: PDFPageProxy,
  viewport: ReturnType<PDFPageProxy["getViewport"]>,
): Promise<{ image: ImageData; scale: number }> {
  const scale = Math.min(2, DETECTION_MAX_PIXELS / Math.max(viewport.width, viewport.height));
  const scaled = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(scaled.width);
  canvas.height = Math.floor(scaled.height);
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas-2D-Kontext nicht verfügbar.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const lib = await getPdfJs();
    // Formular-Widgets nicht mitrendern: Deren Rahmen sind bereits als echte Felder bekannt.
    await page.render({
      canvas,
      canvasContext: context,
      viewport: scaled,
      annotationMode: lib.AnnotationMode.ENABLE_FORMS,
    }).promise;
    return { image: context.getImageData(0, 0, canvas.width, canvas.height), scale };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * Ermittelt alle Ausfüllstellen einer Seite: echte Formularfelder an ihrer
 * Position sowie per Bildanalyse erkannte Kästchen, Kästen und Schreiblinien.
 */
export async function detectPageFillFields(
  doc: PDFDocumentProxy,
  pageIndex: number,
): Promise<{ fields: FillField[]; values: FillValues; size: PageSize }> {
  const page = await doc.getPage(pageIndex + 1);
  try {
    const viewport = page.getViewport({ scale: 1 });
    const acro = await readAcroFields(page, pageIndex, viewport);
    const textBoxes = await readTextBoxes(page, viewport);
    const { image, scale } = await rasterizeForDetection(page, viewport);

    const fields: FillField[] = [...acro.fields];
    let counter = 0;
    for (const area of detectFillAreas(image, scale)) {
      if (fields.some((field) => overlapsSignificantly(field, area, 0.3))) continue;
      counter += 1;
      const label = findLabel(area, textBoxes) ?? (area.kind === "checkbox" ? "Kästchen" : "Feld");
      fields.push({
        id: uid(),
        pageIndex,
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
        kind: area.kind,
        source: "erkannt",
        label: textBoxes.length > 0 ? label : `${label} ${counter}`,
        multiline: area.kind === "text" && area.height >= 34,
        onLine: area.source === "linie",
      });
    }

    fields.sort((a, b) => a.y - b.y || a.x - b.x);
    return {
      fields,
      values: acro.values,
      size: { width: viewport.width, height: viewport.height },
    };
  } finally {
    page.cleanup();
  }
}

/**
 * Erzeugt ein leeres, manuell platziertes Textfeld. Bei `onLine` ist die
 * Unterkante des Felds die Grundlinie (z. B. Klick auf eine Linie).
 */
export function createManualField(
  pageIndex: number,
  rect: FillRect,
  number: number,
  onLine: boolean,
): FillField {
  return {
    id: uid(),
    pageIndex,
    ...rect,
    kind: "text",
    source: "manuell",
    label: `Eigenes Feld ${number}`,
    multiline: !onLine && rect.height >= 34,
    onLine,
  };
}

export const MIN_FONT_SIZE = 5;
export const MAX_FONT_SIZE = 36;

/** Schriftgröße, die ein Feld standardmäßig verwendet. */
export function defaultFontSize(field: FillRect, multiline: boolean): number {
  if (multiline) return 11;
  return Math.max(6, Math.min(12, field.height * 0.65));
}

/** Schriftgröße des Felds: vom Nutzer gewählt oder automatisch. */
export function fieldFontSize(field: FillField): number {
  return field.fontSize ?? defaultFontSize(field, field.multiline);
}

const LINE_HEIGHT = TEXT_LINE_HEIGHT_FACTOR;
/** Abstand der Grundlinie über der Schreiblinie (Anteil der Schriftgröße). */
const ON_LINE_GAP = 0.15;
const PADDING = 2;

/**
 * Lage der ersten Grundlinie in Punkt ab Feldoberkante. UI und Export nutzen
 * dieselbe Rechnung, damit der Text im PDF dort steht, wo er getippt wurde.
 */
export function firstBaseline(
  field: Pick<FillField, "height" | "multiline" | "onLine">,
  fontSize: number,
  lineCount = 1,
): number {
  if (field.multiline) return PADDING + fontSize * 0.97;
  if (field.onLine)
    return field.height - fontSize * ON_LINE_GAP - (lineCount - 1) * fontSize * LINE_HEIGHT;
  return field.height / 2 + fontSize * 0.35 - ((lineCount - 1) * fontSize * LINE_HEIGHT) / 2;
}

/**
 * Setzt die Schriftgröße und vergrößert das Feld bei Bedarf. Felder auf einer
 * Linie wachsen nach oben, damit der Text auf der Linie bleibt.
 */
export function withFontSize(field: FillField, fontSize: number): FillField {
  const size = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(fontSize * 2) / 2));
  const needed = field.multiline ? size * LINE_HEIGHT + 2 * PADDING : size * 1.3;
  if (field.height >= needed) return { ...field, fontSize: size };
  const grow = needed - field.height;
  return {
    ...field,
    fontSize: size,
    height: needed,
    y: field.onLine ? Math.max(0, field.y - grow) : field.y,
  };
}

type MeasureFont = Awaited<ReturnType<PDFDocument["embedFont"]>>;

function wrapText(text: string, font: MeasureFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function layoutText(
  field: FillField,
  text: string,
  font: MeasureFont,
): Omit<TextElement, "id" | "pageIndex" | "kind"> {
  const width = Math.max(4, field.width - 2 * PADDING);
  const singleLine = text.replace(/\s*\n\s*/g, " ");
  const blockHeightOf = (lineCount: number, fontSize: number) =>
    fontSize + (lineCount - 1) * fontSize * LINE_HEIGHT;
  const fits = (candidate: string[], fontSize: number) =>
    Math.max(...candidate.map((line) => font.widthOfTextAtSize(line, fontSize))) <= width &&
    blockHeightOf(candidate.length, fontSize) <= field.height;

  // Erst verkleinern; passt eine einzeilige Eingabe auch klein nicht, umbrechen,
  // statt über den Feldrand hinauszuschreiben.
  const attempts: Array<(fontSize: number) => string[]> = field.multiline
    ? [(fontSize) => wrapText(text, font, fontSize, width)]
    : [() => [singleLine], (fontSize) => wrapText(singleLine, font, fontSize, width)];
  let size = MIN_FONT_SIZE;
  let lines = attempts[attempts.length - 1](MIN_FONT_SIZE);
  search: for (const attempt of attempts) {
    for (let fontSize = fieldFontSize(field); fontSize >= MIN_FONT_SIZE; fontSize -= 0.5) {
      const candidate = attempt(fontSize);
      if (fits(candidate, fontSize)) {
        size = fontSize;
        lines = candidate;
        break search;
      }
    }
  }

  // Die Grundlinie der ersten Zeile liegt bei y + Schriftgröße (siehe annotate.ts).
  const y = field.y + firstBaseline(field, size, lines.length) - size;

  return {
    x: field.x + PADDING,
    y,
    width,
    height: field.height,
    text: lines.join("\n"),
    fontFamily: "Helvetica",
    bold: false,
    fontSize: size,
    color: "#111111",
    align: "left",
  };
}

/**
 * Speichert die Eingaben: echte Formularfelder werden als Formularwerte
 * gesetzt, alle anderen Einträge dauerhaft als Text ins PDF geschrieben.
 */
export async function exportFilledPdf(
  bytes: Uint8Array,
  fields: FillField[],
  values: FillValues,
  options: { flattenForm: boolean },
): Promise<Uint8Array> {
  let result = bytes;

  const formValues: FormValues = {};
  for (const field of fields) {
    if (!field.acro || field.acro.readOnly) continue;
    const value = values[field.acro.name];
    if (value === undefined) continue;
    formValues[field.acro.name] = value;
  }
  if (Object.keys(formValues).length > 0 || options.flattenForm) {
    result = await fillForm(result, formValues, options.flattenForm);
  }

  const measureDoc = await PDFDocument.create();
  const font = await measureDoc.embedFont(StandardFonts.Helvetica);
  const pages: PageElements = {};
  for (const field of fields) {
    if (field.acro) continue;
    const value = values[field.id];
    let element: TextElement | null = null;
    if (field.kind === "checkbox" && value === true) {
      const size = Math.min(field.width, field.height) * 0.85;
      element = {
        id: field.id,
        pageIndex: field.pageIndex,
        kind: "text",
        x: field.x,
        // Grundlinie so setzen, dass das „X" (Versalhöhe ≈ 0,72) mittig sitzt.
        y: field.y + field.height / 2 - size * 0.64,
        width: field.width,
        height: field.height,
        text: "X",
        fontFamily: "Helvetica",
        bold: true,
        fontSize: size,
        color: "#111111",
        align: "center",
      };
    } else if (field.kind === "text" && typeof value === "string" && value.trim()) {
      try {
        element = {
          id: field.id,
          pageIndex: field.pageIndex,
          kind: "text",
          ...layoutText(field, value, font),
        };
      } catch {
        throw new AppError(
          "INVALID_TYPE",
          `Der Text in „${field.label}" enthält Zeichen, die nicht ins PDF geschrieben werden können.`,
          "Verwende lateinische Buchstaben, Ziffern und gängige Satzzeichen (z. B. keine Emojis).",
        );
      }
    }
    if (element) (pages[field.pageIndex] ??= []).push(element);
  }

  if (Object.keys(pages).length === 0) return result;
  return flattenEditorElements(result, pages);
}
