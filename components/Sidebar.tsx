import React from 'react';
import { Thread, Role } from '../types';
import { PlusCircle, MessageSquare, Trash2, Settings, X, Search } from 'lucide-react';

interface SidebarProps {
  threads: Thread[];
  currentThreadId: string | null;
  onSelectThread: (id: string) => void;
  onNewThread: () => void;
  onDeleteThread: (id: string) => void;
  userRole: Role;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  onOpenAdmin: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  threads,
  currentThreadId,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  userRole,
  isOpen,
  setIsOpen,
  onOpenAdmin
}) => {
  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-black/40 backdrop-blur-sm z-40 transition-opacity duration-300 ease-in-out ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setIsOpen(false)}
      />

      {/* Sidebar Panel - Sliding Drawer */}
      <div 
        className={`fixed inset-y-4 left-4 z-50 w-72 bg-white/95 dark:bg-[#1a1f2c]/95 backdrop-blur-xl border border-gray-200 dark:border-gray-800 rounded-3xl shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${isOpen ? 'translate-x-0' : '-translate-x-[120%]'}`}
      >
        
        {/* Header */}
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-teal-400 rounded-full flex items-center justify-center shadow-lg">
                <span className="text-white font-bold text-xs">SIT</span>
            </div>
            <span className="text-gray-900 dark:text-white font-semibold text-lg tracking-tight">Scholar</span>
          </div>
          <button 
            onClick={() => setIsOpen(false)} 
            className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-4 pb-2">
          <button
            onClick={() => {
                onNewThread();
                setIsOpen(false);
            }}
            className="w-full flex items-center space-x-3 bg-gray-50 dark:bg-black/20 text-gray-900 dark:text-white px-4 py-3 rounded-2xl hover:bg-blue-50 dark:hover:bg-blue-900/20 hover:text-blue-600 dark:hover:text-blue-400 transition-all duration-200 border border-gray-100 dark:border-gray-800 group"
          >
            <div className="p-1 bg-white dark:bg-gray-800 rounded-full shadow-sm group-hover:scale-110 transition-transform">
                <PlusCircle className="w-5 h-5 text-blue-500" />
            </div>
            <span className="font-medium">New Search</span>
          </button>
        </div>

        {/* Thread History */}
        <div className="flex-1 overflow-y-auto px-2 py-2 custom-scrollbar">
          <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest px-4 mb-2 mt-2">
            Recent
          </div>
          <div className="space-y-1">
            {threads.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                <Search className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p>No history yet</p>
              </div>
            )}
            {threads.map(thread => (
              <div 
                key={thread.id}
                className={`group relative flex items-center justify-between px-4 py-3 rounded-2xl text-sm transition-all cursor-pointer ${
                  thread.id === currentThreadId 
                    ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white font-medium shadow-sm' 
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'
                }`}
                onClick={() => {
                    onSelectThread(thread.id);
                    setIsOpen(false);
                }}
              >
                <div className="flex items-center space-x-3 overflow-hidden">
                  <MessageSquare className={`w-4 h-4 flex-shrink-0 ${thread.id === currentThreadId ? 'text-blue-500' : 'text-gray-400'}`} />
                  <span className="truncate">{thread.title}</span>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteThread(thread.id); }}
                  className="absolute right-2 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full opacity-0 group-hover:opacity-100 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800">
          <button 
            onClick={() => {
                onOpenAdmin();
                setIsOpen(false);
            }}
            className="w-full flex items-center justify-center space-x-2 px-3 py-2.5 rounded-xl text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Knowledge Base</span>
          </button>
        </div>
      </div>
    </>
  );
};