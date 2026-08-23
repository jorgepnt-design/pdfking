"use client";

import { AppError } from "../types";
import { fromBase64, toBase64 } from "./encoding";

const SALT_STORAGE_KEY = "pdfking.signature.salt";
const PBKDF2_ITERATIONS = 250_000;

let sessionKey: CryptoKey | null = null;

function subtle(): SubtleCrypto {
  if (typeof globalThis.crypto?.subtle === "undefined") {
    throw new AppError("UNKNOWN", "Web Crypto wird von diesem Browser nicht unterstützt.");
  }
  return globalThis.crypto.subtle;
}

export function isSessionUnlocked(): boolean {
  return sessionKey !== null;
}

function getOrCreateSalt(): Uint8Array {
  const existing = localStorage.getItem(SALT_STORAGE_KEY);
  if (existing) return fromBase64(existing);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  localStorage.setItem(SALT_STORAGE_KEY, toBase64(salt));
  return salt;
}

/** Leitet den Sitzungsschlüssel aus der Passphrase ab (PBKDF2, SHA-256). */
export async function unlockSignatureStore(passphrase: string): Promise<void> {
  if (!passphrase) throw new AppError("INVALID_TYPE", "Bitte gib eine Passphrase ein.");
  const salt = getOrCreateSalt() as unknown as BufferSource;
  const keyMaterial = await subtle().importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  sessionKey = await subtle().deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function lockSignatureStore(): void {
  sessionKey = null;
}

function requireKey(): CryptoKey {
  if (!sessionKey) {
    throw new AppError(
      "UNKNOWN",
      "Der Unterschriftenspeicher ist gesperrt.",
      "Bitte entsperre ihn zuerst mit deiner Passphrase.",
    );
  }
  return sessionKey;
}

export interface EncryptedBlob {
  ivB64: string;
  cipher: ArrayBuffer;
}

export async function encryptForStorage(plaintext: ArrayBuffer): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await subtle().encrypt({ name: "AES-GCM", iv }, requireKey(), plaintext);
  return { ivB64: toBase64(iv), cipher };
}

export async function decryptFromStorage(blob: EncryptedBlob): Promise<ArrayBuffer> {
  try {
    const iv = fromBase64(blob.ivB64) as unknown as BufferSource;
    return await subtle().decrypt({ name: "AES-GCM", iv }, requireKey(), blob.cipher);
  } catch {
    throw new AppError(
      "WRONG_PASSWORD",
      "Die gespeicherten Unterschriften konnten nicht entschlüsselt werden.",
      "Vermutlich wurde mit einer anderen Passphrase verschlüsselt. Ohne die richtige Passphrase sind sie nicht wiederherstellbar.",
    );
  }
}
