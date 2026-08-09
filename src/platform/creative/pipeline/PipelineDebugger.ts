import { pipelineDeepFreeze } from './PipelineImmutable';
import type { PipelineDebugSnapshot, PipelineSnapshot } from './ImagePipelineTypes';

export class PipelineDebugger {
  debug(snapshot: PipelineSnapshot): PipelineDebugSnapshot {
    return pipelineDeepFreeze({
      workflowId: snapshot.workflow.id,
      pipelineId: snapshot.graph.id,
      operations: snapshot.graph.operations.map((item) => `${item.operation} → ${item.implementation}`),
      resources: snapshot.resources,
      verification: snapshot.verification,
      recovery: snapshot.recovery,
      metrics: snapshot.metrics,
      snapshotId: snapshot.id,
    });
  }
}
