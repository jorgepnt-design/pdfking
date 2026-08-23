import { describe, expect, it } from "vitest";
import {
  formatBytes,
  hexToRgb,
  mmToPt,
  parsePageList,
  parseRangeGroups,
  percentSaved,
  sanitizeFilename,
} from "../src/lib/utils";
import { AppError } from "../src/lib/types";

describe("parseRangeGroups", () => {
  it("parst einfache Angaben", () => {
    expect(parseRangeGroups("3", 10)).toEqual([[2]]);
    expect(parseRangeGroups("1-3, 5", 10)).toEqual([[0, 1, 2], [4]]);
  });

  it("unterstützt offene Bereiche bis zum Ende", () => {
    expect(parseRangeGroups("8-", 10)).toEqual([[7, 8, 9]]);
    expect(parseRangeGroups("-", 3)).toEqual([[0, 1, 2]]);
  });

  it("begrenzt auf vorhandene Seiten", () => {
    expect(parseRangeGroups("1-100", 5)).toEqual([[0, 1, 2, 3, 4]]);
  });

  it("wirft bei ungültiger Eingabe einen AppError", () => {
    expect(() => parseRangeGroups("abc", 10)).toThrow(AppError);
    expect(() => parseRangeGroups("", 10)).toThrow(AppError);
    expect(() => parseRangeGroups("0-2", 10)).not.toThrow();
  });
});

describe("parsePageList", () => {
  it("flacht Gruppen ab", () => {
    expect(parsePageList("1,3-5", 10)).toEqual([0, 2, 3, 4]);
  });
});

describe("formatBytes", () => {
  it("formatiert lesbar (deutsches Format)", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(1024 * 1024 * 2.5)).toContain("MB");
  });
});

describe("percentSaved", () => {
  it("berechnet Ersparnis korrekt", () => {
    expect(percentSaved(200, 100)).toBe(50);
    expect(percentSaved(100, 150)).toBeNull();
    expect(percentSaved(0, 10)).toBeNull();
  });
});

describe("mmToPt", () => {
  it("konvertiert Millimeter zu Punkt", () => {
    expect(mmToPt(25.4)).toBeCloseTo(72, 5);
    expect(mmToPt(0)).toBe(0);
  });
});

describe("hexToRgb", () => {
  it("wandelt Hexfarben in 0..1-Werte um", () => {
    expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb("#ffffff")).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb("#ff0000").r).toBeCloseTo(1);
    const shortHand = hexToRgb("#f00");
    expect(shortHand.r).toBeCloseTo(1);
    expect(shortHand.g).toBeCloseTo(0);
  });
});

describe("sanitizeFilename", () => {
  it("entfernt Endung und Sonderzeichen", () => {
    expect(sanitizeFilename("Mein Dokument.pdf")).toBe("Mein Dokument");
    expect(sanitizeFilename("rechnung/2024?.pdf")).toBe("rechnung_2024_");
    expect(sanitizeFilename(".pdf")).toBe("dokument");
  });
});
