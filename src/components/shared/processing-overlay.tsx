"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress";
import type { ProgressState } from "@/lib/types";

export function ProcessingOverlay({
  state,
  onCancel,
}: {
  state: ProgressState;
  onCancel?: () => void;
}) {
  if (!state.active) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-3">
          <Loader2 aria-hidden className="h-5 w-5 animate-spin text-blue-700 dark:text-blue-400" />
          <p className="font-semibold text-slate-900 dark:text-white">{state.label}</p>
        </div>
        {state.percent === null ? (
          <ProgressBar percent={null} indeterminate label="Bitte warten …" />
        ) : (
          <ProgressBar percent={state.percent} label={`${Math.round(state.percent)} %`} />
        )}
        {onCancel ? (
          <Button variant="secondary" className="mt-4 w-full" onClick={onCancel}>
            Abbrechen
          </Button>
        ) : null}
      </div>
    </div>
  );
}
