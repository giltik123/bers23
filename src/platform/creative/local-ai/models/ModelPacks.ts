import { immutableClone } from '../immutable';
import type { ModelPackDefinition } from '../types';

/** Artifact-independent pack definitions; signed manifests supply exact, device-tested model versions. */
export const LOCAL_MODEL_PACKS: readonly ModelPackDefinition[] = immutableClone([
  { id: 'IMAGE_ANALYSIS', family: 'MobileNet/EfficientNet ONNX', capabilities: ['scene-classification', 'quality-assessment', 'image-attributes'], optional: false, artifactKinds: ['ANALYSIS'] },
  { id: 'SEGMENTATION', family: 'MobileSAM/EfficientSAM ONNX', capabilities: ['segmentation', 'mask', 'background-removal'], optional: false, artifactKinds: ['MASK', 'IMAGE'] },
  { id: 'UPSCALE', family: 'Real-ESRGAN ONNX', capabilities: ['upscale'], optional: false, artifactKinds: ['IMAGE'] },
  { id: 'OCR', family: 'PaddleOCR-compatible ONNX', capabilities: ['ocr', 'text-verification'], optional: false, artifactKinds: ['TEXT', 'ANALYSIS'] },
  { id: 'LOCAL_REASONING', family: 'Qwen/Gemma GGUF', capabilities: ['intent-parsing', 'prompt-restructuring', 'operation-extraction', 'explanation', 'creative-planning'], optional: true, artifactKinds: ['TEXT', 'ANALYSIS'] },
]);

export function modelPack(id: ModelPackDefinition['id']): ModelPackDefinition { const pack = LOCAL_MODEL_PACKS.find((item) => item.id === id); if (!pack) throw new Error(`Unknown local model pack: ${id}`); return pack; }
