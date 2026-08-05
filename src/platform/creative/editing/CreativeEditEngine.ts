import type { CreativeAccessContext, CreativeCanvas } from '../CreativeTypes';
import type { EditRequest, EditResult } from './CreativeOperation';
import { EditDecisionEngine } from './EditDecisionEngine';
import { OperationCostTracker } from './OperationCostTracker';
import { OperationExecutor } from './OperationExecutor';
import { OperationHistory } from './OperationHistory';

export interface EditCanvasPort {
  getCanvas(context: CreativeAccessContext, canvasId: string): CreativeCanvas;
}

export class CreativeEditEngine {
  readonly historyStore = new OperationHistory();
  private readonly decisionEngine = new EditDecisionEngine();
  private readonly executor: OperationExecutor;
  private readonly costTracker = new OperationCostTracker();

  constructor(private readonly canvasPort: EditCanvasPort, private readonly clock: () => number = Date.now) {
    this.executor = new OperationExecutor(clock);
  }

  apply(request: EditRequest): EditResult {
    const canvas = this.getAuthorizedCanvas(request);
    const decision = this.decisionEngine.decide(request);
    const operation = this.historyStore.record(request.canvasId, this.executor.execute(canvas, request, decision));
    return Object.freeze({ success: true, operation, decision, previewAvailable: decision.mode === 'LOCAL' });
  }

  preview(request: EditRequest) {
    const canvas = this.getAuthorizedCanvas(request);
    const decision = this.decisionEngine.decide(request);
    return Object.freeze({ canvasId: canvas.id, mode: decision.mode, type: decision.type, previewAvailable: decision.mode === 'LOCAL', estimatedCost: decision.estimatedCost, generatedAt: this.clock() });
  }

  undo(request: Pick<EditRequest, 'tenantId' | 'projectId' | 'userId' | 'canvasId'>) {
    this.getAuthorizedCanvas(request);
    return this.historyStore.undo(request.canvasId);
  }

  redo(request: Pick<EditRequest, 'tenantId' | 'projectId' | 'userId' | 'canvasId'>) {
    this.getAuthorizedCanvas(request);
    return this.historyStore.redo(request.canvasId);
  }

  inspect(request: Pick<EditRequest, 'tenantId' | 'projectId' | 'userId' | 'canvasId'>) {
    const canvas = this.getAuthorizedCanvas(request);
    const history = this.history(request);
    return Object.freeze({ canvas, history, cost: this.costTracker.summarize(history) });
  }

  estimateCost(request: EditRequest) { return this.decisionEngine.decide(request); }

  history(request: Pick<EditRequest, 'tenantId' | 'projectId' | 'userId' | 'canvasId'>) {
    this.getAuthorizedCanvas(request);
    return this.historyStore.history(request.canvasId);
  }

  private getAuthorizedCanvas(request: Pick<EditRequest, 'tenantId' | 'projectId' | 'userId' | 'canvasId'>): CreativeCanvas {
    const context = { tenantId: request.tenantId, projectId: request.projectId, userId: request.userId };
    const canvas = this.canvasPort.getCanvas(context, request.canvasId);
    if (canvas.tenantId !== request.tenantId) throw new Error('Tenant access denied');
    if (canvas.projectId !== request.projectId) throw new Error('Project access denied');
    if (canvas.userId !== request.userId) throw new Error('User access denied');
    return canvas;
  }
}
