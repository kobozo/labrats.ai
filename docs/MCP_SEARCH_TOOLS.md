# MCP Search Tools for AI Agents

This document describes the comprehensive search and file manipulation tools available to AI agents through the MCP (Model Context Protocol) integration.

## Overview

The LabRats.AI codebase now provides advanced search and code reading capabilities:

1. **Vector Search** - AI-powered semantic code search
2. **File Search** - Search by file names and paths
3. **In-File Search** - Search within file contents with advanced filtering
4. **Context-Aware Search** - Search with code element boundaries
5. **Code Element Reading** - Read specific functions/classes around search results
6. **Replace Operations** - Modify file contents programmatically

## Tool Reference

### 1. Vector Search Tools

#### `search_code`
Search for code using natural language queries. Returns code snippets that match the semantic meaning of your query.

**Parameters:**
- `query` (required): Natural language description of what you're looking for
- `limit` (optional): Maximum number of results (default: 10, max: 50)
- `type` (optional): Filter by code element type (function, class, method, interface, etc.)
- `language` (optional): Filter by programming language
- `minSimilarity` (optional): Minimum similarity score (0-1, default: 0.7)

**Example:**
```json
{
  "query": "function that handles user authentication",
  "limit": 15,
  "type": "function",
  "minSimilarity": 0.8
}
```

#### `find_similar_code`
Find code similar to a given code snippet.

**Parameters:**
- `codeSnippet` (required): The code snippet to find similar code for
- `limit` (optional): Maximum number of results (default: 10, max: 50)
- `minSimilarity` (optional): Minimum similarity score (0-1, default: 0.8)

### 2. File Search Tools

#### `search_files`
Search for files by name and path. Returns files that match the search query in their filename or path.

**Parameters:**
- `query` (required): Search query to match against file names and paths (case-insensitive)
- `limit` (optional): Maximum number of results (default: 50, max: 200)
- `includePatterns` (optional): Comma-separated patterns to include (e.g., "src/, *.js, component")
- `excludePatterns` (optional): Comma-separated patterns to exclude (e.g., "node_modules/, *.min.js, test/")

**Example:**
```json
{
  "query": "search",
  "limit": 20,
  "includePatterns": "src/, *.ts",
  "excludePatterns": "test/, *.spec.ts"
}
```

### 3. In-File Search Tools

#### `search_in_files`
Search for text content within files. Supports case sensitivity, regex patterns, and include/exclude filters.

**Parameters:**
- `query` (required): Search query to find within file contents
- `caseSensitive` (optional): Whether the search should be case sensitive (default: false)
- `useRegex` (optional): Whether to treat the query as a regular expression (default: false)
- `limit` (optional): Maximum number of files to search (default: 100, max: 500)
- `maxMatchesPerFile` (optional): Maximum matches per file (default: 10, max: 50)
- `includePatterns` (optional): Comma-separated patterns to include files
- `excludePatterns` (optional): Comma-separated patterns to exclude files

**Example:**
```json
{
  "query": "useState.*string",
  "useRegex": true,
  "caseSensitive": false,
  "includePatterns": "*.tsx, *.ts",
  "excludePatterns": "node_modules/",
  "maxMatchesPerFile": 5
}
```

### 4. Context-Aware Tools

#### `search_with_context`
Search for text within files and get the containing code element context. Combines search with AST parsing for better code understanding.

**Parameters:**
- `query` (required): Search query to find within file contents
- `caseSensitive` (optional): Whether the search should be case sensitive (default: false)
- `useRegex` (optional): Whether to treat the query as a regular expression (default: false)
- `limit` (optional): Maximum number of files to search (default: 50, max: 200)
- `maxMatchesPerFile` (optional): Maximum matches per file (default: 5, max: 20)
- `includeCodeContext` (optional): Whether to include code element context (default: true)
- `includePatterns` (optional): Comma-separated patterns to include files
- `excludePatterns` (optional): Comma-separated patterns to exclude files

**Example:**
```json
{
  "query": "setState",
  "includeCodeContext": true,
  "includePatterns": "*.tsx",
  "maxMatchesPerFile": 3
}
```

#### `read_code_element`
Read the specific code element (function, class, method) that contains a given line number. This is much more efficient than reading entire files.

**Parameters:**
- `filePath` (required): Path to the file (relative to project root)
- `lineNumber` (required): Line number to find the containing code element for
- `searchQuery` (optional): Optional search query to highlight within the code element
- `contextLines` (optional): Number of context lines if no element found (default: 5)

**Example:**
```json
{
  "filePath": "src/components/Header.tsx",
  "lineNumber": 45,
  "searchQuery": "useState"
}
```

### 5. Replace Tools

#### `replace_in_file`
Replace text content within a specific file. Supports case sensitivity, regex patterns, and replace all or first occurrence only.

**Parameters:**
- `filePath` (required): Path to the file (relative to project root)
- `searchText` (required): Text to search for and replace
- `replaceText` (optional): Text to replace with (default: empty string)
- `caseSensitive` (optional): Whether the search should be case sensitive (default: false)
- `useRegex` (optional): Whether to treat searchText as a regular expression (default: false)
- `replaceAll` (optional): Whether to replace all occurrences (default: true)

**Example:**
```json
{
  "filePath": "src/components/Header.tsx",
  "searchText": "oldFunctionName",
  "replaceText": "newFunctionName",
  "replaceAll": true
}
```

### 6. Exploration Tools

#### `explore_codebase`
Explore and navigate the codebase structure.

