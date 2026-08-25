import Link from "next/link";
import { DonationSection } from "./donation-section";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 py-8 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 sm:px-6">
        <DonationSection />

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
