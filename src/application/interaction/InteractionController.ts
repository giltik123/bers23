import { InteractionDebugger } from './InteractionDebugger';
import { InteractionHistory } from './InteractionHistory';
import {
  assertInteractionAccess,
  createInteractionResponseId,
  immutable,
  type InteractionAction,
  type InteractionContext,
  type InteractionDebugTree,
  type InteractionRequest,
  type InteractionResponse,
  type InteractionSecurityScope,
  type InteractionSuggestion,
} from './InteractionModel';
import { SuggestionEngine } from './SuggestionEngine';

export interface InteractionStatePort {
  update(id: string, update: Readonly<Record<string, unknown>>, scope: InteractionSecurityScope): unknown;
  transition(id: string, status: string, scope: InteractionSecurityScope): unknown;
  requestDecision(id: string, reason: string, scope: InteractionSecurityScope, metadata?: Readonly<Record<string, unknown>>): { readonly id: string };
  approveDecision(id: string, decisionId: string, scope: InteractionSecurityScope): unknown;
  rejectDecision(id: string, decisionId: string, scope: InteractionSecurityScope): unknown;
  load(id: string, scope: InteractionSecurityScope): unknown;
}

export interface InteractionControllerOptions {
  readonly state?: InteractionStatePort;
  readonly suggestions?: SuggestionEngine;
}

export class InteractionController {
  readonly #requests = new Map<string, InteractionRequest>();
  readonly #responses = new Map<string, InteractionResponse>();
  readonly #undoStack = new Map<string, InteractionResponse[]>();
  readonly #redoStack = new Map<string, InteractionResponse[]>();
  readonly #history = new InteractionHistory();
  readonly #debugger = new InteractionDebugger();
  readonly #suggestions: SuggestionEngine;
  readonly #state?: InteractionStatePort;

  constructor(options: InteractionControllerOptions = {}) {
    this.#state = options.state;
    this.#suggestions = options.suggestions || new SuggestionEngine();
  }

