import React, { useState, useEffect } from 'react';
import { BarChart3, GitCommit, Clock, TrendingUp, Users, FileText, Activity, Calendar, Target, Zap, Award, Network, Database, RefreshCw, CheckCircle2, AlertCircle, Layers } from 'lucide-react';
import { dexyService } from '../../services/dexy-service-renderer';
import { kanbanService } from '../../services/kanban-service';

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

const metrics: Metric[] = [
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
    label: 'Code Reviews',
    value: 89,
    change: '+7',
    trend: 'up',
    icon: FileText
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

export const Dashboard: React.FC = () => {
  const [activeView, setActiveView] = useState<'overview' | 'timeline' | 'compare' | 'embeddings'>('overview');
  const [vectorStats, setVectorStats] = useState<VectorStats>({
    totalTasks: 0,
    vectorizedTasks: 0,
    missingVectors: 0,
    lastSync: null,
    isDexyReady: false
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);

  // Get current folder from Electron API
  useEffect(() => {
    const getCurrentFolder = async () => {
      try {
        const projectPath = await window.electronAPI.projectState.get('currentProjectPath');
        setCurrentFolder(projectPath);
      } catch (error) {
        console.error('Failed to get current folder:', error);
      }
    };
    getCurrentFolder();
  }, []);

  // Load vector statistics
  useEffect(() => {
    loadVectorStats();
  }, [currentFolder]);

  const loadVectorStats = async () => {
    if (!currentFolder) return;

    try {
      // Check if Dexy is ready
      const isReady = await dexyService.isReady();
      
      if (isReady) {
        // Get Dexy config
        const config = await dexyService.getConfig();
        
        // Get all tasks
        const tasks = await kanbanService.getTasks('main-board');
        const totalTasks = tasks.length;
        
        // Get vectorized task IDs
        const vectorizedIds = await dexyService.getVectorizedTaskIds();
        const vectorizedTasks = vectorizedIds.length;
        
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
      console.error('Failed to load vector stats:', error);
    }
  };

  const handleForceResync = async () => {
    if (!currentFolder || isSyncing) return;

    setIsSyncing(true);
    try {
      // Initialize Dexy if needed
      await dexyService.initialize(currentFolder);
      
      // Get all tasks and sync
      const tasks = await kanbanService.getTasks('main-board');
      await dexyService.syncTasks(tasks, 'main-board');
      
      // Reload stats
      await loadVectorStats();
    } catch (error) {
      console.error('Failed to resync:', error);
    } finally {
      setIsSyncing(false);
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
    <div className="flex-1 bg-gray-900 overflow-hidden flex flex-col">
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
              { id: 'embeddings', label: 'Embeddings', icon: Database }
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
      <div className="p-6 overflow-y-auto flex-1">
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

        {activeView === 'embeddings' && (
          <div className="space-y-6">
            {/* Vector Database Overview */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-white">Vector Database Overview</h3>
                <button
                  onClick={handleForceResync}
                  disabled={isSyncing || !currentFolder}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    isSyncing || !currentFolder
                      ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Syncing...' : 'Force Resync'}</span>
                </button>
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
              </div>

              {/* Vector Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <Layers className="w-5 h-5 text-blue-400" />
                    <span className="text-2xl font-bold text-white">{vectorStats.totalTasks}</span>
                  </div>
                  <div className="text-sm text-gray-400">Total Tasks</div>
                </div>

                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <Database className="w-5 h-5 text-green-400" />
                    <span className="text-2xl font-bold text-white">{vectorStats.vectorizedTasks}</span>
                  </div>
                  <div className="text-sm text-gray-400">Vectorized Tasks</div>
                  <div className="mt-2">
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${vectorStats.totalTasks > 0 ? (vectorStats.vectorizedTasks / vectorStats.totalTasks) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-center justify-between mb-2">
                    <AlertCircle className="w-5 h-5 text-yellow-400" />
                    <span className="text-2xl font-bold text-white">{vectorStats.missingVectors}</span>
                  </div>
                  <div className="text-sm text-gray-400">Missing Vectors</div>
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
                <div className="flex items-center justify-between p-4 bg-gray-700 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-blue-500/20 rounded">
                      <FileText className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-white font-medium">Kanban Tasks</div>
                      <div className="text-sm text-gray-400">Task titles, descriptions, and metadata</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-white">{vectorStats.vectorizedTasks}</div>
                    <div className="text-sm text-gray-400">vectors</div>
                  </div>
                </div>

                {/* Future: Code Files */}
                <div className="flex items-center justify-between p-4 bg-gray-700/50 rounded-lg opacity-50">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 bg-purple-500/20 rounded">
                      <FileText className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <div className="text-white font-medium">Code Files</div>
                      <div className="text-sm text-gray-400">Source code and documentation</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Coming Soon</div>
                  </div>
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

            {/* Performance Metrics */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-6">Embedding Performance</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-400 mb-2">
                    {vectorStats.totalTasks > 0 ? Math.round((vectorStats.vectorizedTasks / vectorStats.totalTasks) * 100) : 0}%
                  </div>
                  <div className="text-gray-400">Coverage Rate</div>
                  <div className="text-sm text-gray-500 mt-1">Tasks with vectors</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-blue-400 mb-2">~50ms</div>
                  <div className="text-gray-400">Avg. Search Time</div>
                  <div className="text-sm text-gray-500 mt-1">Semantic similarity search</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-purple-400 mb-2">1536D</div>
                  <div className="text-gray-400">Vector Dimension</div>
                  <div className="text-sm text-gray-500 mt-1">Embedding size</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};