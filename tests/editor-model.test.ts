import { describe, expect, it } from "vitest";
import {
  HistoryStore,
  createImageElement,
  createTextElement,
  moveElement,
  resizeImageElement,
} from "../src/lib/editor/model";
import { DEFAULT_EDITOR_STYLE } from "../src/lib/editor/model";

describe("HistoryStore", () => {
  it("unterstützt Undo und Redo", () => {
    const history = new HistoryStore<number>();
    history.push(1);
    history.push(2);
    expect(history.canUndo).toBe(true);
    expect(history.undo()).toBe(1);
    expect(history.canRedo).toBe(true);
    expect(history.redo()).toBe(2);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe(1);
    expect(history.canUndo).toBe(false);
  });

  it("verwirft Redo-Zweig nach neuem Push", () => {
    const history = new HistoryStore<number>();
    history.push(1);
    history.push(2);
    history.undo();
    history.push(3);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe(1);
  });

  it("begrenzt die Kapazität", () => {
    const history = new HistoryStore<number>(3);
    history.push(1);
    history.push(2);
    history.push(3);
    history.push(4);
    expect(history.undo()).toBe(3);
    expect(history.undo()).toBe(2);
    expect(history.canUndo).toBe(false);
    expect(history.undo()).toBeNull();
  });

  it("reset leert die Historie", () => {
    const history = new HistoryStore<number>();
    history.push(1);
    history.reset();
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBeNull();
  });

  it("reset mit Anfangszustand setzt Baseline", () => {
    const history = new HistoryStore<number>();
    history.reset(5);
    expect(history.canUndo).toBe(false);
    history.push(6);
    expect(history.undo()).toBe(5);
  });
});

describe("Element-Fabriken", () => {
  it("erzeugt eindeutige IDs", () => {
    const first = createTextElement(0, 10, 10, DEFAULT_EDITOR_STYLE);
    const second = createTextElement(0, 10, 10, DEFAULT_EDITOR_STYLE);
    expect(first.id).not.toBe(second.id);
    expect(first.kind).toBe("text");
  });

  it("moveElement verschiebt Linien-Endpunkte mit", () => {
    const line = {
      ...createTextElement(0, 0, 0, DEFAULT_EDITOR_STYLE),
      kind: "line" as const,
      x2: 100,
      y2: 50,
      color: "#000",
      strokeWidth: 2,
      arrow: false,
      height: 0,
      pageIndex: 0,
      id: "test",
    };
    const moved = moveElement(line, 10, -5);
    expect(moved.x).toBe(10);
    expect(moved.y).toBe(-5);
    expect((moved as { x2: number }).x2).toBe(110);
    expect((moved as { y2: number }).y2).toBe(45);
  });

  it("moveElement verschiebt Freihandpunkte mit", () => {
    const ink = {
      ...createTextElement(0, 0, 0, DEFAULT_EDITOR_STYLE),
      kind: "ink" as const,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
      color: "#000",
      strokeWidth: 2,
      height: 0,
      pageIndex: 0,
      id: "test2",
    };
    const moved = moveElement(ink, 3, 3);
    expect((moved as { points: Array<{ x: number; y: number }> }).points[1]).toEqual({
      x: 8,
      y: 8,
    });
  });

  it("skaliert Bilder proportional über einen Eckgriff", () => {
    const image = createImageElement(0, 100, 80, "data:image/png;base64,AA==", 3);
    const resized = resizeImageElement(image, "se", 90, 10, 600, 800);

    expect(resized.width).toBe(270);
    expect(resized.height).toBe(90);
    expect(resized.x).toBe(100);
    expect(resized.y).toBe(80);
  });

  it("hält Bilder beim Skalieren innerhalb der Seite", () => {
    const image = createImageElement(0, 100, 80, "data:image/png;base64,AA==", 3);
    const resized = resizeImageElement(image, "nw", -500, -500, 600, 800);

    expect(resized.x).toBeGreaterThanOrEqual(0);
    expect(resized.y).toBeGreaterThanOrEqual(0);
    expect(resized.width / resized.height).toBeCloseTo(3);
  });
});
