# PDFKing 👑

**Sichere PDF-Werkzeuge – standardmäßig vollständig lokal im Browser.**

PDFKing ist eine Open-Source-Web-App zum Bearbeiten, Organisieren, Verkleinern, Unterschreiben und Konvertieren von PDFs. Vertrauliche Dokumente verlassen dein Gerät nicht: Die Verarbeitung läuft direkt im Browser (JavaScript/WebAssembly), ohne Upload, ohne Konto, ohne Tracking.

> **Hinweis:** Das Einfügen einer sichtbaren Unterschrift ist **keine qualifizierte elektronische Signatur (QES)** und ersetzt keine kryptografische Dokumentsignatur.

---

## ✨ Funktionen

### 📝 Bearbeiten

- PDF per Drag-and-drop oder Dateiauswahl öffnen, mehrseitige Vorschau
- Textfelder mit Schriftart, -größe, Farbe, Fett und Ausrichtung
- Bilder & Logos einfügen · Rechtecke, Linien, Pfeile
- Hervorheben, Unterstreichen, Durchstreichen · Freihand zeichnen
- Elemente verschieben, löschen · **Undo/Redo** (Strg+Z / Strg+Y)
- Export „brennt" alle Änderungen dauerhaft ins PDF

### ✍️ Unterschreiben

- Unterschrift zeichnen (Maus/Touch/Stift), als Bild hochladen oder aus dem Namen erzeugen
- Weißer Hintergrund wird automatisch transparent gemacht
- **AES-256-GCM-verschlüsselte Speicherung** im Browser; Schlüsselableitung per PBKDF2 aus deiner Passphrase
- Mehrere Unterschriften verwalten, einzeln oder komplett löschen
- Platzieren per Editor – niemals ohne ausdrückliche Zustimmung auf einem Server

### 🗂️ Organisieren

- Seiten drehen, löschen, duplizieren, neu sortieren (Drag-and-drop + Tastatur)
- Seiten extrahieren, Leerseiten einfügen, mehrere PDFs zusammenfügen
- Aufteilen per Seitenbereichen (`1-3, 5, 8-`) inkl. ZIP-Download
- Zuschneiden (Ränder in mm) und Seitengröße anpassen (A4/Letter)
- Seitenzahlen (Position, Format, Startwert) sowie Kopf-/Fußzeilen mit `{seite}`-Platzhalter
- Wasserzeichen mit Farbe, Deckkraft und Winkel

### 🗜️ Verkleinern

- Drei Stufen: _Leicht_ (verlustfrei) · _Mittel_ (~150 dpi) · _Stark_ (~110 dpi)
- **Echte Größenanzeige vor dem Download** (Original → neu, % Ersparnis)
- Optionale Metadaten-Entfernung und Graustufen-Konvertierung
- Klare Warnung bei qualitätsmindernder Komprimierung; Original bleibt unverändert

### 🔄 Konvertieren

| Richtung                    | Lokal im Browser           | Optionaler Server |
| --------------------------- | -------------------------- | ----------------- |
| PDF → PNG/JPG (ZIP)         | ✅                         | –                 |
| PNG/JPG → PDF               | ✅                         | –                 |
| PDF → Text (.txt)           | ✅                         | –                 |
| PDF → HTML                  | ✅ (vereinfachte Struktur) | –                 |
| PDF → Word (DOCX)           | ✅ (nur Textstruktur)      | ✅ layouttreu     |
| Word/PowerPoint/Excel → PDF | ❌                         | ✅                |

Serverfunktionen sind deaktiviert, solange kein Backend konfiguriert ist, und werden im UI deutlich als „Server erforderlich" markiert. Details: [`server/README.md`](server/README.md).

### 🔒 Sicherheit

- **Metadaten** anzeigen, bearbeiten oder komplett entfernen
- **Verschlüsseln** mit AES-256 (ISO 32000-2) inkl. Berechtigungen (Drucken/Kopieren/Ändern …)
- **Passwort entfernen** nach Eingabe des korrekten Passworts
- **Schwärzen mit Garantie**: Betroffene Seiten werden gerastert, nachdem die Bereiche geschwärzt wurden – der Inhalt ist physisch entfernt, nicht überdeckt
- **Formulare**: AcroForm-Felder erkennen, ausfüllen, optional abflachen

### 🔍 OCR & Extraktion

- Texterkennung für gescannte Dokumente (Deutsch, Englisch, Französisch …) via Tesseract.js/WebAssembly
- Durchsuchbares PDF mit unsichtbarer Textebene erstellen
- Text & eingebettete Bilder extrahieren (Bilder experimentell)

### 🌐 Allgemein

- Installierbare **PWA** mit eingeschränkter Offline-Nutzung
- Dunkelmodus · Responsive Layout (Desktop/Tablet/Smartphone)
- Barrierearme Bedienung (WCAG 2.2 AA angestrebt): vollständige Tastaturbedienung, Fokussichtbarkeit, ARIA-Beschriftungen, Skip-Link, `prefers-reduced-motion`
- Abbrechen-Schaltfläche und Fortschrittsanzeige bei allen längeren Vorgängen
- Verständliche deutsche Fehlermeldungen mit Lösungsvorschlägen

