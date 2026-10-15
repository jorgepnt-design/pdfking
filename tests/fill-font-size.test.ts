import { describe, expect, it } from "vitest";
import { loadPreferredFontSize, savePreferredFontSize } from "../src/lib/pdf/fill-fields";

describe("gemerkte Schriftgröße", () => {
  it("bleibt für das nächste Dokument erhalten", () => {
    localStorage.clear();
    expect(loadPreferredFontSize()).toBeNull();
    savePreferredFontSize(14.5);
    expect(loadPreferredFontSize()).toBe(14.5);
  });

  it("ignoriert ungültige gespeicherte Werte", () => {
    localStorage.setItem("pdfking.fill.fontSize", "999");
    expect(loadPreferredFontSize()).toBeNull();
    localStorage.setItem("pdfking.fill.fontSize", "abc");
    expect(loadPreferredFontSize()).toBeNull();
  });
});
