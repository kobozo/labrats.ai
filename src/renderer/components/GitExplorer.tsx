import React, { useState, useEffect, useRef } from 'react';
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
  ChevronRight,
  Archive,
  ArchiveRestore,
  RefreshCcw,
  Trash2,
  GitMerge,
  History,
  MoreVertical,
  Settings,
  Zap,
  AlertTriangle
} from 'lucide-react';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { GitStatus, GitFileStatus, GitDiff } from '../types/electron';
import { getFileIconInfo } from '../utils/fileIcons';
import { stateManager } from '../../services/state-manager';

interface GitExplorerProps {
  currentFolder: string | null;
  isVisible?: boolean;
}

export const GitExplorer: React.FC<GitExplorerProps> = ({ currentFolder, isVisible = true }) => {
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
  const [expandedStagedDirectories, setExpandedStagedDirectories] = useState<Set<string>>(new Set());
  const [expandedChangedDirectories, setExpandedChangedDirectories] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: GitFileStatus | null; type: 'file' | 'staged' | 'changes' | 'general' } | null>(null);
  const [branches, setBranches] = useState<{ current: string; all: string[] }>({ current: '', all: [] });
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [showStashMenu, setShowStashMenu] = useState(false);
  const [stashList, setStashList] = useState<string[]>([]);
  const [commitHistory, setCommitHistory] = useState<Array<{ hash: string; message: string; author: string; date: string }>>([]);
  const [showHistoryMenu, setShowHistoryMenu] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(true);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [isRestoringState, setIsRestoringState] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Load persisted state when component mounts or folder changes
  useEffect(() => {
    if (currentFolder) {
      const persistedState = stateManager.getGitExplorerState();
      if (persistedState) {
        if (persistedState.stagedExpanded !== undefined) {
          setStagedExpanded(persistedState.stagedExpanded);
        }
        if (persistedState.changesExpanded !== undefined) {
          setChangesExpanded(persistedState.changesExpanded);
        }
        if (persistedState.historyExpanded !== undefined) {
          setHistoryExpanded(persistedState.historyExpanded);
        }
        if (persistedState.commitMessage) {
          setCommitMessage(persistedState.commitMessage);
        }
        if (persistedState.expandedStagedDirectories) {
          setExpandedStagedDirectories(new Set(persistedState.expandedStagedDirectories));
        }
        if (persistedState.expandedChangedDirectories) {
          setExpandedChangedDirectories(new Set(persistedState.expandedChangedDirectories));
        }
      }
    }
  }, [currentFolder]);

  // Persist state when it changes (but not during state restoration)
  useEffect(() => {
    if (currentFolder && !isRestoringState) {
      const stateToSave = {
        stagedExpanded,
        changesExpanded,
        historyExpanded,
        commitMessage,
        expandedStagedDirectories: Array.from(expandedStagedDirectories),
        expandedChangedDirectories: Array.from(expandedChangedDirectories),
        selectedFilePath: selectedFile?.path || null
      };
      stateManager.setGitExplorerState(stateToSave);
    }
  }, [stagedExpanded, changesExpanded, historyExpanded, commitMessage, expandedStagedDirectories, expandedChangedDirectories, selectedFile, currentFolder, isRestoringState]);

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
      loadBranches();
      loadStashList();
      loadCommitHistory();
    } else {
      setGitStatus(null);
      setError(null);
      setBranches({ current: '', all: [] });
      setStashList([]);
      setCommitHistory([]);
    }
  }, [currentFolder]);

  // Restore selected file after gitStatus loads and component becomes visible
  useEffect(() => {
    if (currentFolder && gitStatus && gitStatus.files.length > 0 && isVisible) {
      const persistedState = stateManager.getGitExplorerState();
      if (persistedState?.selectedFilePath && !selectedFile && !isRestoringState) {
        setIsRestoringState(true);
        restoreSelectedFile(persistedState.selectedFilePath);
        // Reset restoring flag after a short delay
        setTimeout(() => setIsRestoringState(false), 1000);
      }
    }
  }, [gitStatus, currentFolder, selectedFile, isRestoringState, isVisible]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, file: GitFileStatus | null, type: 'file' | 'staged' | 'changes' | 'general') => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      file,
      type
    });
  };

  const handleContextMenuAction = async (action: string, file?: GitFileStatus) => {
    setContextMenu(null);
    
    if (!file) return;
    
    switch (action) {
      case 'stage':
        await handleStageFile(file.path);
        break;
      case 'unstage':
        await handleUnstageFile(file.path);
        break;
      case 'discard':
        await handleDiscardChanges(file.path);
        break;
      case 'revert':
        await handleRevertFile(file.path);
        break;
      case 'viewDiff':
        await loadDiff(file);
        break;
    }
  };

  // Helper function to restore selected file from persisted state
  const restoreSelectedFile = (filePath: string) => {
    if (!gitStatus) return;
    
    // Look for the file in the files array
    const fileToRestore = gitStatus.files.find(file => file.path === filePath);
    
    if (fileToRestore) {
      setSelectedFile(fileToRestore);
      loadDiff(fileToRestore);
    }
  };

  const handleBulkAction = async (action: string) => {
    setContextMenu(null);
    
    switch (action) {
      case 'stageAll':
        await handleStageAll();
        break;
      case 'unstageAll':
        await handleUnstageAll();
        break;
      case 'discardAll':
        await handleDiscardAll();
        break;
      case 'stashPush':
        const message = window.prompt('Enter stash message (optional):');
        if (message !== null) {
          await handleStashPush(message || undefined);
        }
        break;
      case 'stashPop':
        await handleStashPop();
        break;
      case 'resetSoft':
        await handleResetSoft();
        break;
      case 'resetHard':
        await handleResetHard();
        break;
    }
  };

  const handlePull = async () => {
    if (isPulling) return;
    
    setIsPulling(true);
    try {
      const result = await window.electronAPI.git.pull();
      if (result.success) {
        await loadGitStatus();
        await loadCommitHistory();
        console.log('Pull successful:', result.message);
      } else {
        console.error('Pull failed:', result.message);
        alert(`Pull failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Error during pull:', error);
      alert('Pull failed: Network error or repository issue');
    } finally {
      setIsPulling(false);
    }
  };

  const handlePush = async () => {
    if (isPushing) return;
    
    setIsPushing(true);
    try {
      const result = await window.electronAPI.git.push();
      if (result.success) {
        await loadGitStatus();
        console.log('Push successful:', result.message);
      } else {
        console.error('Push failed:', result.message);
        alert(`Push failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Error during push:', error);
      alert('Push failed: Network error or repository issue');
    } finally {
      setIsPushing(false);
    }
  };

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

  const handleRevertFile = async (filePath: string) => {
    if (window.confirm(`Are you sure you want to revert ${filePath} to HEAD?`)) {
      try {
        await window.electronAPI.git.revertFile(filePath);
        loadGitStatus();
        if (selectedFile?.path === filePath) {
          setSelectedFile(null);
          setSelectedDiff(null);
        }
      } catch (error) {
        console.error('Error reverting file:', error);
      }
    }
  };

  const handleStashPush = async (message?: string) => {
    try {
      const success = await window.electronAPI.git.stashPush(message);
      if (success) {
        loadGitStatus();
        loadStashList();
        setSelectedFile(null);
        setSelectedDiff(null);
      }
    } catch (error) {
      console.error('Error stashing changes:', error);
    }
  };

  const handleStashPop = async () => {
    try {
      const success = await window.electronAPI.git.stashPop();
      if (success) {
        loadGitStatus();
        loadStashList();
      }
    } catch (error) {
      console.error('Error popping stash:', error);
    }
  };

  const handleStageAll = async () => {
    try {
      await window.electronAPI.git.stageAllFiles();
      loadGitStatus();
    } catch (error) {
      console.error('Error staging all files:', error);
    }
  };

  const handleUnstageAll = async () => {
    try {
      await window.electronAPI.git.unstageAllFiles();
      loadGitStatus();
    } catch (error) {
      console.error('Error unstaging all files:', error);
    }
  };

  const handleDiscardAll = async () => {
    if (window.confirm('Are you sure you want to discard all changes? This cannot be undone.')) {
      try {
        await window.electronAPI.git.discardAllChanges();
        loadGitStatus();
        setSelectedFile(null);
        setSelectedDiff(null);
      } catch (error) {
        console.error('Error discarding all changes:', error);
      }
    }
  };

  const handleResetSoft = async (commitHash?: string) => {
    if (window.confirm(`Are you sure you want to soft reset to ${commitHash || 'HEAD~1'}?`)) {
      try {
        await window.electronAPI.git.resetSoft(commitHash);
        loadGitStatus();
      } catch (error) {
        console.error('Error soft resetting:', error);
      }
    }
  };

  const handleResetHard = async (commitHash?: string) => {
    if (window.confirm(`Are you sure you want to hard reset to ${commitHash || 'HEAD~1'}? This will lose all changes.`)) {
      try {
        await window.electronAPI.git.resetHard(commitHash);
        loadGitStatus();
        setSelectedFile(null);
        setSelectedDiff(null);
      } catch (error) {
        console.error('Error hard resetting:', error);
      }
    }
  };

  const handleSwitchBranch = async (branchName: string) => {
    try {
      await window.electronAPI.git.switchBranch(branchName);
      loadGitStatus();
      loadBranches();
    } catch (error) {
      console.error('Error switching branch:', error);
    }
  };

  const loadBranches = async () => {
    try {
      const branchData = await window.electronAPI.git.getBranches();
      setBranches(branchData);
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const loadStashList = async () => {
    try {
      const stashes = await window.electronAPI.git.stashList();
      setStashList(stashes);
    } catch (error) {
      console.error('Error loading stash list:', error);
    }
  };

  const loadCommitHistory = async (count: number = 10) => {
    try {
      const history = await window.electronAPI.git.getCommitHistory(count);
      setCommitHistory(history);
    } catch (error) {
      console.error('Error loading commit history:', error);
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

  const toggleDirectory = (path: string, isStaged: boolean) => {
    if (isStaged) {
      setExpandedStagedDirectories(prev => {
        const newSet = new Set(prev);
        if (newSet.has(path)) {
          newSet.delete(path);
        } else {
          newSet.add(path);
        }
        return newSet;
      });
    } else {
      setExpandedChangedDirectories(prev => {
        const newSet = new Set(prev);
        if (newSet.has(path)) {
          newSet.delete(path);
        } else {
          newSet.add(path);
        }
        return newSet;
      });
    }
  };

  const renderTreeNode = (node: GitTreeNode, depth: number = 0, isStaged: boolean = false): React.ReactNode => {
    const expandedDirectories = isStaged ? expandedStagedDirectories : expandedChangedDirectories;
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
              onClick={() => toggleDirectory(node.path, isStaged)}
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
                {node.children.map(child => renderTreeNode(child, depth + 1, isStaged))}
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
                onContextMenu={(e) => handleContextMenu(e, file, file.staged ? 'staged' : 'changes')}
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

  const renderContextMenu = () => {
    if (!contextMenu) return null;

    const { x, y, file, type } = contextMenu;
    
    return (
      <div
        ref={contextMenuRef}
        className="fixed bg-gray-800 border border-gray-600 rounded shadow-lg z-[9999] py-1 min-w-48"
        style={{ left: x, top: y }}
      >
        {type === 'file' && file && (
          <>
            <button
              onClick={() => handleContextMenuAction('viewDiff', file)}
              className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
            >
              <MessageSquare className="w-4 h-4" />
              <span>View Diff</span>
            </button>
            {file.staged ? (
              <button
                onClick={() => handleContextMenuAction('unstage', file)}
                className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
              >
                <Minus className="w-4 h-4" />
                <span>Unstage</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => handleContextMenuAction('stage', file)}
                  className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Stage</span>
                </button>
                {!file.isNew && (
                  <>
                    <button
                      onClick={() => handleContextMenuAction('discard', file)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Discard Changes</span>
                    </button>
                    <button
                      onClick={() => handleContextMenuAction('revert', file)}
                      className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
                    >
                      <RefreshCcw className="w-4 h-4" />
                      <span>Revert to HEAD</span>
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}
        
        {type === 'staged' && (
          <>
            <button
              onClick={() => handleBulkAction('unstageAll')}
              className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
            >
              <Minus className="w-4 h-4" />
              <span>Unstage All</span>
            </button>
          </>
        )}
        
        {type === 'changes' && (
          <>
            <button
              onClick={() => handleBulkAction('stageAll')}
              className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Stage All</span>
            </button>
            <button
              onClick={() => handleBulkAction('discardAll')}
              className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2 text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
              <span>Discard All</span>
            </button>
          </>
        )}
        
        {type === 'general' && (
          <>
            <button
              onClick={() => handleBulkAction('stashPush')}
              className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
            >
              <Archive className="w-4 h-4" />
              <span>Stash Changes</span>
            </button>
            <button
              onClick={() => handleBulkAction('stashPop')}
              className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
            >
              <ArchiveRestore className="w-4 h-4" />
              <span>Pop Stash</span>
            </button>
            <div className="border-t border-gray-600 my-1" />
            <button
              onClick={() => handleBulkAction('resetSoft')}
              className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2"
            >
              <RefreshCcw className="w-4 h-4" />
              <span>Reset Soft</span>
            </button>
            <button
              onClick={() => handleBulkAction('resetHard')}
              className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-gray-700 flex items-center space-x-2 text-red-400 hover:text-red-300"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Reset Hard</span>
            </button>
          </>
        )}
      </div>
    );
  };


  const renderStashDropdown = () => {
    if (!showStashMenu) return null;
    
    return (
      <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg z-[9999] py-1 min-w-64">
        <div className="px-3 py-2 text-xs text-gray-400 font-medium border-b border-gray-600">
          Stash List
        </div>
        {stashList.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">No stashes</div>
        ) : (
          stashList.map((stash, index) => (
            <div key={index} className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-700">
              <div className="truncate">{stash}</div>
            </div>
          ))
        )}
      </div>
    );
  };

  const renderHistoryDropdown = () => {
    if (!showHistoryMenu) return null;
    
    return (
      <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded shadow-lg z-[9999] py-1 min-w-80">
        <div className="px-3 py-2 text-xs text-gray-400 font-medium border-b border-gray-600">
          Recent Commits
        </div>
        {commitHistory.length === 0 ? (
          <div className="px-3 py-2 text-sm text-gray-500">No commits</div>
        ) : (
          commitHistory.slice(0, 5).map((commit, index) => (
            <div key={commit.hash} className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-700">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <div className="font-mono text-xs text-gray-400">{commit.hash.substring(0, 7)}</div>
              </div>
              <div className="mt-1 text-xs truncate">{commit.message}</div>
              <div className="text-xs text-gray-500 mt-1">{commit.author} • {new Date(commit.date).toLocaleDateString()}</div>
            </div>
          ))
        )}
        <div className="border-t border-gray-600 px-3 py-2">
          <button 
            onClick={() => {
              setHistoryExpanded(true);
              setShowHistoryMenu(false);
            }}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Show all commits in sidebar
          </button>
        </div>
      </div>
    );
  };

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
      className="h-full w-full bg-gray-900 flex overflow-visible min-h-0"
      style={isDebugMode ? { border: '2px solid red' } : {}}
    >
      {/* Git Status Sidebar */}
      <div 
        className="w-80 bg-gray-800 border-r border-gray-700 p-4 flex flex-col h-full overflow-visible min-h-0"
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

          {/* Git Actions Bar */}
          {gitStatus && (
            <div className="mb-4">
              <div className="flex items-center justify-between p-2 bg-gray-700 rounded text-sm">
                {gitStatus.ahead > 0 && (
                  <button
                    onClick={handlePush}
                    disabled={isPushing}
                    className={`flex items-center space-x-1 px-2 py-1 rounded text-green-400 hover:text-green-300 hover:bg-gray-600 transition-colors ${
                      isPushing ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title={isPushing ? 'Pushing...' : `Push ${gitStatus.ahead} commit(s) to remote`}
                  >
                    <span>{isPushing ? '↑...' : `↑${gitStatus.ahead}`}</span>
                    <span className="text-xs">Push</span>
                  </button>
                )}
                {gitStatus.behind > 0 && (
                  <button
                    onClick={handlePull}
                    disabled={isPulling}
                    className={`flex items-center space-x-1 px-2 py-1 rounded text-red-400 hover:text-red-300 hover:bg-gray-600 transition-colors ${
                      isPulling ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    title={isPulling ? 'Pulling...' : `Pull ${gitStatus.behind} commit(s) from remote`}
                  >
                    <span>{isPulling ? '↓...' : `↓${gitStatus.behind}`}</span>
                    <span className="text-xs">Pull</span>
                  </button>
                )}
                <div className="flex items-center space-x-1 ml-auto">
                  <div className="relative">
                    <button
                      onClick={() => setShowStashMenu(!showStashMenu)}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      title="Stash"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                    {renderStashDropdown()}
                  </div>
                  <div className="relative">
                    <button
                      onClick={() => setShowHistoryMenu(!showHistoryMenu)}
                      className="p-1 text-gray-400 hover:text-white transition-colors"
                      title="History"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    {renderHistoryDropdown()}
                  </div>
                  <button
                    onClick={(e) => handleContextMenu(e, null, 'general')}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="More Actions"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
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
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setStagedExpanded(!stagedExpanded)}
                  className="flex items-center space-x-2 text-left text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  {stagedExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span>Staged Changes ({stagedFiles.length})</span>
                </button>
                <button
                  onClick={(e) => handleContextMenu(e, null, 'staged')}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                  title="Staged Actions"
                >
                  <MoreVertical className="w-3 h-3" />
                </button>
              </div>
              {stagedExpanded && (
                <div className="space-y-1">
                  {stagedTree.map(node => renderTreeNode(node, 0, true))}
                </div>
              )}
            </div>
          )}

          {/* Changes */}
          {changedFiles.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setChangesExpanded(!changesExpanded)}
                  className="flex items-center space-x-2 text-left text-sm font-medium text-gray-300 hover:text-white transition-colors"
                >
                  {changesExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span>Changes ({changedFiles.length})</span>
                </button>
                <button
                  onClick={(e) => handleContextMenu(e, null, 'changes')}
                  className="p-1 text-gray-400 hover:text-white transition-colors"
                  title="Changes Actions"
                >
                  <MoreVertical className="w-3 h-3" />
                </button>
              </div>
              {changesExpanded && (
                <div className="space-y-1">
                  {changedTree.map(node => renderTreeNode(node, 0, false))}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Commit History Footer - Always Visible */}
        {gitStatus && (
          <div className="border-t border-gray-700 pt-2 mt-2">
            <button
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="w-full flex items-center justify-between p-3 bg-gray-700 hover:bg-gray-600 rounded transition-colors text-sm font-medium text-gray-300 hover:text-white"
            >
              <div className="flex items-center space-x-2">
                <History className="w-4 h-4" />
                <span>Recent Commits ({commitHistory.length})</span>
              </div>
              {historyExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            
            {historyExpanded && (
              <div className="mt-2 space-y-1 max-h-64 overflow-y-auto bg-gray-800 rounded p-2">
                {commitHistory.length === 0 ? (
                  <div className="text-center text-gray-500 py-4">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No commits found</p>
                  </div>
                ) : (
                  commitHistory.map((commit, index) => (
                    <div 
                      key={commit.hash} 
                      className="p-2 rounded cursor-pointer hover:bg-gray-600 transition-colors border-l-2 border-green-500"
                      title={`${commit.hash}\n${commit.message}\n${commit.author} - ${new Date(commit.date).toLocaleString()}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full" />
                          <span className="font-mono text-xs text-gray-400">{commit.hash.substring(0, 7)}</span>
                        </div>
                        <span className="text-xs text-gray-500">{new Date(commit.date).toLocaleDateString()}</span>
                      </div>
                      <div className="text-xs text-gray-300 truncate mb-1" title={commit.message}>
                        {commit.message}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {commit.author}
                      </div>
                    </div>
                  ))
                )}
                {commitHistory.length > 10 && (
                  <div className="text-center pt-2 border-t border-gray-600">
                    <button 
                      onClick={() => loadCommitHistory(commitHistory.length + 10)}
                      className="text-xs text-blue-400 hover:text-blue-300 py-1"
                    >
                      Load more commits
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
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
      {renderContextMenu()}
    </div>
  );
};