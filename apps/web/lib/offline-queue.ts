"use client";

export type OfflineMutationType =
  | "meal:create"
  | "meal:update"
  | "meal:delete"
  | "meal:status"
  | "product:create"
  | "meal-group:create"
  | "meal-group:update"
  | "meal-group:delete";

export type OfflineMutation = {
  id: string;
  type: OfflineMutationType;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

const DB_NAME = "macro-tracker-offline";
const DB_VERSION = 1;
const STORE = "mutations";

function openOfflineDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | void> {
  const db = await openOfflineDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const request = callback(store);

    if (request) {
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    }

    tx.oncomplete = () => {
      if (!request) resolve();
      db.close();
    };
    tx.onerror = () => {
      reject(tx.error);
      db.close();
    };
  });
}

export async function enqueueOfflineMutation(
  type: OfflineMutationType,
  payload: unknown,
) {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  const mutation: OfflineMutation = {
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  await withStore("readwrite", (store) => store.put(mutation));
  window.dispatchEvent(new CustomEvent("macro-tracker-offline-queue"));
  return mutation;
}

export async function listOfflineMutations(): Promise<OfflineMutation[]> {
  if (typeof indexedDB === "undefined") {
    return [];
  }

  const result = await withStore<OfflineMutation[]>("readonly", (store) =>
    store.getAll(),
  );
  return (result ?? []).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflineMutation(id: string) {
  if (typeof indexedDB === "undefined") {
    return;
  }

  await withStore("readwrite", (store) => store.delete(id));
}

export async function markOfflineMutationFailed(id: string, error: string) {
  const mutations = await listOfflineMutations();
  const mutation = mutations.find((item) => item.id === id);
  if (!mutation) {
    return;
  }

  await withStore("readwrite", (store) =>
    store.put({
      ...mutation,
      attempts: mutation.attempts + 1,
      lastError: error,
    }),
  );
}

export async function replayOfflineMutations(
  handler: (mutation: OfflineMutation) => Promise<void>,
) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return;
  }

  for (const mutation of await listOfflineMutations()) {
    try {
      await handler(mutation);
      await removeOfflineMutation(mutation.id);
    } catch (error) {
      await markOfflineMutationFailed(
        mutation.id,
        error instanceof Error ? error.message : "Sync failed.",
      );
      break;
    }
  }
}
