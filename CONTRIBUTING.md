# Mitwirken an CoroaPDF

Danke für dein Interesse! Dieses Projekt lebt von Beiträgen. Diese Datei erklärt dir, wie du effizient beitragen kannst.

## Verhaltenskodex

Sei respektvoll und konstruktiv. Wir erwarten einen freundlichen, sachlichen Umgangston in Issues und Pull Requests.

## Entwicklung einrichten

```bash
git clone https://github.com/jorgepnt-design/pdfking.git
cd pdfking
npm install
npm run dev
```

Die App läuft dann unter http://localhost:3000.

### Nützliche Befehle

| Befehl              | Beschreibung                       |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Entwicklungsserver starten         |
| `npm run build`     | Produktions-Build erstellen        |
| `npm run lint`      | ESLint prüfen                      |
| `npm run typecheck` | TypeScript prüfen (`tsc --noEmit`) |
| `npm test`          | Unit-Tests ausführen (Vitest)      |
| `npm run format`    | Prettier auf alle Dateien anwenden |

## Vor jedem Pull Request

1. **Tests ausführen:** `npm test`
2. **Typprüfung:** `npm run typecheck`
3. **Linting:** `npm run lint`
4. **Build prüfen:** `npm run build`

Der CI-Workflow führt alle vier Schritte automatisch aus – PRs müssen grün sein.

## Neues Werkzeug hinzufügen

CoroaPDF ist modular aufgebaut. So ergänzt du ein eigenes PDF-Werkzeug:

1. **Logik** (`src/lib/pdf/`): Implementiere die reine Verarbeitungsfunktion mit `@cantoo/pdf-lib` oder PDF.js. Nutze das Muster `(bytes: Uint8Array, options) => Promise<Uint8Array>`. Kein UI-Code hier!
2. **Registrierung** (`src/tools/registry.ts`): Füge eine `ToolDefinition` hinzu (Titel, Beschreibung, Kategorie, Route, Icon, Datenschutz-Einstufung).
3. **Seite** (`src/app/tools/<name>/page.tsx`): Baue die Oberfläche mit den wiederverwendbaren Komponenten:
   - `ToolShell` (Kopf mit Datenschutzbadge)
   - `FileDropzone` (validierter Upload)
   - `useProcessing` + `ProcessingOverlay` (Fortschritt & Abbruch)
   - `ErrorAlert` / `ResultCard` (Ergebnis & Download)
4. **Test**: Schreibe mindestens einen Unit-Test für die Logik unter `tests/`.
5. **Dokumentation**: Ergänze das Werkzeug in der Funktionsliste des README.

## Konventionen

- **Sprache:** Benutzeroberfläche und Dokumentation auf Deutsch; Code (Variablen/Kommentare) auf Englisch.
- **Commits:** Conventional Commits, z. B. `feat(werkzeug): wasserzeichen drehung hinzugefügt`, `fix(editor: …)`.
- **Stil:** Prettier regelt die Formatierung (`npm run format`). Keine manuellen Debatten nötig.
- **Sicherheit:** Niemals Geheimnisse committen. Neue Abhängigkeiten bitte begründen (aktiv gepflegt? Lizenz kompatibel?).
- **Datenschutz:** Neue Funktionen sind standardmäßig lokal zu implementieren. Serverabhängigkeiten müssen im UI klar gekennzeichnet werden (`privacy: "server"`) und über `/api/convert/[format]` laufen.

## Fehler melden

Öffne ein Issue mit:

- Kurzer Beschreibung + Schritte zum Nachstellen
- Erwartetes vs. tatsächliches Verhalten
- Browser/Betriebssystem
- Konsolenfehler (falls vorhanden) – **ohne Dokumentinhalte!**
