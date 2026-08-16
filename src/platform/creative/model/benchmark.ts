import { immutable } from './immutable';
import type { DecisionContext } from './types';
export const BENCHMARK_CATEGORIES = immutable(['Luxury', 'Portrait', 'Catalog', 'Fashion', 'Upscale', 'Background', 'Generative Edit', 'Try-On', 'Repair', 'Minimal Edit'] as const);
export const DECISION_BENCHMARK_V1 = immutable(BENCHMARK_CATEGORIES.map((category, index): DecisionContext => ({ operation: category.toUpperCase().replaceAll(' ', '_'), intent: category, goal: index < 4 ? 'premium output' : 'accurate edit', deviceClass: index % 2 ? 'desktop' : 'mobile', platform: index % 2 ? 'web' : 'ios', projectType: category, privacyMode: index === 8 ? 'LOCAL_ONLY' : 'STANDARD', budget: 10 + index, latencyTarget: 5000 + index * 500, qualityTarget: .75 })));
