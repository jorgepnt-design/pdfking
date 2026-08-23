"use client";

import { ArrowLeft, ArrowRight, Copy, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { IconButton } from "@/components/ui/button";
import { cn, uid } from "@/lib/utils";
import { renderPageToCanvas } from "@/lib/pdf/pdfjs";

export interface ThumbDoc {
  id: string;
  name: string;
  jsDoc: PDFDocumentProxy;
  /** Gibt den zugrunde liegenden PDF.js-Loading-Task frei. */
  release?: () => void;
}

export interface ThumbItem {
  key: string;
  docId: string;
  pageIndex: number;
  rotation: number;
}

export function createThumbItem(docId: string, pageIndex: number): ThumbItem {
  return { key: uid(), docId, pageIndex, rotation: 0 };
}

function Thumb({
  item,
  jsDoc,
  label,
  selected,
  onSelectToggle,
  showActions,
  onRotate,
  onDelete,
  onDuplicate,
  onMoveLeft,
  onMoveRight,
  canMoveLeft,
  canMoveRight,
  dragProps,
  isDragOver,
}: {
  item: ThumbItem;
  jsDoc: PDFDocumentProxy;
  label: string;
  selected: boolean;
  onSelectToggle?: () => void;
  showActions?: boolean;
  onRotate?: (delta: number) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onMoveLeft?: () => void;
  onMoveRight?: () => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
  dragProps?: Record<string, unknown>;
  isDragOver: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [renderedRotation, setRenderedRotation] = useState<number | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!visible || !canvas || renderedRotation === item.rotation) return;
    let cancelled = false;
    const width = containerRef.current?.clientWidth ?? 160;
    renderPageToCanvas(jsDoc, item.pageIndex, canvas, width, item.rotation)
      .then(() => {
        if (!cancelled) setRenderedRotation(item.rotation);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [visible, item.pageIndex, item.rotation, item.key, jsDoc, renderedRotation]);

  return (
    <div
      ref={containerRef}
      {...dragProps}
      className={cn(
        "group relative flex flex-col rounded-xl border-2 bg-white p-2 transition-shadow dark:bg-slate-900",
        selected
          ? "border-blue-700 shadow-md dark:border-blue-500"
          : "border-slate-200 hover:border-slate-300 dark:border-slate-700",
        isDragOver && "border-blue-500 ring-2 ring-blue-300",
      )}
    >
      {onSelectToggle ? (
        <label className="absolute top-3 left-3 z-10 flex cursor-pointer items-center gap-1.5 rounded-md bg-white/90 px-1.5 py-1 text-xs font-medium shadow-sm dark:bg-slate-800/90">
          <input
            type="checkbox"
            checked={selected}
            onChange={onSelectToggle}
            aria-label={`${label} auswählen`}
            className="h-4 w-4 accent-blue-700"
          />
          <span className="sr-only sm:not-sr-only">Auswählen</span>
        </label>
      ) : null}

      <div className="flex min-h-[120px] items-center justify-center overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
        <canvas ref={canvasRef} aria-hidden className="max-h-56 w-auto max-w-full" />
      </div>
      <p
        className="mt-2 truncate text-center text-xs text-slate-600 dark:text-slate-400"
        title={label}
      >
        {label}
      </p>

      {showActions ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-0.5">
          {onMoveLeft ? (
            <IconButton
              label={`${label}: nach links verschieben`}
              onClick={onMoveLeft}
              disabled={!canMoveLeft}
              className="h-7 w-7"
            >
              <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          {onRotate ? (
            <>
              <IconButton
                label={`${label}: nach links drehen`}
                onClick={() => onRotate(-90)}
                className="h-7 w-7"
              >
                <RotateCcw aria-hidden className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton
                label={`${label}: nach rechts drehen`}
                onClick={() => onRotate(90)}
                className="h-7 w-7"
              >
                <RotateCw aria-hidden className="h-3.5 w-3.5" />
              </IconButton>
            </>
          ) : null}
          {onDuplicate ? (
            <IconButton label={`${label}: duplizieren`} onClick={onDuplicate} className="h-7 w-7">
              <Copy aria-hidden className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          {onMoveRight ? (
            <IconButton
              label={`${label}: nach rechts verschieben`}
              onClick={onMoveRight}
              disabled={!canMoveRight}
              className="h-7 w-7"
            >
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
          {onDelete ? (
            <IconButton
              label={`${label}: löschen`}
              onClick={onDelete}
              className="h-7 w-7 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
            </IconButton>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function PageThumbGrid({
  docs,
  items,
  selectedKeys,
  onToggleSelect,
  onRotate,
  onDelete,
  onDuplicate,
  onReorder,
  showActions = true,
  selectable = true,
}: {
  docs: ThumbDoc[];
  items: ThumbItem[];
  selectedKeys: Set<string>;
  onToggleSelect?: (key: string) => void;
  onRotate?: (key: string, delta: number) => void;
  onDelete?: (key: string) => void;
  onDuplicate?: (key: string) => void;
  onReorder?: (fromKey: string, toKey: string) => void;
  showActions?: boolean;
  selectable?: boolean;
}) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const docById = useCallback((id: string) => docs.find((doc) => doc.id === id), [docs]);

  const moveItem = (fromKey: string, direction: -1 | 1) => {
    if (!onReorder) return;
    const index = items.findIndex((item) => item.key === fromKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    onReorder(fromKey, items[target].key);
  };

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {items.map((item, index) => {
        const doc = docById(item.docId);
        if (!doc) return null;
        const label = `${doc.name} · S. ${item.pageIndex + 1}`;
        return (
          <Thumb
            key={item.key}
            item={item}
            jsDoc={doc.jsDoc}
            label={label}
            selected={selectedKeys.has(item.key)}
            onSelectToggle={selectable ? () => onToggleSelect?.(item.key) : undefined}
            showActions={showActions}
            onRotate={onRotate ? (delta) => onRotate(item.key, delta) : undefined}
            onDelete={onDelete ? () => onDelete(item.key) : undefined}
            onDuplicate={onDuplicate ? () => onDuplicate(item.key) : undefined}
            onMoveLeft={onReorder && index > 0 ? () => moveItem(item.key, -1) : undefined}
            onMoveRight={
              onReorder && index < items.length - 1 ? () => moveItem(item.key, 1) : undefined
            }
            canMoveLeft={index > 0}
            canMoveRight={index < items.length - 1}
            isDragOver={dragOverKey === item.key && dragKey !== item.key}
            dragProps={
              onReorder
                ? {
                    draggable: true,
                    onDragStart: () => setDragKey(item.key),
                    onDragEnd: () => {
                      setDragKey(null);
                      setDragOverKey(null);
                    },
                    onDragOver: (event: React.DragEvent) => {
                      event.preventDefault();
                      if (dragKey) setDragOverKey(item.key);
                    },
                    onDrop: (event: React.DragEvent) => {
                      event.preventDefault();
                      if (dragKey && dragKey !== item.key) onReorder(dragKey, item.key);
                      setDragKey(null);
                      setDragOverKey(null);
                    },
                  }
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
