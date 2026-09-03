import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createManagedGarmentClient, normalizeManagedGarmentDto } from '../src/api/managedGarmentClient.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const GARMENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const VIEW_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SHA = 'c'.repeat(64);

function capture({ cardinal = [], low = [], details = 0, unspecified = 0 } = {}) {
  const order = ['FRONT','BACK','LEFT','RIGHT'];
  const present = order.filter(kind => cardinal.includes(kind));
  const missing = order.filter(kind => !cardinal.includes(kind));
  const lowKinds = order.filter(kind => low.includes(kind));
  return {
    cardinal_complete: missing.length === 0,
    cardinal_coverage_score: present.length / 4,
    present_cardinal_view_kinds: present,
    missing_cardinal_view_kinds: missing,
    detail_view_count: details,
    unspecified_view_count: unspecified,
    technical_resolution: {
      status: present.length === 0 ? 'NOT_ASSESSED' : lowKinds.length ? 'NEEDS_HIGHER_RESOLUTION' : 'ADEQUATE',
      minimum_best_cardinal_short_edge_px: present.length ? (lowKinds.length ? 400 : 600) : null,
      threshold_short_edge_px: 512,
      low_resolution_cardinal_view_kinds: lowKinds,
      low_resolution_view_ids: lowKinds.map(() => VIEW_ID),
    },
    semantic_quality: 'NOT_ASSESSED',
    next_capture_requests: [
      ...missing.map(view_kind => ({ view_kind, reason: 'MISSING_CARDINAL_VIEW' })),
      ...lowKinds.map(view_kind => ({ view_kind, reason: 'LOW_RESOLUTION_CARDINAL_VIEW' })),
    ],
  };
}

