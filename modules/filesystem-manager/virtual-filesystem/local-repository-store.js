// Persists FileSystemDirectoryHandle objects (from add_local_repository) across
// page reloads. Handles are structured-cloneable but NOT JSON-serializable, so
// they can't live in localStorage - IndexedDB is the only browser storage that
// can hold them directly.
const DB_NAME = "mermeid-local-repositories";
const STORE_NAME = "handles";
const DB_VERSION = 1;

function hasIndexedDB() {
    return typeof indexedDB !== "undefined";
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export default class LocalRepositoryStore {
    async put(name, dirHandle) {
        if (!hasIndexedDB()) {
            return;
        }

        const db = await openDatabase();

        await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).put(dirHandle, name);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }

    async delete(name) {
        if (!hasIndexedDB()) {
            return;
        }

        const db = await openDatabase();

        await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readwrite");
            transaction.objectStore(STORE_NAME).delete(name);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();
    }

    // Returns a Map<name, FileSystemDirectoryHandle> of everything persisted.
    async getAll() {
        const entries = new Map();

        if (!hasIndexedDB()) {
            return entries;
        }

        const db = await openDatabase();

        await new Promise((resolve, reject) => {
            const transaction = db.transaction(STORE_NAME, "readonly");
            const cursorRequest = transaction.objectStore(STORE_NAME).openCursor();

            cursorRequest.onsuccess = () => {
                const cursor = cursorRequest.result;
                if (cursor) {
                    entries.set(cursor.key, cursor.value);
                    cursor.continue();
                }
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
        db.close();

        return entries;
    }
}
