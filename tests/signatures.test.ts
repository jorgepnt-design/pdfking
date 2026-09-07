import { describe, expect, it } from "vitest";
import {
  encryptForStorage,
  decryptFromStorage,
  unlockSignatureStore,
  lockSignatureStore,
} from "../src/lib/signatures/session";
import { fromBase64, toBase64 } from "../src/lib/signatures/encoding";

describe("Automatischer lokaler Signaturspeicher", () => {
  it("verschlüsselt und entschlüsselt rundum korrekt", async () => {
    await unlockSignatureStore();
    const plaintext = new TextEncoder().encode("vertrauliche-unterschrift").buffer as ArrayBuffer;
    const payload = await encryptForStorage(plaintext);

    expect(payload.ivB64).toBeTruthy();
    const decrypted = await decryptFromStorage(payload);
    expect(new TextDecoder().decode(decrypted)).toBe("vertrauliche-unterschrift");
  });

  it("produziert unterschiedliche IVs für gleiche Daten", async () => {
    await unlockSignatureStore();
    const data = new TextEncoder().encode("abc").buffer as ArrayBuffer;
    const first = await encryptForStorage(data);
    const second = await encryptForStorage(data);
    expect(first.ivB64).not.toBe(second.ivB64);
    lockSignatureStore();
  });

  it("öffnet sich nach einer Sperrung automatisch wieder", async () => {
    await unlockSignatureStore();
    const payload = await encryptForStorage(
      new TextEncoder().encode("geheim").buffer as ArrayBuffer,
    );
    lockSignatureStore();
    const decrypted = await decryptFromStorage(payload);
    expect(new TextDecoder().decode(decrypted)).toBe("geheim");
    lockSignatureStore();
  });

  it("verschlüsselt ohne vorherige Passworteingabe", async () => {
    lockSignatureStore();
    await expect(
      encryptForStorage(new TextEncoder().encode("x").buffer as ArrayBuffer),
    ).resolves.toMatchObject({ ivB64: expect.any(String) });
  });
});

describe("Base64-Helfer", () => {
  it("rundet Bytes durch Base64 hindurch", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255]);
    const decoded = fromBase64(toBase64(bytes));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});
