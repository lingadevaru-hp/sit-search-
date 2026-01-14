/**
 * Database Service using IndexedDB
 * Stores documents, files, and metadata for the search engine
 */

import { Document } from '../types';

const DB_NAME = 'sit-scholar-db';
const DB_VERSION = 1;

interface StoredFile {
    id: string;
    name: string;
    type: 'pdf' | 'csv' | 'excel' | 'image' | 'text';
    mimeType: string;
    size: number;
    content: string; // Base64 encoded
    textContent?: string; // Extracted text
    uploadedAt: number;
}

let db: IDBDatabase | null = null;

/**
 * Initialize the database
 */
export async function initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('Database failed to open:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            console.log('[DB] Database initialized');
            resolve();
        };

        request.onupgradeneeded = (event) => {
            const database = (event.target as IDBOpenDBRequest).result;

            // Documents store
            if (!database.objectStoreNames.contains('documents')) {
                const docStore = database.createObjectStore('documents', { keyPath: 'id' });
                docStore.createIndex('category', 'category', { unique: false });
                docStore.createIndex('title', 'title', { unique: false });
            }

            // Files store (PDFs, images, etc.)
            if (!database.objectStoreNames.contains('files')) {
                const fileStore = database.createObjectStore('files', { keyPath: 'id' });
                fileStore.createIndex('type', 'type', { unique: false });
                fileStore.createIndex('uploadedAt', 'uploadedAt', { unique: false });
            }

            // Settings store
            if (!database.objectStoreNames.contains('settings')) {
                database.createObjectStore('settings', { keyPath: 'key' });
            }

            console.log('[DB] Database upgraded');
        };
    });
}

/**
 * Ensure database is ready
 */
async function ensureDB(): Promise<IDBDatabase> {
    if (!db) {
        await initDatabase();
    }
    if (!db) throw new Error('Database not initialized');
    return db;
}

// ==================== Documents ====================

export async function saveDocument(doc: Document): Promise<void> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['documents'], 'readwrite');
        const store = transaction.objectStore('documents');
        const request = store.put(doc);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getDocument(id: string): Promise<Document | undefined> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllDocuments(): Promise<Document[]> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['documents'], 'readonly');
        const store = transaction.objectStore('documents');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

export async function deleteDocument(id: string): Promise<void> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['documents'], 'readwrite');
        const store = transaction.objectStore('documents');
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function searchDocuments(query: string): Promise<Document[]> {
    const docs = await getAllDocuments();
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(' ').filter(k => k.length > 2);

    return docs.filter(doc => {
        const content = (doc.title + ' ' + doc.content).toLowerCase();
        return keywords.some(k => content.includes(k));
    });
}

// ==================== Files ====================

export async function saveFile(file: StoredFile): Promise<void> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['files'], 'readwrite');
        const store = transaction.objectStore('files');
        const request = store.put(file);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getFile(id: string): Promise<StoredFile | undefined> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const request = store.get(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getAllFiles(): Promise<StoredFile[]> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['files'], 'readonly');
        const store = transaction.objectStore('files');
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

export async function deleteFile(id: string): Promise<void> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['files'], 'readwrite');
        const store = transaction.objectStore('files');
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ==================== File Upload Helper ====================

export async function uploadFile(file: File): Promise<StoredFile> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = async () => {
            const base64 = (reader.result as string).split(',')[1];

            // Determine type
            let type: StoredFile['type'] = 'text';
            if (file.type.includes('pdf')) type = 'pdf';
            else if (file.type.includes('csv') || file.type.includes('excel') || file.type.includes('spreadsheet')) type = 'csv';
            else if (file.type.includes('image')) type = 'image';

            const storedFile: StoredFile = {
                id: Date.now().toString(),
                name: file.name,
                type,
                mimeType: file.type,
                size: file.size,
                content: base64,
                uploadedAt: Date.now()
            };

            try {
                await saveFile(storedFile);
                resolve(storedFile);
            } catch (e) {
                reject(e);
            }
        };

        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

// ==================== Settings ====================

export async function setSetting(key: string, value: any): Promise<void> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['settings'], 'readwrite');
        const store = transaction.objectStore('settings');
        const request = store.put({ key, value });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const database = await ensureDB();
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(['settings'], 'readonly');
        const store = transaction.objectStore('settings');
        const request = store.get(key);

        request.onsuccess = () => {
            resolve(request.result?.value ?? defaultValue);
        };
        request.onerror = () => reject(request.error);
    });
}

// ==================== Utilities ====================

export async function clearAllData(): Promise<void> {
    const database = await ensureDB();
    const transaction = database.transaction(['documents', 'files', 'settings'], 'readwrite');

    await Promise.all([
        new Promise<void>((resolve) => {
            transaction.objectStore('documents').clear().onsuccess = () => resolve();
        }),
        new Promise<void>((resolve) => {
            transaction.objectStore('files').clear().onsuccess = () => resolve();
        }),
        new Promise<void>((resolve) => {
            transaction.objectStore('settings').clear().onsuccess = () => resolve();
        })
    ]);

    console.log('[DB] All data cleared');
}

export function getDatabaseSize(): Promise<{ documents: number; files: number }> {
    return new Promise(async (resolve) => {
        const docs = await getAllDocuments();
        const files = await getAllFiles();
        resolve({
            documents: docs.length,
            files: files.length
        });
    });
}

// Export types
export type { StoredFile };
