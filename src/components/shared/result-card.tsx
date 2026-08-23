"use client";

import { Download, FileDown } from "lucide-react";
import type { ReactNode } from "react";
import { SuccessAlert } from "@/components/ui/alerts";
import { downloadBytes, formatBytes, percentSaved } from "@/lib/utils";

export type DownloadData = Blob | Uint8Array;

export function DownloadButton({
  data,
  filename,
  mime = "application/pdf",
  variant = "primary",
  children,
}: {
  data: DownloadData;
  filename: string;
  mime?: string;
  variant?: "primary" | "secondary";
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => downloadBytes(data, filename, mime)}
      className={
        variant === "primary"
          ? "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700"
          : "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
      }
    >
      {variant === "primary" ? (
        <Download aria-hidden className="h-4 w-4" />
      ) : (
        <FileDown aria-hidden className="h-4 w-4" />
      )}
      {children ?? `„${filename}" herunterladen`}
    </button>
  );
}

export function ResultCard({
  title,
  filename,
  data,
  mime,
  originalSize,
  note,
  children,
}: {
  title: string;
  filename: string;
  data: DownloadData;
  mime?: string;
  originalSize?: number;
  note?: ReactNode;
  children?: ReactNode;
}) {
  const blob = data instanceof Blob ? data : null;
  const newSize = blob ? blob.size : (data as Uint8Array).byteLength;
  const saved = originalSize ? percentSaved(originalSize, newSize) : null;

  return (
    <SuccessAlert title={title}>
      <div className="mt-2 flex flex-col items-start gap-3">
        {originalSize ? (
          <p className="text-sm">
            Größe: <strong>{formatBytes(originalSize)}</strong> →{" "}
            <strong>{formatBytes(newSize)}</strong>
            {saved !== null
              ? ` · ${saved} % kleiner`
              : newSize > originalSize
                ? " · etwas größer geworden"
                : ""}
          </p>
        ) : null}
        <DownloadButton data={data} filename={filename} mime={mime} />
        {note}
        {children}
      </div>
    </SuccessAlert>
  );
}
