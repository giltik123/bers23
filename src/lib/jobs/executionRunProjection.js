import { executionRunRecoveryClient } from '../../api/executionRunRecoveryClient.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const REASON = /^[A-Z0-9_]{1,128}$/;
const RESULT_PATH = /^\/api\/core\/artifacts\/results\/[^/?#\s]+$/;
const ROOT_LIMIT = 10;
const CHILD_LIMIT = 25;
const POLL_INTERVAL_MS = 15000;
const STATUS = new Set(['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN']);
const AUTHORITY_BY_CAPABILITY = Object.freeze({
  LOCAL_EXECUTION: 'LOCAL_EXECUTION_TICKET',
  CREATIVE_EXECUTION: 'CREATIVE_EXECUTION',
  WORKFLOW_CONTINUATION: 'WORKFLOW_CONTINUATION',
  WORKFLOW_STEP: 'WORKFLOW_INTERNAL_STEP',
});

export class ExecutionRunProjection {
  constructor({
    client,
    rootLimit = ROOT_LIMIT,
    childLimit = CHILD_LIMIT,
    pollIntervalMs = POLL_INTERVAL_MS,
    schedule = (fn, ms) => globalThis.setInterval(fn, ms),
    cancelSchedule = (handle) => globalThis.clearInterval(handle),
    now = () => new Date().toISOString(),
  }) {
    assertReadClient(client);
    this.client = client;
    this.rootLimit = boundedLimit(rootLimit, 'rootLimit');
    this.childLimit = boundedLimit(childLimit, 'childLimit');
    if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 1000) throw new TypeError('pollIntervalMs must be at least 1000');
    this.pollIntervalMs = pollIntervalMs;
    this.schedule = schedule;
    this.cancelSchedule = cancelSchedule;
    this.now = now;
    this.listeners = new Set();
    this.state = emptyState();
    this.generation = 0;
    this.hasSnapshot = false;
    this.timer = null;
    this.inFlight = null;
  }

  snapshot() { return this.state; }

  subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('ExecutionRun projection listener must be a function');
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  start(projectIdValue) {
    this._clearTimer();
    this.generation += 1;
    this.inFlight = null;
    this.hasSnapshot = false;

    if (projectIdValue === null || projectIdValue === undefined || projectIdValue === '') {
      this._set(emptyState());
      return Promise.resolve(false);
    }

    let projectId;
    try { projectId = canonicalUuid(projectIdValue, 'projectId'); }
    catch (cause) {
      this._set(emptyState(projectionError(cause, 'invalid_project_id')));
      return Promise.resolve(false);
    }

    this._set(Object.freeze({
      projectId,
      runs: Object.freeze([]),
      loading: true,
      refreshing: false,
      stale: false,
      authoritative: false,
      error: null,
      lastRefreshedAt: null,
    }));

    const pending = this.refresh();
    this.timer = this.schedule(() => { void this.refresh(); }, this.pollIntervalMs);
    return pending;
  }

  stop() {
    this._clearTimer();
    this.generation += 1;
    this.inFlight = null;
  }

  refresh() {
    const projectId = this.state.projectId;
    if (!projectId) return Promise.resolve(false);
    const generation = this.generation;
    if (this.inFlight?.generation === generation) return this.inFlight.promise;

    const promise = this._refresh(generation, projectId);
    this.inFlight = { generation, promise };
    return promise.finally(() => {
      if (this.inFlight?.generation === generation && this.inFlight.promise === promise) this.inFlight = null;
    });
  }

  async _refresh(generation, projectId) {
    this._set(Object.freeze({
      ...this.state,
      loading: !this.hasSnapshot,
      refreshing: this.hasSnapshot,
    }));

    try {
      const rootsPayload = await this.client.listRoots(projectId, this.rootLimit);
      const roots = responseRuns(rootsPayload, 'root response').map(normalizeRoot);
      const hydrated = await Promise.all(roots.map((root) => this._hydrateRoot(root, projectId)));
      if (generation !== this.generation || projectId !== this.state.projectId) return false;
      const refreshedAt = canonicalTimestamp(this.now(), 'refresh time');

      this.hasSnapshot = true;
      this._set(Object.freeze({
        projectId,
        runs: Object.freeze(hydrated),
        loading: false,
        refreshing: false,
        stale: false,
        authoritative: true,
        error: null,
        lastRefreshedAt: refreshedAt,
      }));
      return true;
    } catch (cause) {
      if (generation !== this.generation || projectId !== this.state.projectId) return false;
      this._set(Object.freeze({
        ...this.state,
        loading: false,
        refreshing: false,
        stale: this.hasSnapshot,
        authoritative: this.hasSnapshot,
        error: projectionError(cause),
      }));
      return false;
    }
  }

  async _hydrateRoot(root, projectId) {
    if (root.capability !== 'WORKFLOW_CONTINUATION') return freezeRun(root, []);
    const payload = await this.client.listChildren(root.runId, projectId, this.childLimit);
    const parent = normalizeRun(payload?.parent, 'workflow parent');
    if (parent.runId !== root.runId || parent.parentRunId) throw new Error('ExecutionRun recovery returned a mismatched workflow parent');
    if (parent.capability !== 'WORKFLOW_CONTINUATION') throw new Error('ExecutionRun recovery workflow parent capability changed');
    const children = responseRuns(payload, 'children response').map((candidate) => {
      const child = normalizeRun(candidate, 'workflow child');
      if (child.parentRunId !== parent.runId) throw new Error('ExecutionRun recovery returned a child outside the requested parent');
      return freezeRun(child, []);
    });
    return freezeRun(parent, children);
  }

  _set(next) {
    this.state = next;
    for (const listener of this.listeners) listener(next);
  }

  _clearTimer() {
    if (this.timer !== null) this.cancelSchedule(this.timer);
    this.timer = null;
  }
}

