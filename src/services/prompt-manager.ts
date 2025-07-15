// Import all prompts
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
import uiUxDesignerPrompt from '../prompts/ui-ux-designer.prompt';
import switchySingleAgentPrompt from '../prompts/switchy-single-agent.prompt';

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

// Default prompts mapping
const DEFAULT_PROMPTS: { [key: string]: string } = {
  'team-leader': teamLeaderPrompt,
  'cortex': productOwnerPrompt,
  'scratchy': contrarianPrompt,
  'ziggy': chaosMonkeyPrompt,
  'patchy': backendDevPrompt,
  'shiny': frontendDevPrompt,
  'switchy': fullstackDevPrompt,
  'sniffy': qualityEngineerPrompt,
  'trappy': securityAuditorPrompt,
  'wheelie': devopsPrompt,
  'clawsy': codeReviewerPrompt,
  'nestor': architectPrompt,
  'quill': documentWriterPrompt,
  'git-commit-generator': gitCommitGeneratorPrompt,
  'sketchy': uiUxDesignerPrompt,
};

class PromptManager {
  private userPrompts: Map<string, string> = new Map();
  private singleAgentMode: boolean = false;

  /**
   * Set whether we're in single-agent mode
   */
  setSingleAgentMode(enabled: boolean): void {
    this.singleAgentMode = enabled;
    console.log(`[PROMPT-MANAGER] Single-agent mode set to: ${enabled}`);
  }

  /**
   * Set a user-defined prompt override for a specific agent
   */
  setUserPrompt(agentId: string, prompt: string): void {
    console.log(`[PROMPT-MANAGER] Setting user prompt for ${agentId}`);
    this.userPrompts.set(agentId, prompt);
  }

  /**
   * Get a user-defined prompt override for a specific agent
   */
  getUserPrompt(agentId: string): string | undefined {
    return this.userPrompts.get(agentId);
  }

  /**
   * Clear user prompt override for a specific agent
   */
  clearUserPrompt(agentId: string): void {
    console.log(`[PROMPT-MANAGER] Clearing user prompt for ${agentId}`);
    this.userPrompts.delete(agentId);
  }

  /**
   * Clear all user prompt overrides
   */
  clearAllUserPrompts(): void {
    console.log('[PROMPT-MANAGER] Clearing all user prompts');
    this.userPrompts.clear();
  }

