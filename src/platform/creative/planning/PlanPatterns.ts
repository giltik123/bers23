import { deepFreeze } from './immutable';
import type { GoalDefinition } from './types';

const patterns: Readonly<Record<string, GoalDefinition>> = deepFreeze({
  'luxury-portrait': { title: 'Luxury Portrait', tags: ['luxury', 'portrait'], subGoals: [{ title: 'Lighting', operations: ['soft lighting', 'rim lighting'] }, { title: 'Color', operations: ['warm grading'] }, { title: 'Edit', operations: ['skin retouch'] }] },
  catalog: { title: 'Catalog', tags: ['catalog'], subGoals: [{ title: 'Accuracy', operations: ['color correction'] }, { title: 'Background', operations: ['background cleanup'] }] },
  fashion: { title: 'Fashion', tags: ['fashion'], subGoals: [{ title: 'Editorial direction', operations: ['dramatic lighting', 'contrast'] }] },
  marketing: { title: 'Marketing', tags: ['marketing'], subGoals: [{ title: 'Attention', operations: ['visual hierarchy'] }, { title: 'Conversion', operations: ['product emphasis'] }] },
  'background-removal': { title: 'Background Removal', tags: ['utility'], operations: ['background removal', 'edge cleanup'] },
  'try-on': { title: 'Try-On', tags: ['fashion', 'ai'], operations: ['virtual try-on', 'fit verification'] },
  'studio-portrait': { title: 'Studio Portrait', tags: ['studio', 'portrait'], subGoals: [{ title: 'Studio lighting', operations: ['key light', 'fill light'] }, { title: 'Portrait edit', operations: ['skin retouch'] }] },
});

export class PlanPatterns {
  names(): readonly string[] { return deepFreeze(Object.keys(patterns).sort()); }
  get(name: string): GoalDefinition | undefined { return patterns[name.trim().toLowerCase()]; }
  all(): Readonly<Record<string, GoalDefinition>> { return patterns; }
}
