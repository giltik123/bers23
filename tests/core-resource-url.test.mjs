import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProjectResourceUrls, resolveCoreResourceUrl } from '../src/api/coreResourceUrl.js';

const delivery = '/api/core/artifacts/results/payload.signature';

test('same-origin Core preserves canonical root-relative delivery paths', () => {
  assert.equal(resolveCoreResourceUrl(delivery, '/api/core'), delivery);
});

test('split-origin Core resolves only canonical Core-owned root-relative resources', () => {
  assert.equal(
    resolveCoreResourceUrl(delivery, 'https://core.example.test/api/core'),
    `https://core.example.test${delivery}`,
  );
  for (const value of [
    'https://assets.example.test/image.png',
    'blob:https://app.example.test/value',
    'data:image/png;base64,AA==',
    '/other/image.png',
  ]) assert.equal(resolveCoreResourceUrl(value, 'https://core.example.test/api/core'), value);
});

test('malformed or non-canonical API roots never become browser URL rewrite authority', () => {
  for (const root of [
    'not-a-url',
    'https://core.example.test/api/core/',
    'https://user:secret@core.example.test/api/core',
    'https://core.example.test/api/core?mode=unsafe',
    'ftp://core.example.test/api/core',
  ]) assert.equal(resolveCoreResourceUrl(delivery, root), delivery);
});

test('project normalization covers browser-visible canonical image surfaces including version previews', () => {
  const canonicalVersionPreview = '/api/core/artifacts/results/version.signature';
  const externalVersionPreview = 'https://assets.example.test/version.png';
  const project = Object.freeze({
    id: 'project-1',
    current_image_url: delivery,
    original_image_url: '/api/core/artifacts/results/original.signature',
    thumbnail_url: '/api/core/artifacts/results/thumb.signature',
    versions: Object.freeze([
      Object.freeze({ version_id: 'version-1', name: 'Canonical', preview_url: canonicalVersionPreview }),
      Object.freeze({ version_id: 'version-2', name: 'External', preview_url: externalVersionPreview }),
    ]),
    metadata: Object.freeze({ retained: true }),
  });
  const normalized = normalizeProjectResourceUrls(project, 'http://127.0.0.1:4188/api/core');
  assert.equal(normalized.current_image_url, `http://127.0.0.1:4188${delivery}`);
  assert.equal(normalized.original_image_url, 'http://127.0.0.1:4188/api/core/artifacts/results/original.signature');
  assert.equal(normalized.thumbnail_url, 'http://127.0.0.1:4188/api/core/artifacts/results/thumb.signature');
  assert.equal(normalized.versions[0].preview_url, `http://127.0.0.1:4188${canonicalVersionPreview}`);
  assert.equal(normalized.versions[0].version_id, 'version-1');
  assert.equal(normalized.versions[0].name, 'Canonical');
  assert.equal(normalized.versions[1].preview_url, externalVersionPreview);
  assert.notEqual(normalized.versions, project.versions);
  assert.equal(project.versions[0].preview_url, canonicalVersionPreview, 'normalization must not mutate the server response');
  assert.equal(normalized.metadata, project.metadata);
});
