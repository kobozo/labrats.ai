import React, { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, Plus, X, Settings, Folder, AlertCircle, Search, File } from 'lucide-react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

interface TerminalSession {
  id: string;
  name: string;
  isActive: boolean;
  cwd: string;
  pid?: number;
  terminal?: Terminal;
  fitAddon?: FitAddon;
  currentInput?: string;
}

interface FileSearchResult {
  name: string;
  path: string;
  type: 'file' | 'directory';
}

interface TerminalComponentProps {
  currentFolder: string | null;
}

export const TerminalComponent: React.FC<TerminalComponentProps> = ({ currentFolder }) => {
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFileSearch, setShowFileSearch] = useState(false);
  const [fileSearchQuery, setFileSearchQuery] = useState('');
  const [fileSearchResults, setFileSearchResults] = useState<FileSearchResult[]>([]);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [atSymbolPosition, setAtSymbolPosition] = useState<{row: number, col: number} | null>(null);
  const terminalRefs = useRef<{[key: string]: HTMLDivElement}>({});
  const fileSearchRef = useRef<HTMLDivElement>(null);

  // Search for files
  const searchFiles = async (query: string) => {
    if (!currentFolder) {
      setFileSearchResults([]);
      return;
    }

    try {
      // Use electron API to search files
      const results = await window.electronAPI?.searchFiles?.(currentFolder, query, 20);
      if (results) {
        setFileSearchResults(results);
      }
    } catch (error) {
      console.error('Error searching files:', error);
      setFileSearchResults([]);
    }
  };

  // Handle file selection
  const selectFile = (file: FileSearchResult) => {
    const activeTerminal = terminals.find(t => t.id === activeTerminalId);
    if (activeTerminal && activeTerminal.terminal && atSymbolPosition) {
      // Clear the @ and search query
      for (let i = 0; i <= fileSearchQuery.length; i++) {
        activeTerminal.terminal.write('\b \b');
      }
      
      // Write the file path
      activeTerminal.terminal.write(file.path);
      
      // Reset search state
      setShowFileSearch(false);
      setFileSearchQuery('');
      setAtSymbolPosition(null);
      setSelectedFileIndex(0);
    }
  };

  // Create a new terminal session
  const createNewTerminal = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const terminalId = `terminal-${Date.now()}`;
      const terminal = new Terminal({
        theme: {
          background: '#1f2937',
          foreground: '#f3f4f6',
          cursor: '#60a5fa',
          selectionBackground: 'rgba(96, 165, 250, 0.3)',
          black: '#374151',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#f3f4f6',
          brightBlack: '#6b7280',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#facc15',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#ffffff'
        },
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
        fontSize: 13,
        lineHeight: 1.2,
        cursorBlink: true,
        cursorStyle: 'bar',
        scrollback: 1000,
        tabStopWidth: 4
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      
      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      
      // Store the fitAddon reference for later use
      (terminal as any).fitAddon = fitAddon;

      const newTerminal: TerminalSession = {
        id: terminalId,
        name: `Terminal ${terminals.length + 1}`,
        terminal: terminal,
        fitAddon: fitAddon,
        isActive: true,
        cwd: currentFolder || process.cwd(),
        pid: undefined,
        currentInput: ''
      };

      // Mount the terminal first
      setTimeout(async () => {
        const terminalElement = terminalRefs.current[terminalId];
        if (terminalElement && fitAddon) {
          terminal.open(terminalElement);
          fitAddon.fit();
          
          // Start the terminal process after mounting
          const terminalProcess = await window.electronAPI?.terminal?.create({
            cwd: currentFolder || process.cwd(),
            cols: terminal.cols,
            rows: terminal.rows
          });

          if (terminalProcess) {
            newTerminal.pid = terminalProcess.pid;
            
            // Update the terminals array with the PID
            setTerminals(prev => prev.map(t => 
              t.id === terminalId ? { ...t, pid: terminalProcess.pid } : t
            ));
            
            // Handle terminal data (user input) with @ interception
            terminal.onData((data) => {
              if (showFileSearch) {
                // Handle file search navigation
                if (data === '\x1b[A') { // Up arrow
                  setSelectedFileIndex(prev => Math.max(0, prev - 1));
                } else if (data === '\x1b[B') { // Down arrow
                  setSelectedFileIndex(prev => Math.min(fileSearchResults.length - 1, prev + 1));
                } else if (data === '\r') { // Enter
                  if (fileSearchResults[selectedFileIndex]) {
                    selectFile(fileSearchResults[selectedFileIndex]);
                  }
                } else if (data === '\x1b') { // Escape
                  setShowFileSearch(false);
                  setFileSearchQuery('');
                  setAtSymbolPosition(null);
                } else if (data === '\x7f') { // Backspace
                  if (fileSearchQuery.length > 0) {
                    window.electronAPI?.terminal?.write(terminalProcess.pid, data);
                    const newQuery = fileSearchQuery.slice(0, -1);
                    setFileSearchQuery(newQuery);
                    searchFiles(newQuery);
                  } else {
                    // Close search if backspace on empty query
                    setShowFileSearch(false);
                    setAtSymbolPosition(null);
                    window.electronAPI?.terminal?.write(terminalProcess.pid, data);
                  }
                } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
                  // Regular character input
                  window.electronAPI?.terminal?.write(terminalProcess.pid, data);
                  const newQuery = fileSearchQuery + data;
                  setFileSearchQuery(newQuery);
                  searchFiles(newQuery);
                }
              } else {
                // Check for @ symbol
                if (data === '@') {
                  // Start file search
                  setShowFileSearch(true);
                  setAtSymbolPosition({
                    row: terminal.buffer.active.cursorY,
                    col: terminal.buffer.active.cursorX
                  });
                  setFileSearchQuery('');
                  searchFiles('');
                }
                // Forward all input to terminal
                window.electronAPI?.terminal?.write(terminalProcess.pid, data);
              }
            });

            // Handle terminal resize
            terminal.onResize((size) => {
              window.electronAPI?.terminal?.resize(terminalProcess.pid, size.cols, size.rows);
            });

            // Listen for data from the terminal process (output)
            window.electronAPI?.terminal?.onData(terminalProcess.pid, (data: string) => {
              terminal.write(data);
            });

            // Handle terminal exit
            window.electronAPI?.terminal?.onExit(terminalProcess.pid, (code: number) => {
              terminal.write(`\r\n\r\nProcess exited with code ${code}\r\n`);
            });
            
            terminal.focus();
          }
        }
      }, 100);

      setTerminals(prev => {
        const updated = prev.map(t => ({ ...t, isActive: false }));
        return [...updated, newTerminal];
      });
      
      setActiveTerminalId(terminalId);

    } catch (err) {
      setError(`Failed to create terminal: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Close a terminal session
  const closeTerminal = async (terminalId: string) => {
    const terminal = terminals.find(t => t.id === terminalId);
    if (terminal) {
      // Kill the terminal process
      if (terminal.pid) {
        await window.electronAPI?.terminal?.kill(terminal.pid);
      }
      
      // Dispose of the terminal
      if (terminal.terminal) {
        terminal.terminal.dispose();
      }
      
      // Remove from state
      setTerminals(prev => prev.filter(t => t.id !== terminalId));
      
      // If this was the active terminal, switch to another one
      if (activeTerminalId === terminalId) {
        const remainingTerminals = terminals.filter(t => t.id !== terminalId);
        if (remainingTerminals.length > 0) {
          setActiveTerminalId(remainingTerminals[0].id);
        } else {
          setActiveTerminalId(null);
        }
      }
    }
  };

  // Switch to a terminal
  const switchToTerminal = (terminalId: string) => {
    setActiveTerminalId(terminalId);
    setTerminals(prev => prev.map(t => ({ 
      ...t, 
      isActive: t.id === terminalId 
    })));
    
    // Focus the terminal
    setTimeout(() => {
      const terminal = terminals.find(t => t.id === terminalId);
      if (terminal && terminal.terminal) {
        terminal.terminal.focus();
      }
    }, 100);
  };

  // Rename a terminal
  const renameTerminal = (terminalId: string, newName: string) => {
    setTerminals(prev => prev.map(t => 
      t.id === terminalId ? { ...t, name: newName } : t
    ));
  };

  // Create initial terminal when component mounts
  useEffect(() => {
    if (terminals.length === 0) {
      createNewTerminal();
    }
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      terminals.forEach(terminal => {
        const fitAddon = (terminal.terminal as any).fitAddon;
        if (fitAddon) {
          fitAddon.fit();
        }
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [terminals]);

  // Helper to get the folder name from a full path
  const getFolderName = (folderPath: string): string => {
    if (!folderPath) return '';
    const parts = folderPath.replace(/\\/g, '/').split('/');
    return parts[parts.length - 1] || folderPath;
  };

  return (
    <div className="h-full w-full bg-gray-900 flex overflow-hidden min-h-0">
      {/* Terminal Sidebar */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 flex flex-col h-full overflow-hidden min-h-0">
        <div className="mb-4 flex-shrink-0">
          {/* Current Folder Display */}
          {currentFolder && (
            <div className="mb-3 w-full text-center text-sm font-medium text-gray-300 truncate">
              📁 {getFolderName(currentFolder)}
            </div>
          )}

          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Terminal</h2>
            <div className="flex items-center space-x-2">
              <button 
                onClick={createNewTerminal}
                className="p-1 text-gray-400 hover:text-white transition-colors"
                title="New Terminal"
                disabled={loading}
              >
                <Plus className="w-4 h-4" />
              </button>
              <button className="p-1 text-gray-400 hover:text-white transition-colors" title="Terminal Settings">
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Terminal List */}
        <div className="space-y-2 overflow-y-auto flex-1 min-h-0">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-gray-400">Creating terminal...</div>
            </div>
          )}
          
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-900/20 border border-red-500/30 rounded">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <div className="text-red-400 text-sm">{error}</div>
            </div>
          )}

          {terminals.length === 0 && !loading && (
            <div className="flex items-center justify-center py-8 text-center">
              <div className="text-gray-400">
                <TerminalIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No terminals open</p>
                <p className="text-xs mt-1">Click "+" to create a new terminal</p>
              </div>
            </div>
          )}

          {terminals.map(terminal => (
            <div
              key={terminal.id}
              className={`flex items-center space-x-2 p-3 rounded-lg border transition-all cursor-pointer ${
                activeTerminalId === terminal.id 
                  ? 'bg-blue-600 border-blue-500 text-white' 
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
              }`}
              onClick={() => switchToTerminal(terminal.id)}
            >
              <TerminalIcon className="w-4 h-4 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{terminal.name}</div>
                <div className="text-xs opacity-75 truncate">{terminal.cwd}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTerminal(terminal.id);
                }}
                className="p-1 rounded hover:bg-gray-600 transition-colors"
                title="Close Terminal"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Terminal Display */}
      <div className="flex-1 p-6 h-full overflow-hidden flex flex-col min-w-0 min-h-0">
        {activeTerminalId && terminals.find(t => t.id === activeTerminalId) ? (
          <div className="flex flex-col h-full min-h-0">
            {/* Terminal Header */}
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div className="flex items-center space-x-3">
                <TerminalIcon className="w-6 h-6 text-blue-400" />
                <h1 className="text-xl font-semibold text-white">Terminal</h1>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-400">
                  {terminals.find(t => t.id === activeTerminalId)?.cwd}
                </span>
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
              </div>
            </div>

            {/* Terminal Container */}
            <div className="bg-gray-900 rounded-lg border border-gray-700 flex-1 flex flex-col min-h-0 overflow-hidden relative">
              {/* Actual Terminal */}
              <div
                ref={(el) => {
                  if (el && activeTerminalId) {
                    terminalRefs.current[activeTerminalId] = el;
                  }
                }}
                className="flex-1 p-4"
              />
              
              {/* File Search Overlay */}
              {showFileSearch && (
                <div className="absolute bottom-4 left-4 right-4 max-w-2xl">
                  <div
                    ref={fileSearchRef}
                    className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl overflow-hidden"
                  >
                    <div className="px-4 py-2 border-b border-gray-700 flex items-center space-x-2">
                      <Search className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-300">Search files: {fileSearchQuery}</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {fileSearchResults.length > 0 ? (
                        fileSearchResults.map((file, index) => (
                          <div
                            key={index}
                            className={`px-4 py-2 flex items-center space-x-2 cursor-pointer transition-colors ${
                              index === selectedFileIndex
                                ? 'bg-blue-600 text-white'
                                : 'hover:bg-gray-700 text-gray-300'
                            }`}
                            onClick={() => selectFile(file)}
                          >
                            <File className="w-4 h-4 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{file.name}</div>
                              <div className="text-xs opacity-75 truncate">{file.path}</div>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-8 text-center text-gray-500 text-sm">
                          {fileSearchQuery ? 'No files found' : 'Start typing to search files'}
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-2 border-t border-gray-700 text-xs text-gray-500">
                      Press <kbd className="px-1 py-0.5 bg-gray-700 rounded">Enter</kbd> to select,
                      <kbd className="px-1 py-0.5 bg-gray-700 rounded mx-1">Esc</kbd> to cancel
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-center">
            <div className="text-gray-400">
              <TerminalIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <h2 className="text-xl font-semibold mb-2">No Terminal Selected</h2>
              <p className="text-gray-500">Select a terminal from the sidebar or create a new one</p>
              <button
                onClick={createNewTerminal}
                className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                disabled={loading}
              >
                Create New Terminal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};