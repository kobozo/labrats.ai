import { ChatOrchestrator } from './chat-orchestrator';

/**
 * Simple test to verify ChatOrchestrator functionality
 * Run this to test the orchestrator without the full multi-agent system
 */
export function testChatOrchestrator(): void {
  console.log('🧪 Testing ChatOrchestrator...\n');
  
  const orchestrator = new ChatOrchestrator({
    initialGoal: 'Test the orchestrator',
    cooldownMs: 1000,
    maxConsecutiveAgentTurns: 2
  });

  // Listen to system messages
  orchestrator.on('system-message', (msg: any) => {
    console.log(`[SYSTEM] ${msg.content}`);
  });

  orchestrator.on('conversation-ended', (data: any) => {
    console.log(`[CONVERSATION ENDED]`, data);
  });

  console.log('Initial state:');
  console.log(`- Active: ${orchestrator.isActive}`);
  console.log(`- Members: ${orchestrator.currentMembers.join(', ')}`);
  console.log(`- Goal: ${orchestrator.currentGoal}\n`);

  // Test 1: Normal user message
  console.log('Test 1: User message');
  const userMsg = {
    id: '1',
    role: 'user' as const,
    content: 'Hello team!',
    timestamp: new Date(),
    author: 'user',
    audience: ['*']
  };
  const result1 = orchestrator.handle(userMsg);
  console.log(`Result: ${result1}\n`);

  // Test 2: Cortex invites agents
  console.log('Test 2: Cortex invites shiny');
  const cortexInvite = {
    id: '2',
    role: 'assistant' as const,
    content: '@orchestrator invite shiny',
    timestamp: new Date(),
    author: 'cortex',
    audience: ['*']
  };
  const result2 = orchestrator.handle(cortexInvite);
  console.log(`Result: ${result2}`);
  console.log(`Members: ${orchestrator.currentMembers.join(', ')}\n`);

  // Test 3: Agent response
  console.log('Test 3: Shiny responds');
  const shinyMsg = {
    id: '3',
    role: 'assistant' as const,
    content: 'Hello! I\'m here to help with frontend work.',
    timestamp: new Date(),
    author: 'shiny',
    audience: ['*']
  };
  const result3 = orchestrator.handle(shinyMsg);
  console.log(`Result: ${result3}\n`);

  // Test 4: Status check
  console.log('Test 4: Status check');
  const statusMsg = {
    id: '4',
    role: 'assistant' as const,
    content: '@orchestrator status',
    timestamp: new Date(),
    author: 'cortex',
    audience: ['*']
  };
  const result4 = orchestrator.handle(statusMsg);
  console.log(`Result: ${result4}\n`);

  // Test 5: Cooldown test
  console.log('Test 5: Immediate second response from shiny (should be blocked)');
  const shinyMsg2 = {
    id: '5',
    role: 'assistant' as const,
    content: 'Another message from shiny',
    timestamp: new Date(),
    author: 'shiny',
    audience: ['*']
  };
  const result5 = orchestrator.handle(shinyMsg2);
  console.log(`Result: ${result5}\n`);

  // Test 6: End conversation
  console.log('Test 6: End conversation');
  const endMsg = {
    id: '6',
    role: 'assistant' as const,
    content: 'goal: done',
    timestamp: new Date(),
    author: 'cortex',
    audience: ['*']
  };
  const result6 = orchestrator.handle(endMsg);
  console.log(`Result: ${result6}`);
  console.log(`Active: ${orchestrator.isActive}\n`);

  console.log('✅ ChatOrchestrator test completed!');
}

// Test agent cooldown functionality
export function testAgentCooldown(): void {
  console.log('🕒 Testing Agent Cooldown...\n');
  
  const orchestrator = new ChatOrchestrator({
    cooldownMs: 2000, // 2 seconds for testing
    maxConsecutiveAgentTurns: 3
  });

  // Add some agents
  orchestrator.handle({
    id: '1',
    role: 'assistant' as const,
    content: '@orchestrator invite shiny',
    timestamp: new Date(),
    author: 'cortex',
    audience: ['*']
  });

  orchestrator.handle({
    id: '2',
    role: 'assistant' as const,
    content: '@orchestrator invite patchy',
    timestamp: new Date(),
    author: 'cortex',
    audience: ['*']
  });

  // Test cooldown status
  console.log('Cooldown status for shiny:', orchestrator.getAgentCooldownStatus('shiny'));
  console.log('Cooldown status for patchy:', orchestrator.getAgentCooldownStatus('patchy'));

  // Have shiny respond
  orchestrator.handle({
    id: '3',
    role: 'assistant' as const,
    content: 'First message from shiny',
    timestamp: new Date(),
    author: 'shiny',
    audience: ['*']
  });

  console.log('After shiny responds:');
  console.log('Cooldown status for shiny:', orchestrator.getAgentCooldownStatus('shiny'));
  
  // Try immediate second response
  const blocked = orchestrator.handle({
    id: '4',
    role: 'assistant' as const,
    content: 'Second message from shiny (should be blocked)',
    timestamp: new Date(),
    author: 'shiny',
    audience: ['*']
  });
  
  console.log('Immediate second response blocked:', !blocked);
  console.log('✅ Cooldown test completed!');
}

// Export test runner function
export function runAllTests(): void {
  testChatOrchestrator();
  console.log('\n' + '='.repeat(60) + '\n');
  testAgentCooldown();
}