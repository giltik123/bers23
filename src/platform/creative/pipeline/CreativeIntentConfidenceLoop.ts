import { CreativePipelinePlanner } from './CreativePipelinePlanner';
import type { IntentConfidenceDecision } from './types';

export class CreativeIntentConfidenceLoop {
  decide(prompt: string, confidence?: number): IntentConfidenceDecision {
    const pipeline = new CreativePipelinePlanner().plan(prompt);
    const resolvedConfidence = confidence ?? this.estimate(prompt, pipeline.confidence);
    if (resolvedConfidence > 0.85) return { confidence: resolvedConfidence, action: 'EXECUTE', recommendedPipeline: pipeline, clarificationOptions: [], message: 'Intent is clear enough to execute the recommended pipeline.' };
    const clarificationOptions = ['Luxury brand style — мягкий свет + цветокоррекция', 'Studio catalog — чистый фон + профессиональная обработка', 'Cinematic — глубокие тени и атмосферный стиль'];
    return { confidence: resolvedConfidence, action: 'ASK_CLARIFICATION', clarificationOptions, message: `Я могу сделать несколько направлений. Выберите: ${clarificationOptions.join(' | ')}` };
  }

  private estimate(prompt: string, pipelineConfidence: number): number {
    return /(красиво|дороже|лучше)$/i.test(prompt.trim().toLowerCase()) ? Math.min(0.74, pipelineConfidence) : pipelineConfidence;
  }
}
