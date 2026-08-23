import { CloudOff, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PrivacyMode } from "@/lib/types";

export function PrivacyBadge({ mode, className }: { mode: PrivacyMode; className?: string }) {
  if (mode === "server") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
          className,
        )}
      >
        <CloudOff aria-hidden className="h-3.5 w-3.5" />
        Server erforderlich
      </span>
    );
  }
  if (mode === "mixed") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-900 dark:bg-sky-900/50 dark:text-sky-100",
          className,
        )}
      >
        <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
        Lokal + optional Server
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-900 dark:bg-green-900/50 dark:text-green-100",
        className,
      )}
    >
      <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
      100 % lokal im Browser
    </span>
  );
}
