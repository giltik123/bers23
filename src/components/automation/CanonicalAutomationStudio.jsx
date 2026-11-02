import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Play, RefreshCw, RotateCcw, Save, Square, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { automationClient } from '@/api/automationClient';
import { coreClient } from '@/api/coreClient';
import { createAutomationInvocationRunner } from '@/application/automation/createAutomationInvocationRunner';
import { ORTHOGONAL_TRANSFORM_MODES } from '@/platform/creative/deterministic/OrthogonalTransformIdentity';

const PLAN_KIND = 'BOUNDED_DETERMINISTIC_IMAGE_V1';
const DEFAULT_DRAFT = Object.freeze({ orthogonal_mode: 'ROTATE_90_CW', target_width: 1024, target_height: 1024 });
const MODE_LABELS = Object.freeze({ ROTATE_90_CW: 'automation.modeRotate90', ROTATE_180: 'automation.modeRotate180', ROTATE_270_CW: 'automation.modeRotate270', FLIP_HORIZONTAL: 'automation.modeFlipHorizontal', FLIP_VERTICAL: 'automation.modeFlipVertical' });
const DEFINITION_STATUS_LABELS = Object.freeze({ ACTIVE: 'automation.statusActive', ARCHIVED: 'automation.statusArchived' });
const INVOCATION_STATE_LABELS = Object.freeze({ READY: 'automation.stateReady', WAITING_FOR_LOCAL_RESULT: 'automation.stateWaiting', RUNNING_INTERNAL: 'automation.stateRunning', SUCCESS: 'automation.stateSuccess', FAILED: 'automation.stateFailed', CANCELLED: 'automation.stateCancelled', UNKNOWN: 'automation.stateUnknown' });
const ATTEMPT_STATUS_LABELS = Object.freeze({ FAILED: 'automation.attemptFailed', EXPIRED: 'automation.attemptExpired' });
const OPERATION_LABELS = Object.freeze({ ORTHOGONAL_TRANSFORM: 'automation.operationTransform', RESIZE: 'automation.operationResize' });
function createDefaultDraft(t) { return Object.freeze({ ...DEFAULT_DRAFT, name: t('automation.defaultName') }); }
function translated(map, value, t, fallback) { return t(map[value] || fallback); }
const TERMINAL_STATES = new Set(['SUCCESS', 'FAILED', 'CANCELLED', 'UNKNOWN']);

