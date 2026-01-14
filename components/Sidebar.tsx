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
    <div className="h-full w-72 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">

      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">SIT</span>
          </div>
          <span className="text-gray-900 dark:text-white font-semibold">Scholar</span>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* New Search Button */}
      <div className="p-3">
        <button
          onClick={() => {
            onNewThread();
            setIsOpen(false);
          }}
          className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors"
        >
          <PlusCircle className="w-5 h-5" />
          <span className="font-medium">New Search</span>
        </button>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto px-2">
        <div className="text-xs font-medium text-gray-400 uppercase tracking-wider px-3 py-2">
          Recent
        </div>

        {threads.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-400">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No history yet</p>
          </div>
        ) : (
          <div className="space-y-1">
            {threads.map(thread => (
              <div
                key={thread.id}
                onClick={() => {
                  onSelectThread(thread.id);
                  setIsOpen(false);
                }}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${thread.id === currentThreadId
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <MessageSquare className={`w-4 h-4 flex-shrink-0 ${thread.id === currentThreadId ? 'text-blue-500' : 'text-gray-400'
                    }`} />
                  <span className="text-sm truncate">{thread.title}</span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteThread(thread.id);
                  }}
                  className="p-1 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={() => {
            onOpenAdmin();
            setIsOpen(false);
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          <Settings className="w-4 h-4" />
          <span>Knowledge Base</span>
        </button>
      </div>
    </div>
  );
};