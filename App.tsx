import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatInterface } from './components/ChatInterface';
import { Header, DesktopControls } from './components/Header';
import { AdminPanel } from './components/AdminPanel';
import { StorageService } from './services/storageService';
import { generateAnswer, generateChatTitle } from './services/geminiService';
import { Thread, Message, Role, Document } from './types';
import { Menu } from 'lucide-react';

function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Default to ADMIN as per requirements
  const [userRole, setUserRole] = useState<Role>(Role.ADMIN);
  
  const [threads, setThreads] = useState<Thread[]>([]);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  
  const [documents, setDocuments] = useState<Document[]>([]);

  // Initialization
  useEffect(() => {
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
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    StorageService.setTheme(newTheme);
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const createNewThread = () => {
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
  };

  const deleteThread = (id: string) => {
    StorageService.deleteThread(id);
    setThreads(prev => {
        const remaining = prev.filter(t => t.id !== id);
        if (currentThreadId === id) {
            setCurrentThreadId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
    });
  };

  const handleSendMessage = async (content: string, enableWebSearch = false) => {
    let threadId = currentThreadId;
    let currentThread = threads.find(t => t.id === threadId);
    let isNewThread = false;

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

    // Call Gemini
    const response = await generateAnswer(
      content,
      updatedMessages.map(m => ({ role: m.role, content: m.content })),
      userRole,
      documents,
      enableWebSearch
    );

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
       const newTitle = await generateChatTitle(content, response.text);
       updatedThread.title = newTitle;
    }

    setThreads(prev => prev.map(t => t.id === threadId ? updatedThread : t));
    StorageService.saveThread(updatedThread);
    setIsLoading(false);
  };

  const currentMessages = threads.find(t => t.id === currentThreadId)?.messages || [];

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-[#0f0f10]">
      
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
          onRoleChange={() => {}}
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
  );
}

export default App;