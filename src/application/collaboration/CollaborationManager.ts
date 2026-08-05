import { CollaborationDebugger } from './CollaborationDebugger';
import { CollaborationHistory } from './CollaborationHistory';
import type { SharedRecord } from './SharedContextManager';
import { CollaborationMember, CollaborationPermission, CollaborationProject, CollaborationRole, CollaborationAccessContext, hasCollaborationPermission } from './CollaborationModel';
import { SharedContextManager } from './SharedContextManager';

export interface CollaborationInspection {
  readonly project: CollaborationProject;
  readonly members: readonly CollaborationMember[];
  readonly sharedContext: ReturnType<SharedContextManager['inspect']>;
  readonly activity: ReturnType<CollaborationHistory['list']>;
}

export class CollaborationManager {
  private projects = new Map<string, CollaborationProject>();
  private members = new Map<string, CollaborationMember[]>();
  readonly history: CollaborationHistory;
  readonly sharedContext: SharedContextManager;
  private readonly debuggerApi = new CollaborationDebugger();
  private sequence = 0;

  constructor(private readonly clock: () => number = Date.now) {
    this.history = new CollaborationHistory(clock);
    this.sharedContext = new SharedContextManager(this.history, clock);
  }

  createProject(input: { tenantId: string; projectId?: string; name: string; ownerId: string }): CollaborationProject {
    const project = Object.freeze({ id: input.projectId || `collab-project-${++this.sequence}`, tenantId: input.tenantId, name: input.name, ownerId: input.ownerId, createdAt: this.clock(), updatedAt: this.clock() });
    if (this.projects.has(this.key(project.tenantId, project.id))) throw new Error('Project already exists');
    this.projects.set(this.key(project.tenantId, project.id), project);
    const owner = this.createMember(project.tenantId, project.id, input.ownerId, 'OWNER', input.ownerId);
    this.members.set(this.key(project.tenantId, project.id), [owner]);
    this.history.record({ tenantId: project.tenantId, projectId: project.id, type: 'member.joined', actorId: input.ownerId, snapshot: owner });
    return project;
  }

  invite(context: CollaborationAccessContext, userId: string, role: CollaborationRole): CollaborationMember {
    this.requirePermission(context, 'members');
    if (role === 'OWNER') throw new Error('Owner cannot be invited');
    const member = this.createMember(context.tenantId, context.projectId, userId, role, context.actorId);
    const list = this.getProjectMembers(context.tenantId, context.projectId);
    if (list.some((existing) => existing.userId === userId)) throw new Error('Member already exists');
    list.push(member);
    this.history.record({ tenantId: context.tenantId, projectId: context.projectId, type: 'member.joined', actorId: context.actorId, snapshot: member });
    return member;
  }

  removeMember(context: CollaborationAccessContext, userId: string): void {
    this.requirePermission(context, 'members');
    const list = this.getProjectMembers(context.tenantId, context.projectId);
    const member = list.find((candidate) => candidate.userId === userId);
    if (!member) throw new Error('Member not found');
    if (member.role === 'OWNER') throw new Error('Owner cannot be removed');
    this.members.set(this.key(context.tenantId, context.projectId), list.filter((candidate) => candidate.userId !== userId));
    this.history.record({ tenantId: context.tenantId, projectId: context.projectId, type: 'member.removed', actorId: context.actorId, snapshot: member });
  }

  updateRole(context: CollaborationAccessContext, userId: string, role: CollaborationRole): CollaborationMember {
    this.requirePermission(context, 'members');
    if (role === 'OWNER') throw new Error('Owner role cannot be assigned');
    const list = this.getProjectMembers(context.tenantId, context.projectId);
    const index = list.findIndex((member) => member.userId === userId);
    if (index === -1) throw new Error('Member not found');
    if (list[index].role === 'OWNER') throw new Error('Owner role cannot be changed');
    const updated = Object.freeze({ ...list[index], role, updatedAt: this.clock() });
    list[index] = updated;
    this.history.record({ tenantId: context.tenantId, projectId: context.projectId, type: 'role.changed', actorId: context.actorId, snapshot: updated });
    return updated;
  }

  checkPermission(context: CollaborationAccessContext, permission: CollaborationPermission): boolean {
    const project = this.projects.get(this.key(context.tenantId, context.projectId));
    if (!project) return false;
    const member = this.getProjectMembers(context.tenantId, context.projectId).find((candidate) => candidate.userId === context.actorId);
    return member ? hasCollaborationPermission(member.role, permission) : false;
  }

  listMembers(context: CollaborationAccessContext): readonly CollaborationMember[] {
    this.requirePermission(context, 'view');
    return Object.freeze([...this.getProjectMembers(context.tenantId, context.projectId)]);
  }

  shareWorkflow(context: CollaborationAccessContext, workflow: unknown): SharedRecord {
    this.requirePermission(context, 'execute');
    return this.sharedContext.shareWorkflow(context.tenantId, context.projectId, context.actorId, workflow);
  }

  shareAsset(context: CollaborationAccessContext, asset: unknown): SharedRecord {
    this.requirePermission(context, 'edit');
    return this.sharedContext.shareAsset(context.tenantId, context.projectId, context.actorId, asset);
  }

  createDecision(context: CollaborationAccessContext, decision: unknown): SharedRecord {
    this.requirePermission(context, 'edit');
    return this.sharedContext.createDecision(context.tenantId, context.projectId, context.actorId, decision);
  }

  approveDecision(context: CollaborationAccessContext, decisionId: string): SharedRecord {
    this.requirePermission(context, 'approve');
    return this.sharedContext.approveDecision(context.tenantId, context.projectId, context.actorId, decisionId);
  }

  inspect(context: CollaborationAccessContext): CollaborationInspection {
    this.requirePermission(context, 'view');
    return Object.freeze({ project: this.getProject(context.tenantId, context.projectId), members: this.listMembers(context), sharedContext: this.sharedContext.inspect(context.tenantId, context.projectId), activity: this.history.list(context.tenantId, context.projectId) });
  }

  debug(context: CollaborationAccessContext) { return this.debuggerApi.debug(this.inspect(context)); }

  private requirePermission(context: CollaborationAccessContext, permission: CollaborationPermission): void { if (!this.checkPermission(context, permission)) throw new Error(`Permission denied: ${permission}`); }
  private getProject(tenantId: string, projectId: string): CollaborationProject { const project = this.projects.get(this.key(tenantId, projectId)); if (!project) throw new Error('Project not found'); return project; }
  private getProjectMembers(tenantId: string, projectId: string): CollaborationMember[] { this.getProject(tenantId, projectId); return this.members.get(this.key(tenantId, projectId)) || []; }
  private createMember(tenantId: string, projectId: string, userId: string, role: CollaborationRole, invitedBy?: string): CollaborationMember { return Object.freeze({ id: `collab-member-${++this.sequence}`, tenantId, projectId, userId, role, invitedBy, joinedAt: this.clock(), updatedAt: this.clock() }); }
  private key(tenantId: string, projectId: string): string { return `${tenantId}:${projectId}`; }
}
