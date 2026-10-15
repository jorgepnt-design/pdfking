import AppleIcon from "../apple-icon";

/**
 * iOS Safari bevorzugt für „Zum Home-Bildschirm“ eine eindeutige PNG-URL.
 * Liefert dasselbe echte Kronen-PNG wie /apple-icon, aber mit .png-Endung.
 */
export const dynamic = "force-static";

export function GET() {
  return AppleIcon();
}
