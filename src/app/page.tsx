import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { CATEGORY_LABELS, toolsByCategory } from "@/tools/registry";
import { InfoAlert } from "@/components/ui/alerts";

export default function HomePage() {
  const groups = toolsByCategory();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6">
      <section className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
          Alle PDF-Werkzeuge.{" "}
          <span className="text-blue-700 dark:text-blue-400">Lokal im Browser.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600 dark:text-slate-400">
          Lesen, bearbeiten, organisieren, komprimieren, unterschreiben und konvertieren – ohne
          dass deine Dokumente dein Gerät verlassen. Kostenlos, offen und ohne Anmeldung.
        </p>
      </section>

      <section aria-label="Datenschutzhinweis" className="mb-10 flex justify-center">
        <InfoAlert title="Deine Dateien bleiben bei dir">
          Die Standardverarbeitung erfolgt ausschließlich in deinem Browser. Funktionen, die
          ausnahmsweise einen Server benötigen, sind deutlich mit „Server erforderlich“
          gekennzeichnet – und fragen vorher.
        </InfoAlert>
      </section>

      {groups.map((group) => (
        <section
          key={group.category}
          className="mb-12"
          aria-labelledby={`kategorie-${group.category}`}
        >
          <h2
            id={`kategorie-${group.category}`}
            className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white"
          >
            {group.category === "sicherheit" ? (
              <ShieldCheck aria-hidden className="h-5 w-5 text-green-600" />
            ) : null}
            {CATEGORY_LABELS[group.category]}
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.tools.map((tool) => (
              <li key={tool.id}>
                <Link
                  href={tool.href}
                  className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
                >
                  <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-700 transition-colors group-hover:bg-blue-700 group-hover:text-white dark:bg-blue-950 dark:text-blue-300">
                    <tool.icon aria-hidden className="h-5.5 w-5.5" />
                  </span>
                  <span className="font-semibold text-slate-900 group-hover:text-blue-800 dark:text-white dark:group-hover:text-blue-300">
                    {tool.title}
                  </span>
                  <span className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                    {tool.description}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
