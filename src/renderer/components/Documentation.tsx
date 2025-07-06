import React, { useState } from 'react';
import { Search, Book, FileText, Code, Users, Zap, Settings, GitBranch } from 'lucide-react';

interface DocSection {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  content: string;
  lastUpdated: string;
  updatedBy: string;
}

const docSections: DocSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: Book,
    content: `# Getting Started with LabRats AI IDE

Welcome to the future of development! This AI-first IDE revolutionizes how you build software by putting intelligent agents at the center of your workflow.

## Core Concepts

- **Agent Chat**: Communicate with specialized AI agents for different development tasks
- **Task Board**: Track AI-generated tasks and coordinate development workflow  
- **Analytics**: Monitor code quality and development metrics in real-time
- **Documentation**: AI-maintained project documentation that stays current

## First Steps

1. Start a conversation in Agent Chat
2. Describe what you want to build
3. Watch as the Team Leader coordinates specialists
4. Review generated code and approve changes
5. Monitor progress in the Analytics dashboard`,
    lastUpdated: '2 hours ago',
    updatedBy: 'Team Leader'
  },
  {
    id: 'agent-system',
    title: 'Agent System',
    icon: Users,
    content: `# Agent Coordination System

Our multi-agent system consists of specialized AI entities that collaborate to deliver high-quality code.

## Core Agents

### Team Leader 👑
- **Role**: Project orchestration and agent coordination
- **Specialization**: Architecture decisions, task delegation, quality oversight
- **When Active**: Always present to manage project flow

### Contrarian 🔍  
- **Role**: Critical thinking and quality assurance
- **Specialization**: Code review, debugging, optimization suggestions
- **When Active**: Automatically joins for code review and quality checks

### Chaos Monkey 🔥
- **Role**: Stress testing and reliability
- **Specialization**: Edge cases, performance testing, error scenarios
- **When Active**: Called in for testing and reliability assessment

### Frontend Dev 🎨
- **Role**: User interface and experience
- **Specialization**: UI components, responsive design, accessibility
- **When Active**: Added when UI/UX work is needed

### Backend Dev 🛠️
- **Role**: Server-side development  
- **Specialization**: APIs, databases, server logic
- **When Active**: Joins for backend architecture and implementation

### Fullstack Dev 🔄
- **Role**: End-to-end development
- **Specialization**: Integration, full-stack architecture
- **When Active**: Called for complex integration tasks

## Agent Coordination

Agents communicate through the chat system and can:
- Request other agents to join
- Share code reviews and suggestions  
- Coordinate on complex tasks
- Provide specialized expertise`,
    lastUpdated: '1 day ago',
    updatedBy: 'Team Leader'
  },
  {
    id: 'workflows',
    title: 'Development Workflows',
    icon: GitBranch,
    content: `# Development Workflows

## Code Review Process

1. **Initial Request**: User describes feature or change
2. **Agent Analysis**: Team Leader analyzes requirements
3. **Specialist Assignment**: Relevant agents are brought in
4. **Implementation**: Agents collaborate on solution
5. **Review Phase**: Contrarian reviews for issues
6. **Testing**: Chaos Monkey adds stress tests
7. **Approval**: User approves final implementation
8. **Commit**: Changes are automatically committed

## Task Management

- Tasks are automatically generated from chat conversations
- Agents can create sub-tasks and dependencies
- Progress is tracked in real-time on the Task Board
- Completion triggers notifications and next steps

## Quality Assurance

- Every change goes through multi-agent review
- Automated testing is added by Chaos Monkey
- Code quality metrics are tracked continuously
- Performance impacts are monitored`,
    lastUpdated: '3 hours ago',
    updatedBy: 'Contrarian'
  },
  {
    id: 'api-reference',
    title: 'API Reference',
    icon: Code,
    content: `# API Reference

## Agent Communication API

### Send Message
\`\`\`typescript
interface AgentMessage {
  id: string;
  content: string;
  sender: Agent | 'user';
  timestamp: Date;
  type: 'text' | 'code' | 'review';
  metadata?: MessageMetadata;
}
\`\`\`

### Agent Interface
\`\`\`typescript
interface Agent {
  id: string;
  name: string;
  role: string;
  color: string;
  icon: React.ComponentType;
  isActive: boolean;
  specialization: string[];
}
\`\`\`

### Task Management
\`\`\`typescript
interface Task {
  id: string;
  title: string;
  description: string;
  assignee: string;
  priority: 'low' | 'medium' | 'high';
  status: 'todo' | 'in-progress' | 'review' | 'done';
  createdBy: 'user' | 'agent';
}
\`\`\`

## Code Review API

### Review Data
\`\`\`typescript
interface ReviewData {
  files: string[];
  changes: number;
  additions: number;
  deletions: number;
}
\`\`\``,
    lastUpdated: '5 hours ago',
    updatedBy: 'Fullstack Dev'
  }
];

export const Documentation: React.FC = () => {
  const [activeSection, setActiveSection] = useState(docSections[0]);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSections = docSections.filter(section =>
    section.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    section.content.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex-1 bg-gray-900 flex overflow-hidden">
      {/* Sidebar */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 p-4 flex flex-col overflow-hidden">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-white mb-4">Documentation</h2>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search docs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Section List */}
        <div className="space-y-2 overflow-y-auto flex-1">
          {filteredSections.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section)}
              className={`w-full text-left p-3 rounded-lg transition-colors ${
                activeSection.id === section.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-700 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3">
                <section.icon className="w-5 h-5" />
                <div className="flex-1">
                  <div className="font-medium">{section.title}</div>
                  <div className="text-xs opacity-75 mt-1">
                    Updated {section.lastUpdated} by {section.updatedBy}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl">
          <div className="flex items-center space-x-3 mb-6">
            <activeSection.icon className="w-8 h-8 text-blue-400" />
            <div>
              <h1 className="text-3xl font-bold text-white">{activeSection.title}</h1>
              <p className="text-gray-400 mt-1">
                Last updated {activeSection.lastUpdated} by {activeSection.updatedBy}
              </p>
            </div>
          </div>

          <div className="prose prose-invert max-w-none">
            <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">
              {activeSection.content}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-gray-700">
            <div className="flex items-center justify-between text-sm text-gray-400">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4" />
                <span>This documentation is automatically maintained by AI agents</span>
              </div>
              <div className="flex items-center space-x-2">
                <Zap className="w-4 h-4 text-blue-400" />
                <span>Always up to date</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};