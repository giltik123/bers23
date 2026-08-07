import { pipelineDeepFreeze } from './PipelineImmutable';
import type { ImageState, PipelineGraphSnapshot, PipelineResources } from './ImagePipelineTypes';

export class PipelineResourcePlanner {
  plan(graph: PipelineGraphSnapshot, image: ImageState, available: Partial<{ cpu: number; gpu: number; ram: number }> = {}): PipelineResources {
    const limits = { cpu: 100, gpu: 100, ram: 1024, ...available };
    const cpu = graph.operations.reduce((sum, item) => sum + item.resources.cpu, 0);
    const gpu = graph.operations.reduce((sum, item) => sum + item.resources.gpu, 0);
    const ram = Math.max(0, ...graph.operations.map((item) => item.resources.ram));
    const imagePixels = image.width * image.height;
    const estimatedMemory = Math.ceil(imagePixels * image.channels * 4 / 1024 / 1024) + ram;
    const estimatedLatency = graph.stages.reduce((sum, stage) => sum + Math.max(0, ...stage.operationIds.map((id) => graph.operations.find((item) => item.id === id)!.resources.latency)), 0);
    const shortages = [...(cpu > limits.cpu ? ['cpu'] : []), ...(gpu > limits.gpu ? ['gpu'] : []), ...(estimatedMemory > limits.ram ? ['ram'] : [])];
    return pipelineDeepFreeze({ cpu, gpu, ram, imagePixels, estimatedMemory, estimatedLatency, feasible: !shortages.length, shortages });
  }
}
