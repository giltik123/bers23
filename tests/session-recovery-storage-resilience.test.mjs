import assert from 'node:assert/strict';
import test from 'node:test';
import { readHint, writeHint, clearHint } from '../src/components/editor/agent/sessionHintStorage.js';
import { getSafeSessionStorage } from '../src/lib/performance/safeSessionStorage.js';
import { sessionRecovery } from '../src/lib/performance/sessionRecovery.js';

const SESSION_KEY = 'photo-editor-session';
const AGENT_KEY = 'bers:bounded-agent:v1:project-2';

function replaceSessionStorage(descriptor) {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, ...descriptor });
}

test('Editor and bounded Agent recovery degrade safely and resume session persistence', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

  try {
    replaceSessionStorage({
      get() {
        throw new Error('sessionStorage access is blocked');
      },
    });

    assert.equal(getSafeSessionStorage(), null);
    assert.doesNotThrow(() => sessionRecovery.saveRoute('/editor?project=project-1'));
    assert.equal(sessionRecovery.restore().route, '/editor?project=project-1');
    assert.doesNotThrow(() => sessionRecovery.saveEditor({
      projectId: 'project-1',
      selectionId: 'mask-1',
      historyIndex: 3,
    }));
    assert.deepEqual(sessionRecovery.restore().editor, {
      projectId: 'project-1',
      selectionId: 'mask-1',
      historyIndex: 3,
    });
    assert.doesNotThrow(() => writeHint('project-1', { executionId: 'exec-1' }));
    assert.equal(readHint('project-1'), null);
    assert.doesNotThrow(() => clearHint('project-1'));

    replaceSessionStorage({
      value: {
        getItem() {
          throw new Error('sessionStorage read is denied');
        },
        setItem() {
          throw new Error('sessionStorage write is denied');
        },
        removeItem() {
          throw new Error('sessionStorage remove is denied');
        },
      },
    });

    assert.ok(getSafeSessionStorage());
    assert.doesNotThrow(() => sessionRecovery.saveRoute('/assets'));
    assert.equal(sessionRecovery.restore().route, '/assets');
    assert.equal(readHint('project-1'), null);
    assert.doesNotThrow(() => writeHint('project-1', { executionId: 'exec-2' }));
    assert.doesNotThrow(() => clearHint('project-1'));

    const values = new Map();
    values.set(SESSION_KEY, JSON.stringify({
      route: '/stale-route',
      editor: { projectId: 'stale-project', selectionId: null, historyIndex: 0 },
      savedAt: 1,
    }));
    replaceSessionStorage({
      value: {
        getItem(key) {
          return values.get(key) ?? null;
        },
        setItem(key, value) {
          values.set(key, value);
        },
        removeItem(key) {
          values.delete(key);
        },
      },
    });

    assert.equal(sessionRecovery.restore().route, '/assets');
    assert.doesNotThrow(() => sessionRecovery.saveEditor({
      projectId: 'project-2',
      selectionId: null,
      historyIndex: 0,
    }));
    writeHint('project-2', {
      executionId: 'exec-3',
      sourceArtifactId: 'artifact-1',
      mode: 'RESIZE',
      width: 128,
      height: 96,
    });

    const persisted = JSON.parse(values.get(SESSION_KEY));
    assert.equal(persisted.route, '/assets');
    assert.deepEqual(persisted.editor, {
      projectId: 'project-2',
      selectionId: null,
      historyIndex: 0,
    });
    assert.equal(typeof persisted.savedAt, 'number');
    assert.deepEqual(sessionRecovery.restore(), persisted);
    assert.deepEqual(readHint('project-2'), {
      executionId: 'exec-3',
      sourceArtifactId: 'artifact-1',
      mode: 'RESIZE',
      width: 128,
      height: 96,
    });

    clearHint('project-2');
    assert.equal(values.has(AGENT_KEY), false);
    values.set(SESSION_KEY, '{invalid-json');
    assert.deepEqual(sessionRecovery.restore(), persisted);
    values.set(AGENT_KEY, '{invalid-json');
    assert.equal(readHint('project-2'), null);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  }
});
