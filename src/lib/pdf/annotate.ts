import { degrees, LineCapStyle, PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib";
import type { FontFamily, PageElements } from "../types";
import { hexToRgb } from "../utils";
import { textBaselineFromTop } from "../editor/model";
import { loadPdfDocument, saveDocument } from "./loadDocument";

type EmbeddedFonts = Record<
  FontFamily,
  {
    regular: Awaited<ReturnType<PDFDocument["embedFont"]>>;
    bold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  }
>;

async function embedAllFonts(doc: PDFDocument): Promise<EmbeddedFonts> {
  return {
    Helvetica: {
      regular: await doc.embedFont(StandardFonts.Helvetica),
      bold: await doc.embedFont(StandardFonts.HelveticaBold),
    },
    TimesRoman: {
      regular: await doc.embedFont(StandardFonts.TimesRoman),
      bold: await doc.embedFont(StandardFonts.TimesRomanBold),
    },
    Courier: {
      regular: await doc.embedFont(StandardFonts.Courier),
      bold: await doc.embedFont(StandardFonts.CourierBold),
    },
  };
}

function decodeDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function isPngDataUrl(dataUrl: string): boolean {
  return dataUrl.slice(0, 30).includes("image/png");
}

const FONT_OF_FAMILY: Record<FontFamily, "Helvetica" | "TimesRoman" | "Courier"> = {
  Helvetica: "Helvetica",
  TimesRoman: "TimesRoman",
  Courier: "Courier",
};

export function editorPointToPdf(
  pageBox: { x: number; y: number; width: number; height: number },
  x: number,
  yFromTop: number,
  rotation: 0 | 90 | 180 | 270 = 0,
): { x: number; y: number } {
  switch (rotation) {
    case 90:
      return { x: pageBox.x + yFromTop, y: pageBox.y + x };
    case 180:
      return { x: pageBox.x + pageBox.width - x, y: pageBox.y + yFromTop };
    case 270:
      return {
        x: pageBox.x + pageBox.width - yFromTop,
        y: pageBox.y + pageBox.height - x,
      };
    default:
      return {
        x: pageBox.x + x,
        y: pageBox.y + pageBox.height - yFromTop,
      };
  }
}

function normalizedRotation(angle: number): 0 | 90 | 180 | 270 {
  const normalized = ((angle % 360) + 360) % 360;
  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

/**
 * Brennt Bearbeitungselemente dauerhaft in das PDF.
 * Koordinatenkonvention: y misst von oben (wird hier in PDF-Koordinaten umgerechnet).
 */
export async function flattenEditorElements(
  pdfBytes: Uint8Array,
  pages: PageElements,
  onProgress?: (percent: number) => void,
  pageRotations: Record<number, 0 | 180> = {},
): Promise<Uint8Array> {
  const pageIndices = Object.keys(pages)
    .map(Number)
    .filter((index) => (pages[index] ?? []).length > 0);
  const rotatedPageIndices = Object.keys(pageRotations)
    .map(Number)
    .filter((index) => pageRotations[index] === 180);
  if (pageIndices.length === 0 && rotatedPageIndices.length === 0) return pdfBytes;

  const doc = await loadPdfDocument(pdfBytes);
  for (const pageIndex of rotatedPageIndices) {
    const page = doc.getPage(pageIndex);
    const currentRotation = normalizedRotation(page.getRotation().angle);
    page.setRotation(degrees((currentRotation + 180) % 360));
  }
  const fonts = await embedAllFonts(doc);
  const imageCache = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  const allPages = doc.getPages();

  let done = 0;

  for (const pageIndex of pageIndices) {
    const page = allPages[pageIndex];
    if (!page) continue;
    // PDF.js zeigt die CropBox an. Deshalb müssen Editor-Koordinaten beim Export
    // ebenfalls auf diese sichtbare Box bezogen werden. Bei PDFs mit versetzter
    // CropBox würden Elemente sonst um deren Randabstand verschoben ausgegeben.
    const pageBox = page.getCropBox();
    const rotation = normalizedRotation(page.getRotation().angle);
    const pdfPoint = (x: number, y: number) => editorPointToPdf(pageBox, x, y, rotation);

    for (const element of pages[pageIndex]) {
      switch (element.kind) {
        case "text": {
          const family = FONT_OF_FAMILY[element.fontFamily];
          const font = element.bold ? fonts[family].bold : fonts[family].regular;
          const lines = element.text.split("\n");
          lines.forEach((line, lineIndex) => {
            if (!line) return;
            const textWidth = font.widthOfTextAtSize(line, element.fontSize);
            let x = element.x;
            if (element.align === "center") x = element.x + (element.width - textWidth) / 2;
            if (element.align === "right") x = element.x + element.width - textWidth;
            const baseline = pdfPoint(
              x,
              element.y + textBaselineFromTop(element.fontSize, lineIndex),
            );
            page.drawText(line, {
              ...baseline,
              size: element.fontSize,
              font,
              color: rgb(...(Object.values(hexToRgb(element.color)) as [number, number, number])),
              rotate: degrees(rotation),
            });
          });
          break;
        }
        case "image": {
          let embedded = imageCache.get(element.dataUrl);
          if (!embedded) {
            const bytes = decodeDataUrl(element.dataUrl);
            embedded = isPngDataUrl(element.dataUrl)
              ? await doc.embedPng(bytes)
              : await doc.embedJpg(bytes);
            imageCache.set(element.dataUrl, embedded);
          }
          const origin = pdfPoint(element.x, element.y + element.height);
          page.drawImage(embedded, {
            ...origin,
            width: element.width,
            height: element.height,
            rotate: degrees(rotation),
          });
          break;
        }
        case "rect": {
          const fill = element.fillColor ? hexToRgb(element.fillColor) : null;
          const stroke = hexToRgb(element.strokeColor);
          const origin = pdfPoint(element.x, element.y + element.height);
          page.drawRectangle({
            ...origin,
            width: element.width,
            height: element.height,
            color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
            borderColor: rgb(stroke.r, stroke.g, stroke.b),
            borderWidth: element.strokeWidth,
            opacity: element.fillColor ? element.opacity : 0,
            borderOpacity: element.opacity,
            rotate: degrees(rotation),
          });
          break;
        }
        case "highlight": {
          const color = hexToRgb(element.color);
          const origin = pdfPoint(element.x, element.y + element.height);
          page.drawRectangle({
            ...origin,
            width: element.width,
            height: element.height,
            color: rgb(color.r, color.g, color.b),
            opacity: 0.35,
            rotate: degrees(rotation),
          });
          break;
        }
        case "eraser": {
          const origin = pdfPoint(element.x, element.y + element.height);
          page.drawRectangle({
            ...origin,
            width: element.width,
            height: element.height,
            color: rgb(1, 1, 1),
            opacity: 1,
            rotate: degrees(rotation),
          });
          break;
        }
        case "underline":
        case "strike": {
          const color = hexToRgb(element.color);
          const offset = element.kind === "strike" ? element.height : 0;
          const origin = pdfPoint(element.x, element.y + offset + element.height);
          page.drawRectangle({
            ...origin,
            width: element.width,
            height: element.height,
            color: rgb(color.r, color.g, color.b),
            opacity: 0.9,
            rotate: degrees(rotation),
          });
          break;
        }
        case "line": {
          const color = hexToRgb(element.color);
          const start = pdfPoint(element.x, element.y);
          const end = pdfPoint(element.x2, element.y2);
          page.drawLine({
            start,
            end,
            thickness: element.strokeWidth,
            color: rgb(color.r, color.g, color.b),
            lineCap: LineCapStyle.Round,
          });
          if (element.arrow) {
            const angle = Math.atan2(element.y - element.y2, element.x2 - element.x);
            const headLength = Math.max(10, element.strokeWidth * 4);
            for (const spread of [Math.PI / 7, -Math.PI / 7]) {
              page.drawLine({
                start: end,
                end: pdfPoint(
                  element.x2 + headLength * Math.cos(angle + spread),
                  element.y2 - headLength * Math.sin(angle + spread),
                ),
                thickness: element.strokeWidth,
                color: rgb(color.r, color.g, color.b),
                lineCap: LineCapStyle.Round,
              });
            }
          }
          break;
        }
        case "ink": {
          const color = hexToRgb(element.color);
          for (let index = 1; index < element.points.length; index++) {
            const from = element.points[index - 1];
            const to = element.points[index];
            page.drawLine({
              start: pdfPoint(from.x, from.y),
              end: pdfPoint(to.x, to.y),
              thickness: element.strokeWidth,
              color: rgb(color.r, color.g, color.b),
              lineCap: LineCapStyle.Round,
            });
          }
          break;
        }
      }
    }
    done += 1;
    onProgress?.(Math.round((done / pageIndices.length) * 100));
  }

  return saveDocument(doc);
}