export function createExecutionRunProjection(options = {}) {
  return new ExecutionRunProjection({ client: executionRunRecoveryClient, ...options });
}

export function executionRunStatusLabel(status) {
  return ({ QUEUED: 'Queued', RUNNING: 'Running', SUCCEEDED: 'Succeeded', FAILED: 'Failed', CANCELLED: 'Cancelled', UNKNOWN: 'Unknown' })[status] || 'Unavailable';
}

export function executionRunCapabilityLabel(capability) {
  return ({
    CREATIVE_EXECUTION: 'Creative execution',
    LOCAL_EXECUTION: 'Local execution',
    WORKFLOW_CONTINUATION: 'Composite workflow',
    WORKFLOW_STEP: 'Internal workflow step',
  })[capability] || 'Execution';
}

function emptyState(error = null) {
  return Object.freeze({
    projectId: null,
    runs: Object.freeze([]),
    loading: false,
    refreshing: false,
    stale: false,
    authoritative: false,
    error,
    lastRefreshedAt: null,
  });
}

function assertReadClient(client) {
  if (!client || typeof client !== 'object') throw new TypeError('ExecutionRun read client is required');
  for (const name of ['listRoots', 'get', 'listChildren']) {
    if (typeof client[name] !== 'function') throw new TypeError(`ExecutionRun read client requires ${name}`);
  }
}

function responseRuns(payload, label) {
  if (!payload || typeof payload !== 'object' || !Array.isArray(payload.runs)) throw new Error(`ExecutionRun ${label} must contain runs`);
  return payload.runs;
}

function normalizeRoot(value) {
  const run = normalizeRun(value, 'root');
  if (run.parentRunId) throw new Error('ExecutionRun root unexpectedly has a parent');
  if (run.capability === 'WORKFLOW_STEP') throw new Error('WORKFLOW_STEP cannot be an ExecutionRun root');
  return run;
}

