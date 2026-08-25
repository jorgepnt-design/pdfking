import { Coffee, ExternalLink, Heart } from "lucide-react";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 py-8 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 sm:px-6">
        <section
          aria-labelledby="support-coroapdf"
          className="flex flex-col gap-4 rounded-xl border border-green-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between dark:border-green-900 dark:bg-slate-900"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300">
              <Coffee aria-hidden className="h-5 w-5" />
            </span>
            <div>
              <h2 id="support-coroapdf" className="font-semibold text-slate-900 dark:text-white">
                CoroaPDF gefällt dir?
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                Die App bleibt kostenlos. Wenn sie dir hilft, kannst du meine Arbeit freiwillig mit
                einem kleinen Kaffee unterstützen.
              </p>
            </div>
          </div>
          <a
            href="https://paypal.me/jorgepnt"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg bg-green-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
          >
            <Heart aria-hidden className="h-4 w-4 fill-red-500 text-red-500" />
            Kaffee spendieren
            <ExternalLink aria-hidden className="h-3.5 w-3.5" />
          </a>
        </section>

        <div className="flex flex-col gap-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between dark:text-slate-400">
          <p>
            <strong className="text-slate-800 dark:text-slate-200">CoroaPDF</strong> – PDF-Werkzeuge
            mit lokaler Verarbeitung. Deine Dokumente verlassen standardmäßig dein Gerät nicht.
          </p>
          <nav aria-label="Fußzeile" className="flex gap-4">
            <Link
              href="/datenschutz"
              className="hover:text-slate-900 hover:underline dark:hover:text-white"
            >
              Datenschutz
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
