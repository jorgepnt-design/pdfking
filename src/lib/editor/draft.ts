import type { PageElements } from "../types";

const DATABASE_NAME = "pdfking-editor";
const DATABASE_VERSION = 1;
const STORE_NAME = "drafts";
const ACTIVE_DRAFT_KEY = "active";

export interface EditorDraft {
  pdfBytes: Uint8Array;
  pdfName: string;
  pdfSize: number;
  pageIndex: number;
  pages: PageElements;
  pageRotations?: Record<number, 0 | 180>;
  updatedAt: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Editor-Entwurf konnte nicht geöffnet werden."));
  });
}

export async function saveEditorDraft(draft: EditorDraft): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(draft, ACTIVE_DRAFT_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function loadEditorDraft(): Promise<EditorDraft | null> {
  const database = await openDatabase();
  const draft = await new Promise<EditorDraft | undefined>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(ACTIVE_DRAFT_KEY);
    request.onsuccess = () => resolve(request.result as EditorDraft | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return draft ?? null;
}
