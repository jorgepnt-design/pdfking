export interface ImageAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  grayscale: number;
}

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Applies the scan filters directly to RGBA pixels. This deliberately avoids
 * CanvasRenderingContext2D.filter because some Android WebViews ignore it
 * during canvas export even though the CSS preview looks correct.
 */
export function applyImageAdjustments(
  pixels: Uint8ClampedArray,
  adjustments: ImageAdjustments,
): void {
  const brightness = adjustments.brightness / 100;
  const contrast = adjustments.contrast / 100;
  const saturation = adjustments.saturation / 100;
  const grayscale = adjustments.grayscale / 100;

  for (let index = 0; index < pixels.length; index += 4) {
    let red = pixels[index] * brightness;
    let green = pixels[index + 1] * brightness;
    let blue = pixels[index + 2] * brightness;

    red = (red - 128) * contrast + 128;
    green = (green - 128) * contrast + 128;
    blue = (blue - 128) * contrast + 128;

    let luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red = luminance + (red - luminance) * saturation;
    green = luminance + (green - luminance) * saturation;
    blue = luminance + (blue - luminance) * saturation;

    luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red += (luminance - red) * grayscale;
    green += (luminance - green) * grayscale;
    blue += (luminance - blue) * grayscale;

    pixels[index] = clampChannel(red);
    pixels[index + 1] = clampChannel(green);
    pixels[index + 2] = clampChannel(blue);
  }
}

export function hasImageAdjustments(adjustments: ImageAdjustments): boolean {
  return (
    adjustments.brightness !== 100 ||
    adjustments.contrast !== 100 ||
    adjustments.saturation !== 100 ||
    adjustments.grayscale !== 0
  );
}
