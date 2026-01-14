import React, { useState } from 'react';
import { Document } from '../types';
import { Button } from './ui/Button';
import { Trash2, Upload, FileText, Lock, Globe } from 'lucide-react';
import { StorageService } from '../services/storageService';

interface AdminPanelProps {
  onClose: () => void;
  documents: Document[];
  onUpdateDocs: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onClose, documents, onUpdateDocs }) => {
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [newDocCategory, setNewDocCategory] = useState<Document['category']>('student_list');
  const [isRestricted, setIsRestricted] = useState(true);

  const handleUpload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle || !newDocContent) return;

    const newDoc: Document = {
      id: Date.now().toString(),
      title: newDocTitle,
      content: newDocContent,
      category: newDocCategory,
      isRestricted,
      dateUploaded: new Date().toISOString()
    };

    StorageService.addDocument(newDoc);
    onUpdateDocs();
    setNewDocTitle('');
    setNewDocContent('');
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this document?')) {
      StorageService.deleteDocument(id);
      onUpdateDocs();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white dark:bg-sit-900 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-200 dark:border-sit-700 flex justify-between items-center">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Admin Knowledge Base</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-white">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Upload Section */}
          <div className="bg-gray-50 dark:bg-sit-800 p-6 rounded-xl border border-gray-200 dark:border-sit-700">
            <h3 className="text-lg font-medium mb-4 flex items-center space-x-2 text-gray-900 dark:text-white">
              <Upload className="w-5 h-5" />
              <span>Add New Record</span>
            </h3>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
                  <input 
                    type="text" 
                    value={newDocTitle}
                    onChange={(e) => setNewDocTitle(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 dark:border-sit-700 bg-white dark:bg-sit-900 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. MCA Sem 3 List"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                  <select 
                    value={newDocCategory}
                    onChange={(e) => setNewDocCategory(e.target.value as any)}
                    className="w-full rounded-lg border border-gray-300 dark:border-sit-700 bg-white dark:bg-sit-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
                  >
                    <option value="student_list">Student List</option>
                    <option value="faculty_file">Faculty File</option>
                    <option value="curriculum">Curriculum</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Content (Raw Text)</label>
                <textarea 
                  value={newDocContent}
                  onChange={(e) => setNewDocContent(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-sit-700 bg-white dark:bg-sit-900 px-3 py-2 text-sm text-gray-900 dark:text-white h-32 font-mono"
                  placeholder="Paste document content here..."
                />
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={isRestricted} 
                    onChange={(e) => setIsRestricted(e.target.checked)}
                    className="rounded text-blue-500 focus:ring-blue-500 bg-gray-100 dark:bg-sit-700 border-gray-300 dark:border-sit-600" 
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Restricted Access (Admin/Auth Only)</span>
                </label>
                <Button type="submit" size="sm">Upload Document</Button>
              </div>
            </form>
          </div>

          {/* List Section */}
          <div>
            <h3 className="text-lg font-medium mb-4 text-gray-900 dark:text-white">Existing Documents</h3>
            <div className="space-y-3">
              {documents.map(doc => (
                <div key={doc.id} className="flex items-center justify-between p-4 bg-white dark:bg-sit-800 rounded-lg border border-gray-200 dark:border-sit-700">
                  <div className="flex items-start space-x-4">
                    <div className="p-2 bg-gray-100 dark:bg-sit-700 rounded-lg">
                      <FileText className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900 dark:text-white">{doc.title}</h4>
                      <div className="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <span className="uppercase">{doc.category}</span>
                        <span>•</span>
                        <span className="flex items-center space-x-1">
                          {doc.isRestricted ? <Lock className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                          <span>{doc.isRestricted ? 'Restricted' : 'Public'}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleDelete(doc.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};