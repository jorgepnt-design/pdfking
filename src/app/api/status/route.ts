import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Informiert die App, ob ein optionaler Verarbeitungsserver eingerichtet ist.
 * Enthält keine personenbezogenen Daten und protokolliert nichts.
 */
export async function GET() {
  return NextResponse.json(
    { enabled: Boolean(process.env.SERVER_PROCESSING_URL) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
