/** Normalized routing risks, where 0 is safe and 1 is highest risk. */
export interface RiskScore { readonly identity: number; readonly style: number; readonly provider: number; readonly overall: number; readonly warnings: readonly string[]; }

/** Evaluates intent and metadata risks without depending on Scene Memory implementation. */
export class RoutingRiskAnalyzer {
  analyze(request: string, capabilities: readonly string[], experimentalProvider = false): RiskScore {
    const identity = /(?:replace|change|alter|замен|измен).*(?:face|person|body|лиц|человек|тел)|(?:younger|older|моложе|старше)/i.test(request)
      ? 0.85 : capabilities.some((id) => ['face-editing', 'identity-preservation'].includes(id)) ? 0.55 : 0.1;
    const style = capabilities.some((id) => ['scene-consistency', 'scene-memory'].includes(id)) ? 0.2 : 0.35;
    const provider = experimentalProvider ? 0.7 : 0.1;
    const overall = Math.max(identity * 0.6 + style * 0.2 + provider * 0.2, identity > 0.8 ? 0.7 : 0);
    const warnings = identity >= 0.7 ? ['High identity drift risk; preserve identity and review the result.'] : [];
    return Object.freeze({ identity, style, provider, overall, warnings: Object.freeze(warnings) });
  }
}
