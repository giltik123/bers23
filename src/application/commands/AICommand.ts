export type AICommandIntent = 'fashion_catalog_image' | 'hair_color_change' | 'background_replacement' | 'portrait_enhancement' | 'style_transfer' | 'artistic_edit' | 'generic_edit' | 'identity_transformation' | 'unknown';
export type AICommandStatus = 'PARSED' | 'VALIDATED' | 'CLARIFICATION_REQUIRED' | 'CONFIRMATION_REQUIRED' | 'PLANNED' | 'EXECUTING' | 'COMPLETED' | 'FAILED';

export interface AICommandEntity { readonly type: string; readonly value: string; readonly confidence: number; }

export interface AICommand {
  readonly id: string;
  readonly userInput: string;
  readonly intent: AICommandIntent;
  readonly entities: readonly AICommandEntity[];
  readonly requiredCapabilities: readonly string[];
  readonly requiredWorkflow: string | null;
  readonly confidence: number;
  readonly status: AICommandStatus;
  readonly metadata?: Record<string, unknown>;
}

export const createCommandId = () => `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const withCommandStatus = (command: AICommand, status: AICommandStatus, metadata: Record<string, unknown> = {}): AICommand => Object.freeze({ ...command, status, metadata: Object.freeze({ ...(command.metadata || {}), ...metadata }) });
