import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { PathValidator } from '../security/path-validator';
import { z } from 'zod';

interface FileEntry {
  name: string;
  type: "file" | "directory";
  size?: number;
  modified?: string;
  permissions?: string;
}

interface ListFilesResult {
  path: string;
  entries: FileEntry[];
  total_count: number;
}

// Input schema for list_files tool
const listFilesSchema = z.object({
  path: z.string().optional().default("."),
  recursive: z.boolean().optional().default(false),
  include_hidden: z.boolean().optional().default(false),
  pattern: z.string().optional()
});

export async function listFilesTool(projectRoot: string, params: any): Promise<any> {
  const pathValidator = new PathValidator(projectRoot);
  
  try {
    const { path: requestedPath, recursive, include_hidden, pattern } = listFilesSchema.parse(params);
    
    // Validate path
    const absolutePath = await pathValidator.validatePath(requestedPath);
    const relativePath = pathValidator.getRelativePath(absolutePath);
    
    let entries: FileEntry[] = [];

    if (pattern && recursive) {
      // Use glob for pattern matching with recursive search
      const globPattern = path.join(absolutePath, pattern);
      const files = await glob(globPattern, {
        dot: include_hidden,
        nodir: false,
        absolute: true
      });

      for (const file of files) {
        const relativeFile = pathValidator.getRelativePath(file);
        if (!include_hidden && pathValidator.shouldIgnore(path.basename(file))) {
          continue;
        }

        const stats = await fs.stat(file);
        entries.push({
          name: relativeFile,
          type: stats.isDirectory() ? "directory" : "file",
          size: stats.isFile() ? stats.size : undefined,
          modified: stats.mtime.toISOString(),
          permissions: stats.mode.toString(8).slice(-3)
        });
      }
    } else {
      // Regular directory listing
      const dirEntries = await fs.readdir(absolutePath, { withFileTypes: true });

      for (const entry of dirEntries) {
        // Skip hidden files if not requested
        if (!include_hidden && entry.name.startsWith('.')) {
          continue;
        }

        // Skip ignored files
        if (pathValidator.shouldIgnore(entry.name)) {
          continue;
        }

        const entryPath = path.join(absolutePath, entry.name);
        const stats = await fs.stat(entryPath);

        const fileEntry: FileEntry = {
          name: entry.name,
          type: entry.isDirectory() ? "directory" : "file",
          size: entry.isFile() ? stats.size : undefined,
          modified: stats.mtime.toISOString(),
          permissions: stats.mode.toString(8).slice(-3)
        };

        entries.push(fileEntry);

        // Handle recursive listing
        if (recursive && entry.isDirectory()) {
          const subResult = await listFilesRecursive(
            entryPath,
            pathValidator,
            include_hidden,
            pattern,
            path.join(relativePath, entry.name)
          );
          entries.push(...subResult);
        }
      }
    }

    // Sort entries: directories first, then files, alphabetically
    entries.sort((a, b) => {
      if (a.type === b.type) {
        return a.name.localeCompare(b.name);
      }
      return a.type === "directory" ? -1 : 1;
    });

    const result: ListFilesResult = {
      path: relativePath || ".",
      entries,
      total_count: entries.length
    };

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error) {
    return {
      content: [{
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
}

async function listFilesRecursive(
  dirPath: string,
  pathValidator: PathValidator,
  includeHidden: boolean,
  pattern: string | undefined,
  baseRelativePath: string
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  
  try {
    const dirEntries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of dirEntries) {
      if (!includeHidden && entry.name.startsWith('.')) {
        continue;
      }

      if (pathValidator.shouldIgnore(entry.name)) {
        continue;
      }

      const entryPath = path.join(dirPath, entry.name);
      const relativeName = path.join(baseRelativePath, entry.name);
      
      // Apply pattern filter if specified
      if (pattern && !minimatch(entry.name, pattern)) {
        if (!entry.isDirectory()) {
          continue;
        }
      }

      const stats = await fs.stat(entryPath);

      entries.push({
        name: relativeName,
        type: entry.isDirectory() ? "directory" : "file",
        size: entry.isFile() ? stats.size : undefined,
        modified: stats.mtime.toISOString(),
        permissions: stats.mode.toString(8).slice(-3)
      });

      if (entry.isDirectory()) {
        const subEntries = await listFilesRecursive(
          entryPath,
          pathValidator,
          includeHidden,
          pattern,
          relativeName
        );
        entries.push(...subEntries);
      }
    }
  } catch (error) {
    // Log but don't fail the entire operation
    console.error(`Error reading directory ${dirPath}:`, error);
  }

  return entries;
}

// Simple pattern matching (can be replaced with minimatch package)
function minimatch(filename: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filename);
}