  receive(request: InteractionRequest): InteractionResponse {
    const frozenRequest = immutable({
      ...request,
      payload: { ...request.payload },
      metadata: { ...request.metadata },
      currentState: { ...request.currentState },
    });
    this.#requests.set(request.id, frozenRequest);
    this.#history.record(request.id, 'interaction.received', { type: request.type });

    const response = this.#response(request, 'RECEIVED', {
      message: 'Действие пользователя получено.',
      executionStatus: request.currentState.status || 'received',
    });
    this.#responses.set(request.id, response);

    return response;
  }

  process(requestId: string, scope: InteractionSecurityScope, context: InteractionContext): InteractionResponse {
    const request = this.#secureRequest(requestId, scope);
    this.#history.record(request.id, 'interaction.started', { type: request.type });

    const intent = this.#detectIntent(request);
    const workflow = this.#selectWorkflow(request);

    if (request.type === 'UNDO') {
      return this.#undo(request, intent, workflow);
    }

    if (request.type === 'REDO') {
      return this.#redo(request, intent, workflow);
    }

    if (this.#requiresDecision(request)) {
      const decision = this.#state?.requestDecision(request.currentState.id, `Confirm ${intent}`, scope, {
        interactionId: request.id,
        workflow,
      });
      this.#history.record(request.id, 'interaction.waiting_user', { decisionId: decision?.id || 'local-decision' });
      return this.#storeResponse(request, 'WAITING_USER', {
        detectedIntent: intent,
        selectedWorkflow: workflow,
        requiredDecisions: [decision?.id || 'local-decision'],
        executionStatus: 'WAITING_USER',
        message: 'Требуется подтверждение пользователя перед продолжением.',
        suggestions: this.#suggestions.suggest(context, request.type),
      });
    }

    this.#state?.update(request.currentState.id, {
      currentCommand: request.id,
      currentWorkflow: workflow,
      currentExecution: `${workflow || 'interaction'}:${request.id}`,
      activeAssets: request.currentState.activeAssets || [],
      progress: { step: 'interaction.processed', percent: 100 },
    }, scope);
    this.#history.record(request.id, 'interaction.completed', { workflow });

    return this.#storeResponse(request, 'COMPLETED', {
      detectedIntent: intent,
      selectedWorkflow: workflow,
      executionStatus: 'COMPLETED',
      result: { workflow, action: request.type },
      message: 'Готово.',
      suggestions: this.#suggestions.suggest(context, request.type),
    });
  }

  suggest(context: InteractionContext, completedAction?: InteractionAction): readonly InteractionSuggestion[] {
    return this.#suggestions.suggest(context, completedAction);
  }

  confirm(requestId: string, decisionId: string, scope: InteractionSecurityScope, context: InteractionContext): InteractionResponse {
    const request = this.#secureRequest(requestId, scope);
    this.#state?.approveDecision(request.currentState.id, decisionId, scope);
    this.#state?.transition(request.currentState.id, 'PROCESSING', scope);
    this.#history.record(request.id, 'interaction.confirmed', { decisionId });

    return this.continue(requestId, scope, context, 'Подтверждено. Выполнение продолжено.');
  }

  reject(requestId: string, decisionId: string, scope: InteractionSecurityScope): InteractionResponse {
    const request = this.#secureRequest(requestId, scope);
    this.#state?.rejectDecision(request.currentState.id, decisionId, scope);
    this.#history.record(request.id, 'interaction.rejected', { decisionId });

    return this.#storeResponse(request, 'REJECTED', {
      detectedIntent: this.#detectIntent(request),
      selectedWorkflow: this.#selectWorkflow(request),
      requiredDecisions: [],
      executionStatus: 'REJECTED',
      message: 'Действие отклонено пользователем.',
    });
  }

  continue(
    requestId: string,
    scope: InteractionSecurityScope,
    context: InteractionContext,
    message = 'Выполнение продолжено.',
  ): InteractionResponse {
    const request = this.#secureRequest(requestId, scope);
    const intent = this.#detectIntent(request);
    const workflow = this.#selectWorkflow(request);

    this.#state?.update(request.currentState.id, {
      currentCommand: request.id,
      currentWorkflow: workflow,
      currentExecution: request.currentState.currentExecution || `${workflow || 'interaction'}:${request.id}`,
      progress: { step: 'interaction.continued', percent: 75 },
    }, scope);
    this.#history.record(request.id, 'interaction.completed', { workflow, continued: true });

    return this.#storeResponse(request, 'PROCESSING', {
      detectedIntent: intent,
      selectedWorkflow: workflow,
      executionStatus: 'PROCESSING',
      result: { workflow, continued: true },
      message,
      suggestions: this.#suggestions.suggest(context, request.type),
    });
  }

  inspect(requestId: string, scope: InteractionSecurityScope): InteractionResponse {
    this.#secureRequest(requestId, scope);
    const response = this.#responses.get(requestId);

    if (!response) {
      throw new Error('Interaction response not found.');
    }

    return response;
  }

  debug(requestId: string, scope: InteractionSecurityScope): InteractionDebugTree {
    const request = this.#secureRequest(requestId, scope);
    const response = this.inspect(requestId, scope);
    return this.#debugger.explain(request, response);
  }

  history(requestId: string, scope: InteractionSecurityScope) {
    this.#secureRequest(requestId, scope);
    return this.#history.snapshot(requestId);
  }

  #undo(request: InteractionRequest, intent: string, workflow: string | null): InteractionResponse {
    const stack = this.#undoStack.get(request.currentState.id) || [];
    const current = this.#responses.get(request.id);

    if (current) {
      this.#redoStack.set(request.currentState.id, [...(this.#redoStack.get(request.currentState.id) || []), current]);
    }

    const previous = stack.at(-1) || null;
    this.#history.record(request.id, 'interaction.completed', { undo: true });

    return this.#storeResponse(request, 'COMPLETED', {
      detectedIntent: intent,
      selectedWorkflow: workflow,
      executionStatus: 'UNDO_COMPLETED',
      result: { restoredResponseId: previous?.id || null },
      message: 'Предыдущее действие восстановлено.',
    }, false);
  }

  #redo(request: InteractionRequest, intent: string, workflow: string | null): InteractionResponse {
    const stack = this.#redoStack.get(request.currentState.id) || [];
    const restored = stack.at(-1) || null;
    this.#history.record(request.id, 'interaction.completed', { redo: true });

    return this.#storeResponse(request, 'COMPLETED', {
      detectedIntent: intent,
      selectedWorkflow: workflow,
      executionStatus: 'REDO_COMPLETED',
      result: { restoredResponseId: restored?.id || null },
      message: 'Действие повторено.',
    }, false);
  }

  #storeResponse(
    request: InteractionRequest,
    status: InteractionResponse['status'],
    partial: Partial<InteractionResponse>,
    pushUndo = true,
  ): InteractionResponse {
    const response = this.#response(request, status, partial);
    const previous = this.#responses.get(request.id);

    if (pushUndo && previous) {
      this.#undoStack.set(request.currentState.id, [...(this.#undoStack.get(request.currentState.id) || []), previous]);
      this.#redoStack.set(request.currentState.id, []);
    }

    this.#responses.set(request.id, response);
    return response;
  }

  #response(request: InteractionRequest, status: InteractionResponse['status'], partial: Partial<InteractionResponse>): InteractionResponse {
    return immutable({
      id: createInteractionResponseId(),
      requestId: request.id,
      status,
      action: request.type,
      detectedIntent: partial.detectedIntent || 'unknown',
      selectedWorkflow: partial.selectedWorkflow ?? null,
      requiredDecisions: partial.requiredDecisions || [],
      executionStatus: partial.executionStatus || status,
      result: partial.result ?? null,
      suggestions: partial.suggestions || [],
      message: partial.message || '',
      createdAt: new Date().toISOString(),
    });
  }

  #secureRequest(requestId: string, scope: InteractionSecurityScope): InteractionRequest {
    const request = this.#requests.get(requestId);

    if (!request) {
      throw new Error('Interaction request not found.');
    }

    assertInteractionAccess(request, scope);
    return request;
  }

  #requiresDecision(request: InteractionRequest): boolean {
    if (request.type === 'APPROVE' || request.type === 'REJECT' || request.type === 'REVIEW_RESULT') {
      return false;
    }

    return Boolean(request.metadata.requiresConfirmation || request.payload.requiresConfirmation);
  }

  #detectIntent(request: InteractionRequest): string {
    const prompt = String(request.payload.prompt || request.payload.text || '').toLowerCase();

    if (request.type === 'TRY_ON' || prompt.includes('одеж') || prompt.includes('clothes')) return 'try_on_edit';
    if (request.type === 'CHANGE_BACKGROUND' || prompt.includes('фон') || prompt.includes('background')) return 'background_change';
    if (request.type === 'CHANGE_STYLE' || prompt.includes('стиль') || prompt.includes('style')) return 'style_change';
    if (request.type === 'CREATE_IMAGE') return 'image_creation';
    if (request.type === 'EDIT_IMAGE') return 'image_edit';
    if (request.type === 'APPROVE') return 'approve_decision';
    if (request.type === 'REJECT') return 'reject_decision';
    if (request.type === 'UNDO') return 'undo';
    if (request.type === 'REDO') return 'redo';

    return 'interaction';
  }

  #selectWorkflow(request: InteractionRequest): string | null {
    const intent = this.#detectIntent(request);

    if (intent === 'try_on_edit') return 'try-on';
    if (intent === 'background_change') return 'background-replacement';
    if (intent === 'style_change') return 'style-transfer';
    if (intent === 'image_creation') return 'image-generation';
    if (intent === 'image_edit') return 'image-editing';

    return request.currentState.currentWorkflow || null;
  }
}
