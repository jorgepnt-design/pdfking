type ProgressReporter = (percent: number) => void;

const OFFICE_FORMATS = {
  docx: "docx",
  pptx: "pptx",
  xlsx: "xlsx",
} as const;

/**
 * Converts an Office Open XML file with a real document-layout engine. The
 * result has physical pages, selectable text and vector shapes/table borders.
 */
export async function officeToPdf(file: File, report: ProgressReporter): Promise<Blob> {
  report(5);
  const { Ream } = await import("reamkit");
  const bytes = new Uint8Array(await file.arrayBuffer());
  report(20);

  const extension = file.name.toLowerCase().split(".").pop();
  const expectedFormat = extension
    ? OFFICE_FORMATS[extension as keyof typeof OFFICE_FORMATS]
    : undefined;
  if (!expectedFormat) {
    throw new Error("Unterstützt werden DOCX-, PPTX- und XLSX-Dateien.");
  }

  const document = Ream.parse(bytes);
  if (document.format !== expectedFormat) {
    throw new Error(
      `Die ausgewählte Datei ist kein gültiges ${expectedFormat.toUpperCase()}-Dokument.`,
    );
  }

  report(40);
  const pdfBytes = await document.convert("pdf", {
    layoutProfile: "word",
  });

  if (pdfBytes.length === 0) {
    throw new Error("Das Office-Dokument konnte nicht in PDF umgewandelt werden.");
  }

  report(100);
  return new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
}
