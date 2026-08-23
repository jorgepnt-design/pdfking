import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED_FORMATS = new Set(["pdf-docx-hq", "docx-pdf", "pptx-pdf", "xlsx-pdf"]);
const MAX_UPLOAD_BYTES = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 100) * 1024 * 1024;

/**
 * Optionaler Proxy zu einem externen Konvertierungsdienst.
 *
 * Ohne konfigurierte SERVER_PROCESSING_URL antwortet diese Route mit 501 –
 * die App zeigt dann klar an, dass die Funktion einen Server benötigt.
 *
 * Sicherheitsmaßnahmen:
 * - Format-Whitelist und Größenlimit
 * - Bearer-Token gegenüber dem Backend (SERVER_PROCESSING_TOKEN)
 * - Keine Protokollierung von Dateiinhalten oder Dateinamen
 */
export async function POST(request: Request, context: { params: Promise<{ format: string }> }) {
  const { format } = await context.params;

  if (!ALLOWED_FORMATS.has(format)) {
    return NextResponse.json({ error: "Unbekanntes Konvertierungsformat." }, { status: 400 });
  }

  const backendUrl = process.env.SERVER_PROCESSING_URL;
  if (!backendUrl) {
    return NextResponse.json(
      {
        error:
          "Serververarbeitung ist auf dieser Instanz nicht eingerichtet. Alle lokalen Werkzeuge funktionieren uneingeschränkt.",
      },
      { status: 501 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Keine Datei übermittelt." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Datei überschreitet das Upload-Limit." }, { status: 413 });
  }

  const forward = new FormData();
  forward.append("file", file, file.name);

  try {
    const upstream = await fetch(`${backendUrl.replace(/\/$/, "")}/convert/${format}`, {
      method: "POST",
      body: forward,
      headers: process.env.SERVER_PROCESSING_TOKEN
        ? { Authorization: `Bearer ${process.env.SERVER_PROCESSING_TOKEN}` }
        : undefined,
    });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: "Der Konvertierungsdienst hat einen Fehler gemeldet." },
        { status: 502 },
      );
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Konvertierungsdienst nicht erreichbar." }, { status: 502 });
  }
}
