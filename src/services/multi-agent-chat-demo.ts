import { getMultiAgentChatService } from './multi-agent-chat-service';

/**
 * Demo script for testing multi-agent chat functionality
 * This can be used to test the orchestrator without the UI
 */
export class MultiAgentChatDemo {
  private chatService = getMultiAgentChatService({
    initialGoal: 'Build a user authentication system',
    cooldownMs: 5000, // Shorter cooldown for demo
    maxConsecutiveAgentTurns: 3
  });

  private demoMessages = [
    'I need to build a user authentication system for a web application',
    'The system should support email/password login and JWT tokens',
    'We also need password reset functionality',
    'Security is important - please ensure best practices',
    'How should we handle user sessions?',
    'What about rate limiting for login attempts?',
    'goal: done'
  ];

  async runDemo(): Promise<void> {
    console.log('🚀 Starting Multi-Agent Chat Demo...\n');

    // Set up event listeners
    this.chatService.on('message', (message: any) => {
      const author = message.author === 'user' ? 'User' : 
                    message.author === 'system' ? 'System' :
                    message.author;
      
      console.log(`[${author}]: ${message.content}\n`);
    });

    this.chatService.on('conversation-ended', (data: any) => {
      console.log('✅ Conversation ended:', data);
    });

    // Start the conversation
    await this.chatService.startConversation(this.demoMessages[0]);

    // Send additional messages with delays
    for (let i = 1; i < this.demoMessages.length; i++) {
      await this.delay(3000); // Wait 3 seconds between messages
      console.log(`\n--- Sending message ${i + 1} ---\n`);
      await this.chatService.sendMessage(this.demoMessages[i]);
    }

    // Wait a bit for final processing
    await this.delay(5000);
    console.log('\n🎉 Demo completed!');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Manual orchestrator commands for testing
  async testOrchestratorCommands(): Promise<void> {
    console.log('🔧 Testing Orchestrator Commands...\n');

    // Start conversation
    await this.chatService.startConversation('Let\'s test the orchestrator');

    // Test invite command
    await this.chatService.sendMessage('@orchestrator invite shiny', 'cortex');
    await this.delay(1000);

    // Test status command
    await this.chatService.sendMessage('@orchestrator status', 'cortex');
    await this.delay(1000);

    // Test invite another agent
    await this.chatService.sendMessage('@orchestrator invite patchy', 'cortex');
    await this.delay(1000);

    // Test remove command
    await this.chatService.sendMessage('@orchestrator remove shiny', 'cortex');
    await this.delay(1000);

    // Test end command
    await this.chatService.sendMessage('@orchestrator end', 'cortex');
    await this.delay(1000);

    console.log('\n✅ Orchestrator commands tested!');
  }

  async testCooldownAndLimits(): Promise<void> {
    console.log('⏰ Testing Cooldown and Limits...\n');

    // Create service with very short cooldown for testing
    const testService = getMultiAgentChatService({
      initialGoal: 'Test cooldown mechanisms',
      cooldownMs: 1000, // 1 second cooldown
      maxConsecutiveAgentTurns: 2
    });

    testService.on('message', (message: any) => {
      console.log(`[${message.author}]: ${message.content}`);
    });

    // Start conversation and invite multiple agents
    await testService.startConversation('Test rapid responses');
    await testService.sendMessage('@orchestrator invite shiny', 'cortex');
    await testService.sendMessage('@orchestrator invite patchy', 'cortex');
    await testService.sendMessage('@orchestrator invite sniffy', 'cortex');

    // Try to trigger rapid responses
    await testService.sendMessage('This should trigger multiple agents rapidly');
    await this.delay(500);
    await testService.sendMessage('Another message to test cooldown');
    await this.delay(500);
    await testService.sendMessage('And another one');

    // Wait for cooldown to expire and test again
    await this.delay(2000);
    await testService.sendMessage('This should work after cooldown');

    await this.delay(3000);
    console.log('\n✅ Cooldown and limits tested!');
  }
}

// Export function to run demos
export async function runMultiAgentDemo(): Promise<void> {
  const demo = new MultiAgentChatDemo();
  
  console.log('='.repeat(60));
  console.log('  MULTI-AGENT CHAT SYSTEM DEMO');
  console.log('='.repeat(60));
  
  try {
    await demo.runDemo();
  } catch (error) {
    console.error('Demo failed:', error);
  }
}

export async function runOrchestratorDemo(): Promise<void> {
  const demo = new MultiAgentChatDemo();
  
  console.log('='.repeat(60));
  console.log('  ORCHESTRATOR COMMANDS DEMO');
  console.log('='.repeat(60));
  
  try {
    await demo.testOrchestratorCommands();
  } catch (error) {
    console.error('Orchestrator demo failed:', error);
  }
}

export async function runCooldownDemo(): Promise<void> {
  const demo = new MultiAgentChatDemo();
  
  console.log('='.repeat(60));
  console.log('  COOLDOWN AND LIMITS DEMO');
  console.log('='.repeat(60));
  
  try {
    await demo.testCooldownAndLimits();
  } catch (error) {
    console.error('Cooldown demo failed:', error);
  }
}