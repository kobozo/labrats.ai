import React, { useState, useEffect } from 'react';
import { Chat } from './components/Chat';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Dashboard } from './components/Dashboard';
import { KanbanBoard } from './components/KanbanBoard';
import { Documentation } from './components/Documentation';
import { FileExplorer } from './components/FileExplorer';
import { GitExplorer } from './components/GitExplorer';
import { TerminalComponent } from './components/TerminalComponent';
import { Settings } from './components/Settings';
import { Account } from './components/Account';
import { StartScreen } from './components/StartScreen';
import { stateManager } from '../services/state-manager';
import { gitMonitor } from '../services/git-monitor';
import { 
  MessageSquare, 
  BarChart3, 
  Settings as SettingsIcon,
  Sparkles,
  Bot,
  CheckCircle,
  GitCommit,
  Trello,
  BookOpen,
  FolderOpen,
  GitBranch,
  User,
  Crown,
  Folder,
  Terminal
} from 'lucide-react';
import './App.css';

type ActiveView = 'chat' | 'dashboard' | 'kanban' | 'docs' | 'files' | 'git' | 'terminal' | 'settings' | 'account';

function App() {
  const [activeView, setActiveView] = useState<ActiveView>('chat');
  const [previousView, setPreviousView] = useState<ActiveView>('chat');
  const [notification, setNotification] = useState<{
    type: 'success' | 'info' | 'warning';
    message: string;
  } | null>(null);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [gitStatus, setGitStatus] = useState<{ current: string; ahead: number; behind: number } | null>(null);
  const [branches, setBranches] = useState<{ current: string; all: string[] }>({ current: '', all: [] });
  const [showBranchMenu, setShowBranchMenu] = useState(false);

  // Set initial view based on whether a folder is loaded
  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);
      // If no folder is set on initial load, don't default to any specific view
      if (!currentFolder) {
        setActiveView('chat'); // This will be overridden by the start screen logic
      }
    }
  }, [isInitialized, currentFolder]);

  // Initialize state manager and git monitor when current folder changes
  useEffect(() => {
    const initializeServices = async () => {
      console.log('App: Initializing services for folder:', currentFolder);
      await stateManager.setCurrentProject(currentFolder);
      gitMonitor.setCurrentFolder(currentFolder);
      
      if (currentFolder) {
        // Load persisted navigation state, but only if different from default 'chat'
        const persistedActiveView = stateManager.getActiveView();
        const persistedPreviousView = stateManager.getPreviousView();
        
        // Only restore state if it's not the default 'chat' view or if we're already on a different view
        if (persistedActiveView && persistedActiveView !== 'chat' && persistedActiveView !== activeView) {
          setActiveView(persistedActiveView as ActiveView);
        } else {
          // Default to chat for new projects or when chat was the last view
          setActiveView('chat');
        }
        
        if (persistedPreviousView && persistedPreviousView !== previousView) {
          setPreviousView(persistedPreviousView as ActiveView);
        }
      }
    };
    
    initializeServices();
  }, [currentFolder]);

  // Persist navigation state when it changes
  useEffect(() => {
    if (currentFolder) {
      stateManager.setActiveView(activeView);
    }
  }, [activeView, currentFolder]);

  useEffect(() => {
    if (currentFolder) {
      stateManager.setPreviousView(previousView);
    }
  }, [previousView, currentFolder]);

  const showNotification = (type: 'success' | 'info' | 'warning', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  // Handle navigation changes and track previous view
  const handleViewChange = (newView: ActiveView) => {
    if (newView !== 'settings' && newView !== 'account') {
      setPreviousView(activeView);
    }
    setActiveView(newView);
  };

  // Toggle settings view - return to previous view if already on settings
  const handleSettingsToggle = () => {
    if (activeView === 'settings') {
      // Return to previous view, but only if we have a folder open
      if (currentFolder) {
        setActiveView(previousView);
      } else {
        // If no folder is open, go back to start screen
        setActiveView('chat'); // This will show StartScreen
      }
    } else {
      // Track the current view before going to settings
      if (activeView !== 'account') {
        setPreviousView(activeView);
      }
      setActiveView('settings');
    }
  };

  // Toggle account view - return to previous view if already on account
  const handleAccountToggle = () => {
    if (activeView === 'account') {
      // Return to previous view, but only if we have a folder open
      if (currentFolder) {
        setActiveView(previousView);
      } else {
        // If no folder is open, go back to start screen
        setActiveView('chat'); // This will show StartScreen
      }
    } else {
      // Track the current view before going to account
      if (activeView !== 'settings') {
        setPreviousView(activeView);
      }
      setActiveView('account');
    }
  };

  const handleOpenFolder = async (folderPath?: string) => {
    if (folderPath) {
      setCurrentFolder(folderPath);
      setActiveView('chat');
      showNotification('success', `Opened folder: ${folderPath}`);
    } else {
      try {
        // @ts-ignore - electronAPI will be available through preload script
        const result = await window.electronAPI?.openFolder();
        if (result && !result.canceled && result.filePaths.length > 0) {
          setCurrentFolder(result.filePaths[0]);
          setActiveView('chat');
          showNotification('success', `Opened folder: ${result.filePaths[0]}`);
        }
      } catch (error) {
        showNotification('warning', 'Failed to open folder');
      }
    }
  };

  // Listen for folder opened from menu
  useEffect(() => {
    if (window.electronAPI?.onFolderOpened) {
      window.electronAPI.onFolderOpened((folderPath: string) => {
        setCurrentFolder(folderPath);
        setActiveView('chat');
        showNotification('success', `Opened folder: ${folderPath}`);
      });
    }
  }, []);

  // Subscribe to git monitor for status bar updates
  useEffect(() => {
    const unsubscribe = gitMonitor.subscribe((gitState) => {
      console.log('App: Git monitor state update:', gitState);
      if (gitState.status && gitState.branches.current) {
        setGitStatus({
          current: gitState.branches.current,
          ahead: gitState.status.ahead,
          behind: gitState.status.behind
        });
      } else {
        setGitStatus(null);
      }
      setBranches(gitState.branches);
    });
    
    return unsubscribe;
  }, []);

  // No longer needed - git monitor handles this

  const handleSwitchBranch = async (branchName: string) => {
    try {
      const success = await gitMonitor.switchBranch(branchName);
      setShowBranchMenu(false);
      if (success) {
        showNotification('success', `Switched to branch: ${branchName}`);
      } else {
        showNotification('warning', `Failed to switch to branch: ${branchName}`);
      }
    } catch (error) {
      console.error('Error switching branch:', error);
      showNotification('warning', `Failed to switch to branch: ${branchName}`);
    }
  };

  const handlePull = async () => {
    try {
      if (!currentFolder) return;
      const result = await window.electronAPI.git.pull(currentFolder);
      if (result.success) {
        showNotification('success', 'Successfully pulled changes');
      } else {
        showNotification('warning', `Pull failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Error pulling:', error);
      showNotification('warning', 'Failed to pull changes');
    }
  };

  const handlePush = async () => {
    try {
      if (!currentFolder) return;
      const result = await window.electronAPI.git.push(currentFolder);
      if (result.success) {
        showNotification('success', 'Successfully pushed changes');
      } else {
        showNotification('warning', `Push failed: ${result.message}`);
      }
    } catch (error) {
      console.error('Error pushing:', error);
      showNotification('warning', 'Failed to push changes');
    }
  };

  // Close branch menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showBranchMenu) {
        setShowBranchMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showBranchMenu]);

  const navItems = [
    { 
      id: 'chat' as const, 
      label: 'Agent Chat', 
      icon: MessageSquare,
      description: 'AI-powered collaborative development'
    },
    { 
      id: 'kanban' as const, 
      label: 'Task Board', 
      icon: Trello,
      description: 'Track AI-generated tasks and workflow'
    },
    { 
      id: 'docs' as const, 
      label: 'Documentation', 
      icon: BookOpen,
      description: 'Project documentation and guides'
    },
    { 
      id: 'files' as const, 
      label: 'Files', 
      icon: FolderOpen,
      description: 'Project structure and file management'
    },
    { 
      id: 'git' as const, 
      label: 'Source Control', 
      icon: GitBranch,
      description: 'Git version control and diff viewer'
    },
    { 
      id: 'terminal' as const, 
      label: 'Terminal', 
      icon: Terminal,
      description: 'Integrated terminal with multiple sessions'
    },
    { 
      id: 'dashboard' as const, 
      label: 'Analytics', 
      icon: BarChart3,
      description: 'Code insights and performance metrics'
    }
  ];

  return (
    <div className="h-screen bg-gray-900 flex flex-col overflow-hidden">
      {/* Notification */}
      {notification && (
        <div className="fixed top-20 right-4 z-50 animate-in slide-in-from-top-2">
          <div className={`px-4 py-3 rounded-lg shadow-lg border flex items-center space-x-3 ${
            notification.type === 'success' ? 'bg-green-900 border-green-500 text-green-100' :
            notification.type === 'warning' ? 'bg-yellow-900 border-yellow-500 text-yellow-100' :
            'bg-blue-900 border-blue-500 text-blue-100'
          }`}>
            {notification.type === 'success' && <CheckCircle className="w-5 h-5" />}
            {notification.type === 'warning' && <SettingsIcon className="w-5 h-5" />}
            {notification.type === 'info' && <GitCommit className="w-5 h-5" />}
            <span className="text-sm font-medium">{notification.message}</span>
          </div>
        </div>
      )}

      {/* Top Navigation - Fixed header with title bar space */}
      {currentFolder ? (
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="flex flex-col items-center space-y-2">
            {/* Application & Folder Name (centered full-width) */}
            <div className="w-full text-center truncate text-sm font-medium text-gray-200 select-none">
              LabRats.AI{currentFolder ? ` • ${currentFolder.split('/').pop()}` : ''}
            </div>

            {/* Row with navigation + settings */}
            <div className="flex items-center justify-between w-full" style={{ WebkitAppRegion: 'no-drag' } as any}>
              {/* Navigation Icons */}
              <div className="flex items-center space-x-1 bg-gray-700 rounded-lg p-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleViewChange(item.id)}
                    className={`p-2 rounded-md transition-all ${
                      activeView === item.id
                        ? 'bg-blue-600 text-white shadow-lg'
                        : 'text-gray-300 hover:text-white hover:bg-gray-600'
                    }`}
                    title={item.label}
                  >
                    <item.icon className="w-5 h-5" />
                  </button>
                ))}
              </div>

              {/* Right side - Settings */}
              <div className="flex items-center space-x-2">
                <button 
                  onClick={handleAccountToggle}
                  className={`p-2 rounded-lg transition-colors ${
                    activeView === 'account' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                  title="Account Management"
                >
                  <div className="relative">
                    <User className="w-5 h-5" />
                    <Crown className="w-3 h-3 text-yellow-400 absolute -top-1 -right-1" />
                  </div>
                </button>
                
                <button 
                  onClick={handleSettingsToggle}
                  className={`p-2 rounded-lg transition-colors ${
                    activeView === 'settings' 
                      ? 'bg-blue-600 text-white' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                  title="Settings"
                >
                  <SettingsIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Minimal header when no folder is open */
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as any}>
          <div className="flex items-center justify-end">
            <div className="flex items-center space-x-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
              {/* Account Button */}
              <button 
                onClick={handleAccountToggle}
                className={`p-2 rounded-lg transition-colors ${
                  activeView === 'account' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
                title="Account Management"
              >
                <div className="relative">
                  <User className="w-5 h-5" />
                  <Crown className="w-3 h-3 text-yellow-400 absolute -top-1 -right-1" />
                </div>
              </button>
              
              <button 
                onClick={handleSettingsToggle}
                className={`p-2 rounded-lg transition-colors ${
                  activeView === 'settings' 
                    ? 'bg-blue-600 text-white' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
                title="Settings"
              >
                <SettingsIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Content Area - Scrollable */}
      <div className="flex-1 overflow-hidden">
        {!currentFolder ? (
          /* Show start screen when no folder is open */
          activeView === 'account' ? (
            <Account />
          ) : activeView === 'settings' ? (
            <Settings />
          ) : (
            <StartScreen onOpenFolder={handleOpenFolder} />
          )
        ) : (
          /* Show normal views when a folder is open */
          <>
            <div style={{ display: activeView === 'chat' ? 'block' : 'none', height: '100%' }}>
              <ErrorBoundary>
                <Chat 
                  onCodeReview={() => showNotification('info', 'Code review initiated')} 
                  currentFolder={currentFolder}
                />
              </ErrorBoundary>
            </div>
            
            <div style={{ display: activeView === 'kanban' ? 'block' : 'none', height: '100%' }}>
              <KanbanBoard />
            </div>
            
            <div style={{ display: activeView === 'docs' ? 'block' : 'none', height: '100%' }}>
              <Documentation />
            </div>
            
            <div style={{ display: activeView === 'files' ? 'block' : 'none', height: '100%' }}>
              <FileExplorer currentFolder={currentFolder} isVisible={activeView === 'files'} />
            </div>
            
            <div style={{ display: activeView === 'git' ? 'block' : 'none', height: '100%' }}>
              <GitExplorer currentFolder={currentFolder} isVisible={activeView === 'git'} />
            </div>
            
            <div style={{ display: activeView === 'terminal' ? 'block' : 'none', height: '100%' }}>
              <TerminalComponent 
                currentFolder={currentFolder} 
                isVisible={activeView === 'terminal'}
              />
            </div>
            
            <div style={{ display: activeView === 'dashboard' ? 'block' : 'none', height: '100%' }}>
              <Dashboard />
            </div>

            {activeView === 'settings' && (
              <Settings />
            )}

            {activeView === 'account' && (
              <Account />
            )}
          </>
        )}
      </div>

      {/* Status Bar - Only show when folder is open */}
      {currentFolder && (
        <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 flex items-center justify-between text-xs text-gray-400 flex-shrink-0">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>6 agents active</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
              <span>Chat ready</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
              <span>Review available</span>
            </div>
            {gitStatus && (
              <div className="flex items-center space-x-2 relative">
                <div className="w-2 h-2 bg-orange-400 rounded-full"></div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setShowBranchMenu(!showBranchMenu)}
                    className="flex items-center space-x-1 hover:text-gray-200 transition-colors cursor-pointer"
                    title="Click to switch branch"
                  >
                    <GitBranch className="w-3 h-3" />
                    <span className="max-w-32 truncate">{gitStatus.current}</span>
                  </button>
                  
                  {/* Separate clickable sync indicators */}
                  <div className="flex items-center space-x-1 text-xs">
                      <button
                        onClick={handlePull}
                        className={`px-1 rounded transition-colors ${
                          gitStatus.behind > 0 
                            ? 'text-red-400 hover:text-red-300 hover:bg-gray-700' 
                            : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700'
                        }`}
                        title={gitStatus.behind > 0 ? `Pull ${gitStatus.behind} commit(s) from remote` : 'No commits to pull'}
                      >
                        ↓{gitStatus.behind}
                      </button>
                      <button
                        onClick={handlePush}
                        className={`px-1 rounded transition-colors ${
                          gitStatus.ahead > 0 
                            ? 'text-green-400 hover:text-green-300 hover:bg-gray-700' 
                            : 'text-gray-500 hover:text-gray-400 hover:bg-gray-700'
                        }`}
                        title={gitStatus.ahead > 0 ? `Push ${gitStatus.ahead} commit(s) to remote` : 'No commits to push'}
                      >
                        ↑{gitStatus.ahead}
                      </button>
                    </div>
                </div>
                
                {/* Branch Dropdown */}
                {showBranchMenu && (
                  <div className="absolute bottom-full left-0 mb-2 bg-gray-800 border border-gray-600 rounded shadow-lg z-[9999] py-1 min-w-48">
                    <div className="px-3 py-2 text-xs text-gray-400 font-medium border-b border-gray-600">
                      Switch Branch
                    </div>
                    {branches.all.map(branch => (
                      <button
                        key={branch}
                        onClick={() => handleSwitchBranch(branch)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-gray-700 flex items-center space-x-2 ${
                          branch === branches.current ? 'text-green-400' : 'text-gray-300'
                        }`}
                      >
                        <GitBranch className="w-4 h-4" />
                        <span className="truncate">{branch}</span>
                        {branch === branches.current && <span className="text-xs ml-auto">current</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            LabRats.ai v1.0.0
          </div>
        </div>
      )}
    </div>
  );
}

export default App;