---

## 🔐 Datenschutz & Sicherheit

| Prinzip                    | Umsetzung                                                                    |
| -------------------------- | ---------------------------------------------------------------------------- |
| Lokale Verarbeitung        | Alle grün markierten Werkzeuge laufen 100 % im Browser                       |
| Keine Uploads              | Es existiert schlicht kein Upload-Pfad für diese Funktionen                  |
| Server nur opt-in          | Amber markierte Funktionen benötigen `SERVER_PROCESSING_URL`; Standard = aus |
| Verschlüsselte Übertragung | HTTPS; Proxy setzt Bearer-Token gegenüber dem Backend                        |
| Löschgarantie              | Backend-Tempdateien werden sofort nach Antwort vernichtet                    |
| Kein Logging von Inhalten  | Weder App noch Referenz-Backend protokollieren Dateinamen/-inhalte           |
| Kein Tracking              | Keine Analyse-, Werbe- oder Cookie-Dienste                                   |
| Eingabevalidierung         | Endung + MIME + `%PDF`-Signatur, Größenlimit (client & server)               |
| HTTP-Härtung               | CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy      |
| Keine Geheimnisse im Repo  | `.env.example` dokumentiert alle Variablen; `.env*` ist gitignored           |

Mehr Details: [Datenschutzseite](src/app/datenschutz/page.tsx) in der App sowie [SECURITY.md](SECURITY.md).

---

## 🚀 Schnellstart

**Voraussetzungen:** Node.js ≥ 20, npm

```bash
git clone https://github.com/jorgepnt-design/pdfking.git
cd pdfking
npm install        # installiert Pakete, kopiert den PDF.js-Worker, erzeugt Icons
cp .env.example .env.local   # optional – App läuft auch ohne Konfiguration
npm run dev
```

Öffne http://localhost:3000 – fertig.

Produktions-Build:

```bash
npm run build
npm start
```

### Skripte

| Befehl                        | Beschreibung                |
| ----------------------------- | --------------------------- |
| `npm run dev`                 | Entwicklungsserver          |
| `npm run build` / `npm start` | Produktion bauen / starten  |
| `npm test`                    | Unit-Tests (Vitest)         |
| `npm run lint`                | ESLint                      |
| `npm run typecheck`           | TypeScript (`tsc --noEmit`) |
| `npm run format`              | Prettier formatiert alles   |

---

## 🏗️ Architektur

```
pdfking/
├── src/
│   ├── app/
│   │   ├── page.tsx                  # Startseite mit Werkzeug-Kacheln
│   │   ├── datenschutz/              # Datenschutzerklärung
│   │   ├── api/
│   │   │   ├── status/               # Zeigt, ob ein Server eingerichtet ist
│   │   │   └── convert/[format]/     # Optionaler Proxy (Format-Whitelist, Token)
│   │   └── tools/
│   │       ├── bearbeiten/           # Canvas-Editor (Text/Bild/Formen/Freihand)
│   │       ├── organisieren/         # Sortieren · Zusammenfügen · Aufteilen · Format
│   │       ├── seitenzahlen/         # Nummern + Kopf-/Fußzeilen
│   │       ├── wasserzeichen/
│   │       ├── komprimieren/
│   │       ├── konvertieren/         # Alle Konvertierungen + Statusanzeige
│   │       ├── unterschreiben/       # Verschlüsselte Signaturverwaltung
│   │       ├── sicherheit/           # Metadaten · Encrypt · Unlock · Schwärzen
│   │       ├── formulare/            # AcroForms erkennen & ausfüllen
│   │       └── ocr/                  # Texterkennung + durchsuchbares PDF
│   ├── components/
│   │   ├── ui/                       # Button, Dialog(Radix), Tabs, Slider, Alerts …
│   │   ├── shared/                   # FileDropzone, ToolShell, ProcessingOverlay,
│   │   │                             # ResultCard, PageThumbGrid …
│   │   └── layout/                   # Header, Footer, Service-Worker-Registrierung
│   ├── lib/
│   │   ├── types.ts                  # Zentrale TypeScript-Typen
│   │   ├── utils.ts                  # Ranges, Formatierung, Downloads, Farben
│   │   ├── validate.ts               # Magische Bytes, Größenlimit, Meldungen
│   │   ├── pdf/
│   │   │   ├── pdfjs.ts              # PDF.js-Setup, Rendering, Worker
│   │   │   ├── loadDocument.ts       # Laden, Fehler-Mapping, Metadaten
│   │   │   ├── pages.ts              # Merge/Split/Rotate/Watermark/Crop/Redact …
│   │   │   ├── annotate.ts           # Editor-Elemente dauerhaft einbrennen
│   │   │   ├── compress.ts           # Komprimierungsstufen
│   │   │   ├── convert.ts            # Bilder/TXT/HTML/DOCX, Bildextraktion
│   │   │   ├── security.ts           # AES-Verschlüsselung, Entsperren
│   │   │   ├── forms.ts              # AcroForm-Erkennung & -Füllung
│   │   │   └── ocr.ts                # Tesseract-Integration + Sandwich-Layer
│   │   ├── editor/model.ts           # Elementtypen, HistoryStore (Undo/Redo)
│   │   └── signatures/               # WebCrypto (AES-GCM/PBKDF2), IndexedDB
│   ├── hooks/                        # useProcessing, useTheme, useLoadedPdf
│   └── tools/registry.ts             # Werkzeugkatalog (Kategorien, Badges)
├── public/                           # Manifest, Service Worker, Icons, pdf.worker
├── scripts/                          # postinstall: Worker kopieren, Icons generieren
├── server/README.md                  # Aufbau des optionalen Konvertierungs-Backends
├── tests/                            # Vitest-Suiten (Utils, Editor, Crypto, Validierung)
└── .github/workflows/ci.yml          # Lint · Typecheck · Tests · Build
```

