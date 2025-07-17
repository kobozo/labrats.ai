# Dependency MCP Tools

This document describes the MCP (Model Context Protocol) tools available for querying and analyzing code dependencies in LabRats.ai.

## Overview

The dependency analysis system provides AI agents with the ability to understand code relationships, impact analysis, and dependency tracking. This helps agents make more informed decisions when suggesting code changes.

## Available Tools

### 1. `dependency_query`

Query dependencies for a specific file to understand what it imports and what imports it.

**Parameters:**
- `filePath` (required): The path to the file to query dependencies for

**Example Usage:**
```typescript
const result = await callTool('dependency_query', {
  filePath: 'src/components/Dashboard.tsx'
});
```

**Response:**
```json
{
  "file": "src/components/Dashboard.tsx",
  "found": true,
  "language": "typescript",
  "summary": {
    "imports": 15,
    "exports": 2,
    "dependents": 3
  },
  "dependencies": {
    "imports": [
      { "path": "src/services/api.ts", "name": "api.ts" },
      { "path": "src/types/index.ts", "name": "index.ts" }
    ],
    "exports": ["Dashboard", "DashboardProps"],
    "dependents": [
      { "path": "src/App.tsx", "name": "App.tsx" },
      { "path": "src/pages/Home.tsx", "name": "Home.tsx" }
    ]
  }
}
```

### 2. `dependency_path`

Find the dependency path between two files to understand how they are connected.

**Parameters:**
- `fromFile` (required): The starting file path
- `toFile` (required): The target file path

**Example Usage:**
```typescript
const result = await callTool('dependency_path', {
  fromFile: 'src/components/Dashboard.tsx',
  toFile: 'src/utils/helpers.ts'
});
```

**Response:**
```json
{
  "fromFile": "src/components/Dashboard.tsx",
  "toFile": "src/utils/helpers.ts",
  "connected": true,
  "path": [
    { "path": "src/components/Dashboard.tsx", "name": "Dashboard.tsx" },
    { "path": "src/services/api.ts", "name": "api.ts" },
    { "path": "src/utils/helpers.ts", "name": "helpers.ts" }
  ],
  "pathLength": 3,
  "summary": "Dashboard.tsx → api.ts → helpers.ts"
}
```

### 3. `dependency_stats`

Get overall dependency statistics for the project including most dependent files and circular dependencies.

**Parameters:**
- `includeCircular` (optional): Whether to include circular dependency details (default: true)
- `topCount` (optional): Number of top files to include in lists (default: 10)

**Example Usage:**
```typescript
const result = await callTool('dependency_stats', {
  includeCircular: true,
  topCount: 5
});
```

**Response:**
```json
{
  "available": true,
  "overview": {
    "totalFiles": 150,
    "totalDependencies": 380,
    "circularDependencyCount": 2
  },
  "mostDependent": [
    { "file": "Dashboard.tsx", "path": "src/components/Dashboard.tsx", "imports": 15 },
    { "file": "App.tsx", "path": "src/App.tsx", "imports": 12 }
  ],
  "mostDependedOn": [
    { "file": "api.ts", "path": "src/services/api.ts", "dependents": 25 },
    { "file": "types.ts", "path": "src/types/index.ts", "dependents": 20 }
  ],
  "circularDependencies": [
    {
      "files": [
        { "path": "src/services/a.ts", "name": "a.ts" },
        { "path": "src/services/b.ts", "name": "b.ts" }
      ],
      "cycleLength": 2,
      "summary": "a.ts → b.ts"
    }
  ]
}
```

### 4. `dependency_impact`

Analyze the impact of changes to a file by finding all files that depend on it directly or indirectly.

**Parameters:**
- `filePath` (required): The path to the file to analyze impact for
- `maxDepth` (optional): Maximum depth to search for dependent files (default: 5)

**Example Usage:**
```typescript
const result = await callTool('dependency_impact', {
  filePath: 'src/services/api.ts',
  maxDepth: 3
});
```

**Response:**
```json
{
  "file": "src/services/api.ts",
  "impact": "high",
  "directDependents": 8,
  "totalImpactedFiles": 23,
  "directDependentFiles": [
    { "path": "src/components/Dashboard.tsx", "name": "Dashboard.tsx" },
    { "path": "src/services/auth.ts", "name": "auth.ts" }
  ],
  "allImpactedFiles": [
    { "path": "src/components/Dashboard.tsx", "name": "Dashboard.tsx" },
    { "path": "src/services/auth.ts", "name": "auth.ts" },
    { "path": "src/App.tsx", "name": "App.tsx" }
  ],
  "recommendations": [
    "Exercise caution when modifying this file",
    "Run comprehensive tests for all dependent files",
    "Consider creating a backup branch before changes"
  ]
}
```

## Impact Levels

The `dependency_impact` tool categorizes files into impact levels:

- **Low**: 0-3 dependent files
- **Medium**: 4-10 dependent files  
- **High**: 11-25 dependent files
- **Critical**: 26+ dependent files

## Usage in Agent Prompts

These tools are particularly useful for:

1. **Change Impact Analysis**: Before modifying a file, use `dependency_impact` to understand the scope of changes
2. **Refactoring Decisions**: Use `dependency_stats` to identify highly coupled files that might need refactoring
3. **Debugging**: Use `dependency_path` to trace how data flows between components
4. **Code Review**: Use `dependency_query` to understand a file's role in the system

## Example Agent Workflow

```typescript
// 1. Check impact before making changes
const impact = await callTool('dependency_impact', {
  filePath: 'src/services/api.ts'
});

if (impact.impact === 'critical') {
  // Suggest more careful approach
  return "This file has critical dependencies. Consider making changes incrementally.";
}

// 2. Understand file relationships
const dependencies = await callTool('dependency_query', {
  filePath: 'src/services/api.ts'
});

// 3. Check for circular dependencies
const stats = await callTool('dependency_stats', {
  includeCircular: true
});

if (stats.circularDependencies.length > 0) {
  return "Warning: Circular dependencies detected. Review before making changes.";
}
```

## Data Storage

Dependency data is stored in the `.labrats/dependencies/` folder:
- `dependency-graph.json`: Complete dependency graph data
- `dependency-stats.json`: Calculated statistics and metrics

The system automatically tracks file changes and updates dependencies accordingly.