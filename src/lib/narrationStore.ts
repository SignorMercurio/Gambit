// Where the narration track survives a reload.
//
// Every other authored input is a string in localStorage, and narration was
// left out on the grounds that it does not fit there — which is true, and was
// never a reason for it to be the one input that evaporates on refresh. A
// lesson's voice track is tens of megabytes of binary; localStorage holds a few
// megabytes of UTF-16. IndexedDB stores a Blob as a Blob, so this is the same
// best-effort draft policy as `saveDraft`, in the only store that can hold it.
//
// Everything here fails soft for the same reason the localStorage helpers do:
// storage can be denied outright (private windows, blocked third-party
// contexts) and losing a draft must never cost the author their session.

const DB_NAME = 'gambit';
const DB_VERSION = 1;
const STORE = 'drafts';
const KEY = 'narration';

export type StoredNarration = { blob: Blob; name: string };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('indexedDB open failed'));
    // Another tab is holding an older version open. Rejecting rather than
    // waiting keeps this promise from hanging for as long as that tab lives.
    request.onblocked = () => reject(new Error('indexedDB open blocked'));
  });
}

// One transaction per call, resolved on `complete` rather than on the request:
// a write that succeeds and then loses its transaction to a quota error has not
// been stored, and reporting it as stored would leave the next load empty with
// nothing having gone wrong.
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
    // Written by an older build, or hand-edited: treat anything that is not the
    // current shape as absent rather than handing `App` a track with no bytes.
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
    // Best-effort, exactly like the localStorage drafts: the track is already
    // live in this session, and only the reload after it loses anything.
  }
}

export async function clearNarration(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(KEY));
  } catch {
    // Nothing to report: a delete that fails leaves a track that the next load
    // either restores or rejects as undecodable, and both are recoverable.
  }
}