function normalizeRun(value, label) {
  if (!value || typeof value !== 'object') throw new Error(`ExecutionRun ${label} must be an object`);
  const capability = exactString(value.capability, Object.keys(AUTHORITY_BY_CAPABILITY), `${label}.capability`);
  const authorityKind = exactString(value.authorityKind, Object.values(AUTHORITY_BY_CAPABILITY), `${label}.authorityKind`);
  if (AUTHORITY_BY_CAPABILITY[capability] !== authorityKind) throw new Error(`ExecutionRun ${label} authority binding is invalid`);
  const status = exactString(value.status, STATUS, `${label}.status`);
  const revision = Number(value.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error(`ExecutionRun ${label}.revision is invalid`);
  const reason = value.statusReasonCode === undefined ? undefined : canonicalReason(value.statusReasonCode, `${label}.statusReasonCode`);
  if (['FAILED', 'CANCELLED', 'UNKNOWN'].includes(status) !== Boolean(reason)) throw new Error(`ExecutionRun ${label} reason does not match status`);

  const startedAt = value.startedAt ? canonicalTimestamp(value.startedAt, `${label}.startedAt`) : undefined;
  const finishedAt = value.finishedAt ? canonicalTimestamp(value.finishedAt, `${label}.finishedAt`) : undefined;
  assertTimeShape(status, startedAt, finishedAt, label);
  const result = value.result === undefined ? undefined : normalizeResult(value.result, label, capability, authorityKind, status);

  return Object.freeze({
    runId: canonicalUuid(value.runId, `${label}.runId`),
    capability,
    authorityKind,
    authorityRef: boundedText(value.authorityRef, `${label}.authorityRef`, 4096),
    ...(value.parentRunId ? { parentRunId: canonicalUuid(value.parentRunId, `${label}.parentRunId`) } : {}),
    status,
    revision,
    ...(reason ? { statusReasonCode: reason } : {}),
    createdAt: canonicalTimestamp(value.createdAt, `${label}.createdAt`),
    updatedAt: canonicalTimestamp(value.updatedAt, `${label}.updatedAt`),
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...(result ? { result } : {}),
  });
}

function normalizeResult(value, label, capability, authorityKind, status) {
  if (status !== 'SUCCEEDED' || capability !== 'CREATIVE_EXECUTION' || authorityKind !== 'CREATIVE_EXECUTION') {
    throw new Error(`ExecutionRun ${label} result is not valid for this lifecycle authority`);
  }
  if (!value || typeof value !== 'object' || value.kind !== 'FINAL_IMAGE') throw new Error(`ExecutionRun ${label}.result kind is unsupported`);
  const artifactId = boundedText(value.artifactId, `${label}.result.artifactId`, 8192);
  const imageUrl = boundedText(value.imageUrl, `${label}.result.imageUrl`, 8192);
  if (!RESULT_PATH.test(imageUrl)) throw new Error(`ExecutionRun ${label}.result.imageUrl is invalid`);
  const width = Number(value.width);
  const height = Number(value.height);
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) throw new Error(`ExecutionRun ${label}.result dimensions are invalid`);
  return Object.freeze({ kind: 'FINAL_IMAGE', artifactId, imageUrl, width, height });
}

function freezeRun(run, children) {
  return Object.freeze({ ...run, children: Object.freeze(children) });
}

function exactString(value, allowed, label) {
  const accepted = allowed instanceof Set ? allowed.has(value) : Array.isArray(allowed) && allowed.includes(value);
  if (typeof value !== 'string' || !accepted) throw new Error(`ExecutionRun ${label} is unsupported`);
  return value;
}

function assertTimeShape(status, startedAt, finishedAt, label) {
  if (status === 'QUEUED' && (startedAt || finishedAt)) throw new Error(`ExecutionRun ${label} QUEUED time shape is invalid`);
  if (status === 'RUNNING' && (!startedAt || finishedAt)) throw new Error(`ExecutionRun ${label} RUNNING time shape is invalid`);
  if (['SUCCEEDED', 'FAILED', 'CANCELLED', 'UNKNOWN'].includes(status) && !finishedAt) throw new Error(`ExecutionRun ${label} terminal time shape is invalid`);
}

function canonicalUuid(value, label) {
  if (typeof value !== 'string') throw new TypeError(`${label} must be a UUID`);
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!UUID.test(normalized)) throw new TypeError(`${label} must be a UUID`);
  return normalized;
}

function boundedText(value, label, max) {
  if (typeof value !== 'string') throw new Error(`ExecutionRun ${label} must be text`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/.test(normalized)) throw new Error(`ExecutionRun ${label} is invalid`);
  return normalized;
}

function canonicalReason(value, label) {
  if (typeof value !== 'string' || !REASON.test(value)) throw new Error(`ExecutionRun ${label} is invalid`);
  return value;
}

function canonicalTimestamp(value, label) {
  if (typeof value !== 'string') throw new Error(`ExecutionRun ${label} must be a timestamp`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`ExecutionRun ${label} must be a timestamp`);
  return date.toISOString();
}

function boundedLimit(value, label) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) throw new TypeError(`${label} must be an integer from 1 to 100`);
  return value;
}

function projectionError(cause, fallbackCode = 'execution_run_recovery_unavailable') {
  const code = typeof cause?.code === 'string' && cause.code ? cause.code : fallbackCode;
  const status = Number.isSafeInteger(cause?.status) ? cause.status : undefined;
  return Object.freeze({ code, ...(status ? { status } : {}) });
}