export default function CanonicalAutomationStudio() {
  const { t } = useTranslation();
  const [definitions, setDefinitions] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedAutomationId, setSelectedAutomationId] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [draft, setDraft] = useState(() => createDefaultDraft(t));
  const [invocation, setInvocation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const selected = useMemo(() => definitions.find(item => item.id === selectedAutomationId), [definitions, selectedAutomationId]);
  const dirty = Boolean(selected && (
    draft.name.trim() !== selected.name
    || draft.orthogonal_mode !== selected.plan.orthogonal_mode
    || draft.target_width !== selected.plan.target_width
    || draft.target_height !== selected.plan.target_height
  ));
  const canRun = Boolean(selected?.status === 'ACTIVE' && selectedProjectId && !dirty && !busy);
  const isTerminal = Boolean(invocation && TERMINAL_STATES.has(invocation.state));
  const resumePointer = selected && selectedProjectId ? recalledInvocation(selected.id, selectedProjectId) : '';

  useEffect(() => { void reload(); }, []);

  useEffect(() => {
    if (!selected) return;
    setDraft({
      name: selected.name,
      orthogonal_mode: selected.plan.orthogonal_mode,
      target_width: selected.plan.target_width,
      target_height: selected.plan.target_height,
    });
    setInvocation(null);
  }, [selected?.id, selected?.revision]);

  async function reload() {
    setBusy(true); setError('');
    try {
      const [nextDefinitions, nextProjects] = await Promise.all([automationClient.definitions.list(), coreClient.projects.list()]);
      setDefinitions(Array.isArray(nextDefinitions) ? nextDefinitions : []);
      setProjects(Array.isArray(nextProjects) ? nextProjects : []);
      setSelectedAutomationId(current => current || nextDefinitions?.[0]?.id || '');
      setSelectedProjectId(current => current || nextProjects?.[0]?.id || '');
    } catch (cause) { setError(message(cause, t)); }
    finally { setBusy(false); }
  }

  function newDefinition() {
    setSelectedAutomationId('');
    setDraft(createDefaultDraft(t));
    setInvocation(null);
    setError('');
  }

  async function save() {
    setBusy(true); setError('');
    try {
      const plan = transportPlan(draft);
      const saved = selected
        ? await automationClient.definitions.update({ automationId: selected.id, revision: selected.revision, patch: { name: draft.name.trim(), plan } })
        : await automationClient.definitions.create({ name: draft.name.trim(), plan });
      replaceDefinition(saved);
      setSelectedAutomationId(saved.id);
    } catch (cause) { setError(message(cause, t)); }
    finally { setBusy(false); }
  }

  async function toggleArchive() {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      const next = selected.status === 'ACTIVE'
        ? await automationClient.definitions.archive({ automationId: selected.id, revision: selected.revision })
        : await automationClient.definitions.restore({ automationId: selected.id, revision: selected.revision });
      replaceDefinition(next);
    } catch (cause) { setError(message(cause, t)); }
    finally { setBusy(false); }
  }

  async function run() {
    if (!selected || !selectedProjectId || dirty) return;
    setBusy(true); setError('');
    try {
      const clientRequestId = loadOrCreateStartIntent(selected.id, selectedProjectId, selected.revision);
      const runner = createAutomationInvocationRunner({ projectId: selectedProjectId });
      const observe = view => {
        setInvocation(view);
        rememberInvocation(selected.id, selectedProjectId, view.invocationId);
        clearStartIntent(selected.id, selectedProjectId);
      };
      const result = await runner.start({ automationId: selected.id, definitionRevision: selected.revision, clientRequestId }, observe);
      setInvocation(result.view);
      rememberInvocation(selected.id, selectedProjectId, result.view.invocationId);
      clearStartIntent(selected.id, selectedProjectId);
    } catch (cause) { setError(message(cause, t)); }
    finally { setBusy(false); }
  }

  async function resumeLatest() {
    if (!selected || !selectedProjectId || !resumePointer) return;
    setBusy(true); setError('');
    try {
      const runner = createAutomationInvocationRunner({ projectId: selectedProjectId });
      const result = await runner.resume(resumePointer, setInvocation);
      setInvocation(result.view);
    } catch (cause) { setError(message(cause, t)); }
    finally { setBusy(false); }
  }

  async function retry() {
    if (!invocation || !selectedProjectId) return;
    setBusy(true); setError('');
    try {
      const runner = createAutomationInvocationRunner({ projectId: selectedProjectId });
      const result = await runner.retry(invocation.invocationId, setInvocation);
      setInvocation(result.view);
    } catch (cause) { setError(message(cause, t)); }
    finally { setBusy(false); }
  }

  async function cancel() {
    if (!invocation || !selectedProjectId) return;
    setBusy(true); setError('');
    try {
      const runner = createAutomationInvocationRunner({ projectId: selectedProjectId });
      setInvocation(await runner.cancel(invocation.invocationId));
    } catch (cause) { setError(message(cause, t)); }
    finally { setBusy(false); }
  }

  async function accept() {
    if (invocation?.state !== 'SUCCESS' || !invocation.terminalArtifactId) return;
    setBusy(true); setError('');
    try {
      await coreClient.projects.acceptFinal(invocation.projectId, invocation.terminalArtifactId, `Automation: ${selected?.name || invocation.automationId}`);
      if (selected) {
        forgetInvocation(selected.id, invocation.projectId);
        clearStartIntent(selected.id, invocation.projectId);
      }
      setInvocation(null);
      const nextProjects = await coreClient.projects.list();
      setProjects(Array.isArray(nextProjects) ? nextProjects : []);
    } catch (cause) { setError(message(cause, t)); }
    finally { setBusy(false); }
  }

  function replaceDefinition(next) {
    setDefinitions(current => {
      const present = current.some(item => item.id === next.id);
      return present ? current.map(item => item.id === next.id ? next : item) : [next, ...current];
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t('automation.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('automation.canonicalSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void reload()} disabled={busy}><RefreshCw className="h-4 w-4" />{t('automation.reload')}</Button>
          <Button variant="outline" onClick={newDefinition} disabled={busy}>{t('automation.newDefinition')}</Button>
        </div>
      </header>

      {error && <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-2 rounded-2xl border border-border/60 p-3">
          <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('automation.definitions')}</p>
          {definitions.length === 0 && <p className="px-2 py-4 text-sm text-muted-foreground">{t('automation.noCanonicalAutomations')}</p>}
          {definitions.map(item => (
            <button key={item.id} onClick={() => setSelectedAutomationId(item.id)} className={`w-full rounded-xl border p-3 text-left ${item.id === selectedAutomationId ? 'border-primary bg-primary/5' : 'border-border/50 hover:bg-secondary/50'}`}>
              <div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{item.name}</span><span className="text-[10px] text-muted-foreground">r{item.revision}</span></div>
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground"><span>{translated(MODE_LABELS, item.plan.orthogonal_mode, t, 'automation.transform')}</span><span>{translated(DEFINITION_STATUS_LABELS, item.status, t, 'automation.statusUnknown')}</span></div>
            </button>
          ))}
        </aside>

        <main className="space-y-4">
          <section className="space-y-4 rounded-2xl border border-border/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-medium">{t('automation.boundedPlan')}</p><p className="text-xs text-muted-foreground">{t('automation.boundedPlanHint')}</p></div>
              <div className="flex gap-2">
                {selected && <Button variant="outline" onClick={() => void toggleArchive()} disabled={busy}>{selected.status === 'ACTIVE' ? <Archive className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}{selected.status === 'ACTIVE' ? t('automation.archive') : t('automation.restore')}</Button>}
                <Button onClick={() => void save()} disabled={busy || !draft.name.trim()}><Save className="h-4 w-4" />{selected ? t('automation.saveRevision') : t('common.create')}</Button>
              </div>
            </div>

            <label className="grid gap-1 text-sm">{t('automation.name')}<input className="rounded-lg border border-input bg-background p-2" value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} /></label>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm">{t('automation.transform')}<select className="rounded-lg border border-input bg-background p-2" value={draft.orthogonal_mode} onChange={event => setDraft(current => ({ ...current, orthogonal_mode: event.target.value }))}>{ORTHOGONAL_TRANSFORM_MODES.map(mode => <option key={mode} value={mode}>{translated(MODE_LABELS, mode, t, 'automation.transform')}</option>)}</select></label>
              <label className="grid gap-1 text-sm">{t('automation.targetWidth')}<input className="rounded-lg border border-input bg-background p-2" type="number" min="1" step="1" value={draft.target_width} onChange={event => setDraft(current => ({ ...current, target_width: Number(event.target.value) }))} /></label>
              <label className="grid gap-1 text-sm">{t('automation.targetHeight')}<input className="rounded-lg border border-input bg-background p-2" type="number" min="1" step="1" value={draft.target_height} onChange={event => setDraft(current => ({ ...current, target_height: Number(event.target.value) }))} /></label>
            </div>
            {dirty && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{t('automation.dirtyDraft')}</p>}
          </section>

          <section className="space-y-4 rounded-2xl border border-border/60 p-4">
            <div><p className="font-medium">{t('automation.manualRun')}</p><p className="text-xs text-muted-foreground">{t('automation.manualRunHint')}</p></div>
            <label className="grid gap-1 text-sm">{t('automation.project')}<select className="rounded-lg border border-input bg-background p-2" value={selectedProjectId} onChange={event => { setSelectedProjectId(event.target.value); setInvocation(null); }}>{projects.map(project => <option key={project.id} value={project.id}>{project.name || project.id}</option>)}</select></label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void run()} disabled={!canRun}><Play className="h-4 w-4" />{t('automation.run')}</Button>
              <Button variant="outline" onClick={() => void resumeLatest()} disabled={!resumePointer || busy}><Undo2 className="h-4 w-4" />{t('automation.resumeLatest')}</Button>
              {invocation?.retryAvailable && <Button variant="outline" onClick={() => void retry()} disabled={busy}><RotateCcw className="h-4 w-4" />{t('automation.retry')}</Button>}
              {invocation && !isTerminal && <Button variant="outline" onClick={() => void cancel()} disabled={busy}><Square className="h-4 w-4" />{t('common.cancel')}</Button>}
            </div>

            {invocation && <InvocationPanel invocation={invocation} busy={busy} onAccept={accept} t={t} />}
          </section>
        </main>
      </div>
    </div>
  );
}

