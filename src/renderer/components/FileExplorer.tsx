import React, { useState, useEffect, useRef } from 'react';
import { Folder, File, ChevronRight, ChevronDown, Search, Plus, Eye, AlertCircle, FolderOpen, ChevronUp, Minimize2, Zap, FileText, BookOpen, Code, Replace, Settings, Filter } from 'lucide-react';
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
  const [searchMode, setSearchMode] = useState<'file' | 'vector' | 'infile'>('file');
  const [vectorSearchResults, setVectorSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isHumanView, setIsHumanView] = useState(false);
  const [humanReadableContent, setHumanReadableContent] = useState<string | null>(null);
  const [loadingHumanContent, setLoadingHumanContent] = useState(false);
  const [fileSearchResults, setFileSearchResults] = useState<FileNode[]>([]);
  const [inFileSearchResults, setInFileSearchResults] = useState<any[]>([]);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [replaceText, setReplaceText] = useState('');
  const [includePatterns, setIncludePatterns] = useState('');
  const [excludePatterns, setExcludePatterns] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [targetLine, setTargetLine] = useState<number | null>(null);
  const [targetSelection, setTargetSelection] = useState<{start: number, end: number} | null>(null);
  const editorRef = useRef<any>(null);

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

  // Clear search results when switching modes or clearing search
  useEffect(() => {
    if (searchMode !== 'vector' || !searchTerm.trim()) {
      setVectorSearchResults([]);
    }
    if (searchMode !== 'file' || !searchTerm.trim()) {
      setFileSearchResults([]);
    }
    if (searchMode !== 'infile' || !searchTerm.trim()) {
      setInFileSearchResults([]);
    }
  }, [searchMode, searchTerm]);

  // Perform search when search term changes
  useEffect(() => {
    if (searchTerm.trim() && currentFolder) {
      const delayDebounceFn = setTimeout(() => {
        if (searchMode === 'file') {
          performFileSearch();
        } else if (searchMode === 'infile') {
          performInFileSearch();
        }
      }, 300); // Debounce search by 300ms

      return () => clearTimeout(delayDebounceFn);
    } else if (!searchTerm.trim()) {
      setFileSearchResults([]);
      setInFileSearchResults([]);
    }
  }, [searchTerm, searchMode, currentFolder, caseSensitive, useRegex, includePatterns, excludePatterns]);

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

  const loadFileContent = async (filePath: string, lineNumber?: number, selection?: {start: number, end: number}) => {
    try {
      const content = await window.electronAPI.readFile(filePath);
      setFileContent(content);
      
      // Set target line and selection for navigation after Monaco loads
      if (lineNumber) {
        setTargetLine(lineNumber);
        setTargetSelection(selection || null);
      } else {
        setTargetLine(null);
        setTargetSelection(null);
      }
      
      // Reset human view when loading new file
      setIsHumanView(false);
      setHumanReadableContent(null);
    } catch (error) {
      setFileContent(`Error loading file: ${error}`);
    }
  };

  // Function to handle Monaco Editor mount and navigation
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    
    // Navigate to target line if specified
    if (targetLine) {
      navigateToLine(targetLine, targetSelection);
    }
  };

  // Function to navigate to a specific line and optionally select text
  const navigateToLine = (lineNumber: number, selection?: {start: number, end: number} | null) => {
    if (editorRef.current) {
      // Go to the line
      editorRef.current.revealLineInCenter(lineNumber);
      editorRef.current.setPosition({ lineNumber, column: 1 });
      
      // If selection is specified, select the text
      if (selection) {
        const range = {
          startLineNumber: lineNumber,
          startColumn: selection.start + 1, // Monaco uses 1-based columns
          endLineNumber: lineNumber,
          endColumn: selection.end + 1
        };
        editorRef.current.setSelection(range);
        editorRef.current.focus();
      }
      
      // Clear the target after navigation
      setTargetLine(null);
      setTargetSelection(null);
    }
  };

  // Effect to handle navigation when editor loads after file content is set
  useEffect(() => {
    if (editorRef.current && targetLine) {
      navigateToLine(targetLine, targetSelection);
    }
  }, [fileContent, targetLine, targetSelection]);

  const loadHumanReadableContent = async (filePath: string) => {
    if (!window.electronAPI.aiDescription) {
      console.error('[FileExplorer] AI Description API not available');
      return;
    }
    
    setLoadingHumanContent(true);
    try {
      const result = await window.electronAPI.aiDescription.getHumanReadable(filePath);
      if (result.success && result.content) {
        setHumanReadableContent(result.content);
      } else {
        setHumanReadableContent('No AI descriptions available for this file.\n\nAI descriptions are generated when files are vectorized.\nRun code vectorization to generate descriptions.');
      }
    } catch (error) {
      console.error('[FileExplorer] Error loading human-readable content:', error);
      setHumanReadableContent(`Error loading descriptions: ${error}`);
    } finally {
      setLoadingHumanContent(false);
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
    console.log('[FileExplorer] performVectorSearch called with searchTerm:', searchTerm);
    if (!searchTerm.trim() || !currentFolder) {
      console.log('[FileExplorer] Search cancelled - empty term or no folder');
      return;
    }
    
    setIsSearching(true);
    setVectorSearchResults([]);
    
    try {
      console.log('[FileExplorer] Checking if API is available:', !!window.electronAPI?.codeVectorization);
      const results = await window.electronAPI.codeVectorization?.searchCode(searchTerm, {
        limit: 20,
        minSimilarity: 0.3  // Lowered from 0.5 to catch more results
      });
      
      console.log('[FileExplorer] Search API returned:', results);
      
      if (results?.success && results?.results) {
        console.log('[FileExplorer] Setting', results.results.length, 'search results');
        setVectorSearchResults(results.results);
      } else {
        console.error('[FileExplorer] Vector search failed:', results?.error || 'API not available');
        setVectorSearchResults([]);
      }
    } catch (error) {
      console.error('[FileExplorer] Error performing vector search:', error);
      setVectorSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const performFileSearch = async () => {
    console.log('[FileExplorer] performFileSearch called with searchTerm:', searchTerm);
    if (!searchTerm.trim() || !currentFolder) {
      setFileSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    
    try {
      // Use the backend search API to search all files in the project
      const results = await window.electronAPI.searchFiles(currentFolder, searchTerm, 50);
      console.log('[FileExplorer] File search API returned:', results);
      
      // Convert search results to FileNode format
      const fileNodes: FileNode[] = results.map((result: any) => ({
        id: result.path,
        name: result.name,
        type: result.type,
        path: result.path,
        size: result.type === 'file' ? 'Unknown' : null,
        lastModified: new Date().toISOString(),
        isExpanded: false
      }));
      
      setFileSearchResults(fileNodes);
    } catch (error) {
      console.error('[FileExplorer] Error performing file search:', error);
      setFileSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const performInFileSearch = async () => {
    console.log('[FileExplorer] performInFileSearch called with searchTerm:', searchTerm);
    if (!searchTerm.trim() || !currentFolder) {
      setInFileSearchResults([]);
      return;
    }
    
    setIsSearching(true);
    
    try {
      // Get all files first, then search within their contents
      const allFilesResult = await window.electronAPI.searchFiles(currentFolder, '', 1000);
      const textFiles = allFilesResult.filter((file: any) => 
        file.type === 'file' && 
        !file.name.match(/\.(jpg|jpeg|png|gif|bmp|svg|ico|pdf|zip|tar|gz|exe|dll|so|dylib|bin)$/i)
      );
      
      // Apply include/exclude patterns if specified
      let filteredFiles = textFiles;
      if (includePatterns.trim()) {
        const patterns = includePatterns.split(',').map(p => p.trim()).filter(p => p);
        filteredFiles = filteredFiles.filter((file: any) => 
          patterns.some(pattern => file.path.includes(pattern) || file.name.includes(pattern))
        );
      }
      if (excludePatterns.trim()) {
        const patterns = excludePatterns.split(',').map(p => p.trim()).filter(p => p);
        filteredFiles = filteredFiles.filter((file: any) => 
          !patterns.some(pattern => file.path.includes(pattern) || file.name.includes(pattern))
        );
      }
      
      const searchResults = [];
      const searchPattern = useRegex 
        ? new RegExp(searchTerm, caseSensitive ? 'g' : 'gi')
        : null;
      
      for (const file of filteredFiles.slice(0, 100)) { // Limit to 100 files for performance
        try {
          const content = await window.electronAPI.readFile(file.path);
          const lines = content.split('\n');
          const matches = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            let foundMatch = false;
            
            if (useRegex && searchPattern) {
              const regexMatches = [...line.matchAll(searchPattern)];
              for (const match of regexMatches) {
                matches.push({
                  lineNumber: i + 1,
                  lineContent: line,
                  matchStart: match.index,
                  matchEnd: match.index + match[0].length,
                  matchText: match[0]
                });
                foundMatch = true;
              }
            } else {
              const searchText = caseSensitive ? searchTerm : searchTerm.toLowerCase();
              const lineText = caseSensitive ? line : line.toLowerCase();
              let index = lineText.indexOf(searchText);
              
              while (index !== -1) {
                matches.push({
                  lineNumber: i + 1,
                  lineContent: line,
                  matchStart: index,
                  matchEnd: index + searchTerm.length,
                  matchText: line.substring(index, index + searchTerm.length)
                });
                foundMatch = true;
                index = lineText.indexOf(searchText, index + 1);
              }
            }
          }
          
          if (matches.length > 0) {
            searchResults.push({
              file,
              matches: matches.slice(0, 10) // Limit matches per file
            });
          }
        } catch (error) {
          // Skip files that can't be read
          console.warn('Could not read file:', file.path, error);
        }
      }
      
      setInFileSearchResults(searchResults);
    } catch (error) {
      console.error('[FileExplorer] Error performing in-file search:', error);
      setInFileSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const performReplace = async (filePath: string, matches: any[]) => {
    if (!replaceText && replaceText !== '') return;
    
    try {
      const content = await window.electronAPI.readFile(filePath);
      let newContent = content;
      
      if (useRegex) {
        const searchPattern = new RegExp(searchTerm, caseSensitive ? 'g' : 'gi');
        newContent = content.replace(searchPattern, replaceText);
      } else {
        // Replace all occurrences
        const searchText = searchTerm;
        const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), caseSensitive ? 'g' : 'gi');
        newContent = content.replace(regex, replaceText);
      }
      
      await window.electronAPI.writeFile(filePath, newContent);
      // Refresh search results
      performInFileSearch();
    } catch (error) {
      console.error('Error replacing in file:', error);
      alert(`Error replacing in file: ${error}`);
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
            {/* Search Mode Buttons */}
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setSearchMode('file')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  searchMode === 'file' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}
                title="File Search Mode"
              >
                <FileText className="w-3 h-3 inline mr-1" />Files
              </button>
              <button
                onClick={() => setSearchMode('vector')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  searchMode === 'vector' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}
                title="Vector Search Mode"
              >
                <Zap className="w-3 h-3 inline mr-1" />Vector
              </button>
              <button
                onClick={() => setSearchMode('infile')}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  searchMode === 'infile' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                }`}
                title="In-File Search Mode"
              >
                <Search className="w-3 h-3 inline mr-1" />In-File
              </button>
              {searchMode === 'infile' && (
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`p-1 rounded transition-colors ${
                    showFilters ? 'bg-gray-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                  title="Show/Hide Filters"
                >
                  <Settings className="w-3 h-3" />
                </button>
              )}
            </div>
            
            {/* Search Input */}
            <div className="flex items-center space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={
                    searchMode === 'vector' ? "Search code by meaning..." : 
                    searchMode === 'infile' ? "Search within files..." :
                    "Search files..."
                  }
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchMode === 'vector' && searchTerm.trim()) {
                      performVectorSearch();
                    }
                  }}
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {searchMode === 'infile' && (
                <button
                  onClick={() => setReplaceMode(!replaceMode)}
                  className={`p-2 rounded-lg transition-colors ${
                    replaceMode ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'
                  }`}
                  title="Toggle Replace Mode"
                >
                  <Replace className="w-4 h-4" />
                </button>
              )}
            </div>
            
            {/* Replace Input */}
            {searchMode === 'infile' && replaceMode && (
              <div className="relative">
                <Replace className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Replace with..."
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            )}
            
            {/* In-File Search Options */}
            {searchMode === 'infile' && (
              <div className="flex items-center space-x-4 text-xs">
                <label className="flex items-center space-x-1 text-gray-400">
                  <input
                    type="checkbox"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                    className="rounded"
                  />
                  <span>Case sensitive</span>
                </label>
                <label className="flex items-center space-x-1 text-gray-400">
                  <input
                    type="checkbox"
                    checked={useRegex}
                    onChange={(e) => setUseRegex(e.target.checked)}
                    className="rounded"
                  />
                  <span>Regex</span>
                </label>
              </div>
            )}
            
            {/* Filters */}
            {searchMode === 'infile' && showFilters && (
              <div className="space-y-2 p-3 bg-gray-800 rounded border border-gray-600">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Include patterns (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g., src/, *.js, component"
                    value={includePatterns}
                    onChange={(e) => setIncludePatterns(e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Exclude patterns (comma-separated)</label>
                  <input
                    type="text"
                    placeholder="e.g., node_modules/, *.min.js, test/"
                    value={excludePatterns}
                    onChange={(e) => setExcludePatterns(e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
            
            {/* Search Status */}
            {searchMode === 'vector' && (
              <div className="text-xs text-gray-400">
                Press Enter to search using AI-powered semantic search
              </div>
            )}
            {searchMode === 'vector' && !isSearching && vectorSearchResults.length > 0 && (
              <div className="text-xs text-gray-400 mt-1">
                Found {vectorSearchResults.length} results
              </div>
            )}
            {searchMode === 'infile' && !isSearching && inFileSearchResults.length > 0 && (
              <div className="text-xs text-gray-400 mt-1">
                Found matches in {inFileSearchResults.length} files
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
                {searchMode === 'vector' ? 'Vector Search Results' : 
                 searchMode === 'infile' ? 'In-File Search Results' : 'File Search Results'}
                {isSearching && ' (Searching...)'}
              </h3>
              {searchMode === 'vector' ? (
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
                                // If line information is available, navigate to that line
                                const lineNumber = metadata.lineStart || metadata.lineNumber;
                                await loadFileContent(metadata.filePath, lineNumber);
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
              ) : searchMode === 'infile' ? (
                // In-file search results
                isSearching ? (
                  <div className="text-center py-4 text-gray-400">
                    <div className="animate-spin w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full mx-auto mb-2"></div>
                    Searching within files...
                  </div>
                ) : searchTerm.trim() && inFileSearchResults.length === 0 ? (
                  <div className="text-center py-4 text-gray-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No matches found</p>
                    <p className="text-xs mt-1">Try different search terms or filters</p>
                  </div>
                ) : inFileSearchResults.map((result, index) => {
                  const { file, matches } = result;
                  return (
                    <div key={index} className="mb-4">
                      <div 
                        className={`flex items-center justify-between p-2 bg-gray-700 rounded-t cursor-pointer hover:bg-gray-600 transition-colors ${
                          selectedFile?.path === file.path ? 'ring-2 ring-blue-500' : ''
                        }`}
                        onClick={() => {
                          const fileNode: FileNode = {
                            id: file.path,
                            name: file.name,
                            type: 'file',
                            path: file.path,
                            size: 'Unknown',
                            lastModified: new Date().toISOString(),
                            isExpanded: false
                          };
                          setSelectedFile(fileNode);
                          loadFileContent(file.path);
                        }}
                      >
                        <div className="flex items-center space-x-2">
                          {getFileIcon(file.name, false)}
                          <div>
                            <div className="text-sm font-medium text-gray-200">{file.name}</div>
                            <div className="text-xs text-gray-400">{matches.length} matches</div>
                          </div>
                        </div>
                        {replaceMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              performReplace(file.path, matches);
                            }}
                            className="px-2 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
                            title="Replace all in this file"
                          >
                            Replace All
                          </button>
                        )}
                      </div>
                      <div className="bg-gray-800 rounded-b border-l-2 border-blue-500">
                        {matches.slice(0, 5).map((match: any, matchIndex: number) => (
                          <div 
                            key={matchIndex} 
                            className="px-3 py-2 border-b border-gray-700 last:border-b-0 cursor-pointer hover:bg-gray-700 transition-colors"
                            onClick={() => {
                              const fileNode: FileNode = {
                                id: file.path,
                                name: file.name,
                                type: 'file',
                                path: file.path,
                                size: 'Unknown',
                                lastModified: new Date().toISOString(),
                                isExpanded: false
                              };
                              setSelectedFile(fileNode);
                              loadFileContent(file.path, match.lineNumber, {
                                start: match.matchStart,
                                end: match.matchEnd
                              });
                            }}
                            title="Click to go to this line and select the match"
                          >
                            <div className="text-xs text-gray-400 mb-1">Line {match.lineNumber}</div>
                            <div className="text-sm font-mono text-gray-300">
                              {match.lineContent.substring(0, match.matchStart)}
                              <span className="bg-yellow-600 text-black px-1 rounded">
                                {match.matchText}
                              </span>
                              {match.lineContent.substring(match.matchEnd)}
                            </div>
                          </div>
                        ))}
                        {matches.length > 5 && (
                          <div className="px-3 py-2 text-xs text-gray-400 text-center">
                            ... and {matches.length - 5} more matches
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                // Regular file search results
                isSearching ? (
                  <div className="text-center py-4 text-gray-400">
                    <div className="animate-spin w-6 h-6 border-2 border-gray-400 border-t-transparent rounded-full mx-auto mb-2"></div>
                    Searching files...
                  </div>
                ) : searchTerm.trim() && fileSearchResults.length === 0 ? (
                  <div className="text-center py-4 text-gray-400">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No files found</p>
                    <p className="text-xs mt-1">Try a different search term</p>
                  </div>
                ) : fileSearchResults.map(file => (
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
              <div className="flex items-center space-x-2">
                {selectedFile.type === 'file' && (
                  <button 
                    onClick={() => {
                      setIsHumanView(!isHumanView);
                      if (!isHumanView && !humanReadableContent && selectedFile) {
                        loadHumanReadableContent(selectedFile.path);
                      }
                    }}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                      isHumanView 
                        ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                    }`}
                    title={isHumanView ? 'Show code view' : 'Show human-readable view'}
                  >
                    {isHumanView ? <Code className="w-4 h-4" /> : <BookOpen className="w-4 h-4" />}
                    <span>{isHumanView ? 'Code' : 'Human'}</span>
                  </button>
                )}
                <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                  <Eye className="w-4 h-4" />
                  <span>Open</span>
                </button>
              </div>
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
                  {isHumanView ? (
                    loadingHumanContent ? (
                      <div className="text-gray-400 flex items-center justify-center h-full min-h-[200px]">
                        <div className="flex flex-col items-center">
                          <div className="animate-spin w-8 h-8 border-2 border-purple-400 border-t-transparent rounded-full mb-4"></div>
                          <p>Loading AI descriptions...</p>
                        </div>
                      </div>
                    ) : humanReadableContent ? (
                      <Editor
                        height="100%"
                        language="markdown"
                        value={humanReadableContent}
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
                          lineNumbers: 'off',
                          wordWrap: 'on',
                          automaticLayout: true,
                          contextmenu: true,
                          renderWhitespace: 'none',
                          folding: true,
                          foldingStrategy: 'indentation',
                          showFoldingControls: 'always'
                        }}
                      />
                    ) : (
                      <div className="text-gray-400 flex items-center justify-center h-full min-h-[200px]">
                        <div className="flex flex-col items-center">
                          <BookOpen className="w-16 h-16 mb-4 opacity-50" />
                          <p>No AI descriptions available</p>
                          <p className="text-sm mt-2">Run code vectorization to generate descriptions</p>
                        </div>
                      </div>
                    )
                  ) : fileContent ? (
                    <Editor
                      height="100%"
                      language={getLanguageFromFileName(selectedFile.name)}
                      value={fileContent}
                      theme="vs-dark"
                      onMount={handleEditorDidMount}
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