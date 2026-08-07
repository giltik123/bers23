import { pipelineClamp, pipelineDeepFreeze } from './PipelineImmutable';
import type { ImageState, PipelineDependencies, PipelineGraphSnapshot, PipelineSimulationResult } from './ImagePipelineTypes';

export class PipelineSimulation {
  constructor(private readonly dependencies: PipelineDependencies) {}

  simulate(graph: PipelineGraphSnapshot, initial: ImageState): PipelineSimulationResult {
    const states: ImageState[] = [initial];
    let quality = initial.estimatedQuality;
    let size = initial.estimatedFileSize;
    for (const operationId of graph.stages.slice().sort((a, b) => a.order - b.order).flatMap((stage) => stage.operationIds)) {
      const operation = graph.operations.find((item) => item.id === operationId)!;
      quality = pipelineClamp(quality + (operation.capability === 'ai' ? 0.03 : operation.capability === 'gpu' ? 0.02 : 0.01));
      size = Math.max(1, Math.round(size * (operation.implementation.includes('encode') ? 0.75 : operation.implementation === 'upscale' ? 2 : 1)));
      states.push(pipelineDeepFreeze({ ...states.at(-1)!, id: this.dependencies.id(), estimatedQuality: quality, estimatedFileSize: size, generation: states.at(-1)!.generation + 1, parentId: states.at(-1)!.id, metadata: { ...states.at(-1)!.metadata, lastPipelineOperation: operation.implementation }, createdAt: this.dependencies.now() }) as ImageState);
    }
    const latency = graph.stages.reduce((sum, stage) => sum + Math.max(0, ...stage.operationIds.map((id) => graph.operations.find((item) => item.id === id)!.resources.latency)), 0);
    const memory = Math.max(0, ...graph.operations.map((item) => item.resources.ram));
    const credits = graph.operations.reduce((sum, item) => sum + item.resources.credits, 0);
    return pipelineDeepFreeze({ latency, memory, credits, expectedQuality: quality, expectedSize: size, finalState: states.at(-1)!, states });
  }
}
