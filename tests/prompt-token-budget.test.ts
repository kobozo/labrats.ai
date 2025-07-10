import { getPromptManager } from '../services/prompt-manager';
import { agents } from '../config/agents';

// Simple token estimation: split by spaces and punctuation
function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters or 0.75 words
  // Using a more conservative estimate for safety
  return Math.ceil(text.length / 3.5);
}

describe('Prompt Token Budget Tests', () => {
  let promptManager: ReturnType<typeof getPromptManager>;
  
  beforeAll(() => {
    promptManager = getPromptManager();
  });

  describe('Compact Mode Token Limits', () => {
    const MAX_TOKENS_COMPACT = 900; // Target for compact mode
    
    test.each(agents)('$name prompt should be under ${MAX_TOKENS_COMPACT} tokens in compact mode', async (agent) => {
      const prompt = await promptManager.getPrompt(agent.id, true);
      const tokenCount = estimateTokens(prompt);
      
      console.log(`${agent.name} (compact): ~${tokenCount} tokens`);
      
      expect(tokenCount).toBeLessThan(MAX_TOKENS_COMPACT);
    });
  });

  describe('Full Mode Token Limits', () => {
    const MAX_TOKENS_FULL = 2000; // Reasonable limit for full mode
    
    test.each(agents)('$name prompt should be under ${MAX_TOKENS_FULL} tokens in full mode', async (agent) => {
      const prompt = await promptManager.getPrompt(agent.id, false);
      const tokenCount = estimateTokens(prompt);
      
      console.log(`${agent.name} (full): ~${tokenCount} tokens`);
      
      expect(tokenCount).toBeLessThan(MAX_TOKENS_FULL);
    });
  });

  describe('Individual Component Limits', () => {
    test('Agent summaries should be concise', () => {
      agents.forEach(agent => {
        if (agent.summary) {
          const wordCount = agent.summary.split(/\s+/).length;
          expect(wordCount).toBeLessThanOrEqual(30);
        }
      });
    });
  });

  describe('Token Distribution Analysis', () => {
    test('Should log token distribution for optimization', async () => {
      console.log('\n=== Token Distribution Analysis ===\n');
      
      let totalCompact = 0;
      let totalFull = 0;
      
      for (const agent of agents) {
        const compactPrompt = await promptManager.getPrompt(agent.id, true);
        const fullPrompt = await promptManager.getPrompt(agent.id, false);
        
        const compactTokens = estimateTokens(compactPrompt);
        const fullTokens = estimateTokens(fullPrompt);
        
        totalCompact += compactTokens;
        totalFull += fullTokens;
        
        const savings = Math.round(((fullTokens - compactTokens) / fullTokens) * 100);
        
        console.log(`${agent.name.padEnd(15)} | Compact: ${compactTokens.toString().padStart(4)} | Full: ${fullTokens.toString().padStart(4)} | Savings: ${savings}%`);
      }
      
      const avgCompact = Math.round(totalCompact / agents.length);
      const avgFull = Math.round(totalFull / agents.length);
      const avgSavings = Math.round(((avgFull - avgCompact) / avgFull) * 100);
      
      console.log('\n' + '='.repeat(60));
      console.log(`${'AVERAGE'.padEnd(15)} | Compact: ${avgCompact.toString().padStart(4)} | Full: ${avgFull.toString().padStart(4)} | Savings: ${avgSavings}%`);
      console.log('='.repeat(60) + '\n');
      
      // Ensure we're achieving meaningful token savings
      expect(avgSavings).toBeGreaterThan(30); // At least 30% savings in compact mode
    });
  });
});

// Export for use in other tests
export { estimateTokens };