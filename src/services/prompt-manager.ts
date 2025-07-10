// Import all default prompts
import teamLeaderPrompt from '../prompts/team-leader.prompt';
import contrarianPrompt from '../prompts/contrarian.prompt';
import chaosMonkeyPrompt from '../prompts/chaos-monkey.prompt';
import backendDevPrompt from '../prompts/backend-dev.prompt';
import frontendDevPrompt from '../prompts/frontend-dev.prompt';
import fullstackDevPrompt from '../prompts/fullstack-dev.prompt';
import productOwnerPrompt from '../prompts/product-owner.prompt';
import qualityEngineerPrompt from '../prompts/quality-engineer.prompt';
import securityAuditorPrompt from '../prompts/security-auditor.prompt';
import devopsPrompt from '../prompts/devops.prompt';
import codeReviewerPrompt from '../prompts/code-reviewer.prompt';
import architectPrompt from '../prompts/architect.prompt';
import documentWriterPrompt from '../prompts/document-writer.prompt';
import gitCommitGeneratorPrompt from '../prompts/git-commit-generator.prompt';
import globalLabratsPrompt from '../prompts/global-labrats.prompt';
import globalCompactPrompt from '../prompts/global-compact.prompt';
import uiUxDesignerPrompt from '../prompts/ui-ux-designer.prompt';

// Import agent personas
import cortexPersona from '../prompts/cortex-persona.prompt';
import ziggyPersona from '../prompts/ziggy-persona.prompt';
import patchyPersona from '../prompts/patchy-persona.prompt';
import shinyPersona from '../prompts/shiny-persona.prompt';
import sniffyPersona from '../prompts/sniffy-persona.prompt';
import trappyPersona from '../prompts/trappy-persona.prompt';
import scratchyPersona from '../prompts/scratchy-persona.prompt';
import wheeliePersona from '../prompts/wheelie-persona.prompt';
import clawsyPersona from '../prompts/clawsy-persona.prompt';
import nestorPersona from '../prompts/nestor-persona.prompt';
import quillPersona from '../prompts/quill-persona.prompt';
import sketchyPersona from '../prompts/sketchy-persona.prompt';
import switchyPersona from '../prompts/switchy-persona.prompt';

// Import compact prompts for token optimization
import productOwnerCompactPrompt from '../prompts/product-owner-compact.prompt';
import productOwnerUltraCompactPrompt from '../prompts/product-owner-ultra-compact.prompt';
import globalLabratsCompactPrompt from '../prompts/global-labrats-compact.prompt';
import backendDevCompactPrompt from '../prompts/backend-dev-compact.prompt';
import codeReviewerCompactPrompt from '../prompts/code-reviewer-compact.prompt';
import uiUxDesignerCompactPrompt from '../prompts/ui-ux-designer-compact.prompt';
import frontendDevCompactPrompt from '../prompts/frontend-dev-compact.prompt';
import qualityEngineerCompactPrompt from '../prompts/quality-engineer-compact.prompt';
import devopsCompactPrompt from '../prompts/devops-compact.prompt';
import documentWriterCompactPrompt from '../prompts/document-writer-compact.prompt';
import fullstackDevCompactPrompt from '../prompts/fullstack-dev-compact.prompt';
import chaosMonkeyCompactPrompt from '../prompts/chaos-monkey-compact.prompt';
import contrarianCompactPrompt from '../prompts/contrarian-compact.prompt';
import securityAuditorCompactPrompt from '../prompts/security-auditor-compact.prompt';
import architectCompactPrompt from '../prompts/architect-compact.prompt';

// Import agent metadata for compact persona
import { agents as agentMeta } from '../config/agents';

// Agent personas mapping
const AGENT_PERSONAS: { [key: string]: string } = {
  'cortex': cortexPersona,
  'ziggy': ziggyPersona,
  'patchy': patchyPersona,
  'shiny': shinyPersona,
  'sniffy': sniffyPersona,
  'trappy': trappyPersona,
  'scratchy': scratchyPersona,
  'wheelie': wheeliePersona,
  'clawsy': clawsyPersona,
  'nestor': nestorPersona,
  'quill': quillPersona,
  'sketchy': sketchyPersona,
  'switchy': switchyPersona,
};