#### `code_vectorization_status`
Get the status of code vectorization including progress and statistics.

## Return Formats

### Vector Search Results
```json
{
  "success": true,
  "query": "authentication function",
  "totalResults": 5,
  "results": [
    {
      "rank": 1,
      "score": "0.892",
      "type": "function",
      "name": "authenticateUser",
      "file": "src/auth/auth-service.ts",
      "lines": "45-67",
      "language": "typescript",
      "description": "Function that validates user credentials",
      "content": "export function authenticateUser(email: string, password: string) { ... }"
    }
  ]
}
```

### File Search Results
```json
{
  "success": true,
  "query": "search",
  "totalResults": 8,
  "totalMatched": 12,
  "results": [
    {
      "name": "search-tool.ts",
      "path": "src/services/mcp/tools/search-tool.ts",
      "fullPath": "/project/src/services/mcp/tools/search-tool.ts",
      "type": "file",
      "size": "4.56 KB",
      "lastModified": "2024-01-15T10:30:00Z",
      "extension": "ts"
    }
  ]
}
```

### In-File Search Results
```json
{
  "success": true,
  "query": "useState",
  "totalFiles": 3,
  "totalMatches": 7,
  "filesSearched": 45,
  "results": [
    {
      "file": {
        "name": "Header.tsx",
        "path": "src/components/Header.tsx",
        "type": "file"
      },
      "matches": [
        {
          "lineNumber": 12,
          "lineContent": "  const [isOpen, setIsOpen] = useState(false);",
          "matchStart": 31,
          "matchEnd": 39,
          "matchText": "useState"
        }
      ]
    }
  ]
}
```

### Context-Aware Search Results
```json
{
  "success": true,
  "query": "setState",
  "totalFiles": 3,
  "totalMatches": 8,
  "codeElementTypes": {
    "method": 5,
    "function": 3
  },
  "results": [
    {
      "file": {
        "name": "Header.tsx",
        "path": "src/components/Header.tsx"
      },
      "matches": [
        {
          "lineNumber": 45,
          "lineContent": "    setState({ isOpen: !state.isOpen });",
          "matchStart": 4,
          "matchEnd": 12,
          "matchText": "setState",
          "codeElement": {
            "type": "method",
            "name": "toggleMenu",
            "startLine": 42,
            "endLine": 48
          }
        }
      ]
    }
  ]
}
```

### Code Element Results
```json
{
  "success": true,
  "filePath": "src/components/Header.tsx",
  "lineNumber": 45,
  "searchQuery": "setState",
  "element": {
    "type": "method",
    "name": "toggleMenu",
    "content": "  toggleMenu = () => {\n    const { state } = this;\n    setState({ isOpen: !state.isOpen });\n    this.logAction('menu_toggled');\n  }",
    "startLine": 42,
    "endLine": 48,
    "language": "typescript",
    "parameters": [],
    "modifiers": ["private"],
    "complexity": 2
  },
  "relatedElements": [
    {
      "type": "parent",
      "element": {
        "type": "class",
        "name": "Header",
        "startLine": 15,
        "endLine": 120
      }
    }
  ],
  "imports": [
    {
      "type": "import",
      "content": "import React, { Component } from 'react';",
      "line": 1
    }
  ],
  "highlightPositions": [
    {
      "line": 45,
      "start": 4,
      "end": 12
    }
  ],
  "totalLines": 7
}
```

### Replace Results
```json
{
  "success": true,
  "filePath": "src/components/Header.tsx",
  "searchText": "oldFunction",
  "replaceText": "newFunction",
  "replacementCount": 3,
  "caseSensitive": false,
  "useRegex": false,
  "replaceAll": true,
  "fileSize": 2048,
  "modified": true
}
```

## Usage Tips for AI Agents

1. **Start with Vector Search** for semantic code discovery when you need to understand functionality
2. **Use File Search** when you know roughly what files you're looking for by name
3. **Use In-File Search** when you need to find specific text patterns, especially with regex
4. **Combine tools** for comprehensive exploration: start broad with vector search, then narrow down with file/in-file search
5. **Use filters** extensively to avoid noise from test files, node_modules, etc.
6. **Leverage regex patterns** in in-file search for complex text matching
7. **Be careful with replace operations** - always search first to understand the scope

## Example Workflows

### Finding Authentication Code
1. Use `search_code` with query "user authentication login"
2. Use `search_in_files` with query "password" and includePatterns "src/auth/"
3. Use `explore_codebase` to understand the auth module structure

### Refactoring Function Names
1. Use `search_code` to find the function definition
2. Use `search_in_files` to find all usages with exact function name
3. Use `replace_in_file` to update each file systematically

### Understanding Project Structure
1. Use `search_files` with broad queries to find main modules
2. Use `explore_codebase` to understand relationships
3. Use `search_in_files` to find configuration patterns

### Efficient Code Reading Workflow (NEW)
1. Use `search_with_context` to find code with element boundaries
2. Use `read_code_element` to read just the specific function/class
3. Avoid reading entire files when you only need specific functions

**Example: Finding and reading a specific function**
```json
// Step 1: Search with context
{
  "tool": "search_with_context",
  "args": {
    "query": "handleUserLogin",
    "includeCodeContext": true,
    "limit": 10
  }
}

// Step 2: Read just that function
{
  "tool": "read_code_element", 
  "args": {
    "filePath": "src/auth/auth-service.ts",
    "lineNumber": 45,
    "searchQuery": "handleUserLogin"
  }
}
```

This approach is much more efficient than reading entire files and helps agents focus on the relevant code.