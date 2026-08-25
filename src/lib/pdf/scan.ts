import { PDFDocument, rgb } from "@cantoo/pdf-lib";
import { saveDocument } from "./loadDocument";

export interface PreparedScanPage {
  bytes: Uint8Array;
  width: number;
  height: number;
}

const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const PAGE_MARGIN = 12;

/** Erstellt aus bereits ausgerichteten JPEG-Aufnahmen ein A4-PDF. */
export async function createScanPdf(
  images: PreparedScanPage[],
  onProgress?: (percent: number) => void,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();

  for (let index = 0; index < images.length; index++) {
    const image = images[index];
    const landscape = image.width > image.height;
    const pageSize: [number, number] = landscape
      ? [A4_PORTRAIT[1], A4_PORTRAIT[0]]
      : A4_PORTRAIT;
    const page = document.addPage(pageSize);
    const embedded = await document.embedJpg(image.bytes);
    const availableWidth = pageSize[0] - PAGE_MARGIN * 2;
    const availableHeight = pageSize[1] - PAGE_MARGIN * 2;
    const scale = Math.min(availableWidth / image.width, availableHeight / image.height);
    const width = image.width * scale;
    const height = image.height * scale;

    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageSize[0],
      height: pageSize[1],
      color: rgb(1, 1, 1),
    });
    page.drawImage(embedded, {
      x: (pageSize[0] - width) / 2,
      y: (pageSize[1] - height) / 2,
      width,
      height,
    });
    onProgress?.(Math.round(((index + 1) / images.length) * 100));
  }

  return saveDocument(document);
}