  /**
   * Get the complete prompt for a specific agent
   * Includes: global context + agent persona + role prompt
   */
  async getPrompt(agentId: string): Promise<string> {
    console.log(`[PROMPT-MANAGER] Getting prompt for agent: ${agentId}`);
    
    try {
      // Special handling for git-commit-generator - no personas or global context needed
      if (agentId === 'git-commit-generator') {
        return gitCommitGeneratorPrompt.trim();
      }

      // Build prompt components
      let promptParts: string[] = [];
      
      // 1. Add global LabRats context
      const globalPrompt = globalLabratsPrompt.trim();
      if (globalPrompt) {
        promptParts.push(globalPrompt);
      }
      
      // 2. Add agent persona if available
      const persona = AGENT_PERSONAS[agentId];
      if (persona) {
        promptParts.push(persona.trim());
      }
      
      // 3. Add role-specific prompt (user override or default)
      let rolePrompt = '';
      
      // Special handling for Switchy
      if (agentId === 'switchy') {
        // In single-agent mode, use the compact single-agent prompt
        if (this.singleAgentMode) {
          console.log(`[PROMPT-MANAGER] Using single-agent prompt for Switchy`);
          // Clear prompt parts and only use the single-agent prompt
          promptParts = [switchySingleAgentPrompt.trim()];
          
          // Add MCP tools for single-agent mode too
          promptParts.push(`## Available Tools

You have access to tools for exploring the project. When you need to explore files or understand the project structure, use the available tools. The system will automatically call the appropriate tools based on your needs.

Available capabilities:
- List files and directories in the project
- Navigate through the project structure
- Filter files by patterns

Simply express your intent naturally, and the tools will be invoked automatically.`);
          
          return promptParts.join('\n\n');
        }
        
        // In multi-agent mode, combine ALL role prompts
        console.log(`[PROMPT-MANAGER] Building combined prompt for Switchy`);
        const rolePrompts: string[] = [];
        
        // Add clear instructions first
        rolePrompts.push(`## IMPORTANT: How to Respond\n\nYou are Switchy, a helpful AI assistant. When users ask questions:\n- Answer directly and naturally\n- Don't classify or categorize their questions\n- Provide helpful, conversational responses\n- When asked "who are you?", introduce yourself and explain your capabilities\n\n## Combined Capabilities\n\nYou have the combined expertise of all roles:`);
        
        // Collect all role prompts (excluding personas and git-commit)
        const rolesToCombine = [
          'product-owner', 'architect', 'backend-dev', 'frontend-dev',
          'quality-engineer', 'security-auditor', 'devops', 'code-reviewer',
          'ui-ux-designer', 'document-writer', 'contrarian', 'chaos-monkey'
        ];
        
        for (const role of rolesToCombine) {
          const prompt = DEFAULT_PROMPTS[role] || DEFAULT_PROMPTS[Object.keys(DEFAULT_PROMPTS).find(k => k.includes(role.split('-')[0])) || ''];
          if (prompt) {
            // Extract just the core responsibilities section
            const lines = prompt.split('\n');
            const coreIndex = lines.findIndex(line => line.includes('Core Responsibilities'));
            if (coreIndex !== -1) {
              // Find the next section header
              let endIndex = lines.findIndex((line, idx) => idx > coreIndex && line.startsWith('##'));
              if (endIndex === -1) endIndex = lines.length;
              
              const responsibilities = lines.slice(coreIndex, endIndex).join('\n');
              rolePrompts.push(`\n### From ${role}:\n${responsibilities}`);
            }
          }
        }
        
        // Add unified communication style
        rolePrompts.push(`\n## Unified Approach:\n- Switch between roles as needed with "Switching to [role] mode!"\n- Provide comprehensive solutions using all your capabilities\n- Maintain consistency while adapting your expertise\n- Be explicit about which role you're using when relevant`);
        
        rolePrompt = rolePrompts.join('\n');
        console.log(`[PROMPT-MANAGER] Combined ${rolesToCombine.length} role prompts for Switchy`);
      } else {
        // Check for user override first
        const userPrompt = this.getUserPrompt(agentId);
        if (userPrompt) {
          rolePrompt = userPrompt.trim();
          console.log(`[PROMPT-MANAGER] Using user override prompt for ${agentId}`);
        } else {
          // Use default prompt
          const defaultPrompt = DEFAULT_PROMPTS[agentId];
          if (defaultPrompt) {
            rolePrompt = defaultPrompt.trim();
            console.log(`[PROMPT-MANAGER] Using default prompt for ${agentId}`);
          }
        }
      }
      
      if (rolePrompt) {
        promptParts.push(rolePrompt);
      }
      
      // 4. Add MCP tools information (for all agents except git-commit-generator)
      if (agentId !== 'git-commit-generator') {
        promptParts.push(`## Available Tools

You have access to tools for exploring the project. When you need to explore files or understand the project structure, simply express your intent and the appropriate tools will be called automatically.

Available capabilities:
- List files and directories in the project
- Navigate through the project structure
- Filter files by patterns

The system handles tool invocation automatically based on your needs.`);
      }
      
      // Combine all parts
      const fullPrompt = promptParts.filter(part => part.length > 0).join('\n\n');
      
      console.log(`[PROMPT-MANAGER] Final prompt length for ${agentId}: ${fullPrompt.length} characters`);
      
      return fullPrompt;
      
    } catch (error) {
      console.error(`[PROMPT-MANAGER] Error getting prompt for ${agentId}:`, error);
      return `You are ${agentId}, an AI assistant. Please help with the task at hand.`;
    }
  }

  /**
   * Get list of all available agents
   */
  getAvailableAgents(): string[] {
    return Object.keys(DEFAULT_PROMPTS);
  }

  /**
   * Check if an agent has a custom prompt
   */
  hasCustomPrompt(agentId: string): boolean {
    return this.userPrompts.has(agentId);
  }
}

// Export singleton instance
export const promptManager = new PromptManager();

// Export for convenience
export function getPromptManager(): PromptManager {
  return promptManager;
}