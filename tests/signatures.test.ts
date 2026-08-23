import { describe, expect, it } from "vitest";
import {
  encryptForStorage,
  decryptFromStorage,
  unlockSignatureStore,
  lockSignatureStore,
} from "../src/lib/signatures/session";
import { fromBase64, toBase64 } from "../src/lib/signatures/encoding";
import { AppError } from "../src/lib/types";

describe("Signatur-Verschlüsselung (AES-GCM + PBKDF2)", () => {
  it("verschlüsselt und entschlüsselt rundum korrekt", async () => {
    await unlockSignatureStore("richtige-passphrase");
    const plaintext = new TextEncoder().encode("vertrauliche-unterschrift").buffer as ArrayBuffer;
    const payload = await encryptForStorage(plaintext);

    expect(payload.ivB64).toBeTruthy();
    const decrypted = await decryptFromStorage(payload);
    expect(new TextDecoder().decode(decrypted)).toBe("vertrauliche-unterschrift");
  });

  it("produziert unterschiedliche IVs für gleiche Daten", async () => {
    await unlockSignatureStore("test");
    const data = new TextEncoder().encode("abc").buffer as ArrayBuffer;
    const first = await encryptForStorage(data);
    const second = await encryptForStorage(data);
    expect(first.ivB64).not.toBe(second.ivB64);
    lockSignatureStore();
  });

  it("lehnt falsche Passphrase ab", async () => {
    await unlockSignatureStore("richtig");
    const payload = await encryptForStorage(
      new TextEncoder().encode("geheim").buffer as ArrayBuffer,
    );
    lockSignatureStore();

    await unlockSignatureStore("falsch");
    await expect(decryptFromStorage(payload)).rejects.toThrow(AppError);
    lockSignatureStore();
  });

  it("wirft ohne Entsperrung einen Fehler", async () => {
    lockSignatureStore();
    await expect(
      encryptForStorage(new TextEncoder().encode("x").buffer as ArrayBuffer),
    ).rejects.toThrow(AppError);
  });
});

describe("Base64-Helfer", () => {
  it("rundet Bytes durch Base64 hindurch", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const decoded = fromBase64(toBase64(bytes));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});
