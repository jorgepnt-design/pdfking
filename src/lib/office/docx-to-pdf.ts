type ProgressReporter = (percent: number) => void;

const PIXELS_PER_INCH = 96;
const MILLIMETRES_PER_INCH = 25.4;

function pixelsToMillimetres(pixels: number) {
  return (pixels / PIXELS_PER_INCH) * MILLIMETRES_PER_INCH;
}

/**
 * Renders a DOCX with the browser's layout engine and stores every rendered
 * Word page as a high-resolution image in a PDF. This keeps the visible layout
 * and works fully locally, but intentionally produces a non-editable PDF.
 */
export async function docxToPdf(file: File, report: ProgressReporter): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("Die lokale DOCX-Konvertierung ist nur im Browser verfügbar.");
  }

  report(5);
  const [{ renderAsync }, { default: html2canvas }, { jsPDF }] = await Promise.all([
    import("docx-preview"),
    import("html2canvas"),
    import("jspdf"),
  ]);

  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  Object.assign(container.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: "fit-content",
    minWidth: "1px",
    background: "#ffffff",
    pointerEvents: "none",
    zIndex: "-1",
  });
  document.body.appendChild(container);

  try {
    const bytes = await file.arrayBuffer();
    await renderAsync(bytes, container, container, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      useBase64URL: true,
    });
    report(25);

    if (document.fonts?.ready) await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const pages = Array.from(container.querySelectorAll<HTMLElement>("section.docx"));
    if (pages.length === 0) {
      throw new Error("Das Word-Dokument konnte nicht als Seiten dargestellt werden.");
    }

    let pdf: InstanceType<typeof jsPDF> | null = null;

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const bounds = page.getBoundingClientRect();
      const widthPx = Math.max(1, bounds.width || page.scrollWidth);
      const heightPx = Math.max(1, bounds.height || page.scrollHeight);
      const widthMm = pixelsToMillimetres(widthPx);
      const heightMm = pixelsToMillimetres(heightPx);
      const orientation = widthMm > heightMm ? "landscape" : "portrait";

      const canvas = await html2canvas(page, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        logging: false,
        width: Math.ceil(widthPx),
        height: Math.ceil(heightPx),
        windowWidth: Math.ceil(widthPx),
        windowHeight: Math.ceil(heightPx),
      });

      if (!pdf) {
        pdf = new jsPDF({ orientation, unit: "mm", format: [widthMm, heightMm], compress: true });
      } else {
        pdf.addPage([widthMm, heightMm], orientation);
      }

      pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, widthMm, heightMm);
      report(25 + Math.round(((index + 1) / pages.length) * 70));
    }

    if (!pdf) throw new Error("Das Word-Dokument enthält keine konvertierbaren Seiten.");
    report(100);
    return pdf.output("blob");
  } finally {
    container.remove();
  }
}
