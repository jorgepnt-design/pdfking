import { LineCapStyle, PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib";
import type { FontFamily, PageElements } from "../types";
import { hexToRgb } from "../utils";
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

/**
 * Brennt Bearbeitungselemente dauerhaft in das PDF.
 * Koordinatenkonvention: y misst von oben (wird hier in PDF-Koordinaten umgerechnet).
 */
export async function flattenEditorElements(
  pdfBytes: Uint8Array,
  pages: PageElements,
  onProgress?: (percent: number) => void,
): Promise<Uint8Array> {
  const pageIndices = Object.keys(pages)
    .map(Number)
    .filter((index) => (pages[index] ?? []).length > 0);
  if (pageIndices.length === 0) return pdfBytes;

  const doc = await loadPdfDocument(pdfBytes);
  const fonts = await embedAllFonts(doc);
  const imageCache = new Map<string, Awaited<ReturnType<PDFDocument["embedPng"]>>>();
  const allPages = doc.getPages();

  let done = 0;

  for (const pageIndex of pageIndices) {
    const page = allPages[pageIndex];
    if (!page) continue;
    const { height: pageHeight } = page.getSize();

    for (const element of pages[pageIndex]) {
      switch (element.kind) {
        case "text": {
          const family = FONT_OF_FAMILY[element.fontFamily];
          const font = element.bold ? fonts[family].bold : fonts[family].regular;
          const lineHeight = element.fontSize * 1.25;
          const lines = element.text.split("\n");
          lines.forEach((line, lineIndex) => {
            if (!line) return;
            const textWidth = font.widthOfTextAtSize(line, element.fontSize);
            let x = element.x;
            if (element.align === "center") x = element.x + (element.width - textWidth) / 2;
            if (element.align === "right") x = element.x + element.width - textWidth;
            const baselineY = pageHeight - element.y - element.fontSize - lineIndex * lineHeight;
            page.drawText(line, {
              x,
              y: baselineY,
              size: element.fontSize,
              font,
              color: rgb(...(Object.values(hexToRgb(element.color)) as [number, number, number])),
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
          page.drawImage(embedded, {
            x: element.x,
            y: pageHeight - element.y - element.height,
            width: element.width,
            height: element.height,
          });
          break;
        }
        case "rect": {
          const fill = element.fillColor ? hexToRgb(element.fillColor) : null;
          const stroke = hexToRgb(element.strokeColor);
          page.drawRectangle({
            x: element.x,
            y: pageHeight - element.y - element.height,
            width: element.width,
            height: element.height,
            color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
            borderColor: rgb(stroke.r, stroke.g, stroke.b),
            borderWidth: element.strokeWidth,
            opacity: element.fillColor ? element.opacity : 0,
            borderOpacity: element.opacity,
          });
          break;
        }
        case "highlight": {
          const color = hexToRgb(element.color);
          page.drawRectangle({
            x: element.x,
            y: pageHeight - element.y - element.height,
            width: element.width,
            height: element.height,
            color: rgb(color.r, color.g, color.b),
            opacity: 0.35,
          });
          break;
        }
        case "underline":
        case "strike": {
          const color = hexToRgb(element.color);
          const offset = element.kind === "strike" ? element.height : 0;
          page.drawRectangle({
            x: element.x,
            y: pageHeight - element.y - offset - element.height,
            width: element.width,
            height: element.height,
            color: rgb(color.r, color.g, color.b),
            opacity: 0.9,
          });
          break;
        }
        case "line": {
          const color = hexToRgb(element.color);
          page.drawLine({
            start: { x: element.x, y: pageHeight - element.y },
            end: { x: element.x2, y: pageHeight - element.y2 },
            thickness: element.strokeWidth,
            color: rgb(color.r, color.g, color.b),
            lineCap: LineCapStyle.Round,
          });
          if (element.arrow) {
            const angle = Math.atan2(element.y - element.y2, element.x2 - element.x);
            const headLength = Math.max(10, element.strokeWidth * 4);
            for (const spread of [Math.PI / 7, -Math.PI / 7]) {
              page.drawLine({
                start: { x: element.x2, y: pageHeight - element.y2 },
                end: {
                  x: element.x2 + headLength * Math.cos(angle + spread),
                  y: pageHeight - element.y2 + headLength * Math.sin(angle + spread),
                },
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
              start: { x: from.x, y: pageHeight - from.y },
              end: { x: to.x, y: pageHeight - to.y },
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
