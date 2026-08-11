export interface DirectorScope { readonly userId: string; readonly tenantId: string; readonly projectId: string }
export interface DirectorDependencies { readonly createId: () => string; readonly now: () => number; readonly random: () => number }
export const scopeKey = (scope: DirectorScope): string => `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
export const sameScope = (left: DirectorScope, right: DirectorScope): boolean => scopeKey(left) === scopeKey(right);

export interface WeightedSignal { readonly name: string; readonly weight: number; readonly confidence: number }
export interface CreativeVision extends DirectorScope { readonly id: string; readonly prompt: string; readonly visionGoals: readonly string[]; readonly mood: readonly string[]; readonly style: readonly string[]; readonly commercialIntent: string; readonly visualDirection: readonly string[]; readonly confidence: number; readonly createdAt: number }
export interface StyleGenomeRepresentation { readonly style: string; readonly lighting: number; readonly composition: number; readonly color: number; readonly texture: number; readonly contrast: number; readonly palette: number; readonly perspective: number; readonly emotion: number }
export interface CreativeCandidate { readonly id: string; readonly attributes: Readonly<Record<string, number>>; readonly styles?: readonly string[]; readonly colors?: readonly string[]; readonly lighting?: readonly string[]; readonly operations?: readonly string[]; readonly credits?: number; readonly usesAI?: boolean }
