import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, GitCommit, Clock, TrendingUp, Users, FileText, Activity, Calendar, Target, Zap, Award, Network, Database, RefreshCw, CheckCircle2, AlertCircle, Layers, Code, CheckCircle, Play, Pause, RotateCcw } from 'lucide-react';
import { CodeVectorizationProgress, PreScanResult, LineCountResult, DependencyGraph, DependencyStats } from '../types/electron';
import { dexyService } from '../../services/dexy-service-renderer';
import { kanbanService } from '../../services/kanban-service';
import { todoService, TodoStats } from '../../services/todo-service-renderer';
import { codeVectorizationOrchestrator } from '../../services/code-vectorization-orchestrator-renderer';
import Graph from 'react-graph-vis';

interface Metric {
  label: string;
  value: string | number;
  change: string;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ComponentType<any>;
}

interface TimelineEvent {
  id: string;
  type: 'commit' | 'review' | 'deploy' | 'agent-action';
  title: string;
  description: string;
  timestamp: Date;
  author: string;
  authorType: 'user' | 'agent';
  agentColor?: string;
}

const defaultMetrics: Metric[] = [
  {
    label: 'Lines of Code',
    value: '24,567',
    change: '+1,234',
    trend: 'up',
    icon: BarChart3
  },
  {
    label: 'Total Commits',
    value: 342,
    change: '+12',
    trend: 'up',
    icon: GitCommit
  },
  {
    label: 'Total Vectorized',
    value: '0%',
    change: '',
    trend: 'up',
    icon: Database
  },
  {
    label: 'Agent Actions',
    value: '1,456',
    change: '+89',
    trend: 'up',
    icon: Zap
  },
  {
    label: 'Files',
    value: 156,
    change: '+8',
    trend: 'up',
    icon: FileText
  },
  {
    label: 'Success Rate',
    value: '94.2%',
    change: '+2.1%',
    trend: 'up',
    icon: Target
  }
];

const timelineEvents: TimelineEvent[] = [
  {
    id: '1',
    type: 'agent-action',
    title: 'Team Leader orchestrated new feature',
    description: 'Added Frontend Dev and Backend Dev to implement chat system',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    author: 'Team Leader',
    authorType: 'agent',
    agentColor: 'blue'
  },
  {
    id: '2',
    type: 'review',
    title: 'Code review completed',
    description: 'Contrarian identified 2 issues, Chaos Monkey added stress tests',
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    author: 'Multi-Agent Review',
    authorType: 'agent'
  },
  {
    id: '3',
    type: 'commit',
    title: 'feat: Add agent coordination system',
    description: 'Implemented dynamic agent assignment and chat orchestration',
    timestamp: new Date(Date.now() - 30 * 60 * 1000),
    author: 'AutoCommit System',
    authorType: 'agent',
    agentColor: 'green'
  },
  {
    id: '4',
    type: 'agent-action',
    title: 'Chaos Monkey stress testing',
    description: 'Tested concurrent user scenarios and memory usage patterns',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    author: 'Chaos Monkey',
    authorType: 'agent',
    agentColor: 'orange'
  },
  {
    id: '5',
    type: 'commit',
    title: 'fix: Improve error handling in chat',
    description: 'Added fallback states and retry logic for agent communication',
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
    author: 'AutoCommit System',
    authorType: 'agent',
    agentColor: 'green'
  }
];

interface VectorStats {
  totalTasks: number;
  vectorizedTasks: number;
  missingVectors: number;
  lastSync: Date | null;
  isDexyReady: boolean;
  embeddingProvider?: string;
  embeddingModel?: string;
}

interface CodeVectorizationStats {
  initialized: boolean;
  isVectorizing: boolean;
  isWatching: boolean;
  progress: {
    filesProcessed: number;
    totalFiles: number;
    errors: number;
    currentFile: string | null;
    phase: string;
  };
  stats: {
    totalFiles: number;
    vectorizedFiles: number;
    totalElements: number;
    vectorizedElements: number;
    lastSync: Date | null;
    fileTypeDistribution: Record<string, number>;
    elementTypeDistribution: Record<string, number>;
  };
}

interface DashboardProps {
  currentFolder: string | null;
}

