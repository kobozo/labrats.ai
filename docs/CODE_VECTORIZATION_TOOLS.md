# Code Vectorization Tools for AI Agents

This document describes the MCP tools available for code search and exploration in LabRats.AI. These tools enable semantic search and code understanding capabilities.

## Prerequisites

Before using these tools, ensure code vectorization is initialized:

```json
{
  "tool": "code_vectorization_status",
  "args": {
    "action": "get_status"
  }
}
```

If not initialized, start vectorization:

```json
{
  "tool": "code_vectorization_status",
  "args": {
    "action": "start_vectorization",
    "filePatterns": ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"]
  }
}
```

## Available Tools

### 1. search_code

Search for code using natural language queries. This tool uses semantic search to find relevant code elements.

**Parameters:**
- `query` (required): Natural language search query
- `limit` (optional, default: 10): Maximum number of results (max: 50)
- `type` (optional): Filter by code element type
  - Options: `function`, `class`, `method`, `interface`, `type`, `variable`, `import`, `export`
- `language` (optional): Filter by programming language

**Examples:**

```json
// Find authentication-related functions
{
  "tool": "search_code",
  "args": {
    "query": "user authentication and login",
    "type": "function",
    "limit": 20
  }
}

// Find React components
{
  "tool": "search_code",
  "args": {
    "query": "React component for displaying chat messages",
    "language": "typescript"
  }
}

// Find database connection code
{
  "tool": "search_code",
  "args": {
    "query": "database connection initialization"
  }
}
```

### 2. find_similar_code

Find code similar to a given snippet. Useful for finding duplicates or similar implementations.

**Parameters:**
- `codeSnippet` (required): The code snippet to find similar code for
- `limit` (optional, default: 10): Maximum number of results (max: 50)
- `minSimilarity` (optional, default: 0.8): Minimum similarity score (0-1)

**Examples:**

```json
// Find similar error handling patterns
{
  "tool": "find_similar_code",
  "args": {
    "codeSnippet": "try {\n  await fetchData();\n} catch (error) {\n  console.error('Failed to fetch:', error);\n  throw error;\n}",
    "minSimilarity": 0.7
  }
}

// Find similar React hooks
{
  "tool": "find_similar_code",
  "args": {
    "codeSnippet": "const [isLoading, setIsLoading] = useState(false);\nconst [error, setError] = useState(null);",
    "limit": 15
  }
}
```

### 3. explore_codebase

Explore and navigate the codebase structure. Get information about files, classes, functions, and their relationships.

**Parameters:**
- `action` (required): The exploration action to perform
  - `list_files`: List all indexed files
  - `list_functions`: List all functions
  - `list_classes`: List all classes and interfaces
  - `get_file_structure`: Get structure of a specific file
  - `get_imports`: Get all imports
  - `get_exports`: Get all exports
- `filePath` (optional): File path for file-specific actions
- `pattern` (optional): Filter pattern (e.g., "*.ts")
- `language` (optional): Filter by language

**Examples:**

```json
// List all TypeScript files
{
  "tool": "explore_codebase",
  "args": {
    "action": "list_files",
    "pattern": "*.ts"
  }
}

// Get structure of a specific file
{
  "tool": "explore_codebase",
  "args": {
    "action": "get_file_structure",
    "filePath": "src/services/agent-message-bus.ts"
  }
}

// List all classes in TypeScript files
{
  "tool": "explore_codebase",
  "args": {
    "action": "list_classes",
    "language": "typescript"
  }
}

// Get all imports in a file
{
  "tool": "explore_codebase",
  "args": {
    "action": "get_imports",
    "filePath": "src/renderer/components/Chat.tsx"
  }
}
```

### 4. code_vectorization_status

Control and monitor code vectorization status.

**Parameters:**
- `action` (required): The action to perform
  - `get_status`: Get current vectorization status
  - `start_vectorization`: Start vectorizing the project
  - `stop_watching`: Stop file watching
  - `force_reindex`: Force complete re-indexing
- `filePatterns` (optional, for start_vectorization): File patterns to vectorize

**Examples:**

```json
// Get current status
{
  "tool": "code_vectorization_status",
  "args": {
    "action": "get_status"
  }
}

// Start vectorization with custom patterns
{
  "tool": "code_vectorization_status",
  "args": {
    "action": "start_vectorization",
    "filePatterns": ["**/*.ts", "**/*.tsx", "**/*.py"]
  }
}

// Force re-indexing
{
  "tool": "code_vectorization_status",
  "args": {
    "action": "force_reindex"
  }
}
```

## Best Practices

1. **Initialize First**: Always check status before searching
2. **Use Specific Queries**: More specific queries yield better results
3. **Combine Tools**: Use `explore_codebase` to understand structure, then `search_code` for specific elements
4. **Check Similarity Threshold**: Lower `minSimilarity` for broader matches
5. **Filter by Type**: Use type filters to narrow down results

## Common Use Cases

### Finding Implementation Details
```json
// Step 1: Find relevant files
{
  "tool": "search_code",
  "args": {
    "query": "websocket connection handler",
    "type": "function"
  }
}

// Step 2: Explore specific file structure
{
  "tool": "explore_codebase",
  "args": {
    "action": "get_file_structure",
    "filePath": "src/services/websocket-service.ts"
  }
}
```

### Code Refactoring
```json
// Step 1: Find similar patterns
{
  "tool": "find_similar_code",
  "args": {
    "codeSnippet": "if (user && user.isAuthenticated) { return true; }",
    "minSimilarity": 0.6
  }
}

// Step 2: List all occurrences in specific files
{
  "tool": "explore_codebase",
  "args": {
    "action": "list_functions",
    "filePath": "src/auth/auth-service.ts"
  }
}
```

### Understanding Dependencies
```json
// Step 1: Get imports from main file
{
  "tool": "explore_codebase",
  "args": {
    "action": "get_imports",
    "filePath": "src/main/main.ts"
  }
}

// Step 2: Search for specific import usage
{
  "tool": "search_code",
  "args": {
    "query": "import from electron",
    "type": "import"
  }
}
```

## Error Handling

Common errors and solutions:

1. **"Code vectorization service is not initialized"**
   - Solution: Run `start_vectorization` action first

2. **"No results found"**
   - Try broader search terms
   - Lower the similarity threshold
   - Remove type filters

3. **"File not found"**
   - Ensure the file path is correct and indexed
   - Check vectorization status to see coverage

## Performance Tips

1. **Batch Operations**: Combine multiple searches when possible
2. **Use Filters**: Type and language filters improve performance
3. **Limit Results**: Start with smaller limits, increase if needed
4. **Cache Status**: Store vectorization status to avoid repeated checks