### Architekturprinzipien

1. **UI ≠ Logik** – jede Verarbeitungsfunktion ist ein reiner `(bytes, options) => Promise<bytes>`-Aufruf und damit leicht testbar.
2. **Werkzeugregistry** – neue Tools brauchen nur einen Eintrag in `registry.ts` plus eine Route; Kacheln, Kategorien und Datenschutz-Badges entstehen automatisch.
3. **Wiederverwendbare Arbeitsbereiche** – Dropzone, Fortschritt/Abbruch, Fehler- und Ergebnisdialoge sind geteilte Komponenten.
4. **Speicherschonend** – große Dateien bleiben als `Uint8Array` im Arbeitsspeicher, Rendering erfolgt seitenweise über PDF.js; lange Schleifen geben die UI frei (`yieldToUi`) und sind abbrechbar.
5. **Ehrlichkeit zuerst** – die UI kennzeichnet jederzeit, was lokal läuft und was einen Server bräuchte. Keine vorgetäuschten Offline-Funktionen.

---

## 🧪 Tests & Qualität

```bash
npm test          # Vitest: Range-Parsing, Undo/Redo, AES-Roundtrip, Dateivalidierung …
npm run typecheck # strikte Typprüfung
npm run lint      # ESLint (next/core-web-vitals + typescript)
```

Der GitHub-Actions-Workflow führt Lint, Typprüfung, Tests und Build bei jedem Push/PR aus.

## 📦 Abhängigkeiten (Auswahl)

| Paket             | Lizenz         | Zweck                                                              |
| ----------------- | -------------- | ------------------------------------------------------------------ |
| Next.js, React    | MIT            | Framework                                                          |
| `@cantoo/pdf-lib` | MIT            | Aktive Weiterentwicklung von pdf-lib **inkl. AES-Verschlüsselung** |
| `pdfjs-dist`      | Apache-2.0     | Anzeige, Rendering, Textextraktion (Mozilla)                       |
| `tesseract.js`    | Apache-2.0     | OCR via WebAssembly                                                |
| `docx`            | MIT            | Vereinfachte DOCX-Erzeugung (lokaler Fallback)                     |
| `jszip`           | MIT/GPLv3 dual | ZIP-Downloads (Bildexport, PDF-Aufteilung)                         |
| Radix UI          | MIT            | Barrierearme Primitives (Dialog, Tabs, Slider, Tooltip)            |
| Tailwind CSS      | MIT            | Styling                                                            |
| lucide-react      | ISC            | Icons                                                              |

Alle Abhängigkeiten sind aktiv gepflegt; Lizenzen sind MIT-kompatibel (JSZip dual-lizenziert, wir nutzen die MIT-Seite).

## ⚠️ Bekannte Grenzen

- **PDF→DOCX lokal** liefert nur die Textstruktur (kein Layout/Bilder). Für Layouttreue ist der optionale Server nötig.
- **Starke Komprimierung** rasterisiert Seiten – Text ist danach nicht mehr durchsuchbar (wird im UI gewarnt).
- **Bildextraktion** ist experimentell; nicht jedes Filter-/Farbraum-Kombination wird unterstützt.
- OCR lädt Sprachdaten einmalig aus einem CDN (keine Dokumentinhalte).
- Kryptografische PDF-Signaturen (PAdES) sind nicht implementiert – bewusst, da rechtlich sensibel.

## 🤝 Mitwirken

Beiträge sind willkommen! Siehe [CONTRIBUTING.md](CONTRIBUTING.md) – dort steht auch, wie du in fünf Schritten ein eigenes Werkzeug ergänzt.

## 🔒 Sicherheit gefunden?

Bitte **nicht** als öffentliches Issue melden → [SECURITY.md](SECURITY.md).

## 📄 Lizenz

[MIT](LICENSE) © PDFKing Contributors
