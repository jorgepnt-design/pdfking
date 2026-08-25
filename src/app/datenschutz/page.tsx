import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Datenschutz",
  description:
    "Wie CoroaPDF mit deinen Dokumenten umgeht: lokale Verarbeitung, keine Protokollierung, klare Kennzeichnung von Serverfunktionen.",
};

export default function DatenschutzPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-10 pb-20 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-100 text-green-700 dark:bg-green-900/60 dark:text-green-300">
          <ShieldCheck aria-hidden className="h-6 w-6" />
        </span>
        <h1 className="text-3xl font-bold tracking-tight dark:text-white">
          Datenschutz bei CoroaPDF
        </h1>
      </div>

      <p className="mb-8 text-slate-600 dark:text-slate-400">
        CoroaPDF wurde von Grund auf so gebaut, dass vertrauliche Dokumente dein Gerät möglichst nie
        verlassen. Diese Seite erklärt transparent, was technisch passiert – ohne Kleingedrucktes.
      </p>

      <div className="prose prose-slate dark:prose-invert max-w-none space-y-10">
        <section>
          <h2>1. Lokale Verarbeitung als Standard</h2>
          <p>
            Alle grün gekennzeichneten Werkzeuge (Bearbeiten, Organisieren, Komprimieren,
            Unterschriften, Verschlüsseln, Schwärzen, Formulare und die meisten Konvertierungen)
            laufen <strong>ausschließlich in deinem Browser</strong>. Deine Dateien werden:
          </p>
          <ul>
            <li>nicht hochgeladen</li>
            <li>nicht auf einem Server gespeichert</li>
            <li>nach dem Schließen des Tabs aus dem Arbeitsspeicher entfernt</li>
          </ul>
          <p>
            Technisch basiert die Verarbeitung auf WebAssembly bzw. JavaScript-Bibliotheken, die
            direkt im Browser ausgeführt werden. Du kannst das selbst prüfen: Der Quellcode ist
            vollständig öffentlich (MIT-Lizenz), und die Entwicklerwerkzeuge deines Browsers zeigen,
            dass keine Datei-Uploads stattfinden.
          </p>
        </section>

        <section>
          <h2>2. Serververarbeitung – klar gekennzeichnet</h2>
          <p>
            Einige Funktionen sind im Browser technisch nicht zuverlässig möglich (z.&nbsp;B.
            layoutgetreue DOCX-Konvertierung oder Office-zu-PDF). Diese sind deutlich mit{" "}
            <strong>„Server erforderlich“</strong> markiert und funktionieren nur, wenn der
            Betreiber dieser Instanz einen eigenen Konvertierungsdienst eingerichtet hat.
            Standardmäßig ist das <strong>nicht</strong> der Fall.
          </p>
          <p>Ist ein Serverdienst aktiv, gilt:</p>
          <ul>
            <li>Die Übertragung erfolgt ausschließlich verschlüsselt über HTTPS.</li>
            <li>Hochgeladene Dateien werden unmittelbar nach der Konvertierung gelöscht.</li>
            <li>Dateiinhalte oder -namen werden nicht protokolliert.</li>
            <li>Vor jedem Upload zeigt dir die App an, was passiert.</li>
          </ul>
        </section>

        <section>
          <h2>3. Unterschriften</h2>
          <p>
            Gespeicherte Unterschriften bleiben zu 100 % auf deinem Gerät. Sie werden in einer
            lokalen Browser-Datenbank (IndexedDB) abgelegt und mit AES-256-GCM verschlüsselt. Der
            Schlüssel wird aus deiner persönlichen Passphrase abgeleitet (PBKDF2) und niemals
            gespeichert oder übertragen. Ohne deine Passphrase sind die Daten – auch für den
            Betreiber – nicht lesbar.
          </p>
          <p>
            Hinweis: Das Einfügen einer sichtbaren Unterschrift ist keine qualifizierte
            elektronische Signatur (QES) und ersetzt keine kryptografische Dokumentsignatur.
          </p>
        </section>

        <section>
          <h2>4. Kein Tracking, keine Analyse</h2>
          <p>
            CoroaPDF enthält keine Werbe-, Analyse- oder Trackingdienste. Es werden keine Cookies
            gesetzt und keine Nutzungsprofile erstellt. Serveranfragen gehen ausschließlich an deine
            eigene Instanz (statische App-Dateien).
          </p>
        </section>

        <section>
          <h2>5. OCR-Sprachdaten</h2>
          <p>
            Für die Texterkennung (OCR) lädt dein Browser einmalig Sprachdateien (~10–15 MB) aus
            einem öffentlichen CDN. Dabei werden <strong>keine Dokumentinhalte</strong> übertragen –
            nur die allgemeine Sprachdatei wird heruntergeladen. Die eigentliche Erkennung läuft
            lokal per WebAssembly.
          </p>
        </section>

        <section>
          <h2>6. Deine Kontrolle</h2>
          <ul>
            <li>Gespeicherte Unterschriften kannst du jederzeit einzeln oder komplett löschen.</li>
            <li>Über die Browser-Einstellungen kannst du alle lokalen Daten der App entfernen.</li>
            <li>Die App funktioniert auch offline (nach dem ersten Laden) für lokale Werkzeuge.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
