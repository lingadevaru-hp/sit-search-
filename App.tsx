import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { Header, DesktopControls } from './components/Header';
import { AdminPanel } from './components/AdminPanel';
import { StorageService } from './services/storageService';
import { generateAnswer, generateChatTitle, initializeSearchEngine, cancelCurrentRequest } from './services/geminiService';
import { Thread, Message, Role, Document } from './types';
import { Menu, X } from 'lucide-react';

// Error Boundary Component
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-8">
          <div className="max-w-md text-center space-y-6">
            <div className="text-6xl">⚠️</div>
            <h1 className="text-2xl font-bold">Something went wrong</h1>
            <p className="text-gray-400">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Reload
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
  const [canStop, setCanStop] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [searchStatus, setSearchStatus] = useState<string>('');

  const [documents, setDocuments] = useState<Document[]>([]);

  // Initialize
  useEffect(() => {
    try {
      const storedTheme = StorageService.getTheme();
      setTheme(storedTheme);
      document.documentElement.classList.toggle('dark', storedTheme === 'dark');

      const loadedThreads = StorageService.getThreads();
      setThreads(loadedThreads);
      if (loadedThreads.length > 0) {
        setCurrentThreadId(loadedThreads[0].id);
      }

      setDocuments(StorageService.getDocuments());
      initializeSearchEngine();
    } catch (e) {
      console.error("Init error:", e);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    StorageService.setTheme(newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  }, [theme]);

  const createNewThread = useCallback(() => {
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
  }, []);

  const deleteThread = useCallback((id: string) => {
    StorageService.deleteThread(id);
    setThreads(prev => {
      const remaining = prev.filter(t => t.id !== id);
      if (currentThreadId === id) {
        setCurrentThreadId(remaining.length > 0 ? remaining[0].id : null);
      }
      return remaining;
    });
  }, [currentThreadId]);

  const handleStopGeneration = useCallback(() => {
    cancelCurrentRequest();
    setIsLoading(false);
    setCanStop(false);
    setSearchStatus('');
  }, []);

  const handleSendMessage = useCallback(async (content: string, enableWebSearch = false) => {
    setSearchStatus('');

    let threadId = currentThreadId;
    let currentThread = threads.find(t => t.id === threadId);

    // Create thread if needed
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
    setCanStop(true);

    try {
      const response = await generateAnswer(
        content,
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
        userRole,
        documents,
        enableWebSearch,
        (status) => setSearchStatus(status)
      );

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: response.text,
        citations: response.citations,
        timestamp: Date.now()
      };

      const finalMessages = [...updatedMessages, botMsg];
      updatedThread = { ...updatedThread, messages: finalMessages };

      // Generate title for new threads
      if (finalMessages.length <= 2) {
        try {
          const title = await generateChatTitle(content);
          updatedThread.title = title;
        } catch { }
      }

      setThreads(prev => prev.map(t => t.id === threadId ? updatedThread : t));
      StorageService.saveThread(updatedThread);

    } catch (err: any) {
      console.error("Send error:", err);

      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: `⚠️ Error: ${err.message || 'Something went wrong'}`,
        timestamp: Date.now()
      };

      const errorThread = {
        ...updatedThread,
        messages: [...updatedMessages, errorMsg]
      };
      setThreads(prev => prev.map(t => t.id === threadId ? errorThread : t));
      StorageService.saveThread(errorThread);
    } finally {
      setIsLoading(false);
      setCanStop(false);
      setSearchStatus('');
    }
  }, [currentThreadId, threads, userRole, documents]);

  const currentMessages = threads.find(t => t.id === currentThreadId)?.messages || [];

  return (
    <ErrorBoundary>
      <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0a0a0b]">

        {/* Sidebar Overlay - only on mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
                    fixed lg:relative inset-y-0 left-0 z-40
                    w-72 transform transition-transform duration-300 ease-in-out
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden'}
                `}>
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
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 relative">
          <Header
            theme={theme}
            toggleTheme={toggleTheme}
            userRole={userRole}
            onRoleChange={() => { }}
            toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />

          {/* Toggle Sidebar Button */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="absolute top-6 left-6 z-20 p-2.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl shadow-sm transition-all"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <DesktopControls
            theme={theme}
            toggleTheme={toggleTheme}
          />

          <ChatInterface
            messages={currentMessages}
            isLoading={isLoading}
            canStop={canStop}
            onStopGeneration={handleStopGeneration}
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