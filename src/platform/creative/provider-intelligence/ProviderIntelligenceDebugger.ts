import { intelligenceDeepFreeze, sameIntelligenceScope } from './immutable';
import type { ProviderIntelligenceDebugEvent, ProviderIntelligenceScope, ProviderIntelligenceSnapshot } from './types';
export class ProviderIntelligenceDebugger { debug(snapshot: ProviderIntelligenceSnapshot, scope: ProviderIntelligenceScope): readonly ProviderIntelligenceDebugEvent[] { if (!sameIntelligenceScope(snapshot.scope, scope)) throw new Error('Scope isolation violation'); return intelligenceDeepFreeze(snapshot.timeline.map((event) => ({ ...event, data: { ...event.data } }))); } }