export const Dashboard: React.FC<DashboardProps> = ({ currentFolder }) => {
  const [activeView, setActiveView] = useState<'overview' | 'timeline' | 'compare' | 'todos' | 'embeddings' | 'dependencies'>('overview');
  const [vectorStats, setVectorStats] = useState<VectorStats>({
    totalTasks: 0,
    vectorizedTasks: 0,
    missingVectors: 0,
    lastSync: null,
    isDexyReady: false
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [todoStats, setTodoStats] = useState<TodoStats | null>(null);
  const [isScanningTodos, setIsScanningTodos] = useState(false);
  const [codeVectorStats, setCodeVectorStats] = useState<CodeVectorizationStats | null>(null);
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [codeVectorizationEnabled, setCodeVectorizationEnabled] = useState(true);
  const [vectorizationProgress, setVectorizationProgress] = useState<CodeVectorizationProgress | null>(null);
  const [preScanResult, setPreScanResult] = useState<PreScanResult | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>(defaultMetrics);
  const [lineCountResult, setLineCountResult] = useState<LineCountResult | null>(null);
  const [dependencyGraph, setDependencyGraph] = useState<DependencyGraph | null>(null);
  const [dependencyStats, setDependencyStats] = useState<DependencyStats | null>(null);
  const [isDependencyAnalyzing, setIsDependencyAnalyzing] = useState(false);
  const [graphData, setGraphData] = useState<{ nodes: any[], edges: any[] }>({ nodes: [], edges: [] });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Load config and auto-start code vectorization
  useEffect(() => {
    const loadConfigAndAutoStart = async () => {
      if (!currentFolder) return;
      
      try {
        // Load code vectorization enabled setting (default: true)
        const enabled = await window.electronAPI?.config?.get('codeVectorization', 'enabled') ?? true;
        setCodeVectorizationEnabled(enabled);
        
        // Auto-start code vectorization if enabled
        if (enabled) {
          console.log('[Dashboard] Auto-starting code vectorization...');
          try {
            await codeVectorizationOrchestrator.initialize(currentFolder);
            
            // Get concurrency setting from Dexy
            let concurrency = 4; // Default
            try {
              const dexyConfig = await window.electronAPI?.dexy?.getConfig();
              if (dexyConfig && dexyConfig.concurrency) {
                concurrency = dexyConfig.concurrency;
              }
            } catch (error) {
              console.log('[Dashboard] Could not get concurrency from Dexy, using default:', concurrency);
            }
            
            // Check if project has been vectorized before
            const status = await codeVectorizationOrchestrator.getStatus();
            console.log('[Dashboard] Current vectorization status:', status);
            
            if (!status.isInitialized || status.stats.vectorizedFiles === 0) {
              console.log('[Dashboard] Project not vectorized yet, starting initial full vectorization...');
              await codeVectorizationOrchestrator.vectorizeProject(undefined, concurrency);
              console.log('[Dashboard] Vectorization started, waiting for completion...');
            } else {
              console.log('[Dashboard] Project already vectorized, checking for changes since last run...');
              // Do an incremental update to catch files that changed while app was closed
              await codeVectorizationOrchestrator.vectorizeProject(undefined, concurrency);
              console.log('[Dashboard] Incremental update started...');
            }
            
            // Always start watching after vectorization/reindexing
            console.log('[Dashboard] Starting file watcher...');
            await codeVectorizationOrchestrator.startWatching();
          } catch (error) {
            console.error('[Dashboard] Failed to auto-start code vectorization:', error);
            console.error('[Dashboard] This usually means Dexy is not configured properly.');
            console.error('[Dashboard] Please check that Dexy agent has:');
            console.error('[Dashboard] 1. An AI provider configured (OpenAI, Anthropic, etc.)');
            console.error('[Dashboard] 2. Valid API keys for the provider');
            console.error('[Dashboard] 3. An embedding model selected (e.g., text-embedding-3-small)');
            console.error('[Dashboard] Dexy configuration is shared between task and code vectorization.');
          }
        }
      } catch (error) {
        console.error('[Dashboard] Failed to load code vectorization config:', error);
      }
    };

    loadConfigAndAutoStart();
  }, [currentFolder]);

  // Load vector statistics and TODO stats
  useEffect(() => {
    loadVectorStats();
    if (currentFolder) {
      loadTodoStats();
      loadCodeVectorStats();
      loadLineCount();
      
      // Set up code vectorization progress listener
      const unsubscribe = window.electronAPI?.codeVectorization?.onProgress?.((progress: CodeVectorizationProgress) => {
        console.log('[Dashboard] Vectorization progress:', progress);
        setVectorizationProgress(progress);
        
        // Update vectorizing state based on phase
        if (progress.phase === 'scanning' || progress.phase === 'processing') {
          setIsVectorizing(true);
          // Also update the pre-scan result if we have total elements
          if (progress.totalElements && progress.phase === 'processing') {
            setPreScanResult(prev => ({
              totalFiles: prev?.totalFiles || 0,
              totalElements: progress.totalElements || 0,
              fileTypes: prev?.fileTypes || {},
              elementTypes: prev?.elementTypes || {}
            }));
          }
        } else if (progress.phase === 'completed') {
          setIsVectorizing(false);
          setVectorizationProgress(null);
          // Reload stats after completion
          setTimeout(() => {
            loadCodeVectorStats();
          }, 1000);
        }
      });
      
      // Set up code vectorization event listeners for real-time updates
      const handlers = {
        onProgressUpdate: (progress: any) => {
          console.log('[Dashboard] Vectorization progress update:', progress);
          loadCodeVectorStats(); // Reload stats on progress
        },
        onVectorizationComplete: (data: any) => {
          console.log('[Dashboard] Vectorization complete:', data);
          console.log('[Dashboard] Files processed:', data.filesProcessed);
          console.log('[Dashboard] Elements vectorized:', data.elementsVectorized);
          // Add a small delay to ensure the index is updated
          setTimeout(() => {
            loadCodeVectorStats(); // Reload stats when complete
          }, 1000);
        },
        onFileProcessed: (data: any) => {
          console.log('[Dashboard] File processed:', data);
          if (!data.success && data.error) {
            console.error('[Dashboard] File processing error:', data.error);
          }
          // Update stats periodically (not on every file to avoid too many updates)
        }
      };
      
      codeVectorizationOrchestrator.registerEventHandlers(handlers);
      
      return () => {
        if (unsubscribe) unsubscribe();
        codeVectorizationOrchestrator.unregisterAllEventHandlers();
      };
    }
  }, [currentFolder]);

  // Reload stats when switching to embeddings or todos view
  useEffect(() => {
    if (activeView === 'embeddings' && currentFolder) {
      loadVectorStats();
      loadCodeVectorStats();
    } else if (activeView === 'todos' && currentFolder) {
      loadTodoStats();
    } else if (activeView === 'overview' && currentFolder) {
      loadLineCount();
    } else if (activeView === 'dependencies' && currentFolder) {
      initializeDependencyAnalysis();
    }
  }, [activeView, currentFolder]);

  // Listen for task updates to refresh vector stats
  useEffect(() => {
    const handleTaskUpdate = () => {
      if (activeView === 'embeddings' && currentFolder) {
        console.log('[Dashboard] Task update detected, refreshing vector stats');
        setTimeout(() => loadVectorStats(), 500); // Small delay to ensure sync completes
      }
    };

    // Listen for custom events from KanbanBoard
    window.addEventListener('task-updated', handleTaskUpdate);
    window.addEventListener('task-created', handleTaskUpdate);
    window.addEventListener('task-deleted', handleTaskUpdate);

    return () => {
      window.removeEventListener('task-updated', handleTaskUpdate);
      window.removeEventListener('task-created', handleTaskUpdate);
      window.removeEventListener('task-deleted', handleTaskUpdate);
    };
  }, [activeView, currentFolder]);

  // Calculate totals once and reuse everywhere
  const getTotalElements = () => {
    // Use pre-scan result if available (most accurate), otherwise fall back to code stats
    if (preScanResult) {
      return preScanResult.totalElements;
    }
    // Use vectorization progress if active
    if (vectorizationProgress && vectorizationProgress.totalElements) {
      return vectorizationProgress.totalElements;
    }
    if (codeVectorStats?.stats?.totalElements) {
      return codeVectorStats.stats.totalElements;
    }
    return 0;
  };

  // Get current vectorized elements count (including in-progress)
  const getVectorizedElements = () => {
    // If actively vectorizing, use the progress count
    if (vectorizationProgress && vectorizationProgress.elementsProcessed > 0) {
      return vectorizationProgress.elementsProcessed;
    }
    // Otherwise use the stats
    return Math.min(codeVectorStats?.stats?.vectorizedElements || 0, getTotalElements());
  };

  // Update metrics when stats change
  useEffect(() => {
    if (vectorStats || codeVectorStats || preScanResult || lineCountResult) {
      const newMetrics = [...defaultMetrics];
      
      // Update Lines of Code metric with real count
      if (lineCountResult) {
        newMetrics[0] = {
          ...newMetrics[0],
          value: lineCountResult.formattedTotal || lineCountResult.totalLines.toString(),
          change: `${lineCountResult.totalFiles} files`,
          trend: 'up'
        };
      }
      
      // Calculate total vectorization percentage
      // Tasks: each task is 1 item
      const totalTasks = vectorStats.totalTasks || 0;
      const vectorizedTasks = vectorStats.vectorizedTasks || 0;
      
      // Code elements: functions, classes, etc. - use single source of truth
      const totalCodeElements = getTotalElements();
      const vectorizedCodeElements = getVectorizedElements();
      
      // Combined totals
      const totalItems = totalTasks + totalCodeElements;
      const totalVectorized = vectorizedTasks + vectorizedCodeElements;
      
      if (totalItems > 0) {
        const percentage = Math.min(100, Math.round((totalVectorized / totalItems) * 100));
        newMetrics[2] = {
          ...newMetrics[2],
          value: `${percentage}%`,
          change: `${totalVectorized}/${totalItems}`,
          trend: percentage > 50 ? 'up' : 'down'
        };
      }
      
      setMetrics(newMetrics);
    }
  }, [vectorStats, codeVectorStats, preScanResult, lineCountResult]);

  const loadLineCount = async () => {
    if (!currentFolder) return;

    console.log('[Dashboard] Loading line count for folder:', currentFolder);

    try {
      const result = await window.electronAPI?.lineCounter?.count(currentFolder);
      if (result?.success && result.result) {
        setLineCountResult(result.result);
        console.log('[Dashboard] Line count loaded:', result.result);
      } else {
        console.error('[Dashboard] Failed to load line count:', result?.error);
      }
    } catch (error) {
      console.error('[Dashboard] Error loading line count:', error);
    }
  };

  const loadDependencyStats = async () => {
    if (!currentFolder) return;

    console.log('[Dashboard] Loading dependency stats for folder:', currentFolder);

    try {
      const stats = await window.electronAPI?.dependencyAnalysis?.getStats();
      if (stats) {
        setDependencyStats(stats);
        console.log('[Dashboard] Dependency stats loaded:', stats);
      }
    } catch (error) {
      console.error('[Dashboard] Error loading dependency stats:', error);
    }
  };

  const loadDependencyGraph = async () => {
    if (!currentFolder) return;

    console.log('[Dashboard] Loading dependency graph for folder:', currentFolder);

    try {
      const graph = await window.electronAPI?.dependencyAnalysis?.getGraph();
      if (graph) {
        setDependencyGraph(graph);
        console.log('[Dashboard] Dependency graph loaded:', graph);
        
        // Convert graph to react-graph-vis format
        const visNodes = graph.nodes.map((node) => ({
          id: node.id,
          label: node.name,
          title: `${node.name}\nLanguage: ${node.language}\nImports: ${node.imports.length}\nExports: ${node.exports.length}\nDependents: ${node.dependents.length}`,
          color: {
            background: getNodeColor(node.language),
            border: '#555555',
            highlight: {
              background: lightenColor(getNodeColor(node.language), 0.2),
              border: '#ffffff'
            }
          },
          font: {
            color: 'white',
            size: 12
          },
          shape: 'box',
          margin: 10,
          widthConstraint: {
            minimum: 100,
            maximum: 150
          }
        }));

        const visEdges = graph.edges.map((edge) => ({
          id: edge.id,
          from: edge.source,
          to: edge.target,
          arrows: 'to',
          color: {
            color: '#666666',
            highlight: '#ffffff',
            hover: '#999999'
          },
          width: 1,
          smooth: {
            type: 'continuous',
            roundness: 0.5
          }
        }));

        setGraphData({ nodes: visNodes, edges: visEdges });
      }
    } catch (error) {
      console.error('[Dashboard] Error loading dependency graph:', error);
    }
  };

  const initializeDependencyAnalysis = async () => {
    if (!currentFolder) return;

    console.log('[Dashboard] Initializing dependency analysis for folder:', currentFolder);

    try {
      const result = await window.electronAPI?.dependencyAnalysis?.initialize(currentFolder);
      if (result?.success) {
        console.log('[Dashboard] Dependency analysis initialized successfully');
        await loadDependencyStats();
        await loadDependencyGraph();
      } else {
        console.error('[Dashboard] Failed to initialize dependency analysis:', result?.error);
      }
    } catch (error) {
      console.error('[Dashboard] Error initializing dependency analysis:', error);
    }
  };

  const analyzeDependencies = async () => {
    if (!currentFolder || isDependencyAnalyzing) return;

    setIsDependencyAnalyzing(true);
    console.log('[Dashboard] Starting dependency analysis...');

    try {
      const result = await window.electronAPI?.dependencyAnalysis?.analyze();
      if (result?.success) {
        console.log('[Dashboard] Dependency analysis completed successfully');
        await loadDependencyStats();
        await loadDependencyGraph();
      } else {
        console.error('[Dashboard] Failed to analyze dependencies:', result?.error);
      }
    } catch (error) {
      console.error('[Dashboard] Error analyzing dependencies:', error);
    } finally {
      setIsDependencyAnalyzing(false);
    }
  };

  const getNodeColor = (language: string): string => {
    const colors: { [key: string]: string } = {
      typescript: '#3178c6',
      javascript: '#f7df1e',
      python: '#3776ab',
      java: '#ed8b00',
      go: '#00add8',
      rust: '#ce422b',
      cpp: '#00599c',
      c: '#a8b9cc',
      csharp: '#239120',
      ruby: '#cc342d',
      php: '#777bb4',
      swift: '#fa7343',
      kotlin: '#7f52ff',
      unknown: '#6b7280'
    };
    return colors[language] || colors.unknown;
  };

  const lightenColor = (color: string, percent: number): string => {
    const num = parseInt(color.replace("#", ""), 16);
    const amt = Math.round(2.55 * percent * 100);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 +
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 +
      (B < 255 ? B < 1 ? 0 : B : 255)).toString(16).slice(1);
  };

  const handleNodeClick = (event: any) => {
    if (event.nodes.length > 0) {
      const nodeId = event.nodes[0];
      setSelectedNode(nodeId);
      
      // Highlight connected nodes
      const connectedEdges = graphData.edges.filter(edge => 
        edge.from === nodeId || edge.to === nodeId
      );
      
      const connectedNodes = new Set<string>();
      connectedEdges.forEach(edge => {
        connectedNodes.add(edge.from);
        connectedNodes.add(edge.to);
      });

      // Update node colors to highlight connections
      const updatedNodes = graphData.nodes.map(node => ({
        ...node,
        color: {
          ...node.color,
          background: connectedNodes.has(node.id) 
            ? lightenColor(getNodeColor(getNodeLanguage(node.id)), 0.3)
            : node.color.background
        }
      }));

      const updatedEdges = graphData.edges.map(edge => ({
        ...edge,
        color: {
          ...edge.color,
          color: connectedEdges.some(ce => ce.id === edge.id) ? '#ffffff' : '#666666'
        },
        width: connectedEdges.some(ce => ce.id === edge.id) ? 2 : 1
      }));

      setGraphData({ nodes: updatedNodes, edges: updatedEdges });
    }
  };

  const getNodeLanguage = (nodeId: string): string => {
    const node = dependencyGraph?.nodes.find(n => n.id === nodeId);
    return node?.language || 'unknown';
  };

  const graphOptions = {
    layout: {
      hierarchical: {
        enabled: true,
        levelSeparation: 200,
        nodeSpacing: 150,
        treeSpacing: 200,
        blockShifting: true,
        edgeMinimization: true,
        parentCentralization: true,
        direction: 'LR',
        sortMethod: 'directed'
      }
    },
    physics: {
      enabled: true,
      hierarchicalRepulsion: {
        centralGravity: 0.3,
        springLength: 100,
        springConstant: 0.01,
        nodeDistance: 120,
        damping: 0.09
      },
      maxVelocity: 50,
      solver: 'hierarchicalRepulsion',
      timestep: 0.35,
      stabilization: {
        enabled: true,
        iterations: 1000,
        updateInterval: 25
      }
    },
    nodes: {
      shape: 'box',
      margin: 10,
      widthConstraint: {
        minimum: 100,
        maximum: 150
      },
      heightConstraint: {
        minimum: 30
      }
    },
    edges: {
      smooth: {
        type: 'continuous',
        roundness: 0.5
      },
      arrows: {
        to: {
          enabled: true,
          scaleFactor: 0.5
        }
      }
    },
    interaction: {
      hover: true,
      selectConnectedEdges: true,
      hoverConnectedEdges: true
    }
  };

  const graphEvents = {
    select: handleNodeClick
  };

  const loadVectorStats = async () => {
    if (!currentFolder) return;

    console.log('[Dashboard] Loading vector stats for folder:', currentFolder);

    try {
      // Initialize Dexy first if we have a project folder
      await dexyService.initialize(currentFolder);
      
      // Check if Dexy is ready
      const isReady = await dexyService.isReady();
      console.log('[Dashboard] Dexy ready:', isReady);
      
      if (isReady) {
        // Get Dexy config
        const config = await dexyService.getConfig();
        console.log('[Dashboard] Dexy config:', config);
        
        // Get all tasks
        const tasks = await kanbanService.getTasks('main-board');
        const totalTasks = tasks.length;
        console.log('[Dashboard] Total tasks:', totalTasks);
        
        // Get vectorized task IDs
        const vectorizedIds = await dexyService.getVectorizedTaskIds();
        const vectorizedTasks = vectorizedIds.length;
        console.log('[Dashboard] Vectorized task IDs:', vectorizedIds);
        console.log('[Dashboard] Vectorized count:', vectorizedTasks);
        
        setVectorStats({
          totalTasks,
          vectorizedTasks,
          missingVectors: totalTasks - vectorizedTasks,
          lastSync: new Date(),
          isDexyReady: true,
          embeddingProvider: config?.providerId,
          embeddingModel: config?.modelId
        });
      } else {
        // Dexy not ready, just show task count
        const tasks = await kanbanService.getTasks('main-board');
        setVectorStats({
          totalTasks: tasks.length,
          vectorizedTasks: 0,
          missingVectors: tasks.length,
          lastSync: null,
          isDexyReady: false
        });
      }
    } catch (error) {
      console.error('[Dashboard] Failed to load vector stats:', error);
    }
  };

  const handleForceResync = async () => {
    if (!currentFolder || isSyncing) return;

    console.log('[Dashboard] Starting force resync...');
    setIsSyncing(true);
    try {
      // Initialize Dexy if needed
      await dexyService.initialize(currentFolder);
      
      // Get all tasks and sync
      const tasks = await kanbanService.getTasks('main-board');
      console.log('[Dashboard] Found', tasks.length, 'tasks to sync');
      
      await dexyService.syncTasks(tasks, 'main-board');
      console.log('[Dashboard] Sync completed');
      
      // Reload stats
      await loadVectorStats();
    } catch (error) {
      console.error('[Dashboard] Failed to resync:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const loadTodoStats = async () => {
    if (!currentFolder) return;

    console.log('[Dashboard] Loading TODO stats for folder:', currentFolder);

    try {
      // Set project for TODO service
      todoService.setCurrentProject(currentFolder);
      
      const stats = await todoService.getStats();
      console.log('[Dashboard] TODO stats:', stats);
      
      setTodoStats(stats);
    } catch (error) {
      console.error('[Dashboard] Failed to load TODO stats:', error);
    }
  };

  const handleTodoScan = async () => {
    if (!currentFolder || isScanningTodos) return;

    console.log('[Dashboard] Starting TODO scan...');
    setIsScanningTodos(true);
    try {
      // Set project for TODO service
      todoService.setCurrentProject(currentFolder);
      
      const syncResult = await todoService.sync();
      console.log('[Dashboard] TODO sync completed:', syncResult);
      
      // Reload stats
      await loadTodoStats();
    } catch (error) {
      console.error('[Dashboard] Failed to scan TODOs:', error);
    } finally {
      setIsScanningTodos(false);
    }
  };

  const loadCodeVectorStats = async () => {
    if (!currentFolder) return;

    console.log('[Dashboard] Loading code vectorization stats for folder:', currentFolder);

    try {
      const status = await codeVectorizationOrchestrator.getStatus();
      console.log('[Dashboard] Raw code vectorization status from orchestrator:', JSON.stringify(status, null, 2));
      
      // Transform the status into our stats format
      const stats: CodeVectorizationStats = {
        initialized: status.isInitialized,
        isVectorizing: status.isVectorizing,
        isWatching: status.isWatching,
        progress: {
          filesProcessed: status.progress.filesProcessed,
          totalFiles: status.progress.totalFiles,
          errors: status.progress.errors,
          currentFile: status.progress.currentFile || null,
          phase: status.progress.phase
        },
        stats: {
          totalFiles: status.stats.totalFiles,
          vectorizedFiles: status.stats.vectorizedFiles,
          totalElements: status.stats.totalElements,
          vectorizedElements: status.stats.vectorizedElements,
          lastSync: status.stats.lastSync,
          fileTypeDistribution: {},
          elementTypeDistribution: {}
        }
      };

      console.log('[Dashboard] Transformed stats:', JSON.stringify(stats, null, 2));

      // Get detailed stats if initialized
      if (status.isInitialized) {
        try {
          console.log('[Dashboard] Getting detailed file type and element distribution...');
          // Get file type distribution
          const searchResults = await window.electronAPI.codeVectorization!.searchCode('', { limit: 1000 });
          console.log('[Dashboard] Search results for stats:', searchResults);
          console.log('[Dashboard] Search success:', searchResults.success);
          console.log('[Dashboard] Search results count:', searchResults.results?.length || 0);
          
          if (searchResults.success && searchResults.results) {
            const fileTypes: Record<string, number> = {};
            const elementTypes: Record<string, number> = {};
            
            searchResults.results.forEach((result: any) => {
              // Count file types
              const ext = result.document.metadata.filePath?.split('.').pop() || 'unknown';
              fileTypes[ext] = (fileTypes[ext] || 0) + 1;
              
              // Count element types
              const type = result.document.metadata.codeType || result.document.metadata.type || 'unknown';
              elementTypes[type] = (elementTypes[type] || 0) + 1;
            });
            
            console.log('[Dashboard] File type distribution:', fileTypes);
            console.log('[Dashboard] Element type distribution:', elementTypes);
            
            stats.stats.fileTypeDistribution = fileTypes;
            stats.stats.elementTypeDistribution = elementTypes;
          }
        } catch (error) {
          console.error('[Dashboard] Failed to get detailed stats:', error);
        }
      }
      
      setCodeVectorStats(stats);
      
      // If we don't have total elements in stats and no pre-scan result, do a pre-scan
      if (stats.initialized && (!stats.stats.totalElements || stats.stats.totalElements === 0) && !preScanResult && codeVectorizationEnabled) {
        try {
          console.log('[Dashboard] Running pre-scan to get total elements...');
          const scanResult = await window.electronAPI?.codeVectorization?.preScanProject();
          if (scanResult?.success && scanResult.result) {
            setPreScanResult(scanResult.result);
            console.log('[Dashboard] Pre-scan complete:', scanResult.result);
          }
        } catch (error) {
          console.error('[Dashboard] Pre-scan failed:', error);
        }
      }
    } catch (error) {
      console.error('[Dashboard] Failed to load code vectorization stats:', error);
      setCodeVectorStats(null);
    }
  };

  const handleStartVectorization = async () => {
    if (!currentFolder || isVectorizing) return;

    console.log('[Dashboard] Starting code vectorization...');
    setIsVectorizing(true);
    try {
      await codeVectorizationOrchestrator.initialize(currentFolder);
      
      // Check if this is a fresh start or if we need to reindex
      const status = await codeVectorizationOrchestrator.getStatus();
      if (!status.isInitialized || status.stats.vectorizedFiles === 0) {
        console.log('[Dashboard] Starting fresh vectorization...');
        
        // Get concurrency setting from Dexy
        let concurrency = 4; // Default
        try {
          const dexyConfig = await window.electronAPI?.dexy?.getConfig();
          if (dexyConfig && dexyConfig.concurrency) {
            concurrency = dexyConfig.concurrency;
          }
        } catch (error) {
          console.log('[Dashboard] Could not get concurrency from Dexy, using default:', concurrency);
        }
        
        await codeVectorizationOrchestrator.vectorizeProject(undefined, concurrency);
      } else {
        console.log('[Dashboard] Forcing complete reindex...');
        await codeVectorizationOrchestrator.forceReindex();
      }
      
      // Start watching for changes
      await codeVectorizationOrchestrator.startWatching();
      
      // Reload stats
      await loadCodeVectorStats();
    } catch (error) {
      console.error('[Dashboard] Failed to start vectorization:', error);
    } finally {
      setIsVectorizing(false);
    }
  };

  const handleStopVectorization = async () => {
    try {
      await codeVectorizationOrchestrator.stopWatching();
      await loadCodeVectorStats();
    } catch (error) {
      console.error('[Dashboard] Failed to stop vectorization:', error);
    }
  };

  const handleToggleCodeVectorization = async () => {
    try {
      const newEnabled = !codeVectorizationEnabled;
      await window.electronAPI?.config?.set('codeVectorization', 'enabled', newEnabled);
      setCodeVectorizationEnabled(newEnabled);
      
      if (newEnabled && currentFolder) {
        // Start vectorization
        await handleStartVectorization();
      } else if (!newEnabled) {
        // Stop vectorization
        await handleStopVectorization();
      }
    } catch (error) {
      console.error('[Dashboard] Failed to toggle code vectorization:', error);
    }
  };

  const handleForceRescan = async () => {
    if (!currentFolder || isVectorizing) return;

    console.log('[Dashboard] Starting force rescan...');
    setIsVectorizing(true);
    try {
      await codeVectorizationOrchestrator.initialize(currentFolder);
      console.log('[Dashboard] Forcing complete reindex of all files...');
      await codeVectorizationOrchestrator.forceReindex();
      
      // Start watching for changes
      await codeVectorizationOrchestrator.startWatching();
      
      // Reload stats
      await loadCodeVectorStats();
    } catch (error) {
      console.error('[Dashboard] Failed to force rescan:', error);
    } finally {
      setIsVectorizing(false);
    }
  };

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case 'up': return 'text-green-400';
      case 'down': return 'text-red-400';
      default: return 'text-gray-400';
    }
  };

  const getTrendIcon = (trend: string) => {
    return trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→';
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'commit': return <GitCommit className="w-4 h-4" />;
      case 'review': return <FileText className="w-4 h-4" />;
      case 'deploy': return <Activity className="w-4 h-4" />;
      case 'agent-action': return <Zap className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'commit': return 'bg-green-500';
      case 'review': return 'bg-blue-500';
      case 'deploy': return 'bg-purple-500';
      case 'agent-action': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="flex-1 bg-gray-900 flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-gray-700 bg-gray-800 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Code Analytics Dashboard</h1>
            <p className="text-gray-400 mt-1">Real-time insights into your AI-powered development</p>
          </div>
          
          {/* View Toggle */}
          <div className="flex items-center space-x-2 bg-gray-700 rounded-lg p-1">
            {[
              { id: 'overview', label: 'Overview', icon: BarChart3 },
              { id: 'timeline', label: 'Timeline', icon: Clock },
              { id: 'compare', label: 'Compare', icon: TrendingUp },
              { id: 'todos', label: 'TODOs', icon: Code },
              { id: 'embeddings', label: 'Embeddings', icon: Database },
              { id: 'dependencies', label: 'Dependencies', icon: Network }
            ].map((view) => (
              <button
                key={view.id}
                onClick={() => setActiveView(view.id as any)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  activeView === view.id
                    ? 'bg-blue-600 text-white shadow-lg'
                    : 'text-gray-300 hover:text-white hover:bg-gray-600'
                }`}
              >
                <view.icon className="w-4 h-4" />
                <span>{view.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
        {activeView === 'overview' && (
          <div className="space-y-6">
            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {metrics.map((metric) => (
                <div key={metric.label} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <metric.icon className="w-6 h-6 text-blue-400" />
                    <span className={`text-sm font-medium ${getTrendColor(metric.trend)}`}>
                      {getTrendIcon(metric.trend)} {metric.change}
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">{metric.value}</div>
                  <div className="text-sm text-gray-400">{metric.label}</div>
                </div>
              ))}
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Agent Activity Chart */}
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Agent Activity</h3>
                <div className="space-y-4">
                  {[
                    { name: 'Team Leader', actions: 127, color: 'blue' },
                    { name: 'Contrarian', actions: 89, color: 'red' },
                    { name: 'Chaos Monkey', actions: 56, color: 'orange' },
                    { name: 'Frontend Dev', actions: 34, color: 'purple' },
                    { name: 'Backend Dev', actions: 23, color: 'green' }
                  ].map((agent) => (
                    <div key={agent.name} className="flex items-center space-x-3">
                      <div className={`w-3 h-3 rounded-full bg-${agent.color}-500`}></div>
                      <span className="text-gray-300 flex-1">{agent.name}</span>
                      <div className="flex items-center space-x-3">
                        <div className="w-32 bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 bg-${agent.color}-500 rounded-full`}
                            style={{ width: `${(agent.actions / 127) * 100}%` }}
                          ></div>
                        </div>
                        <span className="text-white font-mono text-sm w-8">{agent.actions}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Commits */}
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Recent Commits</h3>
                <div className="space-y-3">
                  {[
                    { 
                      message: 'feat: Add agent orchestration', 
                      author: 'Team Leader',
                      time: '2 min ago',
                      additions: 45,
                      deletions: 12
                    },
                    { 
                      message: 'fix: Code review workflow', 
                      author: 'Contrarian',
                      time: '15 min ago',
                      additions: 23,
                      deletions: 8
                    },
                    { 
                      message: 'test: Chaos testing suite', 
                      author: 'Chaos Monkey',
                      time: '1 hour ago',
                      additions: 67,
                      deletions: 3
                    }
                  ].map((commit, index) => (
                    <div key={index} className="flex items-center space-x-3 p-3 bg-gray-700 rounded">
                      <GitCommit className="w-4 h-4 text-gray-400" />
                      <div className="flex-1">
                        <div className="text-white text-sm">{commit.message}</div>
                        <div className="text-gray-400 text-xs">by {commit.author} • {commit.time}</div>
                      </div>
                      <div className="flex items-center space-x-2 text-xs">
                        <span className="text-green-400">+{commit.additions}</span>
                        <span className="text-red-400">-{commit.deletions}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Performance Insights */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Performance Insights</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-400 mb-2">94.2%</div>
                  <div className="text-gray-400">Success Rate</div>
                  <div className="text-sm text-gray-500 mt-1">Code reviews auto-approved</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-400 mb-2">2.3s</div>
                  <div className="text-gray-400">Avg Response Time</div>
                  <div className="text-sm text-gray-500 mt-1">Agent coordination speed</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-400 mb-2">87%</div>
                  <div className="text-gray-400">Automation Rate</div>
                  <div className="text-sm text-gray-500 mt-1">Tasks handled by AI</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'timeline' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-6">Development Timeline</h3>
              
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-600"></div>
                
                <div className="space-y-6">
                  {timelineEvents.map((event) => (
                    <div key={event.id} className="relative flex items-start space-x-4">
                      {/* Timeline dot */}
                      <div className={`relative z-10 flex items-center justify-center w-12 h-12 rounded-full ${getEventColor(event.type)}`}>
                        {getEventIcon(event.type)}
                      </div>
                      
                      {/* Event content */}
                      <div className="flex-1 bg-gray-700 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-white font-medium">{event.title}</h4>
                          <span className="text-gray-400 text-sm">
                            {event.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm mb-2">{event.description}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            {event.agentColor && (
                              <div className={`w-3 h-3 rounded-full bg-${event.agentColor}-500`}></div>
                            )}
                            <span className="text-gray-400 text-xs">{event.author}</span>
                          </div>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            event.type === 'commit' ? 'bg-green-900 text-green-300' :
                            event.type === 'review' ? 'bg-blue-900 text-blue-300' :
                            event.type === 'agent-action' ? 'bg-orange-900 text-orange-300' :
                            'bg-gray-600 text-gray-300'
                          }`}>
                            {event.type.replace('-', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'compare' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-6">Performance Comparison</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Before/After Metrics */}
                <div className="space-y-4">
                  <h4 className="text-white font-medium">Before AI Agents</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Commits per day</span>
                      <span className="text-gray-400">3.2</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Code review time</span>
                      <span className="text-gray-400">2.5 hours</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Bug detection rate</span>
                      <span className="text-gray-400">67%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Feature completion</span>
                      <span className="text-gray-400">4.2 days</span>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <h4 className="text-white font-medium">With AI Agents</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Commits per day</span>
                      <span className="text-green-400">12.8 (+300%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Code review time</span>
                      <span className="text-green-400">12 minutes (-92%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Bug detection rate</span>
                      <span className="text-green-400">94% (+27%)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-300">Feature completion</span>
                      <span className="text-green-400">1.3 days (-69%)</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Impact Summary */}
              <div className="mt-8 pt-6 border-t border-gray-700">
                <h4 className="text-white font-medium mb-4">Impact Summary</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-green-900/20 rounded-lg border border-green-500/30">
                    <Award className="w-8 h-8 text-green-400 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-green-400">400%</div>
                    <div className="text-sm text-gray-300">Productivity Increase</div>
                  </div>
                  <div className="text-center p-4 bg-blue-900/20 rounded-lg border border-blue-500/30">
                    <Target className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-blue-400">94%</div>
                    <div className="text-sm text-gray-300">Quality Score</div>
                  </div>
                  <div className="text-center p-4 bg-purple-900/20 rounded-lg border border-purple-500/30">
                    <Zap className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                    <div className="text-2xl font-bold text-purple-400">87%</div>
                    <div className="text-sm text-gray-300">Task Automation</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeView === 'todos' && (
          <div className="space-y-6">
            {!currentFolder ? (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="text-center py-8">
                  <Code className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">No Project Loaded</h3>
                  <p className="text-gray-400">Please open a project folder to view TODO analytics</p>
                </div>
              </div>
            ) : (
              <>
                {/* TODO Overview */}
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-semibold text-white">TODO Analytics</h3>
                    <button
                      onClick={handleTodoScan}
                      disabled={isScanningTodos || !currentFolder}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                        isScanningTodos || !currentFolder
                          ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                      }`}
                    >
                      <RefreshCw className={`w-4 h-4 ${isScanningTodos ? 'animate-spin' : ''}`} />
                      <span>{isScanningTodos ? 'Scanning...' : 'Scan Now'}</span>
                    </button>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <Code className="w-5 h-5 text-blue-400" />
                        <span className="text-2xl font-bold text-white">{todoStats?.total || 0}</span>
                      </div>
                      <div className="text-sm text-gray-400">Total TODOs</div>
                      <div className="text-xs text-green-400 mt-1">
                        {todoStats?.scannedFiles || 0} files scanned
                      </div>
                    </div>

                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="text-2xl font-bold text-white">{todoStats?.validMappings || 0}</span>
                      </div>
                      <div className="text-sm text-gray-400">Tasks Created</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {todoStats?.invalidMappings || 0} invalid mappings
                      </div>
                    </div>

                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <AlertCircle className="w-5 h-5 text-yellow-400" />
                        <span className="text-2xl font-bold text-white">
                          {todoStats?.total ? todoStats.total - (todoStats.validMappings || 0) : 0}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400">Unmapped TODOs</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Need task creation
                      </div>
                    </div>

                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-center justify-between mb-2">
                        <Users className="w-5 h-5 text-purple-400" />
                        <span className="text-2xl font-bold text-white">Cortex</span>
                      </div>
                      <div className="text-sm text-gray-400">Default Assignee</div>
                      <div className="text-xs text-purple-400 mt-1">
                        AI Agent
                      </div>
                    </div>
                  </div>

                  {/* TODO Types Distribution */}
                  {todoStats && Object.keys(todoStats.byType).length > 0 && (
                    <div className="mb-6">
                      <h4 className="text-white font-medium mb-4">TODO Types Distribution</h4>
                      <div className="space-y-3">
                        {Object.entries(todoStats.byType).map(([type, count]) => {
                          const total = todoStats.total;
                          const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                          
                          return (
                            <div key={type} className="flex items-center space-x-3">
                              <span className="text-gray-300 w-16">{type}</span>
                              <div className="flex-1 flex items-center space-x-3">
                                <div className="flex-1 bg-gray-700 rounded-full h-2">
                                  <div 
                                    className={`h-2 rounded-full ${
                                      type === 'TODO' ? 'bg-blue-500' :
                                      type === 'FIXME' ? 'bg-red-500' :
                                      type === 'HACK' ? 'bg-yellow-500' :
                                      type === 'NOTE' ? 'bg-green-500' :
                                      type === 'BUG' ? 'bg-purple-500' :
                                      'bg-gray-500'
                                    }`}
                                    style={{ width: `${percentage}%` }}
                                  ></div>
                                </div>
                                <span className="text-white font-mono text-sm w-12">{count}</span>
                                <span className="text-gray-400 text-xs w-10">{percentage}%</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Priority Distribution */}
                  {todoStats && Object.keys(todoStats.byPriority).length > 0 && (
                    <div>
                      <h4 className="text-white font-medium mb-4">Priority Distribution</h4>
                      <div className="grid grid-cols-3 gap-4">
                        {Object.entries(todoStats.byPriority).map(([priority, count]) => {
                          const total = Object.values(todoStats.byPriority).reduce((sum, c) => sum + c, 0);
                          const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                          
                          return (
                            <div key={priority} className="text-center bg-gray-900 rounded-lg p-4 border border-gray-700">
                              <div className={`text-2xl font-bold mb-2 ${
                                priority === 'high' ? 'text-red-400' :
                                priority === 'medium' ? 'text-yellow-400' :
                                'text-green-400'
                              }`}>
                                {count}
                              </div>
                              <div className="text-gray-400 capitalize">{priority}</div>
                              <div className="text-sm text-gray-500 mt-1">{percentage}%</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* File Extensions */}
                {todoStats && Object.keys(todoStats.byFileExtension).length > 0 && (
                  <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                    <h3 className="text-lg font-semibold text-white mb-4">TODOs by File Type</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {Object.entries(todoStats.byFileExtension)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 8)
                        .map(([ext, count]) => (
                          <div key={ext} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                            <div className="flex items-center justify-between">
                              <span className="text-gray-300 font-mono">{ext || 'No ext'}</span>
                              <span className="text-white font-bold">{count}</span>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeView === 'embeddings' && (
          <div className="space-y-6">
            {!currentFolder ? (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="text-center py-8">
                  <Database className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">No Project Loaded</h3>
                  <p className="text-gray-400">Please open a project folder to view embedding statistics</p>
                </div>
              </div>
            ) : (
            <>
            {/* Vector Database Overview */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Vector Database Overview</h3>
              </div>

              {/* Status Indicator */}
              <div className="mb-6">
                <div className="flex items-center space-x-3">
                  {vectorStats.isDexyReady ? (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-green-400" />
                      <span className="text-green-400">Dexy Service Active</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <span className="text-red-400">Dexy Service Not Configured</span>
                    </>
                  )}
                </div>
                {vectorStats.isDexyReady && vectorStats.embeddingProvider && (
                  <div className="mt-2 text-sm text-gray-400">
                    Using {vectorStats.embeddingProvider} / {vectorStats.embeddingModel}
                  </div>
                )}
                {!vectorStats.isDexyReady && (
                  <div className="mt-2 text-sm text-gray-400">
                    Please configure Dexy in the AI Agents settings panel
                  </div>
                )}
              </div>

              {/* Vector Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <Layers className="w-5 h-5 text-blue-400" />
                    <span className="text-2xl font-bold text-white">
                      {(vectorStats.totalTasks || 0) + getTotalElements()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">Total Elements</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {vectorStats.totalTasks || 0} tasks, {getTotalElements()} code
                  </div>
                </div>

                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <Database className="w-5 h-5 text-green-400" />
                    <span className="text-2xl font-bold text-white">
                      {(vectorStats.vectorizedTasks || 0) + getVectorizedElements()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">Vectorized Elements</div>
                  <div className="mt-2">
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ 
                          width: `${
                            ((vectorStats.totalTasks || 0) + getTotalElements()) > 0 
                              ? (((vectorStats.vectorizedTasks || 0) + getVectorizedElements()) / 
                                 ((vectorStats.totalTasks || 0) + getTotalElements())) * 100 
                              : 0
                          }%` 
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <AlertCircle className="w-5 h-5 text-yellow-400" />
                    <span className="text-2xl font-bold text-white">
                      {((vectorStats.totalTasks || 0) - (vectorStats.vectorizedTasks || 0)) + 
                       (getTotalElements() - getVectorizedElements())}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">Missing Vectors</div>
                </div>
              </div>

              {/* Database Performance */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-400">Avg. Search Time</div>
                      <div className="text-lg font-semibold text-blue-400">~50ms</div>
                    </div>
                    <Activity className="w-5 h-5 text-blue-400" />
                  </div>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-400">Vector Dimensions</div>
                      <div className="text-lg font-semibold text-purple-400">1536D</div>
                    </div>
                    <Network className="w-5 h-5 text-purple-400" />
                  </div>
                </div>
              </div>

              {/* Last Sync Info */}
              {vectorStats.lastSync && (
                <div className="text-sm text-gray-400">
                  Last synchronized: {vectorStats.lastSync.toLocaleString()}
                </div>
              )}
            </div>

            {/* Vector Sources */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-6">Vector Sources</h3>
              
              <div className="space-y-4">
                {/* Kanban Tasks */}
                <div className={`p-4 rounded-lg ${
                  vectorStats.isDexyReady ? 'bg-gray-700' : 'bg-gray-700/50'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-blue-500/20 rounded">
                        <FileText className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <div className="text-white font-medium">Kanban Tasks</div>
                        <div className="text-sm text-gray-400">Task titles, descriptions, and metadata</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {vectorStats.isDexyReady && (
                        <button
                          onClick={handleForceResync}
                          disabled={isSyncing}
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            isSyncing
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {isSyncing ? 'Syncing...' : 'Sync Tasks'}
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Status and Stats */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {vectorStats.isDexyReady ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="text-sm text-green-400">Active</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-red-400" />
                          <span className="text-sm text-red-400">Dexy Not Configured</span>
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-white">
                        {vectorStats.totalTasks > 0 ? Math.round((vectorStats.vectorizedTasks / vectorStats.totalTasks) * 100) : 0}%
                      </div>
                      <div className="text-sm text-gray-400">
                        {vectorStats.vectorizedTasks} / {vectorStats.totalTasks}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Code Files */}
                <div className={`p-4 rounded-lg ${
                  codeVectorStats?.initialized ? 'bg-gray-700' : 'bg-gray-700/50'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-purple-500/20 rounded">
                        <Code className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <div className="text-white font-medium">Code Files</div>
                        <div className="text-sm text-gray-400">Source code and documentation</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={handleToggleCodeVectorization}
                        className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                          codeVectorizationEnabled
                            ? 'bg-purple-600 hover:bg-purple-700 text-white'
                            : 'bg-gray-600 hover:bg-gray-500 text-gray-300'
                        }`}
                      >
                        {codeVectorizationEnabled ? 'Enabled' : 'Disabled'}
                      </button>
                      {codeVectorStats?.initialized && (
                        <button
                          onClick={handleForceRescan}
                          disabled={isVectorizing}
                          className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                            isVectorizing
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                        >
                          {isVectorizing ? 'Scanning...' : 'Force Rescan'}
                        </button>
                      )}
                      {codeVectorStats?.initialized && codeVectorStats.isWatching && (
                        <button
                          onClick={handleStopVectorization}
                          className="px-3 py-1 rounded text-xs font-medium bg-red-600 hover:bg-red-700 text-white"
                        >
                          Stop Watching
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Status and Stats */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {codeVectorStats?.initialized ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="text-sm text-green-400">Active</span>
                          {codeVectorStats.isWatching && (
                            <span className="text-xs text-gray-400">(Monitoring changes)</span>
                          )}
                          {codeVectorStats.isVectorizing && (
                            <span className="text-xs text-blue-400">(Processing...)</span>
                          )}
                        </>
                      ) : codeVectorizationEnabled ? (
                        codeVectorStats && !codeVectorStats.initialized ? (
                          <>
                            <AlertCircle className="w-4 h-4 text-red-400" />
                            <span className="text-sm text-red-400">Dexy Not Configured</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className={`w-4 h-4 text-blue-400 ${isVectorizing ? 'animate-spin' : ''}`} />
                            <span className="text-sm text-blue-400">{isVectorizing ? 'Initializing...' : 'Starting...'}</span>
                          </>
                        )
                      ) : (
                        <>
                          <AlertCircle className="w-4 h-4 text-yellow-400" />
                          <span className="text-sm text-yellow-400">Disabled</span>
                        </>
                      )}
                    </div>
                    <div className="text-right">
                      {codeVectorStats?.initialized ? (
                        <>
                          <div className="text-lg font-semibold text-white">
                            {getTotalElements() > 0 
                              ? Math.round((getVectorizedElements() / getTotalElements()) * 100) 
                              : 0}%
                          </div>
                          <div className="text-sm text-gray-400">
                            {getVectorizedElements()} / {getTotalElements()} elements
                          </div>
                        </>
                      ) : codeVectorizationEnabled ? (
                        codeVectorStats && !codeVectorStats.initialized ? (
                          <div className="text-right">
                            <div className="text-sm text-red-400">Dexy Required</div>
                            <div className="text-xs text-gray-500">Configure Dexy agent</div>
                          </div>
                        ) : (
                          <button
                            onClick={handleStartVectorization}
                            disabled={isVectorizing}
                            className={`px-3 py-1 rounded text-sm font-medium transition-all ${
                              isVectorizing
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-700 text-white'
                            }`}
                          >
                            {isVectorizing ? 'Initializing...' : 'Initialize Now'}
                          </button>
                        )
                      ) : (
                        <div className="text-sm text-gray-500">Not active</div>
                      )}
                    </div>
                  </div>
                  
                  {/* Configuration Notice */}
                  {codeVectorizationEnabled && codeVectorStats && !codeVectorStats.initialized && (
                    <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-500/30 rounded">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <div className="text-sm">
                          <div className="text-yellow-400 font-medium">Code vectorization requires Dexy configuration</div>
                          <div className="text-gray-400 mt-1">
                            Configure Dexy agent with an embedding provider and model in the AI Agents settings. 
                            Dexy handles all vectorization for both tasks and code.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Progress Bar */}
                  {vectorizationProgress && (vectorizationProgress.phase === 'scanning' || vectorizationProgress.phase === 'processing') && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">
                          {vectorizationProgress.phase === 'scanning' ? 'Scanning files...' : 'Processing files...'}
                        </span>
                        <span className="text-xs text-white">
                          {vectorizationProgress.current} / {vectorizationProgress.total}
                        </span>
                      </div>
                      <div className="w-full bg-gray-600 rounded-full h-2">
                        <div
                          className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${vectorizationProgress.percentage}%` }}
                        />
                      </div>
                      {vectorizationProgress.currentFile && (
                        <div className="mt-1 text-xs text-gray-500 truncate">
                          {vectorizationProgress.currentFile}
                        </div>
                      )}
                      {vectorizationProgress.elementsProcessed > 0 && (
                        <div className="mt-1 text-xs text-gray-400">
                          {vectorizationProgress.elementsProcessed} elements vectorized
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Future: Git Commits */}
                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg opacity-50">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-green-500/20 rounded">
                      <GitCommit className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="text-white font-medium">Git Commits</div>
                      <div className="text-sm text-gray-400">Commit messages and diffs</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Coming Soon</div>
                  </div>
                </div>

                {/* Future: Chat History */}
                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg opacity-50">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-orange-500/20 rounded">
                      <Users className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <div className="text-white font-medium">Chat History</div>
                      <div className="text-sm text-gray-400">Agent conversations and decisions</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Coming Soon</div>
                  </div>
                </div>
              </div>
            </div>


            {/* Code File Type Distribution */}
            {codeVectorStats && Object.keys(codeVectorStats.stats.fileTypeDistribution).length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Code File Types</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(codeVectorStats.stats.fileTypeDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 8)
                    .map(([ext, count]) => (
                      <div key={ext} className="bg-gray-900 rounded-lg p-3 border border-gray-700">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-300 font-mono">.{ext}</span>
                          <span className="text-white font-bold">{count}</span>
                        </div>
                        <div className="mt-2">
                          <div className="w-full bg-gray-700 rounded-full h-1">
                            <div
                              className="bg-purple-500 h-1 rounded-full"
                              style={{ 
                                width: `${Math.min(100, (count / Math.max(...Object.values(codeVectorStats.stats.fileTypeDistribution))) * 100)}%` 
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Code Element Type Distribution */}
            {codeVectorStats && Object.keys(codeVectorStats.stats.elementTypeDistribution).length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Code Element Types</h3>
                <div className="space-y-3">
                  {Object.entries(codeVectorStats.stats.elementTypeDistribution)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 10)
                    .map(([type, count]) => {
                      const total = Object.values(codeVectorStats.stats.elementTypeDistribution).reduce((a, b) => a + b, 0);
                      const percentage = Math.round((count / total) * 100);
                      
                      return (
                        <div key={type} className="flex items-center space-x-3">
                          <span className="text-gray-300 w-24 capitalize">{type}</span>
                          <div className="flex-1 flex items-center space-x-3">
                            <div className="flex-1 bg-gray-700 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full ${
                                  type === 'function' ? 'bg-blue-500' :
                                  type === 'class' ? 'bg-purple-500' :
                                  type === 'method' ? 'bg-green-500' :
                                  type === 'interface' ? 'bg-yellow-500' :
                                  type === 'variable' ? 'bg-orange-500' :
                                  'bg-gray-500'
                                }`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                            <span className="text-white font-mono text-sm w-12">{count}</span>
                            <span className="text-gray-400 text-xs w-10">{percentage}%</span>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Code Search Performance */}
            {codeVectorStats?.initialized && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-6">Code Search Performance</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-400 mb-2">
                      {getTotalElements() > 0 
                        ? Math.round((getVectorizedElements() / getTotalElements()) * 100) 
                        : 0}%
                    </div>
                    <div className="text-gray-400">Element Coverage</div>
                    <div className="text-sm text-gray-500 mt-1">Elements with vectors</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-400 mb-2">
                      {getVectorizedElements()} / {getTotalElements()}
                    </div>
                    <div className="text-gray-400">Code Elements</div>
                    <div className="text-sm text-gray-500 mt-1">Functions, classes, etc.</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-400 mb-2">~25ms</div>
                    <div className="text-gray-400">Avg. Search Time</div>
                    <div className="text-sm text-gray-500 mt-1">Semantic code search</div>
                  </div>
                  <div className="text-center">
                    <div className="text-3xl font-bold text-orange-400 mb-2">1536D</div>
                    <div className="text-gray-400">Vector Dimension</div>
                    <div className="text-sm text-gray-500 mt-1">OpenAI embeddings</div>
                  </div>
                </div>
                
                {/* Last Sync Info */}
                {codeVectorStats.stats.lastSync && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <div className="text-sm text-gray-400">
                      Last synchronized: {new Date(codeVectorStats.stats.lastSync).toLocaleString()}
                    </div>
                  </div>
                )}
              </div>
            )}
            </>
            )}
          </div>
        )}

        {activeView === 'dependencies' && (
          <div className="space-y-6">
            {!currentFolder ? (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <div className="text-center py-8">
                  <Network className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">No Project Loaded</h3>
                  <p className="text-gray-400">Please open a project folder to view dependency graph</p>
                </div>
              </div>
            ) : (
            <>
            {/* Dependency Analysis Overview */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Dependency Analysis</h3>
                <button
                  onClick={analyzeDependencies}
                  disabled={isDependencyAnalyzing}
                  className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                >
                  {isDependencyAnalyzing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Analyze Dependencies</span>
                    </>
                  )}
                </button>
              </div>

              {dependencyStats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="bg-gray-700 rounded-lg p-4">
                    <div className="text-2xl font-bold text-white">{dependencyStats.totalFiles}</div>
                    <div className="text-sm text-gray-400">Total Files</div>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <div className="text-2xl font-bold text-white">{dependencyStats.totalDependencies}</div>
                    <div className="text-sm text-gray-400">Dependencies</div>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <div className="text-2xl font-bold text-white">{dependencyStats.circularDependencies.length}</div>
                    <div className="text-sm text-gray-400">Circular Dependencies</div>
                  </div>
                  <div className="bg-gray-700 rounded-lg p-4">
                    <div className="text-2xl font-bold text-white">
                      {dependencyStats.mostDependedOn.length > 0 ? dependencyStats.mostDependedOn[0].count : 0}
                    </div>
                    <div className="text-sm text-gray-400">Max Dependencies</div>
                  </div>
                </div>
              )}
            </div>

            {/* Dependency Graph Visualization */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Dependency Graph</h3>
                <div className="flex items-center space-x-4">
                  {selectedNode && (
                    <div className="flex items-center space-x-2">
                      <div className="text-sm text-blue-400">
                        Selected: {selectedNode.split('/').pop()}
                      </div>
                      <button
                        onClick={() => {
                          setSelectedNode(null);
                          loadDependencyGraph(); // Reset graph colors
                        }}
                        className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded bg-gray-700 hover:bg-gray-600"
                      >
                        Clear
                      </button>
                    </div>
                  )}
                  <div className="text-sm text-gray-400">
                    {dependencyGraph ? `${dependencyGraph.nodes.length} files` : 'No graph data'}
                  </div>
                </div>
              </div>

              {/* Language Legend */}
              {dependencyGraph && graphData.nodes.length > 0 && (
                <div className="mb-4 p-3 bg-gray-700 rounded-lg">
                  <div className="text-sm text-gray-300 mb-2">Language Colors:</div>
                  <div className="flex flex-wrap gap-3">
                    {Object.entries({
                      typescript: '#3178c6',
                      javascript: '#f7df1e',
                      python: '#3776ab',
                      java: '#ed8b00',
                      go: '#00add8',
                      rust: '#ce422b'
                    }).map(([lang, color]) => (
                      <div key={lang} className="flex items-center space-x-2">
                        <div 
                          className="w-3 h-3 rounded-sm" 
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs text-gray-300 capitalize">{lang}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dependencyGraph && graphData.nodes.length > 0 ? (
                <div className="h-[600px] bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
                  <style>{`
                    .vis-network {
                      background-color: #111827 !important;
                    }
                    .vis-navigation {
                      background-color: #374151 !important;
                    }
                    .vis-button {
                      background-color: #4b5563 !important;
                      color: white !important;
                    }
                    .vis-button:hover {
                      background-color: #6b7280 !important;
                    }
                  `}</style>
                  <Graph
                    graph={graphData}
                    options={graphOptions}
                    events={graphEvents}
                    style={{ height: '100%', width: '100%' }}
                    getNetwork={(network: any) => {
                      // Store network reference for potential future use
                      (window as any).dependencyNetwork = network;
                    }}
                  />
                </div>
              ) : (
                <div className="h-[600px] bg-gray-900 rounded-lg border border-gray-700 flex items-center justify-center">
                  <div className="text-center">
                    <Network className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                    <p className="text-gray-400">No dependency graph available</p>
                    <p className="text-sm text-gray-500 mt-2">Click "Analyze Dependencies" to generate the graph</p>
                  </div>
                </div>
              )}
            </div>

            {/* Top Dependencies */}
            {dependencyStats && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-4">Most Dependent Files</h3>
                  <div className="space-y-3">
                    {dependencyStats.mostDependent.slice(0, 10).map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="text-sm text-gray-300 truncate">{item.file}</div>
                        <div className="text-sm text-gray-400">{item.count} imports</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <h3 className="text-lg font-semibold text-white mb-4">Most Depended On Files</h3>
                  <div className="space-y-3">
                    {dependencyStats.mostDependedOn.slice(0, 10).map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="text-sm text-gray-300 truncate">{item.file}</div>
                        <div className="text-sm text-gray-400">{item.count} dependents</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Circular Dependencies */}
            {dependencyStats && dependencyStats.circularDependencies.length > 0 && (
              <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                <h3 className="text-lg font-semibold text-white mb-4">Circular Dependencies</h3>
                <div className="space-y-3">
                  {dependencyStats.circularDependencies.map((cycle, index) => (
                    <div key={index} className="bg-red-900/20 border border-red-700/50 rounded-lg p-4">
                      <div className="text-sm text-red-300">
                        {cycle.map((file, i) => (
                          <span key={i}>
                            {file.split('/').pop()}
                            {i < cycle.length - 1 && ' → '}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
            )}
          </div>
        )}

        </div>
      </div>
    </div>
  );
};