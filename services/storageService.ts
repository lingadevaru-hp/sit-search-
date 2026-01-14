import { Thread, Document, Role } from '../types';
import { INITIAL_DOCS } from '../constants';

const STORAGE_KEYS = {
  THREADS: 'sit_scholar_threads',
  DOCS: 'sit_scholar_docs',
  USER_ROLE: 'sit_scholar_role',
  THEME: 'sit_scholar_theme'
};

export const StorageService = {
  // Threads
  getThreads: (): Thread[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.THREADS);
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error("Failed to load threads", e);
      return [];
    }
  },

  saveThread: (thread: Thread) => {
    const threads = StorageService.getThreads();
    const index = threads.findIndex(t => t.id === thread.id);
    if (index >= 0) {
      threads[index] = thread;
    } else {
      threads.unshift(thread);
    }
    localStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(threads));
  },

  deleteThread: (id: string) => {
    const threads = StorageService.getThreads().filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEYS.THREADS, JSON.stringify(threads));
  },

  clearHistory: () => {
    localStorage.removeItem(STORAGE_KEYS.THREADS);
  },

  // Documents (Mock Backend)
  getDocuments: (): Document[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DOCS);
      if (!stored) {
        // Initialize with default docs if empty
        localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(INITIAL_DOCS));
        return INITIAL_DOCS as Document[];
      }
      return JSON.parse(stored);
    } catch (e) {
      return [];
    }
  },

  addDocument: (doc: Document) => {
    const docs = StorageService.getDocuments();
    docs.push(doc);
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
  },

  deleteDocument: (id: string) => {
    const docs = StorageService.getDocuments().filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
  },

  // User Settings
  getRole: (): Role => {
    // Default to ADMIN as requested
    return Role.ADMIN;
  },

  setRole: (role: Role) => {
    localStorage.setItem(STORAGE_KEYS.USER_ROLE, role);
  },
  
  getTheme: (): 'light' | 'dark' => {
      return (localStorage.getItem(STORAGE_KEYS.THEME) as 'light' | 'dark') || 'dark';
  },

  setTheme: (theme: 'light' | 'dark') => {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
  }
};