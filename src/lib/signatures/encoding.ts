export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function arrayBufferToDataUrl(buffer: ArrayBuffer, mime = "image/png"): string {
  return `data:${mime};base64,${toBase64(new Uint8Array(buffer))}`;
}

/**
 * Entfernt nahezu weiße Hintergründe aus hochgeladenen Unterschriftsbildern,
 * damit sie transparent ins Dokument eingefügt werden können.
 */
export function makeWhiteBackgroundTransparent(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas-2D-Kontext nicht verfügbar."));
        return;
      }
      context.drawImage(image, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let index = 0; index < data.length; index += 4) {
        const brightness = (data[index] + data[index + 1] + data[index + 2]) / 3;
        if (brightness > 225) {
          data[index + 3] = 0;
        } else if (brightness > 180) {
          data[index + 3] = Math.round(((225 - brightness) / 45) * 255);
        }
      }
      context.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => reject(new Error("Bild konnte nicht geladen werden."));
    image.src = dataUrl;
  });
}

/** Rendert einen Namen in Schreibschrift als PNG-Daten-URL. */
export function renderNameSignature(name: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 240;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas-2D-Kontext nicht verfügbar.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  const fontSize = Math.min(96, Math.round(1600 / Math.max(8, name.length)));
  context.font = `italic ${fontSize}px "Segoe Script", "Brush Script MT", "Snell Roundhand", cursive`;
  context.fillStyle = "#111827";
  context.textBaseline = "middle";
  context.textAlign = "center";
  context.fillText(name, canvas.width / 2, canvas.height / 2);
  return canvas.toDataURL("image/png");
}