function view(overrides = {}) {
  return {
    id: VIEW_ID,
    ordinal: 0,
    kind: 'FRONT',
    width: 600,
    height: 600,
    encoding: 'PNG_RGBA8_LOSSLESS',
    content_type: 'image/png',
    content_sha256: SHA,
    storage_provenance: 'POSTGRES_BYTEA_V1',
    delivery_url: '/api/core/garments/delivery/signed-token',
    delivery_expires_at: '2026-09-03T00:05:00.000Z',
    created_at: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

function dto(overrides = {}) {
  return {
    id: GARMENT_ID,
    name: 'Jacket',
    representation_tier: 'BASIC',
    status: 'ACTIVE',
    revision: 1,
    primary_view_id: VIEW_ID,
    capture_assessment: capture({ cardinal: ['FRONT'] }),
    views: [view()],
    created_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

function recorder(response = dto()) {
  const calls = [];
  return {
    calls,
    request: async (url, options) => {
      calls.push({ url, options });
      return typeof response === 'function' ? response(url, options) : structuredClone(response);
    },
  };
}

test('Managed Garment client is transport-injected and has no generic Asset/entity/provider authority', async () => {
  const source = await fs.readFile(path.join(ROOT, 'src/api/managedGarmentClient.js'), 'utf8');
  for (const forbidden of ['fetch(', 'coreClient.entities', 'UploadFile', 'garmentManager', 'FASHN', 'provider', 'Billing', 'cloud']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /createManagedGarmentClient\(request\)/);
  assert.match(source, /X-Expected-Garment-Revision/);
  assert.match(source, /\/api\/core\/garments\/delivery\//);
});

test('Managed Garment create sends image bytes directly to the narrow authority', async () => {
  const { calls, request } = recorder();
  const image = new Blob([new Uint8Array([1,2,3])], { type: 'image/jpeg' });
  const client = createManagedGarmentClient(request);
  await client.create({ name: '  Jacket  ', viewKind: ' front ', image });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/garments?name=Jacket&view=FRONT');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(calls[0].options.headers, { 'Content-Type': 'image/jpeg' });
  assert.equal(calls[0].options.body, image);
});

test('Managed Garment append-view requires a concrete view kind and one optimistic revision', async () => {
  const secondViewId = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const response = dto({
    revision: 2,
    capture_assessment: capture({ cardinal: ['FRONT','BACK'] }),
    views: [view(), view({ id: secondViewId, ordinal: 1, kind: 'BACK', delivery_url: '/api/core/garments/delivery/second-token' })],
  });
  const { calls, request } = recorder(response);
  const image = new Blob([new Uint8Array([4,5,6])], { type: 'image/png' });
  const client = createManagedGarmentClient(request);
  await client.appendView({ garmentId: GARMENT_ID.toUpperCase(), expectedRevision: 1, viewKind: ' back ', image });
  assert.equal(calls[0].url, `/garments/${GARMENT_ID}/views?view=BACK`);
  assert.deepEqual(calls[0].options.headers, {
    'Content-Type': 'image/png',
    'X-Expected-Garment-Revision': '1',
  });
  assert.equal(calls[0].options.body, image);

  const beforeInvalid = calls.length;
  await assert.rejects(() => client.appendView({ garmentId: GARMENT_ID, expectedRevision: 1, viewKind: 'UNSPECIFIED', image }), /concrete view kind/);
  await assert.rejects(() => client.appendView({ garmentId: GARMENT_ID, expectedRevision: 0, viewKind: 'BACK', image }), /expectedRevision/);
  assert.equal(calls.length, beforeInvalid);
});

test('Managed Garment image intent rejects empty or unsupported browser media before transport', async () => {
  const { calls, request } = recorder();
  const client = createManagedGarmentClient(request);
  await assert.rejects(() => client.create({ name: 'A', image: new Blob([], { type: 'image/png' }) }), /empty/);
  await assert.rejects(() => client.create({ name: 'A', image: new Blob([new Uint8Array([1])], { type: 'image/gif' }) }), /PNG, JPEG or WebP/);
  await assert.rejects(() => client.create({ name: 'A', image: new Uint8Array([1]) }), /Blob\/File/);
  assert.equal(calls.length, 0);
});

test('Managed Garment response exposes only canonical immutable view evidence and server-issued delivery path', () => {
  const result = normalizeManagedGarmentDto(dto());
  assert.equal(result.id, GARMENT_ID);
  assert.equal(result.primaryViewId, VIEW_ID);
  assert.equal(result.views[0].storageProvenance, 'POSTGRES_BYTEA_V1');
  assert.equal(result.views[0].contentSha256, SHA);
  assert.equal(result.views[0].deliveryUrl, '/api/core/garments/delivery/signed-token');
  assert.equal(Object.isFrozen(result.views), true);
  assert.equal(Object.isFrozen(result.captureAssessment), true);

  assert.throws(() => normalizeManagedGarmentDto(dto({ primary_view_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' })), /primary_view_id/);
  const badUrl = dto();
  badUrl.views[0].delivery_url = 'https://example.com/garment.png';
  assert.throws(() => normalizeManagedGarmentDto(badUrl), /delivery_url/);
  const widenedUrl = dto();
  widenedUrl.views[0].delivery_url = '/api/core/garments/delivery/token/extra';
  assert.throws(() => normalizeManagedGarmentDto(widenedUrl), /delivery_url/);
  const badHash = dto();
  badHash.views[0].content_sha256 = SHA.toUpperCase();
  assert.throws(() => normalizeManagedGarmentDto(badHash), /SHA-256/);
  const badStorage = dto();
  badStorage.views[0].storage_provenance = 'BROWSER_CACHE';
  assert.throws(() => normalizeManagedGarmentDto(badStorage), /storage_provenance/);
});

test('Managed Garment independently recomputes capture assessment from immutable views', () => {
  const inconsistent = dto();
  inconsistent.capture_assessment.cardinal_complete = true;
  assert.throws(() => normalizeManagedGarmentDto(inconsistent), /capture_assessment does not match/);

  const wrongMissing = dto();
  wrongMissing.capture_assessment.missing_cardinal_view_kinds = ['BACK','LEFT'];
  assert.throws(() => normalizeManagedGarmentDto(wrongMissing), /capture_assessment does not match|canonical cardinal order/);

  const low = dto({
    capture_assessment: capture({ cardinal: ['FRONT'], low: ['FRONT'] }),
    views: [view({ width: 400, height: 600 })],
  });
  const accepted = normalizeManagedGarmentDto(low);
  assert.equal(accepted.captureAssessment.technicalResolution.status, 'NEEDS_HIGHER_RESOLUTION');
  assert.deepEqual(accepted.captureAssessment.nextCaptureRequests.at(-1), { viewKind: 'FRONT', reason: 'LOW_RESOLUTION_CARDINAL_VIEW' });
});

test('Managed Garment response rejects DTO drift, noncanonical ordinals and invented evidence', () => {
  assert.throws(() => normalizeManagedGarmentDto(dto({ id: GARMENT_ID.toUpperCase() })), /canonical lowercase UUID/);
  assert.throws(() => normalizeManagedGarmentDto(dto({ representation_tier: 'MESH' })), /representation_tier/);
  const ordinal = dto();
  ordinal.views[0].ordinal = 1;
  assert.throws(() => normalizeManagedGarmentDto(ordinal), /contiguous canonical ordinals/);
  assert.throws(() => normalizeManagedGarmentDto({ ...dto(), provider: 'x' }), /unexpected fields/);
});
