"use client";

import { AlertCircle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AppErrorView {
  code?: string;
  message: string;
  hint?: string;
}

export function ErrorAlert({ error, onDismiss }: { error: AppErrorView; onDismiss?: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
    >
      <AlertCircle aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{error.message}</p>
        {error.hint ? <p className="mt-1 opacity-80">{error.hint}</p> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="rounded p-1 font-medium hover:bg-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-700 dark:hover:bg-red-900/50"
        >
          Schließen
          <span className="sr-only">Fehlermeldung schließen</span>
        </button>
      ) : null}
    </div>
  );
}

export function InfoAlert({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100"
    >
      <Info aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-1", "opacity-90")}>{children}</div>
      </div>
    </div>
  );
}

export function SuccessAlert({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100"
    >
      <CheckCircle2 aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        {children ? <div className="mt-1 opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function WarningAlert({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <ShieldAlert aria-hidden className="mt-0.5 h-5 w-5 shrink-0" />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-1", "opacity-90")}>{children}</div>
      </div>
    </div>
  );
}
