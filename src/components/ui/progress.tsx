"use client";

import { cn } from "@/lib/utils";

export function ProgressBar({
  percent,
  indeterminate,
  label,
  className,
}: {
  percent: number | null;
  indeterminate?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(percent ?? 0)}
        aria-label={label ?? "Fortschritt"}
        className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
      >
        <div
          className={cn(
            "h-full rounded-full bg-blue-700 transition-[width] duration-300",
            indeterminate && "w-1/3 animate-pulse",
          )}
          style={
            indeterminate ? undefined : { width: `${Math.min(100, Math.max(0, percent ?? 0))}%` }
          }
        />
      </div>
      {label ? <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">{label}</p> : null}
    </div>
  );
}
