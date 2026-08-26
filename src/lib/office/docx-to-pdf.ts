type ProgressReporter = (percent: number) => void;

/**
 * Converts a DOCX with a real document-layout engine. Unlike an HTML screenshot,
 * the output has physical pages, selectable text and vector table borders.
 */
export async function docxToPdf(file: File, report: ProgressReporter): Promise<Blob> {
  report(5);
  const { Ream } = await import("reamkit");
  const bytes = new Uint8Array(await file.arrayBuffer());
  report(20);

  const document = Ream.parse(bytes);
  if (document.format !== "docx") {
    throw new Error("Die ausgewählte Datei ist kein gültiges DOCX-Dokument.");
  }

  report(40);
  const pdfBytes = await document.convert("pdf", {
    layoutProfile: "word",
  });

  if (pdfBytes.length === 0) {
    throw new Error("Das Word-Dokument konnte nicht in PDF umgewandelt werden.");
  }

  report(100);
  return new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
}
