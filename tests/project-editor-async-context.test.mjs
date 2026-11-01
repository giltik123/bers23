import assert from 'node:assert/strict';
import test from 'node:test';
import { createProjectRequestGate } from '../src/hooks/projectRequestGate.js';

test('route switch invalidates a pending Project A load before effect cleanup', () => {
  const gate = createProjectRequestGate('A');
  const oldRead = gate.begin('A');
  gate.sync('B');
  assert.equal(gate.isCurrent('A', oldRead), false);
  assert.equal(gate.begin('A'), null);
  const newRead = gate.begin('B');
  assert.equal(gate.isCurrent('B', newRead), true);
});

test('a slower previous reload cannot overwrite a newer reload', () => {
  const gate = createProjectRequestGate('A');
  const first = gate.begin('A');
  const second = gate.begin('A');
  assert.equal(gate.isCurrent('A', first), false);
  assert.equal(gate.isCurrent('A', second), true);
});

test('a mutation supersedes a pending read for the same Project', () => {
  const gate = createProjectRequestGate('A');
  const read = gate.begin('A');
  const mutation = gate.begin('A');
  assert.equal(gate.isCurrent('A', read), false);
  assert.equal(gate.isCurrent('A', mutation), true);
});

test('cleanup invalidates pending requests and null tickets are never current', () => {
  const gate = createProjectRequestGate('A');
  const request = gate.begin('A');
  gate.invalidate();
  assert.equal(gate.isCurrent('A', request), false);
  assert.equal(gate.isCurrent('A', null), false);
});

test('route roundtrip does not revive an old request ticket', () => {
  const gate = createProjectRequestGate('A');
  const original = gate.begin('A');
  gate.sync('B');
  gate.sync('A');
  const current = gate.begin('A');
  assert.equal(gate.isCurrent('A', original), false);
  assert.equal(gate.isCurrent('A', current), true);
});