function InvocationPanel({ invocation, busy, onAccept, t }) {
  const stateLabel = translated(INVOCATION_STATE_LABELS, invocation.state, t, 'automation.stateUnknown');
  const attemptLabel = invocation.attemptStatus ? translated(ATTEMPT_STATUS_LABELS, invocation.attemptStatus, t, 'automation.attemptUnknown') : '';
  return <div className="space-y-3 rounded-xl bg-secondary/40 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{t('automation.invocation')}: {invocation.invocationId}</p><p className="text-xs text-muted-foreground">{t('automation.definitionState', { revision: invocation.definitionRevision, state: stateLabel })}{invocation.attemptStatus ? ` · ${t('automation.attempt', { status: attemptLabel })}` : ''}</p></div>{invocation.failureCode && <span className="text-xs text-destructive">{invocation.failureCode}</span>}</div>
    {invocation.nextAction && <p className="text-xs text-muted-foreground">{t('automation.coreNextAction', { operation: translated(OPERATION_LABELS, invocation.nextAction.operation, t, 'automation.operationUnknown') })}</p>}
    {invocation.state === 'SUCCESS' && invocation.terminalImageUrl && <img src={deliveryUrl(invocation.terminalImageUrl)} alt={t('automation.resultPreview')} className="max-h-[480px] w-full rounded-xl bg-muted object-contain" />}
    {invocation.state === 'SUCCESS' && invocation.terminalArtifactId && <Button onClick={() => void onAccept()} disabled={busy}>{t('automation.acceptResult')}</Button>}
  </div>;
}

