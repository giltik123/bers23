import { FeedbackAnalyzer } from './FeedbackAnalyzer';
import { FeedbackDebugger } from './FeedbackDebugger';
import {
  assertFeedbackAccess,
  createFeedbackId,
  immutable,
  type FeedbackAnalysis,
  type FeedbackDebugSnapshot,
  type FeedbackRecord,
  type FeedbackRequest,
  type FeedbackSecurityScope,
  type MemoryUpdateProposal,
} from './FeedbackModel';
import { LearningSignalProcessor } from './LearningSignalProcessor';
import { MemoryProposalBridge } from './MemoryProposalBridge';

export class FeedbackManager {
  readonly #records = new Map<string, FeedbackRecord>();
  readonly #signals = new LearningSignalProcessor();
  readonly #analyzer = new FeedbackAnalyzer();
  readonly #memory = new MemoryProposalBridge();
  readonly #debugger = new FeedbackDebugger();

  submit(request: FeedbackRequest): FeedbackRecord {
    const createdAt = new Date().toISOString();
    const signals = this.#signals.fromRequest(request);
    const record = immutable({
      id: request.id || createFeedbackId(),
      userId: request.context.userId,
      tenantId: request.context.tenantId,
      projectId: request.context.projectId,
      interactionId: request.context.interactionId,
      experienceId: request.context.experienceId,
      workflowId: request.context.workflowId,
      executionId: request.context.executionId,
      type: request.type,
      rating: request.rating ?? null,
      comment: request.comment || '',
      signals,
      createdAt,
    });

    this.#records.set(record.id, record);
    return record;
  }

  get(id: string, scope: FeedbackSecurityScope): FeedbackRecord {
    const record = this.#records.get(id);

    if (!record) {
      throw new Error('Feedback record not found.');
    }

    assertFeedbackAccess(record, scope);
    return record;
  }

  list(scope: FeedbackSecurityScope): readonly FeedbackRecord[] {
    return immutable([...this.#records.values()].filter((record) => {
      try {
        assertFeedbackAccess(record, scope);
        return true;
      } catch {
        return false;
      }
    }));
  }

  analyze(scope: FeedbackSecurityScope, workflowId?: string): FeedbackAnalysis {
    return this.#analyzer.analyze(this.list(scope), workflowId);
  }

  inspect(id: string, scope: FeedbackSecurityScope): FeedbackRecord {
    return this.get(id, scope);
  }

  debug(id: string, scope: FeedbackSecurityScope): FeedbackDebugSnapshot {
    const record = this.get(id, scope);
    const records = this.list(scope).filter((candidate) => candidate.workflowId === record.workflowId);
    const analysis = this.#analyzer.analyze(records, record.workflowId);
    const proposals = this.#memory.propose(records, analysis);

    return this.#debugger.snapshot(record, proposals);
  }

  memoryProposals(scope: FeedbackSecurityScope, workflowId?: string): readonly MemoryUpdateProposal[] {
    const records = workflowId ? this.list(scope).filter((record) => record.workflowId === workflowId) : this.list(scope);
    return this.#memory.propose(records, this.#analyzer.analyze(records, workflowId));
  }
}
