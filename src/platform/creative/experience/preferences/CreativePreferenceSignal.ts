import type { CreativePreferenceSignal as CreativePreferenceSignalShape, PreferenceAccessContext, PreferenceCategory, PreferenceEvidenceSource, PreferenceSignalType, PreferenceVisibility } from './types';

export class CreativePreferenceSignal {
  create(input: { id: string; userId: string; tenantId: string; projectId?: string; visibility?: PreferenceVisibility; category: PreferenceCategory; value: string; signalType: PreferenceSignalType; confidenceDelta: number; evidenceSource: PreferenceEvidenceSource; createdAt: number }): CreativePreferenceSignalShape {
    return Object.freeze({ id: input.id, userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, visibility: input.visibility ?? 'PRIVATE', category: input.category, value: input.value, signalType: input.signalType, confidenceDelta: input.confidenceDelta, evidence: Object.freeze({ source: input.evidenceSource }), createdAt: input.createdAt });
  }

  canAccess(signal: CreativePreferenceSignalShape, context: PreferenceAccessContext): boolean {
    if (signal.visibility === 'PRIVATE') return signal.userId === context.userId && signal.tenantId === context.tenantId;
    if (signal.visibility === 'PROJECT') return signal.tenantId === context.tenantId && signal.projectId !== undefined && signal.projectId === context.projectId;
    return signal.tenantId === context.tenantId;
  }
}
