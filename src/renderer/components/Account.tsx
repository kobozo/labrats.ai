import React from 'react';
import { User, Crown, Zap, Award, BarChart3, Clock, Calendar } from 'lucide-react';

export const Account: React.FC = () => {
  const stats = [
    { label: 'AI Conversations', value: '247', icon: Zap, change: '+23 this week' },
    { label: 'Code Reviews', value: '89', icon: Award, change: '+12 this week' },
    { label: 'Agent Actions', value: '1,456', icon: BarChart3, change: '+134 today' },
    { label: 'Time Saved', value: '68 hrs', icon: Clock, change: '+8 hrs this week' }
  ];

  const recentActivity = [
    {
      id: '1',
      action: 'Started chat session with Team Leader',
      timestamp: '2 minutes ago',
      type: 'chat'
    },
    {
      id: '2',
      action: 'Approved code review for Chat.tsx',
      timestamp: '15 minutes ago',
      type: 'review'
    },
    {
      id: '3',
      action: 'Frontend Dev joined project workspace',
      timestamp: '1 hour ago',
      type: 'agent'
    },
    {
      id: '4',
      action: 'Committed changes to main branch',
      timestamp: '2 hours ago',
      type: 'commit'
    },
    {
      id: '5',
      action: 'Chaos Monkey completed stress tests',
      timestamp: '3 hours ago',
      type: 'test'
    }
  ];

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'chat': return '💬';
      case 'review': return '✅';
      case 'agent': return '🤖';
      case 'commit': return '📝';
      case 'test': return '🧪';
      default: return '📋';
    }
  };

  return (
    <div className="flex-1 bg-gray-900 p-6 overflow-y-auto">
      <div className="max-w-6xl">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-6">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center">
                <User className="w-10 h-10 text-white" />
              </div>
              <Crown className="w-6 h-6 text-yellow-400 absolute -top-1 -right-1" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">Developer Pro</h1>
              <p className="text-gray-400">Premium AI-First Development Plan</p>
              <div className="flex items-center space-x-4 mt-2">
                <span className="text-sm text-green-400">● Active</span>
                <span className="text-sm text-gray-400">Member since Nov 2024</span>
                <span className="text-sm text-gray-400">labrats@kobozo.com</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-white">Level 15</div>
              <div className="text-sm text-gray-400">Expert Developer</div>
              <div className="w-32 bg-gray-700 rounded-full h-2 mt-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: '75%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-4">
              {stats.map((stat, index) => (
                <div key={index} className="bg-gray-800 rounded-lg p-6 border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <stat.icon className="w-6 h-6 text-blue-400" />
                    <span className="text-sm text-green-400">{stat.change}</span>
                  </div>
                  <div className="text-2xl font-bold text-white mb-1">{stat.value}</div>
                  <div className="text-sm text-gray-400">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* AI Agents Summary */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Your AI Team</h3>
              <div className="space-y-3">
                {[
                  { name: 'Team Leader', interactions: 127, efficiency: 98, color: 'blue' },
                  { name: 'Contrarian', interactions: 89, efficiency: 95, color: 'red' },
                  { name: 'Chaos Monkey', interactions: 56, efficiency: 92, color: 'orange' },
                  { name: 'Frontend Dev', interactions: 34, efficiency: 97, color: 'purple' },
                  { name: 'Backend Dev', interactions: 23, efficiency: 94, color: 'green' }
                ].map((agent, index) => (
                  <div key={index} className="flex items-center space-x-4 p-3 bg-gray-700 rounded">
                    <div className={`w-3 h-3 rounded-full bg-${agent.color}-500`}></div>
                    <span className="text-white flex-1">{agent.name}</span>
                    <div className="text-sm text-gray-400">
                      {agent.interactions} interactions
                    </div>
                    <div className="text-sm text-green-400">
                      {agent.efficiency}% efficiency
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Achievements */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Achievements</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { title: 'AI Collaborator', description: '100+ agent interactions', icon: '🤝', earned: true },
                  { title: 'Code Reviewer', description: '50+ reviews completed', icon: '👁️', earned: true },
                  { title: 'Automation Master', description: '80% automation rate', icon: '⚡', earned: true },
                  { title: 'Quality Guardian', description: '95%+ success rate', icon: '🛡️', earned: false }
                ].map((achievement, index) => (
                  <div key={index} className={`p-4 rounded-lg border ${
                    achievement.earned 
                      ? 'bg-green-900/20 border-green-500/30' 
                      : 'bg-gray-700 border-gray-600'
                  }`}>
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{achievement.icon}</span>
                      <div>
                        <div className={`font-medium ${
                          achievement.earned ? 'text-green-400' : 'text-gray-400'
                        }`}>
                          {achievement.title}
                        </div>
                        <div className="text-sm text-gray-400">{achievement.description}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Activity */}
          <div className="space-y-6">
            {/* Plan Info */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Subscription</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Plan</span>
                  <span className="text-white font-medium">Pro Developer</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Billing</span>
                  <span className="text-white">$29/month</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Next billing</span>
                  <span className="text-white">Dec 15, 2024</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">AI Credits</span>
                  <span className="text-green-400">Unlimited</span>
                </div>
              </div>
              <button className="w-full mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                Manage Subscription
              </button>
            </div>

            {/* Recent Activity */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start space-x-3 p-3 hover:bg-gray-700 rounded transition-colors">
                    <span className="text-lg">{getActivityIcon(activity.type)}</span>
                    <div className="flex-1">
                      <div className="text-white text-sm">{activity.action}</div>
                      <div className="text-gray-400 text-xs">{activity.timestamp}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Usage Stats */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h3 className="text-lg font-semibold text-white mb-4">This Month</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Chat Messages</span>
                    <span className="text-white">847 / ∞</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-blue-500 h-2 rounded-full" style={{ width: '20%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Agent Hours</span>
                    <span className="text-white">156 / ∞</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '35%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Code Reviews</span>
                    <span className="text-white">89 / ∞</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2">
                    <div className="bg-purple-500 h-2 rounded-full" style={{ width: '15%' }}></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};