export type PreferenceCategory = 'STYLE' | 'COLOR' | 'LIGHTING' | 'COMPOSITION' | 'QUALITY' | 'WORKFLOW' | 'COST';
export type PreferenceSignalType = 'ACCEPTED' | 'REJECTED' | 'CREATED' | 'REPEATED' | 'CORRECTED';
export type PreferenceEvidenceSource = 'USER_ACTION' | 'FEEDBACK' | 'RESULT_SELECTION' | 'WORKFLOW_HISTORY';
export type PreferenceVisibility = 'PRIVATE' | 'PROJECT' | 'TENANT';

export interface PreferenceEvidence { source: PreferenceEvidenceSource }
export interface CreativePreferenceSignal { id: string; userId: string; tenantId: string; projectId?: string; visibility: PreferenceVisibility; category: PreferenceCategory; value: string; signalType: PreferenceSignalType; confidenceDelta: number; evidence: PreferenceEvidence; createdAt: number }
export interface PreferenceEntry { category: PreferenceCategory; value: string; confidence: number; evidenceCount: number; firstSeen: number; lastUpdated: number }
export interface PreferenceProfile { id: string; userId: string; tenantId: string; preferences: readonly PreferenceEntry[]; createdAt: number; updatedAt: number }
export interface PreferenceAccessContext { userId: string; tenantId: string; projectId?: string }
export interface PreferenceAnalysis { topStyles: PreferenceEntry[]; topColors: PreferenceEntry[]; topWorkflows: PreferenceEntry[]; confidence: number }
