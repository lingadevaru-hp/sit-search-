import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { Header, DesktopControls } from './components/Header';
import { AdminPanel } from './components/AdminPanel';
import { StorageService } from './services/storageService';
import { generateAnswer, generateChatTitle, initializeSearchEngine } from './services/geminiService';
import { Thread, Message, Role, Document } from './types';
import { Menu } from 'lucide-react';

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error:', error, errorInfo);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-900 to-black text-white p-8">
          <div className="max-w-md text-center space-y-6">
            <div className="text-6xl">⚠️</div>
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-gray-400">
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              className="px-6 py-3 bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userRole, setUserRole] = useState<Role>(Role.ADMIN);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Document[]>([]);

  // Initialize
  useEffect(() => {
    try {
      // Theme
      const storedTheme = StorageService.getTheme();
      setTheme(storedTheme);
      document.documentElement.classList.toggle('dark', storedTheme === 'dark');

      // Data
      const loadedThreads = StorageService.getThreads();
      setThreads(loadedThreads);

      if (loadedThreads.length > 0) {
        setCurrentThreadId(loadedThreads[0].id);
      }

      setDocuments(StorageService.getDocuments());

      // Initialize search engine (prefetch common pages)
      initializeSearchEngine();

    } catch (e) {
      console.error("Initialization error:", e);
      setError("Failed to initialize application");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    StorageService.setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  }, [theme]);

  const createNewThread = useCallback(() => {
    try {
      const newThread: Thread = {
        id: Date.now().toString(),
        title: 'New Search',
        messages: [],
        updatedAt: Date.now()
      };
      setThreads(prev => [newThread, ...prev]);
      setCurrentThreadId(newThread.id);
      StorageService.saveThread(newThread);
      setSidebarOpen(false);
      setError(null);
    } catch (e) {
      console.error("Failed to create thread:", e);
    }
  }, []);

  const deleteThread = useCallback((id: string) => {
    try {
      StorageService.deleteThread(id);
      setThreads(prev => {
        const remaining = prev.filter(t => t.id !== id);
        if (currentThreadId === id) {
          setCurrentThreadId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
    } catch (e) {
      console.error("Failed to delete thread:", e);
    }
  }, [currentThreadId]);

  const handleSendMessage = useCallback(async (content: string, enableWebSearch = false) => {
    setError(null);
    setSearchStatus('');

    let threadId = currentThreadId;
    let currentThread = threads.find(t => t.id === threadId);

    try {
      // Create new thread if needed
      if (!threadId || !currentThread) {
        const newThread: Thread = {
          id: Date.now().toString(),
          title: 'New Search',
          messages: [],
          updatedAt: Date.now()
        };
        setThreads(prev => [newThread, ...prev]);
        setCurrentThreadId(newThread.id);
        threadId = newThread.id;
        currentThread = newThread;
        StorageService.saveThread(newThread);
      }

      // Add user message
      const userMsg: Message = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: Date.now()
      };

      const updatedMessages = [...currentThread.messages, userMsg];
      let updatedThread = { ...currentThread, messages: updatedMessages, updatedAt: Date.now() };

      setThreads(prev => prev.map(t => t.id === threadId ? updatedThread : t));
      setIsLoading(true);

      // Progress callback for search status updates
      const onProgress = (status: string) => {
        setSearchStatus(status);
      };

      // Generate response with web scraping
      const response = await generateAnswer(
        content,
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
        userRole,
        documents,
        enableWebSearch,
        onProgress
      );

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response.text,
        citations: response.citations,
        needsWebSearchApproval: response.needsWebSearchApproval,
        scrapedPages: response.scrapedPages,
        timestamp: Date.now()
      };

      const finalMessages = [...updatedMessages, botMsg];
      updatedThread = { ...updatedThread, messages: finalMessages };

      // Generate title for new threads
      if (finalMessages.length <= 2) {
        try {
          const newTitle = await generateChatTitle(content, response.text);
          updatedThread.title = newTitle;
        } catch (e) {
          console.warn("Title generation failed");
        }
      }

      setThreads(prev => prev.map(t => t.id === threadId ? updatedThread : t));
      StorageService.saveThread(updatedThread);

    } catch (err: any) {
      console.error("Search error:", err);

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: `⚠️ **Search Error**\n\n${err.message || 'An unexpected error occurred'}\n\nPlease try again.`,
        timestamp: Date.now()
      };

      if (currentThread) {
        const errorThread = {
          ...currentThread,
          messages: [...currentThread.messages, errorMsg],
          updatedAt: Date.now()
        };
        setThreads(prev => prev.map(t => t.id === threadId ? errorThread : t));
        StorageService.saveThread(errorThread);
      }
    } finally {
      setIsLoading(false);
      setSearchStatus('');
    }
  }, [currentThreadId, threads, userRole, documents]);

  const currentMessages = threads.find(t => t.id === currentThreadId)?.messages || [];

  return (
    <ErrorBoundary onError={(e) => console.error("ErrorBoundary:", e)}>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0a0a0b]">

        {/* Error Toast */}
        {error && (
          <div className="fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 animate-slide-down">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-white/80 hover:text-white">
              ✕
            </button>
          </div>
        )}

        <Sidebar
          threads={threads}
          currentThreadId={currentThreadId}
          onSelectThread={(id) => { setCurrentThreadId(id); setSidebarOpen(false); }}
          onNewThread={createNewThread}
          onDeleteThread={deleteThread}
          userRole={userRole}
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          onOpenAdmin={() => setShowAdmin(true)}
        />

        <div className="flex-1 flex flex-col min-w-0 relative">
          <Header
            theme={theme}
            toggleTheme={toggleTheme}
            userRole={userRole}
            onRoleChange={() => { }}
            toggleSidebar={() => setSidebarOpen(true)}
          />

          {/* Desktop Menu Trigger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="hidden lg:flex absolute top-6 left-6 z-20 p-2.5 bg-white/80 dark:bg-white/5 backdrop-blur-md border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-xl shadow-sm transition-all hover:scale-105"
          >
            <Menu className="w-5 h-5" />
          </button>

          <DesktopControls
            theme={theme}
            toggleTheme={toggleTheme}
          />

          <ChatInterface
            messages={currentMessages}
            isLoading={isLoading}
            onSendMessage={handleSendMessage}
            onNewChat={createNewThread}
            userRole={userRole}
            searchStatus={searchStatus}
          />
        </div>

        {showAdmin && (
          <AdminPanel
            onClose={() => setShowAdmin(false)}
            documents={documents}
            onUpdateDocs={() => setDocuments(StorageService.getDocuments())}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;