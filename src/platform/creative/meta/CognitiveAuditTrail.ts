import { deepImmutable } from './immutable';
import type { AuditEvent, MetaDependencies, Scope, Strategy } from './types';
export class CognitiveAuditTrail {
  private readonly records: Array<AuditEvent & Scope> = [];
  constructor(private readonly dependencies: MetaDependencies) {}
  record(scope: Scope, actor: string, action: string, reason: string, extras: { rule?: string; expert?: string; strategy?: Strategy } = {}): AuditEvent { const event = deepImmutable({ ...scope, id: this.dependencies.id(), at: this.dependencies.now(), sequence: this.records.filter((item) => item.tenantId === scope.tenantId && item.projectId === scope.projectId && item.userId === scope.userId).length, actor, action, reason, ...extras }); this.records.push(event); return event; }
  history(scope: Scope): readonly AuditEvent[] { return deepImmutable(this.records.filter((item) => item.tenantId === scope.tenantId && item.projectId === scope.projectId && item.userId === scope.userId).map(({ tenantId: _t, projectId: _p, userId: _u, ...event }) => event)); }
}
