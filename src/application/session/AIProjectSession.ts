export type AIProjectSessionStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'FAILED';

export interface AIProjectSessionSnapshot {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly currentExperienceId: string | null;
  readonly status: AIProjectSessionStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateAIProjectSessionInput {
  readonly id?: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly currentExperienceId?: string | null;
  readonly status?: AIProjectSessionStatus;
  readonly createdAt?: string;
  readonly updatedAt?: string;
}

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));
const freezeDeep = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>)) freezeDeep(item);
  }
  return value;
};

export const immutable = <T>(value: T): T => freezeDeep(clone(value));
export const createProjectSessionId = () => `proj_sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export class AIProjectSession {
  private snapshot: AIProjectSessionSnapshot;

  constructor(input: CreateAIProjectSessionInput, now = new Date().toISOString()) {
    const createdAt = input.createdAt ?? now;
    this.snapshot = immutable({
      id: input.id ?? createProjectSessionId(),
      userId: input.userId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      currentExperienceId: input.currentExperienceId ?? null,
      status: input.status ?? 'ACTIVE',
      createdAt,
      updatedAt: input.updatedAt ?? createdAt,
    });
  }

  inspect(): AIProjectSessionSnapshot { return immutable(this.snapshot); }

  setExperience(experienceId: string | null, at = new Date().toISOString()): AIProjectSessionSnapshot {
    this.snapshot = immutable({ ...this.snapshot, currentExperienceId: experienceId, updatedAt: at });
    return this.inspect();
  }

  setStatus(status: AIProjectSessionStatus, at = new Date().toISOString()): AIProjectSessionSnapshot {
    this.snapshot = immutable({ ...this.snapshot, status, updatedAt: at });
    return this.inspect();
  }
}
