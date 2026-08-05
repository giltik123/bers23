/** Resolution result before platform matching and policy evaluation. */
export interface CapabilityResolution { readonly capabilities: readonly string[]; readonly confidence: number; readonly evidence: readonly string[]; }

interface ResolutionRule { readonly pattern: RegExp; readonly capabilities: readonly string[]; readonly confidence: number; readonly evidence: string; }

const defaultRules: readonly ResolutionRule[] = [
  { pattern: /(?:hair|волос).*(?:color|colour|recolor|цвет)|(?:change|измен).*(?:hair|волос).*(?:color|цвет)/i, capabilities: ['face-editing', 'scene-memory', 'image-edit'], confidence: 0.96, evidence: 'hair-color-edit' },
  { pattern: /(?:virtual\s+try[ -]?on|try\s+on|пример(?:ить|ка))/i, capabilities: ['virtual-try-on'], confidence: 0.98, evidence: 'virtual-try-on' },
  { pattern: /(?:younger|моложе|омолод)/i, capabilities: ['face-editing', 'identity-preservation', 'scene-memory'], confidence: 0.94, evidence: 'age-edit' },
  { pattern: /(?:replace|change|замен|смен).*(?:background|фон)/i, capabilities: ['background-edit', 'scene-consistency'], confidence: 0.93, evidence: 'background-edit' },
  { pattern: /(?:keep|preserve|сохран).*(?:person|subject|человек)/i, capabilities: ['person-preservation'], confidence: 0.92, evidence: 'person-preservation' },
];

/** Converts natural-language requests into required platform capabilities. */
export class CapabilityResolver {
  constructor(private readonly rules: readonly ResolutionRule[] = defaultRules) {}

  /** Resolves all matching intent rules with deterministic deduplication. */
  resolve(request: string): CapabilityResolution {
    const matches = this.rules.filter((rule) => rule.pattern.test(request));
    if (matches.length === 0) return Object.freeze({ capabilities: Object.freeze(['image-edit']), confidence: 0.5, evidence: Object.freeze(['generic-image-edit']) });
    return Object.freeze({
      capabilities: Object.freeze([...new Set(matches.flatMap((match) => match.capabilities))]),
      confidence: Math.max(...matches.map((match) => match.confidence)),
      evidence: Object.freeze(matches.map((match) => match.evidence)),
    });
  }
}
