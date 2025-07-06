import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Minus, 
  RotateCcw, 
  GitCommit, 
  GitBranch, 
  RefreshCw,
  MessageSquare,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  ChevronRight
} from 'lucide-react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { GitStatus, GitFileStatus, GitDiff } from '../types/electron';
import { getFileIconInfo } from '../utils/fileIcons';

interface GitExplorerProps {
  currentFolder: string | null;
}

export const GitExplorer: React.FC<GitExplorerProps> = ({ currentFolder }) => {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [selectedFile, setSelectedFile] = useState<GitFileStatus | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<GitDiff | null>(null);
  const [loading, setLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkDebugMode = async () => {
      try {
        const debugValue = await window.electronAPI.getEnv('LABRATS_DEBUG');
        console.log('GitExplorer debug value:', debugValue);
        setIsDebugMode(debugValue === 'true');
        console.log('GitExplorer isDebugMode:', debugValue === 'true');
      } catch (error) {
        console.error('Error checking debug mode:', error);
        setIsDebugMode(false);
      }
    };
    checkDebugMode();
  }, []);

  useEffect(() => {
    if (currentFolder) {
      loadGitStatus();
    } else {
      setGitStatus(null);
      setError(null);
    }
  }, [currentFolder]);

  const loadGitStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      // First try to initialize git for the current folder
      const initialized = await window.electronAPI.git.initialize(currentFolder!);
      console.log('Git initialization result:', initialized);
      
      if (!initialized) {
        setError('Not a git repository. Initialize git or open a git repository.');
        setGitStatus(null);
        return;
      }
      
      const status = await window.electronAPI.git.getStatus();
      setGitStatus(status);
      
      if (!status) {
        setError('Failed to get git status. Make sure this is a valid git repository.');
      }
    } catch (error) {
      console.error('Error loading git status:', error);
      setError(`Error: ${error}`);
      setGitStatus(null);
    } finally {
      setLoading(false);
    }
  };

  const loadDiff = async (file: GitFileStatus) => {
    try {
      const diff = await window.electronAPI.git.getDiff(file.path, file.staged);
      setSelectedDiff(diff);
      setSelectedFile(file);
    } catch (error) {
      console.error('Error loading diff:', error);
      setSelectedDiff(null);
    }
  };

  const handleStageFile = async (filePath: string) => {
    try {
      await window.electronAPI.git.stageFile(filePath);
      loadGitStatus();
    } catch (error) {
      console.error('Error staging file:', error);
    }
  };

  const handleUnstageFile = async (filePath: string) => {
    try {
      await window.electronAPI.git.unstageFile(filePath);
      loadGitStatus();
    } catch (error) {
      console.error('Error unstaging file:', error);
    }
  };

  const handleDiscardChanges = async (filePath: string) => {
    if (window.confirm(`Are you sure you want to discard changes to ${filePath}?`)) {
      try {
        await window.electronAPI.git.discardChanges(filePath);
        loadGitStatus();
        if (selectedFile?.path === filePath) {
          setSelectedFile(null);
          setSelectedDiff(null);
        }
      } catch (error) {
        console.error('Error discarding changes:', error);
      }
    }
  };

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    
    setIsCommitting(true);
    try {
      const success = await window.electronAPI.git.commit(commitMessage.trim());
      if (success) {
        setCommitMessage('');
        loadGitStatus();
        setSelectedFile(null);
        setSelectedDiff(null);
      }
    } catch (error) {
      console.error('Error committing:', error);
    } finally {
      setIsCommitting(false);
    }
  };

  const getStatusIcon = (file: GitFileStatus) => {
    const iconInfo = getFileIconInfo(file.path, false);
    return (
      <i 
        className={`codicon codicon-${iconInfo.icon} file-icon`}
        style={{ color: iconInfo.color }}
      />
    );
  };

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      'M': { label: 'M', color: 'bg-yellow-600' },
      'A': { label: 'A', color: 'bg-green-600' },
      'D': { label: 'D', color: 'bg-red-600' },
      'R': { label: 'R', color: 'bg-blue-600' },
      'C': { label: 'C', color: 'bg-blue-600' },
      'U': { label: 'U', color: 'bg-purple-600' },
      '??': { label: 'U', color: 'bg-green-600' }
    };

    const badge = badges[status] || { label: status, color: 'bg-gray-600' };
    return (
      <span className={`${badge.color} text-white text-xs px-1.5 py-0.5 rounded font-mono`}>
        {badge.label}
      </span>
    );
  };

  // Tree view helper functions
  interface GitTreeNode {
    name: string;
    path: string;
    isDirectory: boolean;
    files: GitFileStatus[];
    children: GitTreeNode[];
  }

  const buildFileTree = (files: GitFileStatus[]): GitTreeNode[] => {
    const root: GitTreeNode[] = [];
    const nodeMap = new Map<string, GitTreeNode>();

    files.forEach(file => {
      const parts = file.path.split('/');
      let currentPath = '';
      
      parts.forEach((part, index) => {
        const isLast = index === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        if (!nodeMap.has(currentPath)) {
          const node: GitTreeNode = {
            name: part,
            path: currentPath,
            isDirectory: !isLast,
            files: isLast ? [file] : [],
            children: []
          };
          
          nodeMap.set(currentPath, node);
          
          if (index === 0) {
            root.push(node);
          } else {
            const parentPath = parts.slice(0, index).join('/');
            const parentNode = nodeMap.get(parentPath);
            if (parentNode) {
              parentNode.children.push(node);
            }
          }
        } else if (isLast) {
          const node = nodeMap.get(currentPath);
          if (node) {
            node.files.push(file);
          }
        }
      });
    });

    return root.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  };

  const toggleDirectory = (path: string) => {
    setExpandedDirectories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const renderTreeNode = (node: GitTreeNode, depth: number = 0): React.ReactNode => {
    const isExpanded = expandedDirectories.has(node.path);
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.path}>
        {node.isDirectory ? (
          // Directory node
          <div>
            <div
              className="flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-gray-700 transition-colors"
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => toggleDirectory(node.path)}
            >
              {hasChildren && (
                <button className="p-0.5">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              )}
              {!hasChildren && <div className="w-5" />}
              
              <i className="codicon codicon-folder file-icon" style={{ color: '#dcb67a' }} />
              <span className="flex-1 text-gray-300 text-sm">{node.name}</span>
              
              {/* Show count of files in directory */}
              <span className="text-xs text-gray-500">
                {node.children.reduce((acc, child) => 
                  acc + (child.isDirectory ? 0 : child.files.length), 0
                )}
              </span>
            </div>
            
            {isExpanded && hasChildren && (
              <div>
                {node.children.map(child => renderTreeNode(child, depth + 1))}
              </div>
            )}
          </div>
        ) : (
          // File nodes
          <div>
            {node.files.map(file => (
              <div
                key={file.path}
                className={`flex items-center space-x-2 p-2 rounded cursor-pointer hover:bg-gray-700 transition-colors group ${
                  selectedFile?.path === file.path ? 'bg-blue-600' : ''
                }`}
                style={{ paddingLeft: `${depth * 16 + 28}px` }}
                onClick={() => loadDiff(file)}
              >
                {getStatusIcon(file)}
                <span className="flex-1 text-gray-300 text-sm truncate">{node.name}</span>
                {getStatusBadge(file.status)}
                
                <div className={`flex space-x-1 opacity-0 group-hover:opacity-100 ${
                  file.staged ? '' : ''
                }`}>
                  {file.staged ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnstageFile(file.path);
                      }}
                      className="p-1 text-gray-400 hover:text-white transition-all"
                      title="Unstage"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStageFile(file.path);
                        }}
                        className="p-1 text-gray-400 hover:text-white transition-all"
                        title="Stage"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      {!file.isNew && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDiscardChanges(file.path);
                          }}
                          className="p-1 text-gray-400 hover:text-red-400 transition-all"
                          title="Discard"
                        >
                          <RotateCcw className="w-3 h-3" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderDiffViewer = () => {
    if (!selectedDiff || !selectedFile) return null;

    // Reconstruct original and modified content from diff hunks
    const reconstructContent = () => {
      let originalContent = '';
      let modifiedContent = '';
      
      selectedDiff.hunks.forEach(hunk => {
        hunk.lines.forEach(line => {
          if (line.type === 'context') {
            originalContent += line.content + '\n';
            modifiedContent += line.content + '\n';
          } else if (line.type === 'deletion') {
            originalContent += line.content + '\n';
          } else if (line.type === 'addition') {
            modifiedContent += line.content + '\n';
          }
        });
      });

      return { originalContent, modifiedContent };
    };

    const { originalContent, modifiedContent } = reconstructContent();

    // Determine file language from extension
    const getLanguageFromPath = (filePath: string) => {
      const ext = filePath.split('.').pop()?.toLowerCase();
      const languageMap: Record<string, string> = {
        'js': 'javascript',
        'jsx': 'javascript',
        'ts': 'typescript',
        'tsx': 'typescript',
        'py': 'python',
        'css': 'css',
        'scss': 'scss',
        'html': 'html',
        'json': 'json',
        'md': 'markdown',
        'yaml': 'yaml',
        'yml': 'yaml'
      };
      return languageMap[ext || ''] || 'plaintext';
    };

    return (
      <DiffEditor
        height="100%"
        language={getLanguageFromPath(selectedFile.path)}
        original={originalContent}
        modified={modifiedContent}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 14,
          wordWrap: 'on',
          automaticLayout: true,
          contextmenu: false,
          renderWhitespace: 'selection',
          renderSideBySide: true,
          enableSplitViewResizing: true,
          scrollbar: {
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10
          }
        }}
      />
    );
  };

  const stagedFiles = gitStatus?.files.filter(f => f.staged) || [];
  const changedFiles = gitStatus?.files.filter(f => !f.staged) || [];
  
  const stagedTree = buildFileTree(stagedFiles);
  const changedTree = buildFileTree(changedFiles);

  if (!currentFolder) {
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <GitBranch className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">No folder opened</p>
          <p className="text-sm mt-2">Open a folder to see git status</p>
        </div>
      </div>
    );
  }

  if (error && !loading) {
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <div className="text-center text-gray-400 max-w-md px-6">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg mb-2">Git Error</p>
          <p className="text-sm text-gray-500">{error}</p>
          <button
            onClick={loadGitStatus}
            className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  
  if (!gitStatus && !loading && !error) {
    return (
      <div className="h-full bg-gray-900 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <AlertCircle className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg">Not a git repository</p>
          <p className="text-sm mt-2">Initialize git to track changes</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="h-full w-full bg-gray-900 flex overflow-hidden min-h-0"
      style={isDebugMode ? { border: '2px solid red' } : {}}
    >
      {/* Git Status Sidebar */}
      <div 
        className="w-80 bg-gray-800 border-r border-gray-700 p-4 flex flex-col h-full overflow-hidden min-h-0"
        style={isDebugMode ? { border: '2px solid blue' } : {}}
      >
        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Source Control</h2>
            <button
              onClick={loadGitStatus}
              className="p-1 text-gray-400 hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Branch info */}
          {gitStatus && (
            <div className="mb-4 p-2 bg-gray-700 rounded text-sm text-gray-300">
              <div className="flex items-center space-x-2">
                <GitBranch className="w-4 h-4" />
                <span>{gitStatus.current}</span>
                {gitStatus.ahead > 0 && (
                  <span className="text-green-400">↑{gitStatus.ahead}</span>
                )}
                {gitStatus.behind > 0 && (
                  <span className="text-red-400">↓{gitStatus.behind}</span>
                )}
              </div>
            </div>
          )}

          {/* Commit section */}
          {stagedFiles.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <MessageSquare className="w-4 h-4 text-gray-400" />
                <span className="text-sm text-gray-300">Commit Message</span>
              </div>
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Enter commit message..."
                className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 text-sm resize-none"
                rows={3}
              />
              <button
                onClick={handleCommit}
                disabled={!commitMessage.trim() || isCommitting}
                className="w-full mt-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded text-sm transition-colors flex items-center justify-center space-x-2"
              >
                <GitCommit className="w-4 h-4" />
                <span>{isCommitting ? 'Committing...' : 'Commit'}</span>
              </button>
            </div>
          )}
        </div>

        {/* File lists */}
        <div className="flex-1 overflow-y-auto space-y-4">
          {loading && (
            <div className="text-center text-gray-400 py-8">
              <div>Loading git status...</div>
            </div>
          )}

          {gitStatus && gitStatus.isClean && (
            <div className="text-center text-gray-400 py-8">
              <Check className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>No changes</p>
            </div>
          )}

          {/* Staged Changes */}
          {stagedFiles.length > 0 && (
            <div>
              <button
                onClick={() => setStagedExpanded(!stagedExpanded)}
                className="flex items-center space-x-2 w-full text-left text-sm font-medium text-gray-300 hover:text-white transition-colors mb-2"
              >
                {stagedExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span>Staged Changes ({stagedFiles.length})</span>
              </button>
              {stagedExpanded && (
                <div className="space-y-1">
                  {stagedTree.map(node => renderTreeNode(node))}
                </div>
              )}
            </div>
          )}

          {/* Changes */}
          {changedFiles.length > 0 && (
            <div>
              <button
                onClick={() => setChangesExpanded(!changesExpanded)}
                className="flex items-center space-x-2 w-full text-left text-sm font-medium text-gray-300 hover:text-white transition-colors mb-2"
              >
                {changesExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                <span>Changes ({changedFiles.length})</span>
              </button>
              {changesExpanded && (
                <div className="space-y-1">
                  {changedTree.map(node => renderTreeNode(node))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Diff Viewer */}
      <div 
        className="flex-1 p-6 h-full overflow-hidden flex flex-col min-w-0 min-h-0"
        style={isDebugMode ? { border: '2px solid green' } : {}}
      >
        {selectedFile && selectedDiff ? (
          <div className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="flex items-center space-x-3 mb-6 flex-shrink-0">
              {getStatusIcon(selectedFile)}
              <div className="flex-1">
                <h1 className="text-xl font-bold text-white">{selectedFile.path}</h1>
                <p className="text-gray-400 text-sm">
                  {selectedFile.staged ? 'Staged changes' : 'Unstaged changes'}
                </p>
              </div>
              {getStatusBadge(selectedFile.status)}
            </div>

            {/* Diff Content */}
            <div 
              className="bg-gray-800 rounded-lg border border-gray-700 flex-1 overflow-hidden min-h-0 flex flex-col"
              style={isDebugMode ? { border: '2px solid yellow' } : {}}
            >
              <div className="p-4 border-b border-gray-700 flex-shrink-0">
                <h3 className="text-lg font-semibold text-white">Changes2</h3>
              </div>
              <div 
                className="flex-1 bg-gray-900 overflow-hidden w-full min-h-0"
                style={isDebugMode ? { border: '2px solid purple', height: '100%' } : { height: '100%' }}
              >
                {renderDiffViewer()}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <GitCommit className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No file selected</h3>
              <p>Select a file from the source control panel to view changes</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};