// Default prompts mapping - using agent IDs from config/agents.ts
const DEFAULT_PROMPTS: { [key: string]: string } = {
  // Agent ID mapping
  'cortex': productOwnerPrompt,
  'ziggy': chaosMonkeyPrompt,
  'patchy': backendDevPrompt,
  'shiny': frontendDevPrompt,
  'sniffy': qualityEngineerPrompt,
  'trappy': securityAuditorPrompt,
  'scratchy': contrarianPrompt,
  'wheelie': devopsPrompt,
  'clawsy': codeReviewerPrompt,
  'nestor': architectPrompt,
  'quill': documentWriterPrompt,
  'sketchy': uiUxDesignerPrompt,
  'switchy': fullstackDevPrompt,
  
  // Legacy role-based mapping for backwards compatibility
  'team-leader': teamLeaderPrompt,
  'contrarian': contrarianPrompt,
  'chaos-monkey': chaosMonkeyPrompt,
  'backend-dev': backendDevPrompt,
  'frontend-dev': frontendDevPrompt,
  'fullstack-dev': fullstackDevPrompt,
  'product-owner': productOwnerPrompt,
  'quality-engineer': qualityEngineerPrompt,
  'security-auditor': securityAuditorPrompt,
  'devops': devopsPrompt,
  'code-reviewer': codeReviewerPrompt,
  'architect': architectPrompt,
  'document-writer': documentWriterPrompt,
  'git-commit-generator': gitCommitGeneratorPrompt,
  'ui-ux-designer': uiUxDesignerPrompt
};

// Compact prompts mapping for token optimization
const COMPACT_PROMPTS: { [key: string]: string } = {
  // Agent ID mapping
  'cortex': productOwnerUltraCompactPrompt, // Use ultra-compact to stay under 750 tokens
  'ziggy': chaosMonkeyCompactPrompt,
  'patchy': backendDevCompactPrompt,
  'shiny': frontendDevCompactPrompt,
  'sniffy': qualityEngineerCompactPrompt,
  'trappy': securityAuditorCompactPrompt,
  'scratchy': contrarianCompactPrompt,
  'wheelie': devopsCompactPrompt,
  'clawsy': codeReviewerCompactPrompt,
  'nestor': architectCompactPrompt,
  'quill': documentWriterCompactPrompt,
  'sketchy': uiUxDesignerCompactPrompt,
  'switchy': fullstackDevCompactPrompt,
  
  // Legacy role-based mapping for backwards compatibility
  'product-owner': productOwnerUltraCompactPrompt,
  'chaos-monkey': chaosMonkeyCompactPrompt,
  'backend-dev': backendDevCompactPrompt,
  'frontend-dev': frontendDevCompactPrompt,
  'quality-engineer': qualityEngineerCompactPrompt,
  'security-auditor': securityAuditorCompactPrompt,
  'contrarian': contrarianCompactPrompt,
  'devops': devopsCompactPrompt,
  'code-reviewer': codeReviewerCompactPrompt,
  'architect': architectCompactPrompt,
  'document-writer': documentWriterCompactPrompt,
  'ui-ux-designer': uiUxDesignerCompactPrompt,
  'fullstack-dev': fullstackDevCompactPrompt
};

// Agent persona cache
const personaCache: { [key: string]: string } = {};

export class PromptManager {
  private configDir: string | null = null;

  constructor() {
    this.initializeConfigDir();
  }

