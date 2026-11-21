// The narration draft, kept across reloads in IndexedDB because a voice track
// is too large for localStorage. Same best-effort policy as `saveDraft`: every
// call fails soft, since storage can be denied and losing a draft must never
// cost the session.

const DB_NAME = 'gambit';
const DB_VERSION = 1;
const STORE = 'drafts';
const KEY = 'narration';

type StoredNarration = { blob: Blob; name: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
    // Another tab holds an older version open; reject rather than hang.
    request.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
}

// One transaction per call, resolved on `complete`, not on the request: a
// write can succeed and still lose its transaction to a quota error.
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = work(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result as T);
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('indexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export async function loadNarration(): Promise<StoredNarration | null> {
  try {
    const stored = await withStore<StoredNarration | undefined>('readonly', (store) =>
      store.get(KEY),
    );
    // Anything not in the current shape is treated as absent.
    if (!stored || !(stored.blob instanceof Blob) || typeof stored.name !== 'string') {
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

export async function saveNarration(value: StoredNarration): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.put(value, KEY));
  } catch {
    // Best-effort: the track is still live in this session.
  }
}

export async function clearNarration(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } catch {
    // A failed delete leaves a track the next load restores or rejects.
  }
}
