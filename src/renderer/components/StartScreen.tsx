import React, { useState, useEffect } from 'react';
import { FolderOpen, Clock, Search, Folder, X, ChevronRight } from 'lucide-react';

interface RecentProject {
  path: string;
  lastOpened: string;
  name: string;
}

interface StartScreenProps {
  onOpenFolder: (path: string) => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({ onOpenFolder }) => {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<RecentProject[]>([]);

  useEffect(() => {
    loadRecentProjects();
  }, []);

  const loadRecentProjects = async () => {
    try {
      const projects = await window.electronAPI.getRecentProjects();
      setRecentProjects(projects);
    } catch (error) {
      console.error('Failed to load recent projects:', error);
    }
  };

  const handleOpenFolder = async () => {
    try {
      const result = await window.electronAPI.openFolder();
      if (result && !result.canceled && result.filePaths.length > 0) {
        onOpenFolder(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  };

  const handleRemoveProject = async (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await window.electronAPI.removeRecentProject(path);
      loadRecentProjects();
    } catch (error) {
      console.error('Failed to remove project:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = (now.getTime() - date.getTime()) / (1000 * 60);
    
    if (diffInMinutes < 60) {
      return `${Math.floor(diffInMinutes)} min ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)} hours ago`;
    } else if (diffInMinutes < 10080) {
      return `${Math.floor(diffInMinutes / 1440)} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const filteredProjects = searchTerm 
    ? recentProjects.filter(project => 
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.path.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : recentProjects;

  return (
    <div className="h-full w-full bg-gray-900 flex flex-col items-center justify-center overflow-hidden">
      <div className="max-w-4xl w-full px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">Welcome to LabRats.ai</h1>
          <p className="text-xl text-gray-400">Start by opening a project folder</p>
        </div>

        {/* Search Bar */}
        <div className="mb-8">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search recent projects..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          <button
            onClick={handleOpenFolder}
            className="flex items-center justify-center space-x-3 p-6 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <FolderOpen className="w-6 h-6" />
            <span className="text-lg font-medium">Open Folder</span>
          </button>
          <button
            className="flex items-center justify-center space-x-3 p-6 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors border border-gray-700"
          >
            <Folder className="w-6 h-6" />
            <span className="text-lg font-medium">Create New Project</span>
          </button>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-semibold text-white mb-6 flex items-center justify-center">
              <Clock className="w-6 h-6 mr-2" />
              Recent Projects
            </h2>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {filteredProjects.map((project) => (
                <div
                  key={project.path}
                  onClick={() => onOpenFolder(project.path)}
                  className="group flex items-center justify-between p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg cursor-pointer transition-all"
                >
                  <div className="flex items-center space-x-4">
                    <Folder className="w-6 h-6 text-blue-400" />
                    <div>
                      <h3 className="text-lg font-medium text-white">{project.name}</h3>
                      <p className="text-sm text-gray-400">{project.path}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        Last opened {formatDate(project.lastOpened)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={(e) => handleRemoveProject(project.path, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-400 transition-all"
                      title="Remove from recent"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {recentProjects.length === 0 && !searchTerm && (
          <div className="text-center text-gray-400 mt-12">
            <Folder className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No recent projects</p>
            <p className="text-sm mt-2">Open a folder to get started</p>
          </div>
        )}

        {/* No Search Results */}
        {filteredProjects.length === 0 && searchTerm && (
          <div className="text-center text-gray-400 mt-12">
            <Search className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">No projects found</p>
            <p className="text-sm mt-2">Try a different search term</p>
          </div>
        )}
      </div>
    </div>
  );
};