import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { PrivacyMode } from "@/lib/types";
import { PrivacyBadge } from "@/components/ui/privacy-badge";

const PRIVACY_EXPLANATION: Record<PrivacyMode, string> = {
  local:
    "Deine Datei wird ausschließlich lokal in deinem Browser verarbeitet und verlässt dein Gerät nicht.",
  server:
    "Diese Funktion benötigt einen Server. Deine Datei wird dafür hochgeladen – das wird deutlich angezeigt, bevor es passiert.",
  mixed:
    "Die Standardvariante läuft lokal in deinem Browser. Optionale Serverfunktionen sind klar gekennzeichnet und fragen vorher.",
};

export function ToolShell({
  title,
  description,
  privacy,
  children,
  backHref = "/",
}: {
  title: string;
  description: string;
  privacy: PrivacyMode;
  children: ReactNode;
  backHref?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <Link
        href={backHref}
        className="mb-4 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Alle Werkzeuge
      </Link>
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">{description}</p>
        </div>
        <PrivacyBadge mode={privacy} />
      </header>
      <p className="sr-only">{PRIVACY_EXPLANATION[privacy]}</p>
      {children}
    </div>
  );
}
