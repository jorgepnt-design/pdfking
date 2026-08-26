import { describe, expect, it } from "vitest";
import { applyImageAdjustments, hasImageAdjustments } from "@/lib/image-adjustments";

describe("scan image adjustments", () => {
  it("leaves pixels unchanged with the defaults", () => {
    const pixels = new Uint8ClampedArray([40, 120, 220, 170]);
    applyImageAdjustments(pixels, {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      grayscale: 0,
    });
    expect(Array.from(pixels)).toEqual([40, 120, 220, 170]);
  });

  it("writes brightness into the actual pixel data", () => {
    const pixels = new Uint8ClampedArray([100, 120, 140, 255]);
    applyImageAdjustments(pixels, {
      brightness: 50,
      contrast: 100,
      saturation: 100,
      grayscale: 0,
    });
    expect(Array.from(pixels)).toEqual([50, 60, 70, 255]);
  });

  it("creates grayscale pixels while preserving alpha", () => {
    const pixels = new Uint8ClampedArray([220, 80, 30, 96]);
    applyImageAdjustments(pixels, {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      grayscale: 100,
    });
    expect(pixels[0]).toBe(pixels[1]);
    expect(pixels[1]).toBe(pixels[2]);
    expect(pixels[3]).toBe(96);
  });

  it("recognizes whether processing is necessary", () => {
    expect(
      hasImageAdjustments({ brightness: 100, contrast: 100, saturation: 100, grayscale: 0 }),
    ).toBe(false);
    expect(
      hasImageAdjustments({ brightness: 110, contrast: 100, saturation: 100, grayscale: 0 }),
    ).toBe(true);
  });
});
