export interface ResolvedGoal { readonly intent: string; readonly confidence: number; readonly evidence: readonly string[]; }

/** Converts natural language into a compact user goal without calling an LLM. */
export class GoalResolver {
  resolve(request: string): ResolvedGoal { const value = request.toLowerCase(); const evidence: string[] = []; let intent = 'image-editing'; if (/try\s*on|пример|одежд|outfit|garment/.test(value)) { intent = 'virtual-try-on'; evidence.push('try-on'); } if (/background|фон|beach|scene/.test(value)) { intent = intent === 'image-editing' ? 'background-editing' : `${intent}+background-editing`; evidence.push('background'); } if (/hair|волос|face|portrait/.test(value)) { intent = intent === 'image-editing' ? 'portrait-editing' : `${intent}+portrait-editing`; evidence.push('portrait'); } if (/campaign|photoshoot|workflow|реклам/.test(value)) { intent = 'creative-workflow'; evidence.push('workflow'); } return Object.freeze({ intent, confidence: evidence.length ? 0.9 : 0.6, evidence: Object.freeze(evidence) }); }
}