  private async initializeConfigDir(): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.config?.getConfigDir) {
        this.configDir = await window.electronAPI.config.getConfigDir();
      }
    } catch (error) {
      console.error('Failed to get config directory:', error);
    }
  }

  private async getConfigDir(): Promise<string> {
    if (!this.configDir) {
      await this.initializeConfigDir();
    }
    
    if (!this.configDir) {
      throw new Error('Config directory not available');
    }
    
    return this.configDir;
  }

  /**
   * Get the complete prompt for a specific agent
   * Includes: global professional standards + labrats context + agent persona + (user override OR default prompt)
   */
  async getPrompt(agentId: string, compact: boolean = true): Promise<string> {
    console.log(`[PROMPT-MANAGER] Getting prompt for agent: ${agentId}`);
    
    try {
      // Special handling for git-commit-generator - no personas or global context needed
      if (agentId === 'git-commit-generator') {
        console.log(`[PROMPT-MANAGER] Returning git commit generator prompt`);
        // Check for user override first
        if (typeof window !== 'undefined' && window.electronAPI?.prompt?.read) {
          const userPrompt = await window.electronAPI.prompt.read(agentId);
          if (userPrompt) {
            return userPrompt.trim();
          }
        }
        
        // Fall back to default prompt
        return DEFAULT_PROMPTS[agentId] || '';
      }

      // Build the complete prompt with all components for regular agents
      let completePrompt = '';
      
      if (compact) {
        // Compact mode: Use minimal global context
        completePrompt += globalCompactPrompt + '\n\n';
        completePrompt += globalLabratsCompactPrompt + '\n\n';
      } else {
        // Full mode: Use expanded context
        completePrompt += globalLabratsPrompt + '\n\n';
      }
      
      // 3. Add agent persona (only in compact mode for efficiency)
      if (compact) {
        const persona = AGENT_PERSONAS[agentId];
        if (persona) {
          completePrompt += persona + '\n\n';
        }
      }
      
      // 4. Add role-specific prompt (user override or default)
      let rolePrompt = '';
      
      // Check for user override first
      if (typeof window !== 'undefined' && window.electronAPI?.prompt?.read) {
        const userPrompt = await window.electronAPI.prompt.read(agentId);
        if (userPrompt) {
          rolePrompt = userPrompt.trim();
          console.log(`[PROMPT-MANAGER] Using user override prompt for ${agentId}`);
        }
      }
      
      // If no user override, use default or compact prompt
      if (!rolePrompt) {
        if (compact && COMPACT_PROMPTS[agentId]) {
          rolePrompt = COMPACT_PROMPTS[agentId].trim();
          console.log(`[PROMPT-MANAGER] Using compact prompt for ${agentId}, length: ${rolePrompt.length}`);
        } else {
          const defaultPrompt = DEFAULT_PROMPTS[agentId];
          if (defaultPrompt) {
            rolePrompt = defaultPrompt.trim();
            console.log(`[PROMPT-MANAGER] Using default prompt for ${agentId}, length: ${rolePrompt.length}`);
          } else {
            // Fallback for unknown agents
            console.log(`[PROMPT-MANAGER] No default prompt found for ${agentId}, using generic`);
            rolePrompt = this.getGenericPrompt(agentId);
          }
        }
      }
      
      completePrompt += rolePrompt;
      
      console.log(`[PROMPT-MANAGER] Complete prompt for ${agentId}, total length: ${completePrompt.length}`);
      
      return completePrompt;
    } catch (error) {
      console.error(`Failed to load prompt for agent ${agentId}:`, error);
      return this.getGenericPrompt(agentId);
    }
  }

  /**
   * Save a custom prompt for an agent
   */
  async savePrompt(agentId: string, prompt: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.prompt?.write) {
        const success = await window.electronAPI.prompt.write(agentId, prompt);
        if (!success) {
          throw new Error('Failed to write prompt file');
        }
      } else {
        throw new Error('Prompt API not available');
      }
    } catch (error) {
      console.error(`Failed to save prompt for agent ${agentId}:`, error);
      throw new Error(`Failed to save custom prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Reset an agent's prompt to default by removing the user override
   */
  async resetPrompt(agentId: string): Promise<void> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.prompt?.delete) {
        const success = await window.electronAPI.prompt.delete(agentId);
        if (!success) {
          throw new Error('Failed to delete prompt file');
        }
      } else {
        throw new Error('Prompt API not available');
      }
    } catch (error) {
      console.error(`Failed to reset prompt for agent ${agentId}:`, error);
      throw new Error(`Failed to reset prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if an agent has a custom prompt override
   */
  async hasCustomPrompt(agentId: string): Promise<boolean> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.prompt?.exists) {
        return await window.electronAPI.prompt.exists(agentId);
      }
      return false;
    } catch (error) {
      console.error(`Failed to check custom prompt for agent ${agentId}:`, error);
      return false;
    }
  }

  /**
   * Get the default prompt for an agent
   */
  async getDefaultPrompt(agentId: string): Promise<string> {
    const defaultPrompt = DEFAULT_PROMPTS[agentId];
    if (defaultPrompt) {
      return defaultPrompt.trim();
    }
    return this.getGenericPrompt(agentId);
  }

  /**
   * Get list of all available agent IDs with prompts
   */
  getAvailableAgents(): string[] {
    return Object.keys(DEFAULT_PROMPTS);
  }

  /**
   * Get list of agents with custom prompts
   */
  async getCustomPromptAgents(): Promise<string[]> {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.prompt?.listCustom) {
        return await window.electronAPI.prompt.listCustom();
      }
      return [];
    } catch (error) {
      console.error('Failed to get custom prompt agents:', error);
      return [];
    }
  }

  private getGenericPrompt(agentId: string): string {
    return `You are an AI assistant specializing in software development. Your role is to help with ${agentId.replace('-', ' ')} related tasks. 

Please provide helpful, accurate, and professional assistance while maintaining a collaborative tone. Focus on best practices, clear explanations, and practical solutions.`;
  }
}

// Singleton instance
let promptManagerInstance: PromptManager | null = null;

export function getPromptManager(): PromptManager {
  if (!promptManagerInstance) {
    promptManagerInstance = new PromptManager();
  }
  return promptManagerInstance;
}