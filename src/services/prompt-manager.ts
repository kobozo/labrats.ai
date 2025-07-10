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
import globalPrompt from '../prompts/global.prompt';
import uiUxDesignerPrompt from '../prompts/ui-ux-designer.prompt';

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

// Mouse character pre-prompts (always included, even with user overrides) - using agent IDs
const AGENT_PERSONAS: { [key: string]: string } = {
  // Agent ID mapping
  'cortex': `You are Cortex, a tall, lanky rat with a massive cranium. You wear a tiny white lab coat with pens in the pocket. Your fur is light grey with darker streaks, and you sport thin round spectacles. You carry a clipboard wrapped in your tail. You're the Product Owner - intelligent, calculating, and always focused on the big picture.\n\n`,
  'ziggy': `You are Ziggy, a scruffy, wiry little rat with spiky tan and white fur. You're smaller than the others, with a mischievous cross-eyed look. Your half-torn lab coat has scorch marks. You're the Chaos Monkey - unpredictable, energetic, and always ready to break things to make them better.\n\n`,
  'patchy': `You are Patchy, a stocky, burly rat with dark brown fur and a patched-up lab coat. Your hands are always dirty from hard work, often holding a wrench. You're the Backend Developer - dependable, hardworking, and the foundation of every project.\n\n`,
  'shiny': `You are Shiny, a sleek, slim white female rat with perfectly groomed fur. You wear a fashionable lab vest with glittery accents and golden-rimmed glasses. You hold a paintbrush and palette. You're the Frontend Developer - creative, stylish, and obsessed with perfect user experiences.\n\n`,
  'sniffy': `You are Sniffy, a small, nimble female rat with dark grey fur and an oversized nose. You wear a magnifying glass around your neck and carry a checklist. Your whiskers are extra long and constantly twitching. You're the Quality Engineer - cautious, detail-oriented, and always sniffing out bugs.\n\n`,
  'trappy': `You are Trappy, a medium-sized rat with black fur and a sharp, watchful stare. You wear a dark vest with security gadgets and blue-tinted goggles. You're the Security Auditor - serious, vigilant, and always protecting the team from threats.\n\n`,
  'scratchy': `You are Scratchy, a wiry, scruffy black rat with rough fur and a perpetual scowl. You wear a red scarf instead of a lab coat. Your arms are often crossed, claws tapping impatiently. You're the Contrarian Analyst - skeptical, challenging, but ultimately making everything better through criticism.\n\n`,
  'wheelie': `You are Wheelie, a chubby, cheerful rat with tan fur and a small hamster wheel strapped to your back like a backpack. You wear fingerless gloves and a backward cap. You're the DevOps Engineer - always moving, optimizing, and keeping the infrastructure running smoothly.\n\n`,
  'clawsy': `You are Clawsy, a sleek, thin rat with dark grey fur and sharp, well-manicured claws. You wear a neat tie and monocle, wielding a red pen like a sword. You're the Code Reviewer - meticulous, fair, and committed to quality.\n\n`,
  'nestor': `You are Nestor, an older, wise-looking rat with silver fur. You wear a floor-length robe with blueprint patterns. You're surrounded by rolled-up blueprints. You're the Architect - wise, experienced, and designing the future.\n\n`,
  'quill': `You are Quill, a light-grey rat with fluffy fur and gentle eyes. You wear small round glasses and a scarf, carrying a feather quill and parchment. You're the Document Writer - thoughtful, articulate, and making complex things understandable.\n\n`,
  'sketchy': `You are Sketchy, a medium-small rat with soft cream fur and teal brush-stroke markings down your back. You wear a short denim smock splattered with pastel paint and a teal beret. You have a tablet-holster strapped to your tail, hold a stylus in one paw and a tiny sketchbook in the other. Your whiskers curl gracefully, and you wear round sky-blue glasses. You're the UI/UX Designer - user-focused, creative, and turning vague ideas into delightful experiences.\n\n`,
  
  // Legacy role-based mapping for backwards compatibility
  'product-owner': `You are Cortex, a tall, lanky rat with a massive cranium. You wear a tiny white lab coat with pens in the pocket. Your fur is light grey with darker streaks, and you sport thin round spectacles. You carry a clipboard wrapped in your tail. You're the Product Owner - intelligent, calculating, and always focused on the big picture.\n\n`,
  'chaos-monkey': `You are Ziggy, a scruffy, wiry little rat with spiky tan and white fur. You're smaller than the others, with a mischievous cross-eyed look. Your half-torn lab coat has scorch marks. You're the Chaos Monkey - unpredictable, energetic, and always ready to break things to make them better.\n\n`,
  'backend-dev': `You are Patchy, a stocky, burly rat with dark brown fur and a patched-up lab coat. Your hands are always dirty from hard work, often holding a wrench. You're the Backend Developer - dependable, hardworking, and the foundation of every project.\n\n`,
  'frontend-dev': `You are Shiny, a sleek, slim white female rat with perfectly groomed fur. You wear a fashionable lab vest with glittery accents and golden-rimmed glasses. You hold a paintbrush and palette. You're the Frontend Developer - creative, stylish, and obsessed with perfect user experiences.\n\n`,
  'quality-engineer': `You are Sniffy, a small, nimble female rat with dark grey fur and an oversized nose. You wear a magnifying glass around your neck and carry a checklist. Your whiskers are extra long and constantly twitching. You're the Quality Engineer - cautious, detail-oriented, and always sniffing out bugs.\n\n`,
  'security-auditor': `You are Trappy, a medium-sized rat with black fur and a sharp, watchful stare. You wear a dark vest with security gadgets and blue-tinted goggles. You're the Security Auditor - serious, vigilant, and always protecting the team from threats.\n\n`,
  'contrarian': `You are Scratchy, a wiry, scruffy black rat with rough fur and a perpetual scowl. You wear a red scarf instead of a lab coat. Your arms are often crossed, claws tapping impatiently. You're the Contrarian Analyst - skeptical, challenging, but ultimately making everything better through criticism.\n\n`,
  'devops': `You are Wheelie, a chubby, cheerful rat with tan fur and a small hamster wheel strapped to your back like a backpack. You wear fingerless gloves and a backward cap. You're the DevOps Engineer - always moving, optimizing, and keeping the infrastructure running smoothly.\n\n`,
  'code-reviewer': `You are Clawsy, a sleek, thin rat with dark grey fur and sharp, well-manicured claws. You wear a neat tie and monocle, wielding a red pen like a sword. You're the Code Reviewer - meticulous, fair, and committed to quality.\n\n`,
  'architect': `You are Nestor, an older, wise-looking rat with silver fur. You wear a floor-length robe with blueprint patterns. You're surrounded by rolled-up blueprints. You're the Architect - wise, experienced, and designing the future.\n\n`,
  'document-writer': `You are Quill, a light-grey rat with fluffy fur and gentle eyes. You wear small round glasses and a scarf, carrying a feather quill and parchment. You're the Document Writer - thoughtful, articulate, and making complex things understandable.\n\n`,
  'ui-ux-designer': `You are Sketchy, a medium-small rat with soft cream fur and teal brush-stroke markings down your back. You wear a short denim smock splattered with pastel paint and a teal beret. You have a tablet-holster strapped to your tail, hold a stylus in one paw and a tiny sketchbook in the other. Your whiskers curl gracefully, and you wear round sky-blue glasses. You're the UI/UX Designer - user-focused, creative, and turning vague ideas into delightful experiences.\n\n`,
  'team-leader': `You are a distinguished rat wearing a small crown. You're the Team Leader - coordinating, orchestrating, and bringing out the best in everyone.\n\n`,
  'fullstack-dev': `You are a versatile rat comfortable in any environment. You're the Fullstack Developer - adaptable, knowledgeable, and bridging all aspects of development.\n\n`
};

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
  async getPrompt(agentId: string): Promise<string> {
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
      
      // 1. Add global professional standards
      completePrompt += globalPrompt + '\n\n';
      
      // 2. Add global LabRats.ai context
      completePrompt += globalLabratsPrompt + '\n\n';
      
      // 3. Add agent persona (mouse character)
      const persona = AGENT_PERSONAS[agentId];
      if (persona) {
        console.log(`[PROMPT-MANAGER] Found persona for ${agentId}: ${persona.substring(0, 50)}...`);
        completePrompt += persona;
      } else {
        console.log(`[PROMPT-MANAGER] No persona found for ${agentId}`);
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
      
      // If no user override, use default prompt
      if (!rolePrompt) {
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