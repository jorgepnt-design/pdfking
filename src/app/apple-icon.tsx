import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/**
 * Eigenständiges Apple-Touch-Icon: Next.js liefert direkt ein PNG aus.
 * Damit ist die Darstellung nicht von den beim postinstall generierten
 * Dateien im öffentlichen Verzeichnis abhängig.
 */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 1024 1024">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#119957" />
            <stop offset="1" stopColor="#07532e" />
          </linearGradient>
          <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffdf82" />
            <stop offset="1" stopColor="#f0a500" />
          </linearGradient>
        </defs>
        <rect width="1024" height="1024" fill="url(#bg)" />
        <path d="M670 480A215 215 0 1 0 670 720" fill="none" stroke="white" strokeWidth="120" strokeLinecap="round" />
        <path d="M300 340 280 170 410 250 512 120 614 250 744 170 724 340Z" fill="url(#gold)" stroke="#a86f00" strokeWidth="10" strokeLinejoin="round" />
        <rect x="300" y="330" width="424" height="40" rx="14" fill="url(#gold)" stroke="#a86f00" strokeWidth="10" />
        <circle cx="512" cy="230" r="30" fill="#e52535" />
        <circle cx="400" cy="300" r="18" fill="white" />
        <circle cx="624" cy="300" r="18" fill="white" />
      </svg>
    ),
    size,
  );
}
