import React, { useState, useEffect } from 'react';
import { Folder, File, ChevronRight, ChevronDown, Search, Plus, Eye, AlertCircle, FolderOpen, ChevronUp, Minimize2, Zap, FileText } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { FileNode } from '../types/electron';
import { getFileIconInfo } from '../utils/fileIcons';
import { getLanguageFromFileName, getLanguageDisplayName } from '../utils/fileLanguages';
import { stateManager } from '../../services/state-manager';
import '@vscode/codicons/dist/codicon.css';

interface FileExplorerProps {
  currentFolder: string | null;
  isVisible?: boolean;
  navigateToFile?: { filePath: string; lineNumber?: number } | null;
  onNavigationComplete?: () => void;
}

export const FileExplorer: React.FC<FileExplorerProps> = ({ currentFolder, isVisible = true, navigateToFile, onNavigationComplete }) => {
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [detailsCollapsed, setDetailsCollapsed] = useState(false);
  const [isVectorSearch, setIsVectorSearch] = useState(false);
  const [vectorSearchResults, setVectorSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debug mode flag
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [isRestoringState, setIsRestoringState] = useState(false);

  // Load persisted state when component mounts or folder changes
  useEffect(() => {
    if (currentFolder) {
      const persistedState = stateManager.getFileExplorerState();
      if (persistedState) {
        if (persistedState.searchTerm) {
          setSearchTerm(persistedState.searchTerm);
        }
        if (persistedState.detailsCollapsed !== undefined) {
          setDetailsCollapsed(persistedState.detailsCollapsed);
        }
      }
    }
  }, [currentFolder]);

  // Restore selected file and expanded state after file tree loads and component becomes visible
  useEffect(() => {
    if (currentFolder && fileTree.length > 0 && isVisible) {
      const persistedState = stateManager.getFileExplorerState();
      if (persistedState?.selectedFilePath && !selectedFile && !isRestoringState) {
        setIsRestoringState(true);
        const selectedNode = findNodeByPath(fileTree, persistedState.selectedFilePath);
        if (selectedNode) {
          setSelectedFile(selectedNode);
          if (selectedNode.type === 'file') {
            loadFileContent(selectedNode.path);
          }
        }
        // Reset restoring flag after a short delay
        setTimeout(() => setIsRestoringState(false), 1000);
      }
    }
  }, [fileTree, currentFolder, selectedFile, isRestoringState, isVisible]);

  // Persist state when it changes (but not during state restoration)
  useEffect(() => {
    if (currentFolder && !isRestoringState) {
      const stateToSave = {
        searchTerm,
        detailsCollapsed,
        selectedFilePath: selectedFile?.path || null,
        expandedFolders: getExpandedFolders(fileTree)
      };
      stateManager.setFileExplorerState(stateToSave);
    }
  }, [searchTerm, detailsCollapsed, selectedFile, fileTree, currentFolder, isRestoringState]);

  // Clear vector search results when switching modes or clearing search
  useEffect(() => {
    if (!isVectorSearch || !searchTerm.trim()) {
      setVectorSearchResults([]);
    }
  }, [isVectorSearch, searchTerm]);

  // Helper function to get expanded folder paths
  const getExpandedFolders = (nodes: FileNode[]): string[] => {
    const expanded: string[] = [];
    const traverse = (nodeList: FileNode[]) => {
      for (const node of nodeList) {
        if (node.type === 'folder' && node.isExpanded) {
          expanded.push(node.path);
          if (node.children) {
            traverse(node.children);
          }
        }
      }
    };
    traverse(nodes);
    return expanded;
  };

  // Helper function to restore expanded state
  const restoreExpandedState = (nodes: FileNode[], expandedPaths: string[]): FileNode[] => {
    return nodes.map(node => {
      if (node.type === 'folder' && expandedPaths.includes(node.path)) {
        return {
          ...node,
          isExpanded: true,
          children: node.children ? restoreExpandedState(node.children, expandedPaths) : node.children
        };
      }
      return {
        ...node,
        children: node.children ? restoreExpandedState(node.children, expandedPaths) : node.children
      };
    });
  };

  useEffect(() => {
    const checkDebugMode = async () => {
      try {
        const debugValue = await window.electronAPI.getEnv('LABRATS_DEBUG');
        setIsDebugMode(debugValue === 'true');
      } catch (error) {
        console.error('Error checking debug mode:', error);
        setIsDebugMode(false);
      }
    };
    checkDebugMode();
  }, []);

  const loadFileContent = async (filePath: string) => {
    try {
      const content = await window.electronAPI.readFile(filePath);
      setFileContent(content);
    } catch (error) {
      setFileContent(`Error loading file: ${error}`);
    }
  };

  // Handle navigation to specific file
  useEffect(() => {
    if (navigateToFile && currentFolder && isVisible) {
      const navigateToRequestedFile = async () => {
        const { filePath, lineNumber } = navigateToFile;
        
        // Convert relative path to absolute if needed
        const absolutePath = filePath.startsWith('/') 
          ? filePath 
          : `${currentFolder}/${filePath}`;

        // Find the file node in the tree
        const fileNode = findNodeByPath(fileTree, absolutePath);
        
        if (fileNode) {
          // File is already in the tree, select it
          setSelectedFile(fileNode);
          if (fileNode.type === 'file') {
            await loadFileContent(fileNode.path);
          }
        } else {
          // File not in tree, try to load it directly
          try {
            const stats = await window.electronAPI.getFileStats(absolutePath);
            const newNode: FileNode = {
              id: absolutePath,
              name: absolutePath.split('/').pop() || '',
              type: 'file',
              path: absolutePath,
              size: stats.size,
              lastModified: stats.modifiedTime,
              isExpanded: false
            };
            setSelectedFile(newNode);
            await loadFileContent(absolutePath);
          } catch (error) {
            console.error('Failed to load file:', absolutePath, error);
          }
        }

        // Complete navigation
        if (onNavigationComplete) {
          onNavigationComplete();
        }
      };

      navigateToRequestedFile();
    }
  }, [navigateToFile, currentFolder, fileTree, isVisible, onNavigationComplete]);


  // Load folder contents when currentFolder changes
  useEffect(() => {
    if (currentFolder) {
      loadDirectory(currentFolder);
    } else {
      setFileTree([]);
      setError(null);
    }
  }, [currentFolder]);

  const loadDirectory = async (dirPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const files = await window.electronAPI.readDirectory(dirPath);
      
      // Restore expanded state and selected file from persisted state
      const persistedState = stateManager.getFileExplorerState();
      let processedFiles = files;
      
      if (persistedState?.expandedFolders) {
        processedFiles = restoreExpandedState(files, persistedState.expandedFolders);
        
        // Load children for expanded folders
        for (const expandedPath of persistedState.expandedFolders) {
          try {
            const children = await window.electronAPI.readDirectory(expandedPath);
            processedFiles = updateNodeChildren(processedFiles, expandedPath, children);
          } catch (error) {
            console.warn(`Failed to load expanded folder: ${expandedPath}`, error);
          }
        }
      }
      
      setFileTree(processedFiles);
      
      // Note: Selected file restoration moved to separate useEffect
    } catch (error) {
      setError(`Failed to load directory: ${error}`);
      setFileTree([]);
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to update node children
  const updateNodeChildren = (nodes: FileNode[], targetPath: string, children: FileNode[]): FileNode[] => {
    return nodes.map(node => {
      if (node.path === targetPath) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateNodeChildren(node.children, targetPath, children) };
      }
      return node;
    });
  };
  
  // Helper function to find node by path
  const findNodeByPath = (nodes: FileNode[], targetPath: string): FileNode | null => {
    for (const node of nodes) {
      if (node.path === targetPath) {
        return node;
      }
      if (node.children) {
        const found = findNodeByPath(node.children, targetPath);
        if (found) return found;
      }
    }
    return null;
  };

  const handleOpenFolder = async () => {
    try {
      const result = await window.electronAPI.openFolder();
      if (result && !result.canceled && result.filePaths.length > 0) {
        // The App component will handle the folder opening via the menu system
        // This is just a fallback
      }
    } catch (error) {
      console.error('Error opening folder:', error);
    }
  };

  const toggleFolder = async (targetNode: FileNode) => {
    if (targetNode.type === 'folder') {
      // If folder is being expanded and has no children loaded, load them
      if (!targetNode.isExpanded && (!targetNode.children || targetNode.children.length === 0)) {
        try {
          const children = await window.electronAPI.readDirectory(targetNode.path);
          const updateNode = (nodes: FileNode[]): FileNode[] => {
            return nodes.map(node => {
              if (node.id === targetNode.id) {
                return { ...node, isExpanded: true, children };
              }
              if (node.children) {
                return { ...node, children: updateNode(node.children) };
              }
              return node;
            });
          };
          setFileTree(updateNode(fileTree));
        } catch (error) {
          console.error('Error loading folder contents:', error);
        }
      } else {
        // Just toggle the expanded state
        const updateNode = (nodes: FileNode[]): FileNode[] => {
          return nodes.map(node => {
            if (node.id === targetNode.id) {
              return { ...node, isExpanded: !node.isExpanded };
            }
            if (node.children) {
              return { ...node, children: updateNode(node.children) };
            }
            return node;
          });
        };
        setFileTree(updateNode(fileTree));
      }
    }
  };

  const getFileIcon = (fileName: string, isFolder: boolean = false, large: boolean = false) => {
    const iconInfo = getFileIconInfo(fileName, isFolder);
    return (
      <i 
        className={`codicon codicon-${iconInfo.icon} ${large ? 'file-icon-large' : 'file-icon'}`}
        style={{ color: iconInfo.color }}
      />
    );
  };



  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMinutes = (now.getTime() - date.getTime()) / (1000 * 60);
    
    if (diffInMinutes < 60) {
      return `${Math.floor(diffInMinutes)} min ago`;
    } else if (diffInMinutes < 1440) {
      return `${Math.floor(diffInMinutes / 60)} hours ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const performVectorSearch = async () => {
    if (!searchTerm.trim() || !currentFolder) return;
    
    setIsSearching(true);
    setVectorSearchResults([]);
    
    try {
      const results = await window.electronAPI.codeVectorization?.searchCode(searchTerm, {
        limit: 20,
        minSimilarity: 0.5
      });
      
      if (results?.success && results?.results) {
        setVectorSearchResults(results.results);
      } else {
        console.error('Vector search failed:', results?.error || 'API not available');
        setVectorSearchResults([]);
      }
    } catch (error) {
      console.error('Error performing vector search:', error);
      setVectorSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const renderFileNode = (node: FileNode, depth: number = 0) => {
    const isFolder = node.type === 'folder';
    const hasChildren = node.children && node.children.length > 0;
    const isSelected = selectedFile?.id === node.id;

    return (
      <div key={node.id}>
        <div
          className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-gray-700 transition-colors ${
            isSelected ? 'bg-blue-600' : ''
          }`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => {
            if (isFolder) {
              toggleFolder(node);
            } else {
              setSelectedFile(node);
              loadFileContent(node.path);
            }
          }}
        >
          {isFolder && hasChildren && (
            <button className="p-0.5">
              {node.isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-400" />
              )}
            </button>
          )}
          
          {isFolder && !hasChildren && <div className="w-5" />}
          
          {getFileIcon(node.name, isFolder)}
          
          <span className="text-gray-300 text-sm flex-1">{node.name}</span>
          
          {!isFolder && (
            <span className="text-xs text-gray-500">{node.size}</span>
          )}
        </div>
        
        {isFolder && node.isExpanded && node.children && (
          <div>
            {node.children.map(child => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const allFiles = (nodes: FileNode[]): FileNode[] => {
    let files: FileNode[] = [];
    nodes.forEach(node => {
      if (node.type === 'file') {
        files.push(node);
      }
      if (node.children) {
        files = files.concat(allFiles(node.children));
      }
    });
    return files;
  };

  const filteredFiles = allFiles(fileTree).filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    file.path.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Helper to get the folder name from a full path
  const getFolderName = (folderPath: string): string => {
    if (!folderPath) return '';
    const parts = folderPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || folderPath;
  };

  return (
    <div 
      className="h-full w-full bg-gray-900 flex overflow-hidden min-h-0"
      style={isDebugMode ? { border: '2px solid red' } : {}}
    >
              {/* File Tree */}
        <div 
          className="w-80 bg-gray-800 border-r border-gray-700 p-4 flex flex-col h-full overflow-hidden min-h-0"
          style={isDebugMode ? { border: '2px solid blue' } : {}}
        >
        <div className="mb-4 flex-shrink-0">
          {/* Current Folder Display - full width, centered */}
          {currentFolder && (
            <div className="mb-3 w-full text-center text-sm font-medium text-gray-300 truncate">
              📁 {getFolderName(currentFolder)}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Files</h2>
            <div className="flex items-center space-x-2">
              <button 
                onClick={handleOpenFolder}
                className="p-1 text-gray-400 hover:text-white transition-colors"
                title="Open Folder"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
              <button className="p-1 text-gray-400 hover:text-white transition-colors" title="New File">
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setIsVectorSearch(!isVectorSearch)}
                className={`p-2 rounded-lg transition-colors ${
                  isVectorSearch ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}
                title={isVectorSearch ? 'Vector Search Mode' : 'Regular Search Mode'}
              >
                {isVectorSearch ? <Zap className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
              </button>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={isVectorSearch ? "Search code by meaning..." : "Search files..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && isVectorSearch && searchTerm.trim()) {
                      performVectorSearch();
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            {isVectorSearch && (
              <div className="text-xs text-gray-400 pl-11">
                Press Enter to search using AI-powered semantic search
              </div>
            )}
            {isVectorSearch && !isSearching && vectorSearchResults.length > 0 && (
              <div className="text-xs text-gray-400 pl-11 mt-1">
                Found {vectorSearchResults.length} results
              </div>
            )}
          </div>
        </div>

        {/* File Tree */}
        <div className="space-y-1 overflow-y-auto flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-400">Loading...</div>
            </div>
          ) : error ? (
            <div className="flex items-center space-x-2 p-3 bg-red-900/20 border border-red-500/30 rounded">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <div className="text-red-400 text-sm">{error}</div>
            </div>
          ) : !currentFolder ? (
            <div className="flex items-center justify-center py-8 text-center">
              <div className="text-gray-400">
                <Folder className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No folder opened</p>
                <p className="text-xs mt-1">Click "Open Folder" to get started</p>
              </div>
            </div>
          ) : searchTerm ? (
            // Show search results
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2">
                {isVectorSearch ? 'Vector Search Results' : 'Search Results'}
                {isSearching && ' (Searching...)'}
              </h3>
              {isVectorSearch ? (
                // Vector search results
                vectorSearchResults.length > 0 ? (
                  <div className="space-y-2">
                    {vectorSearchResults.map((result, index) => {
                      const { document, similarity } = result;
                      const metadata = document.metadata || {};
                      return (
                        <div
                          key={document.id || index}
                          className={`p-3 rounded-lg bg-gray-700 hover:bg-gray-600 cursor-pointer transition-colors ${
                            selectedFile?.path === metadata.filePath ? 'ring-2 ring-blue-500' : ''
                          }`}
                          onClick={async () => {
                            if (metadata.filePath) {
                              try {
                                const stats = await window.electronAPI.getFileStats(metadata.filePath);
                                const fileNode: FileNode = {
                                  id: metadata.filePath,
                                  name: metadata.filePath.split('/').pop() || '',
                                  type: 'file',
                                  path: metadata.filePath,
                                  size: stats.size,
                                  lastModified: stats.modifiedTime,
                                  isExpanded: false
                                };
                                setSelectedFile(fileNode);
                                await loadFileContent(metadata.filePath);
                              } catch (error) {
                                console.error('Failed to load file:', error);
                              }
                            }
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                {getFileIcon(metadata.filePath || '', false)}
                                <span className="text-sm font-medium text-gray-200">
                                  {metadata.functionName || metadata.className || 'Code Element'}
                                </span>
                                <span className="text-xs px-2 py-0.5 bg-gray-600 rounded-full text-gray-300">
                                  {metadata.codeType || metadata.type}
                                </span>
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                {metadata.filePath?.split('/').pop() || 'Unknown file'}
                                {metadata.lineStart && metadata.lineEnd && (
                                  <span className="ml-2">Lines {metadata.lineStart}-{metadata.lineEnd}</span>
                                )}
                              </div>
                              {metadata.aiDescription && (
                                <div className="text-xs text-gray-300 mt-2 italic">
                                  {metadata.aiDescription}
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-blue-400 font-medium ml-2">
                              {(similarity * 100).toFixed(0)}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : isSearching ? (
                  <div className="text-center py-4 text-gray-400">
                    <div className="animate-spin w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full mx-auto mb-2"></div>
                    Searching through code vectors...
                  </div>
                ) : searchTerm.trim() ? (
                  <div className="text-center py-4 text-gray-400">
                    <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No results found</p>
                    <p className="text-xs mt-1">Try a different search query</p>
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-400">
                    <Zap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Enter a search query</p>
                    <p className="text-xs mt-1">Search by meaning, not just keywords</p>
                  </div>
                )
              ) : (
                // Regular file search results
                filteredFiles.map(file => (
                <div
                  key={file.id}
                  className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-gray-700 transition-colors ${
                    selectedFile?.id === file.id ? 'bg-blue-600' : ''
                  }`}
                  onClick={() => {
                    setSelectedFile(file);
                    if (file.type === 'file') {
                      loadFileContent(file.path);
                    }
                  }}
                >
                  {getFileIcon(file.name, false)}
                  <div className="flex-1">
                    <div className="text-gray-300 text-sm">{file.name}</div>
                    <div className="text-xs text-gray-500">{file.path}</div>
                  </div>
                </div>
              ))
              )}
            </div>
          ) : (
            // Show file tree
            fileTree.map(node => renderFileNode(node))
          )}
        </div>
      </div>

      {/* File Details */}
      <div 
        className="flex-1 p-6 h-full overflow-hidden flex flex-col min-w-0 min-h-0"
        style={isDebugMode ? { border: '2px solid green' } : {}}
      >
        {selectedFile ? (
          <div className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="flex items-center space-x-3 mb-6 flex-shrink-0">
              <div className="text-2xl">{getFileIcon(selectedFile.name, selectedFile.type === 'folder', true)}</div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-white truncate">{selectedFile.name}</h1>
                <p className="text-gray-400 text-sm truncate">{selectedFile.path}</p>
              </div>
              <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex-shrink-0">
                <Eye className="w-4 h-4" />
                <span>Open</span>
              </button>
            </div>

            {/* File Details - Collapsible */}
            <div className="flex-shrink-0 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-white">File Details</h3>
                <button
                  onClick={() => setDetailsCollapsed(!detailsCollapsed)}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                  title={detailsCollapsed ? 'Expand details' : 'Collapse details'}
                >
                  {detailsCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </button>
              </div>
              
              {!detailsCollapsed && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Size</h3>
                    <p className="text-xl font-bold text-white">{selectedFile.size || 'Unknown'}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Last Modified</h3>
                    <p className="text-white">{formatDate(selectedFile.lastModified)}</p>
                  </div>
                  <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                    <h3 className="text-sm font-medium text-gray-400 mb-2">Type</h3>
                    <p className="font-medium text-blue-400">
                      {selectedFile.type === 'file' ? getLanguageDisplayName(selectedFile.name) : 'Folder'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* File Contents - Expandable */}
            {selectedFile.type === 'file' && (
              <div 
                className="bg-gray-800 rounded-lg border border-gray-700 flex-1 flex flex-col min-h-0 overflow-hidden w-full"
                style={isDebugMode ? { border: '2px solid yellow' } : {}}
              >
                <div 
                  className="flex-1 bg-gray-900 overflow-hidden w-full"
                  style={isDebugMode ? { border: '2px solid purple' } : {}}
                >
                  {fileContent ? (
                    <Editor
                      height="100%"
                      language={getLanguageFromFileName(selectedFile.name)}
                      value={fileContent}
                      theme="vs-dark"
                      loading={
                        <div className="text-gray-400 flex items-center justify-center h-full min-h-[200px]">
                          Loading editor...
                        </div>
                      }
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        fontSize: 14,
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        automaticLayout: true,
                        contextmenu: true,
                        selectOnLineNumbers: true,
                        renderWhitespace: 'selection',
                        folding: true,
                        foldingStrategy: 'indentation',
                        showFoldingControls: 'always',
                        bracketPairColorization: { enabled: true },
                        guides: {
                          indentation: true,
                          bracketPairs: true,
                          bracketPairsHorizontal: true,
                          highlightActiveIndentation: true
                        }
                      }}
                    />
                  ) : (
                    <div className="text-gray-400 flex items-center justify-center h-full min-h-[200px]">
                      Click on a file to view its contents...
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <File className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No file selected</h3>
              <p>Select a file from the explorer to view its details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};