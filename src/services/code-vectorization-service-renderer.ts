import { VectorDocument } from '../main/vector-storage-service';
import { CodeVectorizationStats } from '../main/code-vectorization-service';

class CodeVectorizationServiceRenderer {
  private static instance: CodeVectorizationServiceRenderer;

  private constructor() {}

  static getInstance(): CodeVectorizationServiceRenderer {
    if (!CodeVectorizationServiceRenderer.instance) {
      CodeVectorizationServiceRenderer.instance = new CodeVectorizationServiceRenderer();
    }
    return CodeVectorizationServiceRenderer.instance;
  }

  /**
   * Initialize the code vectorization service for a project
   */
  async initialize(projectPath: string): Promise<void> {
    const result = await window.electronAPI.codeVectorization!.initialize(projectPath);
    if (!result.success) {
      throw new Error(result.error || 'Failed to initialize code vectorization');
    }
  }

  /**
   * Check if the service is ready
   */
  async isReady(): Promise<boolean> {
    return await window.electronAPI.codeVectorization!.isReady();
  }

  /**
   * Vectorize a single file
   */
  async vectorizeFile(filePath: string): Promise<VectorDocument[]> {
    const result = await window.electronAPI.codeVectorization!.vectorizeFile(filePath);
    if (!result.success) {
      throw new Error(result.error || 'Failed to vectorize file');
    }
    return result.documents || [];
  }

  /**
   * Vectorize the entire project
   */
  async vectorizeProject(filePatterns?: string[]): Promise<void> {
    const result = await window.electronAPI.codeVectorization!.vectorizeProject(filePatterns);
    if (!result.success) {
      throw new Error(result.error || 'Failed to vectorize project');
    }
  }

  /**
   * Get vectorization statistics
   */
  async getStats(): Promise<CodeVectorizationStats> {
    const result = await window.electronAPI.codeVectorization!.getStats();
    if (!result.success) {
      throw new Error(result.error || 'Failed to get stats');
    }
    return result.stats;
  }

  /**
   * Search for code by natural language query
   */
  async searchCode(query: string, options?: {
    limit?: number;
    type?: string;
    language?: string;
    minSimilarity?: number;
  }): Promise<Array<{ document: VectorDocument; similarity: number }>> {
    const result = await window.electronAPI.codeVectorization!.searchCode(query, options);
    if (!result.success) {
      throw new Error(result.error || 'Failed to search code');
    }
    return result.results || [];
  }

  /**
   * Find code similar to a given snippet
   */
  async findSimilarCode(codeSnippet: string, options?: {
    limit?: number;
    minSimilarity?: number;
  }): Promise<Array<{ document: VectorDocument; similarity: number }>> {
    const result = await window.electronAPI.codeVectorization!.findSimilarCode(codeSnippet, options);
    if (!result.success) {
      throw new Error(result.error || 'Failed to find similar code');
    }
    return result.results || [];
  }

  /**
   * Delete vectors for a file
   */
  async deleteFileVectors(filePath: string): Promise<void> {
    const result = await window.electronAPI.codeVectorization!.deleteFileVectors(filePath);
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete file vectors');
    }
  }
}

export const codeVectorizationService = CodeVectorizationServiceRenderer.getInstance();