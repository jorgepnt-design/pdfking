import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-50 py-8 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:text-slate-400">
        <p>
          <strong className="text-slate-800 dark:text-slate-200">PDFKing</strong> – PDF-Werkzeuge
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
    </footer>
  );
}
