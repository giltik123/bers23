import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionRecovery } from '../src/lib/performance/sessionRecovery.js';

const STORAGE_KEY = 'photo-editor-session';

function replaceSessionStorage(descriptor) {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, ...descriptor });
}

test('Editor session recovery degrades to same-tab memory when sessionStorage is unavailable', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');

  try {
    replaceSessionStorage({
      get() {
        throw new Error('sessionStorage access is blocked');
      },
    });

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

    replaceSessionStorage({
      value: {
        getItem() {
          throw new Error('sessionStorage read is denied');
        },
        setItem() {
          throw new Error('sessionStorage write is denied');
        },
      },
    });

    assert.doesNotThrow(() => sessionRecovery.saveRoute('/assets'));
    assert.equal(sessionRecovery.restore().route, '/assets');

    const values = new Map();
    replaceSessionStorage({
      value: {
        getItem(key) {
          return values.get(key) ?? null;
        },
        setItem(key, value) {
          values.set(key, value);
        },
      },
    });

    assert.doesNotThrow(() => sessionRecovery.saveEditor({
      projectId: 'project-2',
      selectionId: null,
      historyIndex: 0,
    }));

    const persisted = JSON.parse(values.get(STORAGE_KEY));
    assert.equal(persisted.route, '/assets');
    assert.deepEqual(persisted.editor, {
      projectId: 'project-2',
      selectionId: null,
      historyIndex: 0,
    });
    assert.equal(typeof persisted.savedAt, 'number');
    assert.deepEqual(sessionRecovery.restore(), persisted);

    values.set(STORAGE_KEY, '{invalid-json');
    assert.deepEqual(sessionRecovery.restore(), persisted);
  } finally {
    if (original) Object.defineProperty(globalThis, 'sessionStorage', original);
    else delete globalThis.sessionStorage;
  }
});
