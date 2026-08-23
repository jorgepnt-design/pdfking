import { describe, expect, it } from "vitest";
import { isPdfBuffer, validatePdfFiles, MAX_UPLOAD_MB } from "../src/lib/validate";

function fakeFile(name: string, content: string | Uint8Array, type = "application/pdf"): File {
  const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
  const file = new File([bytes as BlobPart], name, { type });
  return file;
}

describe("isPdfBuffer", () => {
  it("erkennt PDF-Magische Bytes", () => {
    expect(isPdfBuffer(new TextEncoder().encode("%PDF-1.7 rest"))).toBe(true);
  });

  it("erkennt Header mit führendem Müll (innerhalb 1 KB)", () => {
    const junk = new Uint8Array(200).fill(0);
    const header = new TextEncoder().encode("%PDF-1.4");
    const combined = new Uint8Array(junk.length + header.length);
    combined.set(junk);
    combined.set(header, junk.length);
    expect(isPdfBuffer(combined)).toBe(true);
  });

  it("lehnt andere Formate ab", () => {
    expect(isPdfBuffer(new TextEncoder().encode("PK\x03\x04 zip data"))).toBe(false);
    expect(isPdfBuffer(new TextEncoder().encode("<html></html>"))).toBe(false);
  });
});

describe("validatePdfFiles", () => {
  it("akzeptiert gültige PDFs", async () => {
    const result = await validatePdfFiles([fakeFile("test.pdf", "%PDF-1.7 ...")]);
    expect(result.accepted).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });

  it("lehnt falsche Endungen ab", async () => {
    const result = await validatePdfFiles([fakeFile("bild.png", "%PDF-1.7", "image/png")]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].code).toBe("INVALID_TYPE");
  });

  it("lehnt gefälschte PDFs ohne Magische Bytes ab", async () => {
    const result = await validatePdfFiles([fakeFile("fake.pdf", "kein pdf")]);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0].code).toBe("CORRUPT_PDF");
  });

  it("lehnt zu große Dateien ab", async () => {
    const big = new File([new ArrayBuffer(1024)], "riesig.pdf", { type: "application/pdf" });
    Object.defineProperty(big, "size", { value: (MAX_UPLOAD_MB + 1) * 1024 * 1024 });
    const result = await validatePdfFiles([big]);
    expect(result.rejected[0].code).toBe("TOO_LARGE");
  });

  it("prüft mehrere Dateien unabhängig", async () => {
    const good = fakeFile("gut.pdf", "%PDF-1.5 x");
    const bad = fakeFile("schlecht.pdf", "nope");
    const result = await validatePdfFiles([good, bad]);
    expect(result.accepted).toEqual([good]);
    expect(result.rejected).toHaveLength(1);
  });
});
