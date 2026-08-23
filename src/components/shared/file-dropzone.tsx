"use client";

import { FileUp, ImageIcon } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";
import { cn } from "@/lib/utils";

export interface FileDropzoneProps {
  onFiles: (files: File[]) => void;
  accept?: "pdf" | "images" | "office";
  multiple?: boolean;
  disabled?: boolean;
  compact?: boolean;
}

const ACCEPT_MAP: Record<NonNullable<FileDropzoneProps["accept"]>, string> = {
  pdf: ".pdf,application/pdf",
  images: "image/png,image/jpeg,.png,.jpg,.jpeg",
  office: ".docx,.pptx,.xlsx",
};

const HINTS: Record<NonNullable<FileDropzoneProps["accept"]>, string> = {
  pdf: "PDF",
  images: "PNG, JPG",
  office: "DOCX, PPTX, XLSX",
};

export function FileDropzone({
  onFiles,
  accept = "pdf",
  multiple = false,
  disabled,
  compact,
}: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOver, setIsOver] = useState(false);

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    if (multiple) onFiles(files);
    else onFiles([files[0]]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    setIsOver(false);
    handleFiles(event.dataTransfer.files);
  };

  const Icon = accept === "images" ? ImageIcon : FileUp;

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setIsOver(true);
      }}
      onDragLeave={() => setIsOver(false)}
      onDrop={handleDrop}
      className={cn(
        "relative rounded-xl border-2 border-dashed transition-colors",
        isOver
          ? "border-blue-700 bg-blue-50 dark:bg-blue-950/40"
          : "border-slate-300 bg-slate-50 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-900/50",
        disabled && "pointer-events-none opacity-50",
        compact ? "p-5" : "p-8 sm:p-10",
      )}
    >
      <input
        ref={inputRef}
        type="file"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        aria-label={
          multiple ? `Dateien auswählen (${HINTS[accept]})` : `Datei auswählen (${HINTS[accept]})`
        }
        accept={ACCEPT_MAP[accept]}
        multiple={multiple}
        disabled={disabled}
        onChange={(event) => handleFiles(event.target.files)}
      />
      <div className="pointer-events-none flex flex-col items-center gap-3 text-center">
        <span
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-200",
            compact && "h-10 w-10",
          )}
        >
          <Icon aria-hidden className="h-6 w-6" />
        </span>
        {!compact ? (
          <>
            <p className="text-base font-semibold text-slate-800 dark:text-slate-100">
              Datei hierher ziehen oder klicken zum Auswählen
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Unterstützt: {HINTS[accept]}
              {multiple ? " · mehrere Dateien möglich" : ""}
            </p>
          </>
        ) : (
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Weitere Datei hinzufügen ({HINTS[accept]})
          </p>
        )}
      </div>
    </div>
  );
}
