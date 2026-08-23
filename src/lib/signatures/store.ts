"use client";

import type { StoredSignature, StoredSignatureMeta } from "../types";

const DB_NAME = "pdfking";
const STORE_NAME = "signatures";
const DB_VERSION = 1;

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB-Fehler"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = action(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Datenbankfehler"));
    transaction.oncomplete = () => db.close();
  });
}

export async function listSignatures(): Promise<StoredSignatureMeta[]> {
  const all = await withStore<StoredSignature[]>(
    "readonly",
    (store) => store.getAll() as IDBRequest<StoredSignature[]>,
  );
  return all
    .map(({ id, name, source, createdAt }) => ({ id, name, source, createdAt }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadSignaturePayload(id: string): Promise<StoredSignature | undefined> {
  return withStore<StoredSignature | undefined>(
    "readonly",
    (store) => store.get(id) as IDBRequest<StoredSignature | undefined>,
  );
}

export async function saveSignature(signature: StoredSignature): Promise<void> {
  await withStore(
    "readwrite",
    (store) => store.put(signature) as unknown as IDBRequest<IDBValidKey>,
  );
}

export async function deleteSignature(id: string): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id) as unknown as IDBRequest<undefined>);
}

export async function clearSignatures(): Promise<void> {
  await withStore("readwrite", (store) => store.clear() as unknown as IDBRequest<undefined>);
}
