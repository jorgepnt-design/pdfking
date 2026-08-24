import type {
  EditorElement,
  EraserElement,
  FontFamily,
  ImageElement,
  InkStrokeElement,
  LineElement,
  PageElements,
  RectElement,
  TextAlign,
  TextElement,
} from "../types";
import { uid } from "../utils";

export interface EditorStyleDefaults {
  fontFamily: FontFamily;
  bold: boolean;
  fontSize: number;
  color: string;
  align: TextAlign;
  strokeWidth: number;
}

export const DEFAULT_EDITOR_STYLE: EditorStyleDefaults = {
  fontFamily: "Helvetica",
  bold: false,
  fontSize: 14,
  color: "#111827",
  align: "left",
  strokeWidth: 2,
};

/**
 * Undo/Redo-Historie mit fester Kapazität.
 * Speichert vollständige Snapshots; `push` beginnt einen neuen Zweig
 * (bestehende Redo-Einträge werden verworfen).
 */
export class HistoryStore<T> {
  private states: T[] = [];
  private index = -1;

  constructor(private readonly capacity = 50) {}

  push(state: T): void {
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(state);
    if (this.states.length > this.capacity) this.states.shift();
    this.index = this.states.length - 1;
  }

  /** Ein Schritt zurück; gibt null am Anfang zurück. */
  undo(): T | null {
    if (this.index <= 0) return null;
    this.index -= 1;
    return this.states[this.index];
  }

  /** Ein Schritt vor; gibt null am Ende zurück. */
  redo(): T | null {
    if (this.index >= this.states.length - 1) return null;
    this.index += 1;
    return this.states[this.index];
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.states.length - 1;
  }

  reset(initial?: T): void {
    this.states = [];
    this.index = -1;
    if (initial !== undefined) this.push(initial);
  }
}

export function createTextElement(
  pageIndex: number,
  x: number,
  y: number,
  style: EditorStyleDefaults,
): TextElement {
  return {
    id: uid(),
    kind: "text",
    pageIndex,
    x,
    y,
    width: 240,
    height: style.fontSize * 1.5,
    text: "Neuer Text",
    fontFamily: style.fontFamily,
    bold: style.bold,
    fontSize: style.fontSize,
    color: style.color,
    align: style.align,
  };
}

export function createRectElement(
  pageIndex: number,
  x: number,
  y: number,
  style: EditorStyleDefaults,
): RectElement {
  return {
    id: uid(),
    kind: "rect",
    pageIndex,
    x,
    y,
    width: 160,
    height: 100,
    strokeColor: style.color,
    fillColor: null,
    strokeWidth: style.strokeWidth,
    opacity: 1,
  };
}

export function createHighlightElement(
  pageIndex: number,
  x: number,
  y: number,
): import("../types").HighlightElement {
  return {
    id: uid(),
    kind: "highlight",
    pageIndex,
    x,
    y,
    width: 200,
    height: 26,
    color: "#fde047",
  };
}

export function createEraserElement(pageIndex: number, x: number, y: number): EraserElement {
  return {
    id: uid(),
    kind: "eraser",
    pageIndex,
    x,
    y,
    width: 160,
    height: 32,
  };
}

export function createDecorationElement(
  pageIndex: number,
  x: number,
  y: number,
  kind: "underline" | "strike",
  style: EditorStyleDefaults,
): import("../types").DecorationElement {
  return {
    id: uid(),
    kind,
    pageIndex,
    x,
    y,
    width: 160,
    height: Math.max(1.5, style.strokeWidth),
    color: style.color,
  };
}

export function createLineElement(
  pageIndex: number,
  x: number,
  y: number,
  arrow: boolean,
  style: EditorStyleDefaults,
): LineElement {
  return {
    id: uid(),
    kind: "line",
    pageIndex,
    x,
    y,
    x2: x + 140,
    y2: arrow ? y - 60 : y,
    width: 140,
    height: 0,
    color: style.color,
    strokeWidth: style.strokeWidth,
    arrow,
  };
}

export function createInkElement(
  pageIndex: number,
  point: { x: number; y: number },
  style: EditorStyleDefaults,
): InkStrokeElement {
  return {
    id: uid(),
    kind: "ink",
    pageIndex,
    x: point.x,
    y: point.y,
    width: 0,
    height: 0,
    points: [point],
    color: style.color,
    strokeWidth: style.strokeWidth * 1.5,
  };
}

export function createImageElement(
  pageIndex: number,
  x: number,
  y: number,
  dataUrl: string,
  aspectRatio: number,
): ImageElement {
  const width = 180;
  return {
    id: uid(),
    kind: "image",
    pageIndex,
    x,
    y,
    width,
    height: width / aspectRatio,
    dataUrl,
  };
}

export type ImageResizeHandle = "nw" | "ne" | "sw" | "se";

export function resizeImageElement(
  element: ImageElement,
  handle: ImageResizeHandle,
  dx: number,
  dy: number,
  pageWidth: number,
  pageHeight: number,
): ImageElement {
  const horizontalDelta = handle.includes("e") ? dx : -dx;
  const verticalDelta = handle.includes("s") ? dy : -dy;
  const horizontalFactor = (element.width + horizontalDelta) / element.width;
  const verticalFactor = (element.height + verticalDelta) / element.height;
  const factor =
    Math.abs(horizontalDelta / element.width) >= Math.abs(verticalDelta / element.height)
      ? horizontalFactor
      : verticalFactor;

  const minFactor = Math.max(24 / element.width, 12 / element.height);
  const maxHorizontalFactor = handle.includes("w")
    ? (element.x + element.width) / element.width
    : (pageWidth - element.x) / element.width;
  const maxVerticalFactor = handle.includes("n")
    ? (element.y + element.height) / element.height
    : (pageHeight - element.y) / element.height;
  const boundedFactor = Math.max(
    minFactor,
    Math.min(factor, maxHorizontalFactor, maxVerticalFactor),
  );
  const width = element.width * boundedFactor;
  const height = element.height * boundedFactor;

  return {
    ...element,
    x: handle.includes("w") ? element.x + element.width - width : element.x,
    y: handle.includes("n") ? element.y + element.height - height : element.y,
    width,
    height,
  };
}

export function moveElement(element: EditorElement, dx: number, dy: number): EditorElement {
  element.x += dx;
  element.y += dy;
  if (element.kind === "line") {
    element.x2 += dx;
    element.y2 += dy;
  }
  if (element.kind === "ink") {
    element.points = element.points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
  }
  return element;
}

export function elementsForPage(pages: PageElements, pageIndex: number): EditorElement[] {
  return pages[pageIndex] ?? [];
}
