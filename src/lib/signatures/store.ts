"use client";

import type { StoredSignature, StoredSignatureMeta } from "../types";
import { fromBase64, toBase64 } from "./encoding";

const DB_NAME = "pdfking";
const STORE_NAME = "signatures";
const SETTINGS_STORE_NAME = "settings";
const DB_VERSION = 2;

interface SettingRecord {
  key: string;
  value: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB wird von diesem Browser nicht unterstützt."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
        db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB-Fehler"));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));

    // Ein erfolgreicher Request bedeutet noch nicht, dass die Transaktion
    // dauerhaft geschrieben wurde. Erst nach oncomplete Erfolg melden.
    transaction.oncomplete = () => {
      const result = request.result;
      db.close();
      resolve(result);
    };
    transaction.onabort = () => {
      db.close();
      reject(transaction.error ?? request.error ?? new Error("Datenbankfehler"));
    };
    transaction.onerror = () => {
      // Der konkrete Fehler wird über onabort weitergereicht.
    };
  });
}

export async function listSignatures(): Promise<StoredSignatureMeta[]> {
  const all = await withStore<StoredSignature[]>(
    STORE_NAME,
    "readonly",
    (store) => store.getAll() as IDBRequest<StoredSignature[]>,
  );
  return all
    .map(({ id, name, source, createdAt }) => ({ id, name, source, createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadSignaturePayload(id: string): Promise<StoredSignature | undefined> {
  return withStore<StoredSignature | undefined>(
    STORE_NAME,
    "readonly",
    (store) => store.get(id) as IDBRequest<StoredSignature | undefined>,
  );
}

export async function saveSignature(signature: StoredSignature): Promise<void> {
  await withStore(
    STORE_NAME,
    "readwrite",
    (store) => store.put(signature) as unknown as IDBRequest<IDBValidKey>,
  );

  // Nach einer bewussten Speicheraktion um beständigen Browserspeicher bitten.
  // Browser dürfen dies ablehnen; der normale IndexedDB-Speicher bleibt dann erhalten.
  await navigator.storage?.persist?.().catch(() => false);
}

export async function deleteSignature(id: string): Promise<void> {
  await withStore(
    STORE_NAME,
    "readwrite",
    (store) => store.delete(id) as unknown as IDBRequest<undefined>,
  );
}

export async function clearSignatures(): Promise<void> {
  await withStore(
    STORE_NAME,
    "readwrite",
    (store) => store.clear() as unknown as IDBRequest<undefined>,
  );
}

export async function getSignatureSalt(): Promise<string | null> {
  const record = await withStore<SettingRecord | undefined>(
    SETTINGS_STORE_NAME,
    "readonly",
    (store) => store.get("signatureSalt") as IDBRequest<SettingRecord | undefined>,
  );
  return record?.value ?? null;
}

export async function saveSignatureSalt(value: string): Promise<void> {
  await withStore(
    SETTINGS_STORE_NAME,
    "readwrite",
    (store) =>
      store.put({ key: "signatureSalt", value } satisfies SettingRecord) as IDBRequest<IDBValidKey>,
  );
}

export interface SignatureBackup {
  version: 1;
  salt: string;
  signatures: Array<{
    id: string;
    name: string;
    source: StoredSignature["source"];
    createdAt: number;
    ivB64: string;
    cipherB64: string;
  }>;
}

/** Exportiert nur bereits verschlüsselte Datensätze – niemals die Passphrase oder Klartextbilder. */
export async function exportSignatureBackup(): Promise<SignatureBackup> {
  const salt = await getSignatureSalt();
  const signatures = await withStore<StoredSignature[]>(
    STORE_NAME,
    "readonly",
    (store) => store.getAll() as IDBRequest<StoredSignature[]>,
  );
  if (!salt || signatures.length === 0) {
    throw new Error("Auf dieser Adresse wurden keine alten Unterschriften gefunden.");
  }
  return {
    version: 1,
    salt,
    signatures: signatures.map((signature) => ({
      id: signature.id,
      name: signature.name,
      source: signature.source,
      createdAt: signature.createdAt,
      ivB64: signature.payload.ivB64,
      cipherB64: toBase64(new Uint8Array(signature.payload.cipher)),
    })),
  };
}

/** Importiert ein verschlüsseltes Backup nur in einen noch leeren Speicher. */
export async function importSignatureBackup(backup: SignatureBackup): Promise<number> {
  if (backup.version !== 1 || !backup.salt || !Array.isArray(backup.signatures)) {
    throw new Error("Die übertragenen Unterschriftendaten sind ungültig.");
  }
  const existing = await listSignatures();
  if (existing.length > 0) {
    throw new Error(
      "Auf dieser Adresse sind bereits Unterschriften gespeichert. Die Übernahme wurde zum Schutz dieser Daten abgebrochen.",
    );
  }
  await saveSignatureSalt(backup.salt);
  try {
    localStorage.setItem("pdfking.signature.salt", backup.salt);
  } catch {
    // Die Salt-Kopie in IndexedDB reicht aus.
  }
  for (const signature of backup.signatures) {
    await saveSignature({
      id: signature.id,
      name: signature.name,
      source: signature.source,
      createdAt: signature.createdAt,
      payload: {
        ivB64: signature.ivB64,
        cipher: fromBase64(signature.cipherB64).buffer as ArrayBuffer,
      },
    });
  }
  return backup.signatures.length;
}