function transportPlan(draft) {
  if (!Number.isSafeInteger(draft.target_width) || draft.target_width < 1 || !Number.isSafeInteger(draft.target_height) || draft.target_height < 1) throw new Error('Target width and height must be positive integers.');
  if (!ORTHOGONAL_TRANSFORM_MODES.includes(draft.orthogonal_mode)) throw new Error('Unsupported orthogonal transform mode.');
  return Object.freeze({ kind: PLAN_KIND, orthogonal_mode: draft.orthogonal_mode, target_width: draft.target_width, target_height: draft.target_height });
}
function deliveryUrl(value) {
  if (typeof value !== 'string' || !value) return '';
  if (/^https?:\/\//i.test(value) || typeof window === 'undefined') return value;
  try {
    const apiRoot = new URL((import.meta.env ?? {}).VITE_CORE_API_URL || '/api/core', window.location.origin);
    return value.startsWith('/') ? `${apiRoot.origin}${value}` : new URL(value, `${apiRoot.toString().replace(/\/?$/, '/')}`).toString();
  } catch { return value; }
}
function storageKey(automationId, projectId) { return `bers:automation-invocation:${automationId}:${projectId}`; }
function startIntentKey(automationId, projectId) { return `bers:automation-start-intent:${automationId}:${projectId}`; }
function rememberInvocation(automationId, projectId, invocationId) { try { localStorage.setItem(storageKey(automationId, projectId), invocationId); } catch {} }
function recalledInvocation(automationId, projectId) { try { return localStorage.getItem(storageKey(automationId, projectId)) || ''; } catch { return ''; } }
function forgetInvocation(automationId, projectId) { try { localStorage.removeItem(storageKey(automationId, projectId)); } catch {} }
function loadOrCreateStartIntent(automationId, projectId, definitionRevision) {
  const key = startIntentKey(automationId, projectId);
  let raw;
  try { raw = localStorage.getItem(key); }
  catch { throw new Error('Durable browser storage is required to start an Automation safely.'); }
  if (raw) {
    try {
      const existing = JSON.parse(raw);
      if (existing?.version === 1 && existing.definitionRevision === definitionRevision && typeof existing.clientRequestId === 'string' && existing.clientRequestId) return existing.clientRequestId;
    } catch {}
  }
  const clientRequestId = globalThis.crypto.randomUUID();
  try { localStorage.setItem(key, JSON.stringify({ version: 1, definitionRevision, clientRequestId })); }
  catch { throw new Error('Durable browser storage is required to start an Automation safely.'); }
  return clientRequestId;
}
function clearStartIntent(automationId, projectId) { try { localStorage.removeItem(startIntentKey(automationId, projectId)); } catch {} }
function message(cause, t) {
  const raw = cause instanceof Error ? cause.message : '';
  const known = {
    'Target width and height must be positive integers.': 'automation.invalidDimensions',
    'Unsupported orthogonal transform mode.': 'automation.unsupportedTransform',
    'Durable browser storage is required to start an Automation safely.': 'automation.storageRequired',
    'Automation request failed.': 'automation.requestFailed',
  };
  return known[raw] ? t(known[raw]) : raw || t('automation.requestFailed');
}
