import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { Header, DesktopControls } from './components/Header';
import { AdminPanel } from './components/AdminPanel';
import { StorageService } from './services/storageService';
import { generateAnswer, generateChatTitle } from './services/geminiService';
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
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">
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
  // Default to ADMIN as per requirements
  const [userRole, setUserRole] = useState<Role>(Role.ADMIN);

  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [documents, setDocuments] = useState<Document[]>([]);

  // Initialization
  useEffect(() => {
    try {
      // Theme
      const storedTheme = StorageService.getTheme();
      setTheme(storedTheme);
      if (storedTheme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // Data
      const loadedThreads = StorageService.getThreads();
      setThreads(loadedThreads);

      // Select most recent thread if available
      if (loadedThreads.length > 0) {
        setCurrentThreadId(loadedThreads[0].id);
      }

      // Role is hardcoded to ADMIN for this view
      setDocuments(StorageService.getDocuments());
    } catch (e) {
      console.error("Initialization error:", e);
      setError("Failed to initialize application");
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    StorageService.setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const createNewThread = useCallback(() => {
    try {
      const newThread: Thread = {
        id: Date.now().toString(),
        title: 'New Conversation',
        messages: [],
        updatedAt: Date.now()
      };
      setThreads(prev => [newThread, ...prev]);
      setCurrentThreadId(newThread.id);
      StorageService.saveThread(newThread);
      setSidebarOpen(false);
      setError(null); // Clear any previous errors
    } catch (e) {
      console.error("Failed to create thread:", e);
      setError("Failed to create new conversation");
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
    // Clear previous errors
    setError(null);

    let threadId = currentThreadId;
    let currentThread = threads.find(t => t.id === threadId);
    let isNewThread = false;

    try {
      if (!threadId || !currentThread) {
        isNewThread = true;
        const newThread: Thread = {
          id: Date.now().toString(),
          title: 'New Conversation',
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

      // Call Gemini with timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 60000); // 60 second timeout
      });

      const responsePromise = generateAnswer(
        content,
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
        userRole,
        documents,
        enableWebSearch
      );

      const response = await Promise.race([responsePromise, timeoutPromise]);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response.text,
        citations: response.citations,
        needsWebSearchApproval: response.needsWebSearchApproval,
        timestamp: Date.now()
      };

      const finalMessages = [...updatedMessages, botMsg];
      updatedThread = { ...updatedThread, messages: finalMessages };

      // Auto-rename logic for new threads (first exchange)
      if (finalMessages.length <= 2) {
        try {
          const newTitle = await generateChatTitle(content, response.text);
          updatedThread.title = newTitle;
        } catch (titleError) {
          console.warn("Failed to generate title:", titleError);
          // Keep default title on error
        }
      }

      setThreads(prev => prev.map(t => t.id === threadId ? updatedThread : t));
      StorageService.saveThread(updatedThread);

    } catch (err: any) {
      console.error("Message handling error:", err);

      // Add error message to the conversation
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: err.message === 'Request timed out'
          ? '⏱️ **Request Timed Out**\n\nThe request took too long to complete. Please try again.'
          : `⚠️ **Error**: ${err.message || 'An unexpected error occurred'}\n\nPlease try again.`,
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
    }
  }, [currentThreadId, threads, userRole, documents]);

  const currentMessages = threads.find(t => t.id === currentThreadId)?.messages || [];

  // Display error notification if any
  const renderError = () => {
    if (!error) return null;
    return (
      <div className="fixed top-4 right-4 z-50 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-3">
        <span>{error}</span>
        <button onClick={() => setError(null)} className="text-white/80 hover:text-white">
          ✕
        </button>
      </div>
    );
  };

  return (
    <ErrorBoundary onError={(e) => console.error("ErrorBoundary caught:", e)}>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0f0f10]">

        {renderError()}

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
            className="hidden lg:flex absolute top-6 left-6 z-20 p-2.5 bg-white/80 dark:bg-sit-800/50 backdrop-blur-md border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-sit-700/50 rounded-xl shadow-sm transition-all hover:scale-105"
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