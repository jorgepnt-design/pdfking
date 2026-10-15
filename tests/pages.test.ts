import { afterEach, describe, expect, it, vi } from "vitest";
import { degrees, PDFDocument } from "@cantoo/pdf-lib";
import { buildMultiSourcePdf, redactPages } from "../src/lib/pdf/pages";

// Kleinstmögliches gültiges 2×2-JPEG (schwarz).
const TINY_JPEG_BASE64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD5/ooooA//2Q==";

function tinyJpeg(): Uint8Array {
  return Uint8Array.from(atob(TINY_JPEG_BASE64), (char) => char.charCodeAt(0));
}

/** JPEG mit großem Kommentarsegment – simuliert eine gemeinsam genutzte, große Ressource. */
function largeJpeg(commentBytes = 60_000): Uint8Array {
  const jpeg = tinyJpeg();
  const length = commentBytes + 2;
  const comment = new Uint8Array(4 + commentBytes);
  comment.set([0xff, 0xfe, (length >> 8) & 0xff, length & 0xff]);
  const result = new Uint8Array(jpeg.length + comment.length);
  result.set(jpeg.subarray(0, 2));
  result.set(comment, 2);
  result.set(jpeg.subarray(2), 2 + comment.length);
  return result;
}

async function makePdf(sizes: Array<[number, number]>, rotations: number[] = []) {
  const doc = await PDFDocument.create();
  sizes.forEach((size, index) => {
    const page = doc.addPage(size);
    if (rotations[index]) page.setRotation(degrees(rotations[index]));
  });
  return doc.save();
}

describe("buildMultiSourcePdf", () => {
  it("dreht relativ zur ursprünglichen /Rotate-Angabe", async () => {
    const bytes = await makePdf(
      [
        [300, 400],
        [300, 400],
      ],
      [90, 0],
    );
    const output = await buildMultiSourcePdf(new Map([["a", bytes]]), [
      { docId: "a", pageIndex: 0, rotation: 0 },
      { docId: "a", pageIndex: 0, rotation: 90 },
      { docId: "a", pageIndex: 1, rotation: 270 },
    ]);
    const result = await PDFDocument.load(output);
    expect(result.getPages().map((page) => page.getRotation().angle)).toEqual([90, 180, 270]);
  });

  it("behält die Reihenfolge über mehrere Quelldokumente bei", async () => {
    const first = await makePdf([
      [100, 100],
      [200, 200],
    ]);
    const second = await makePdf([[300, 300]]);
    const output = await buildMultiSourcePdf(
      new Map([
        ["a", first],
        ["b", second],
      ]),
      [
        { docId: "a", pageIndex: 1, rotation: 0 },
        { docId: "b", pageIndex: 0, rotation: 0 },
        { docId: "a", pageIndex: 0, rotation: 0 },
      ],
    );
    const result = await PDFDocument.load(output);
    expect(result.getPages().map((page) => page.getWidth())).toEqual([200, 300, 100]);
  });

  it("bettet gemeinsam genutzte Ressourcen nur einmal ein", async () => {
    const doc = await PDFDocument.create();
    const image = await doc.embedJpg(largeJpeg());
    for (let index = 0; index < 10; index++) {
      doc.addPage([200, 200]).drawImage(image, { x: 0, y: 0, width: 50, height: 50 });
    }
    const source = await doc.save();
    const output = await buildMultiSourcePdf(
      new Map([["a", source]]),
      Array.from({ length: 10 }, (_, pageIndex) => ({ docId: "a", pageIndex, rotation: 0 })),
    );
    // Bei seitenweisem Kopieren wäre das Bild zehnmal enthalten (> 600 KB).
    expect(output.byteLength).toBeLessThan(source.byteLength * 1.5);
  });
});

describe("redactPages", () => {
  afterEach(() => vi.restoreAllMocks());

  it("übernimmt nicht geschwärzte Seiten in unveränderter Reihenfolge", async () => {
    const sizes: Array<[number, number]> = [
      [100, 150],
      [200, 250],
      [300, 350],
    ];
    const source = await makePdf(sizes);

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      if (tag !== "canvas") return originalCreateElement(tag);
      return {
        width: 0,
        height: 0,
        getContext: () => ({ fillRect: () => undefined, fillStyle: "" }),
        toBlob: (callback: (blob: Blob) => void) =>
          callback(new Blob([tinyJpeg() as unknown as BlobPart], { type: "image/jpeg" })),
      };
    }) as typeof document.createElement);

    const jsDoc = {
      numPages: sizes.length,
      getPage: async (pageNumber: number) => {
        const [width, height] = sizes[pageNumber - 1];
        return {
          getViewport: ({ scale }: { scale: number }) => ({
            width: width * scale,
            height: height * scale,
          }),
          render: () => ({ promise: Promise.resolve() }),
          cleanup: () => undefined,
        };
      },
    } as unknown as import("pdfjs-dist").PDFDocumentProxy;

    const output = await redactPages(
      source,
      jsDoc,
      { 1: [{ x: 10, y: 10, width: 20, height: 20 }] },
      400,
    );
    const result = await PDFDocument.load(output);
    expect(result.getPageCount()).toBe(3);
    expect(result.getPages().map((page) => page.getWidth())).toEqual([100, 200, 300]);
  });
});
