// Import all prompt files for easy access
import agentDecisionPrompt from './agent-decision.prompt';
import goalCompletionPrompt from './goal-completion.prompt';
import codeReviewCriticalPrompt from './code-review-critical.prompt';
import observerInvitationPrompt from './observer-invitation.prompt';
import conversationEndCriticalPrompt from './conversation-end-critical.prompt';
import chatTitleGeneratorPrompt from './chat-title-generator.prompt';
import switchySingleAgentPrompt from './switchy-single-agent.prompt';
import cortexImplementationDetectionPrompt from './cortex-implementation-detection.prompt';
import minimalContinuationPrompt from './minimal-continuation.prompt';
import mentionChatDecisionPrompt from './mention-chat-decision.prompt';
import mentionChatEnhancementPrompt from './mention-chat-enhancement.prompt';
import multiAgentDecisionPrompt from './multi-agent-decision.prompt';
import multiAgentResponseInstructionPrompt from './multi-agent-response-instruction.prompt';
import multiAgentEnhancementPrompt from './multi-agent-enhancement.prompt';
import agentDecisionCriteriaPrompt from './agent-decision-criteria.prompt';
import conversationCompletionPrompt from './conversation-completion.prompt';
import agentRoleReminderPrompt from './agent-role-reminder.prompt';
import progressionWarningPrompt from './progression-warning.prompt';
import codeReviewFeedbackPrompt from './code-review-feedback.prompt';
import bugReportFeedbackPrompt from './bug-report-feedback.prompt';
import testingFeedbackPrompt from './testing-feedback.prompt';
import performanceFeedbackPrompt from './performance-feedback.prompt';
import documentationFeedbackPrompt from './documentation-feedback.prompt';
import userMessageAnalysisPrompt from './user-message-analysis.prompt';
import codeReviewWarningPrompt from './code-review-warning.prompt';
import agentSessionEnhancementPrompt from './agent-session-enhancement.prompt';
import conversationStallPrompt from './conversation-stall.prompt';
import loopDetectionPrompt from './loop-detection.prompt';

// Export all prompts
export const prompts = {
  agentDecision: agentDecisionPrompt,
  goalCompletion: goalCompletionPrompt,
  codeReviewCritical: codeReviewCriticalPrompt,
  observerInvitation: observerInvitationPrompt,
  conversationEndCritical: conversationEndCriticalPrompt,
  chatTitleGenerator: chatTitleGeneratorPrompt,
  switchySingleAgent: switchySingleAgentPrompt,
  cortexImplementationDetection: cortexImplementationDetectionPrompt,
  minimalContinuation: minimalContinuationPrompt,
  mentionChatDecision: mentionChatDecisionPrompt,
  mentionChatEnhancement: mentionChatEnhancementPrompt,
  multiAgentDecision: multiAgentDecisionPrompt,
  multiAgentResponseInstruction: multiAgentResponseInstructionPrompt,
  multiAgentEnhancement: multiAgentEnhancementPrompt,
  agentDecisionCriteria: agentDecisionCriteriaPrompt,
  conversationCompletion: conversationCompletionPrompt,
  agentRoleReminder: agentRoleReminderPrompt,
  progressionWarning: progressionWarningPrompt,
  codeReviewFeedback: codeReviewFeedbackPrompt,
  bugReportFeedback: bugReportFeedbackPrompt,
  testingFeedback: testingFeedbackPrompt,
  performanceFeedback: performanceFeedbackPrompt,
  documentationFeedback: documentationFeedbackPrompt,
  userMessageAnalysis: userMessageAnalysisPrompt,
  codeReviewWarning: codeReviewWarningPrompt,
  agentSessionEnhancement: agentSessionEnhancementPrompt,
  conversationStall: conversationStallPrompt,
  loopDetection: loopDetectionPrompt
};

// Helper function to replace variables in prompts
export function fillPromptTemplate(template: string, variables: Record<string, any>): string {
  let filled = template;
  for (const [key, value] of Object.entries(variables)) {
    const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
    filled = filled.replace(regex, String(value));
  }
  return filled;
}