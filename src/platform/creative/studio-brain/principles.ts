import type { CreativePrinciple, PrincipleDomain, VisualLawName } from './types';
import { immutable } from './immutable';

const statements: Readonly<Record<PrincipleDomain, string>> = {
  LUXURY: 'Restraint, material detail, and controlled light communicate value.', FASHION: 'Silhouette and attitude lead before decorative detail.', PORTRAIT: 'Identity, eyes, and believable skin remain primary.', CINEMA: 'Motivated light and depth support narrative emotion.', CATALOG: 'Consistency and product truth precede novelty.', FOOD: 'Texture, freshness, and appetizing color require natural cues.', ARCHITECTURE: 'Perspective and spatial hierarchy must remain credible.', CARS: 'Surface reflections describe form and engineering precision.', JEWELRY: 'Micro-contrast and controlled highlights reveal craftsmanship.', BEAUTY: 'Skin integrity and intentional color create aspirational realism.'
};
export const VISUAL_LAWS: readonly VisualLawName[] = immutable(['LEADING_LINES', 'GOLDEN_RATIO', 'RULE_OF_THIRDS', 'COLOR_HARMONY', 'CONTRAST', 'DEPTH', 'NEGATIVE_SPACE', 'FOCUS', 'PERSPECTIVE', 'HIERARCHY', 'BALANCE']);
export class CreativePrinciplesEngine {
  private readonly principles: readonly CreativePrinciple[];
  constructor(seed: readonly CreativePrinciple[] = []) { this.principles = immutable([...Object.entries(statements).map(([domain, statement], index) => ({ id: `principle-${domain.toLowerCase()}`, domain: domain as PrincipleDomain, statement, priority: 10 - index / 20, weight: .8, confidence: .82, support: 1 })), ...seed]); }
  forDomain(domain: PrincipleDomain): readonly CreativePrinciple[] { return immutable(this.principles.filter((principle) => principle.domain === domain).sort((a, b) => b.priority * b.weight - a.priority * a.weight)); }
  all(): readonly CreativePrinciple[] { return this.principles; }
}
