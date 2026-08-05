import type { RoutingDecision } from '../router';
import { ExecutionGraph } from './ExecutionGraph';
import type { ExecutionNode } from './ExecutionNode';
import type { ExecutionNodeType } from './ExecutionTypes';

/** Detailed graph plus planning estimates produced from one route. */
export interface ExecutionGraphBuild {
  readonly graph: ExecutionGraph;
  readonly durations: ReadonlyMap<string, number>;
}

interface NodeInput {
  readonly id: string; readonly name: string; readonly capability: string; readonly module: string;
  readonly type: ExecutionNodeType; readonly provider?: string; readonly duration: number; readonly timeout?: number;
  readonly riskLevel?: 'low' | 'medium' | 'high';
}

/** Expands routing capabilities into an explainable, provider-neutral execution graph. */
export class ExecutionGraphBuilder {
  build(decision: RoutingDecision): ExecutionGraphBuild {
    const graph = new ExecutionGraph();
    const durations = new Map<string, number>();
    const add = (input: NodeInput, dependencies: readonly string[] = []): void => {
      const { duration, type, ...step } = input;
      const node: ExecutionNode = { ...step, type, status: 'pending', dependencies, retryPolicy: step.provider ? { attempts: 2, backoffMs: 750 } : undefined };
      graph.addNode(node); durations.set(node.id, duration);
    };

    if (decision.capabilities.includes('virtual-try-on')) {
      add(node('detect-person', 'Analyze Person', 'person-analysis', 'image-pipeline', 'analysis', 6, 'sam3'));
      add(node('prepare-garment', 'Validate and Prepare Garment', 'garment-processing', 'image-pipeline', 'processing', 8), ['detect-person']);
      add(node('generate-mask', 'Generate Person Mask', 'segmentation', 'image-pipeline', 'processing', 5, 'sam3'), ['prepare-garment']);
      add(node('apply-try-on', 'Apply Virtual Try-On', 'virtual-try-on', 'editing-engine', 'generation', 20, 'fashn'), ['generate-mask']);
      add(node('quality-validator', 'Validate Try-On Quality', 'quality-validation', 'image-pipeline', 'validation', 5), ['apply-try-on']);
      add(node('compose-result', 'Compose Result', 'image-composition', 'image-pipeline', 'composition', 4), ['quality-validator']);
    } else if (isHairEdit(decision)) {
      add(node('load-image-context', 'Load Image Context', 'image-context', 'image-pipeline', 'analysis', 2));
      add(node('scene-analysis', 'Analyze Scene Memory', 'scene-memory', 'scene-memory', 'analysis', 3), ['load-image-context']);
      add(node('person-detection', 'Detect Person', 'person-analysis', 'image-pipeline', 'analysis', 4, 'sam3'), ['scene-analysis']);
      add(node('generate-mask', 'Generate Hair Mask', 'segmentation', 'image-pipeline', 'processing', 5, 'sam3'), ['person-detection']);
      add(node('hair-isolation', 'Isolate Hair Region', 'hair-isolation', 'image-pipeline', 'processing', 3), ['generate-mask']);
      add(node('apply-hair-color', 'Apply Hair Color', 'face-editing', 'editing-engine', 'generation', 12, 'reve'), ['hair-isolation']);
      add(node('identity-validation', 'Validate Identity', 'identity-preservation', 'scene-memory', 'validation', 4), ['apply-hair-color']);
      add(node('quality-validator', 'Validate Edit Quality', 'quality-validation', 'image-pipeline', 'validation', 4), ['identity-validation']);
      add(node('compose-result', 'Compose Result', 'image-composition', 'image-pipeline', 'composition', 3), ['quality-validator']);
    } else if (decision.capabilities.includes('background-edit')) {
      add(node('restore-scene', 'Analyze Scene Memory', 'scene-consistency', 'scene-memory', 'analysis', 3));
      add(node('replace-background', 'Replace Background', 'background-edit', 'editing-engine', 'generation', 15, 'reve'), ['restore-scene']);
      add(node('compose-result', 'Compose Result', 'image-composition', 'image-pipeline', 'composition', 4), ['replace-background']);
    } else {
      let previous: string | undefined;
      for (const capability of decision.executionOrder) {
        const id = capability.replace(/[^a-z0-9-]/g, '-');
        add(node(id, humanize(capability), capability, selectModule(capability), inferType(capability), 5, selectProvider(capability, decision.providers)), previous ? [previous] : []);
        previous = id;
      }
    }
    return Object.freeze({ graph, durations });
  }
}

function node(id: string, name: string, capability: string, module: string, type: ExecutionNodeType, duration: number, provider?: string): NodeInput {
  return { id, name, capability, module, type, duration, provider, timeout: provider ? 45000 : undefined, riskLevel: type === 'generation' ? 'medium' : 'low' };
}
function isHairEdit(decision: RoutingDecision): boolean { return decision.evidence.includes('hair-color-edit') || /hair|волос/i.test(decision.request); }
function humanize(value: string): string { return value.split('-').map((part) => part[0]?.toUpperCase() + part.slice(1)).join(' '); }
function inferType(capability: string): ExecutionNodeType { return /analysis|memory/.test(capability) ? 'analysis' : /validation|preservation|consistency/.test(capability) ? 'validation' : /edit|generation|try-on/.test(capability) ? 'generation' : 'processing'; }
function selectModule(capability: string): string { return /memory|preservation|consistency/.test(capability) ? 'scene-memory' : /edit|generation|try-on/.test(capability) ? 'editing-engine' : 'image-pipeline'; }
function selectProvider(capability: string, providers: readonly string[]): string | undefined { return capability === 'virtual-try-on' ? providers.find((id) => id === 'fashn') : /edit/.test(capability) ? providers.find((id) => id === 'reve') : undefined; }
