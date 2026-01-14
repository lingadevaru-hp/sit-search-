import React from 'react';
import { Role } from '../types';
import { Moon, Sun, Menu } from 'lucide-react';

interface HeaderProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  userRole: Role;
  onRoleChange: (role: Role) => void;
  toggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
  theme, 
  toggleTheme, 
  toggleSidebar 
}) => {
  return (
    <header className="flex items-center justify-between p-4 bg-transparent absolute top-0 left-0 right-0 z-10 lg:hidden">
      <button onClick={toggleSidebar} className="p-2 text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-black/50 rounded-xl backdrop-blur-sm">
        <Menu className="w-6 h-6" />
      </button>
      
      <div className="flex items-center space-x-2">
        <button 
          onClick={toggleTheme}
          className="p-2 text-gray-600 dark:text-gray-300 hover:bg-white/50 dark:hover:bg-black/50 rounded-xl backdrop-blur-sm"
        >
          {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>
      </div>
    </header>
  );
};

export const DesktopControls: React.FC<Omit<HeaderProps, 'toggleSidebar' | 'userRole' | 'onRoleChange'>> = ({
    theme, toggleTheme
}) => {
    return (
        <div className="hidden lg:flex absolute top-6 right-6 z-20 items-center space-x-4">
            <button 
                onClick={toggleTheme}
                className="p-2.5 bg-white/80 dark:bg-sit-800/50 backdrop-blur-md border border-gray-200 dark:border-gray-700/50 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-sit-700/50 rounded-full shadow-sm transition-all hover:scale-105"
            >
            {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
        </div>
    )
}