import type { AICommand } from './AICommand';
import { withCommandStatus } from './AICommand';
import type { CommandContext } from './CommandContext';

export interface CommandWorkflowRecommendation { readonly workflow: string; readonly alternatives?: readonly string[]; readonly confidence?: number; readonly explanation?: string; }
export interface CommandGatewayRequest { readonly userId: string; readonly tenantId: string; readonly projectId: string; readonly prompt: string; readonly imageContext?: Record<string, unknown>; readonly budget?: Record<string, unknown>; readonly preferences?: Record<string, unknown>; readonly metadata?: Record<string, unknown>; }
export interface CommandPlan { readonly command: AICommand; readonly recommendation: CommandWorkflowRecommendation; readonly gatewayRequest: CommandGatewayRequest; }
export interface WorkflowRecommendationProvider { recommend(prompt: string, context: Record<string, unknown>): CommandWorkflowRecommendation; }

export class CommandPlanner {
  constructor(private readonly recommendationProvider?: WorkflowRecommendationProvider) {}

  plan(command: AICommand, context: CommandContext): CommandPlan {
    const recommendation = this.recommendationProvider?.recommend(command.userInput, { command, context }) || { workflow: command.requiredWorkflow || 'image-edit-basic', confidence: command.confidence, alternatives: [], explanation: 'Selected by deterministic command parser.' };
    const planned = withCommandStatus({ ...command, requiredWorkflow: recommendation.workflow, confidence: Math.max(command.confidence, recommendation.confidence || 0) }, 'PLANNED', { recommendation });
    return Object.freeze({
      command: planned,
      recommendation: Object.freeze(recommendation),
      gatewayRequest: Object.freeze({
        userId: context.userId,
        tenantId: context.tenantId,
        projectId: context.projectId,
        prompt: command.userInput,
        imageContext: Object.freeze({ ...(context.input || {}) }),
        budget: Object.freeze({ ...(context.budget || {}) }),
        preferences: Object.freeze({ ...(context.policy || {}), ...(context.preferences || {}) }),
        metadata: Object.freeze({ commandId: command.id, intent: command.intent, requiredCapabilities: command.requiredCapabilities, workflow: recommendation.workflow, ...(context.metadata || {}) }),
      }),
    });
  }
}
