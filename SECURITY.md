# Sicherheitsrichtlinie

## Unterstützte Versionen

| Version | Support  |
| ------- | -------- |
| main    | ✅ aktiv |

Wir pflegen ausschließlich den `main`-Zweig. Bitte aktualisiere vor dem Melden eines Problems auf den aktuellen Stand.

## Einen Schwachstelle melden

**Bitte keine Sicherheitsprobleme als öffentliches Issue melden!**

1. Nutze GitHub → _Security_ → _Report a vulnerability_ (Private Vulnerability Reporting), oder
2. kontaktiere den Repository-Betreiber über das Profil [jorgepnt-design](https://github.com/jorgepnt-design).

Bitte gib an:

- Beschreibung des Problems und potenzielle Auswirkung
- Schritte zur Reproduktion (PoC-Code gern gesehen)
- Betroffene Dateien/Zeilen, falls bekannt

Wir antworten in der Regel innerhalb von **72 Stunden** und halten dich über den Fix Fortschritt auf dem Laufenden. Koordinierte Veröffentlichung nach dem Fix ist uns wichtig.

## Sicherheitsarchitektur (Überblick)

### Lokale Verarbeitung

Alle grün gekennzeichneten Werkzeuge verarbeiten Dokumente ausschließlich im Browser (JavaScript/WebAssembly). Dateiinhalte verlassen das Gerät nicht; es existiert kein Upload-Pfad dafür.

### Verschlüsselung der Unterschriftenspeicherung

Gespeicherte Unterschriften liegen AES-256-GCM-verschlüsselt in IndexedDB. Der Schlüssel wird per PBKDF2 (SHA-256, 250 000 Iterationen) aus einer Benutzter-Passphrase abgeleitet, die nie persistiert wird.

### Serververarbeitung (optional)

Nur für DOCX/PPTX/XLSX-Konvertierung und layouttreues PDF→DOCX:

- Deaktiviert, solange `SERVER_PROCESSING_URL` nicht gesetzt ist (`/api/status` antwortet mit `enabled: false`).
- Proxy erzwingt Format-Whitelist und Größenlimit; Authentifizierung gegenüber dem Backend per Bearer-Token (`SERVER_PROCESSING_TOKEN`, nur serverseitig gelesen).
- Keine Protokollierung von Dateinamen oder Inhalten.

### HTTP-Härtung (next.config.mjs)

- Content-Security-Policy (`default-src 'self'`; CDN-Ausnahmen nur für OCR-Sprachdaten)
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy` ohne Kamera/Mikrofon/Standort

### Eingabevalidierung

- Prüfung von Dateiendung, MIME-Typ **und** PDF-Magischen Bytes (`%PDF-` innerhalb der ersten 1024 Byte)
- Konfigurierbares Upload-Limit (`NEXT_PUBLIC_MAX_UPLOAD_MB`, client- und serverseitig)
- Fehlerhafte/verschluesselte Dateien führen zu verständlichen deutschen Fehlermeldungen statt Stack Traces

## Bekannte Grenzen

- Die CSP erlaubt `'unsafe-inline'` für Skripte (Next.js-Bootstrap). Ein Nonce-basiertes Setup ist willkommen (siehe CONTRIBUTING).
- PDF-Passwort-Entfernung setzt das korrekte Passwort voraus – es handelt sich um eine Nutzerfunktion, keinen Angriff.
- Die Sicht-Unterschrift ist keine qualifizierte elektronische Signatur (QES); kryptografische Signaturen sind bewusst NICHT implementiert.

## Versionshinweise zu Abhängigkeiten

Nach jeder Dependency-Änderung: `npm audit` ausführen und Lizenzen prüfen (alle aktuellen Abhängigkeiten sind MIT bzw. Apache-2.0).
