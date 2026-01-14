import { Thread, Document, Role, SourceType } from '../types';
import { getEmbeddedDocuments, MCA_FACULTY, MCA_DEPARTMENT_INFO } from '../data/embeddedData';

const STORAGE_KEYS = {
  THREADS: 'sit_scholar_threads',
  DOCS: 'sit_scholar_docs',
  USER_ROLE: 'sit_scholar_role',
  THEME: 'sit_scholar_theme',
  DATA_INITIALIZED: 'sit_scholar_data_init'
};

// Combine initial docs with embedded MCA data
function getInitialDocuments(): Document[] {
  const embeddedDocs = getEmbeddedDocuments();
  return embeddedDocs;
}

export const StorageService = {
  // Initialize data on first load
  initializeData: (): void => {
    const initialized = localStorage.getItem(STORAGE_KEYS.DATA_INITIALIZED);
    if (!initialized) {
      const docs = getInitialDocuments();
      localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
      localStorage.setItem(STORAGE_KEYS.DATA_INITIALIZED, 'true');
      console.log('[Storage] Initialized with', docs.length, 'documents');
    }
  },

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

  // Documents
  getDocuments: (): Document[] => {
    try {
      // Ensure data is initialized
      StorageService.initializeData();

      const stored = localStorage.getItem(STORAGE_KEYS.DOCS);
      if (!stored) {
        const docs = getInitialDocuments();
        localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
        return docs;
      }
      return JSON.parse(stored);
    } catch (e) {
      console.error("Failed to load documents:", e);
      return getInitialDocuments();
    }
  },

  addDocument: (doc: Document) => {
    const docs = StorageService.getDocuments();
    docs.push(doc);
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
  },

  updateDocument: (doc: Document) => {
    const docs = StorageService.getDocuments();
    const index = docs.findIndex(d => d.id === doc.id);
    if (index >= 0) {
      docs[index] = doc;
    } else {
      docs.push(doc);
    }
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
  },

  deleteDocument: (id: string) => {
    const docs = StorageService.getDocuments().filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
  },

  searchDocuments: (query: string): Document[] => {
    const docs = StorageService.getDocuments();
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(' ').filter(k => k.length > 2);

    return docs.filter(doc => {
      const content = (doc.title + ' ' + doc.content + ' ' + doc.category).toLowerCase();
      return keywords.some(k => content.includes(k));
    });
  },

  // Quick access to faculty data
  getFaculty: () => MCA_FACULTY,
  getDepartmentInfo: () => MCA_DEPARTMENT_INFO,

  // Reset all data
  resetData: () => {
    localStorage.removeItem(STORAGE_KEYS.DATA_INITIALIZED);
    localStorage.removeItem(STORAGE_KEYS.DOCS);
    StorageService.initializeData();
  },

  // User Settings
  getRole: (): Role => {
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