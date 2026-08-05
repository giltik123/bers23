import assert from 'node:assert/strict';
import test from 'node:test';
import { AssetManager, InMemoryStorageAdapter, asset } from '../src/application/assets/index.ts';

const owner = { tenantId: 'tenant-1', projectId: 'project-1', userId: 'user-1' };
const createInput = {
  id: 'original-photo',
  tenantId: 'tenant-1',
  ownerId: 'user-1',
  projectId: 'project-1',
  sessionId: 'session-1',
  type: 'IMAGE',
  source: { uploadName: 'original.png' },
  metadata: { width: 1024, height: 1024 },
};

const createReadyAsset = async () => {
  const manager = new AssetManager();
  const created = await manager.create(createInput);
  await manager.register(created.id, { key: 'storage/original-photo', data: 'image-bytes', metadata: { contentType: 'image/png' } }, owner);
  return { manager, created: manager.get(created.id, owner) };
};

test('create asset', async () => {
  const manager = new AssetManager();
  const created = await manager.create(createInput);

  assert.equal(created.id, 'original-photo');
  assert.equal(created.projectId, 'project-1');
  assert.equal(created.sessionId, 'session-1');
  assert.equal(created.type, 'IMAGE');
  assert.equal(created.status, 'UPLOADED');
  assert.deepEqual(created.metadata, { width: 1024, height: 1024 });
});

test('register asset', async () => {
  const { manager, created } = await createReadyAsset();

  assert.equal(created.status, 'READY');
  assert.deepEqual(created.source, { storageKey: 'storage/original-photo' });
  assert.equal(await manager.storageExists(created.id), true);
});

test('version chain', async () => {
  const manager = new AssetManager();
  const original = await manager.create(createInput);
  const hair = await manager.create({ ...createInput, id: 'hair-color-v2', type: 'RESULT', source: { generatedFrom: original.id } });
  const catalog = await manager.create({ ...createInput, id: 'catalog-photo-v3', type: 'RESULT', source: { generatedFrom: hair.id } });
  manager.version(original.id, { parentAssetId: null, operation: 'Upload image', workflowId: 'upload-image', executionId: 'exec-1' }, owner);
  manager.version(hair.id, { parentAssetId: original.id, operation: 'Change hair color', workflowId: 'hair-color-edit', executionId: 'exec-2' }, owner);
  manager.version(catalog.id, { parentAssetId: hair.id, operation: 'Create catalog photo', workflowId: 'virtual-try-on', executionId: 'exec-3' }, owner);

  assert.deepEqual(manager.history(catalog.id, owner).map((version) => version.assetId), ['original-photo', 'hair-color-v2', 'catalog-photo-v3']);
});

test('lineage', async () => {
  const manager = new AssetManager();
  const original = await manager.create(createInput);
  const result = await manager.create({ ...createInput, id: 'hair-color-v2', type: 'RESULT', source: { generatedFrom: original.id } });
  const lineage = manager.version(result.id, { parentAssetId: original.id, operation: 'Change hair color', workflowId: 'hair-color-edit', executionId: 'exec-hair' }, owner);

  assert.equal(lineage.assetId, 'hair-color-v2');
  assert.equal(lineage.parentAssetId, 'original-photo');
  assert.equal(lineage.workflowId, 'hair-color-edit');
  assert.equal(lineage.executionId, 'exec-hair');
});

test('storage adapter', async () => {
  const storage = new InMemoryStorageAdapter();
  const saved = await storage.save({ key: 'asset-key', data: { bytes: 'abc' }, metadata: { checksum: 'sha256' } });

  assert.equal(saved.key, 'asset-key');
  assert.equal(await storage.exists('asset-key'), true);
  assert.deepEqual(await storage.read('asset-key'), { key: 'asset-key', data: { bytes: 'abc' }, metadata: { checksum: 'sha256' } });
  await storage.delete('asset-key');
  assert.equal(await storage.exists('asset-key'), false);
});

test('tenant isolation', async () => {
  const manager = new AssetManager();
  const created = await manager.create(createInput);

  assert.throws(() => manager.get(created.id, { ...owner, tenantId: 'tenant-2' }), /Tenant access denied/);
});

test('project isolation', async () => {
  const manager = new AssetManager();
  const created = await manager.create(createInput);
  await manager.create({ ...createInput, id: 'project-2-asset', projectId: 'project-2' });

  assert.throws(() => manager.get(created.id, { ...owner, projectId: 'project-2' }), /Project access denied/);
  assert.deepEqual(manager.list(owner).map((item) => item.id), ['original-photo']);
});

test('owner access', async () => {
  const manager = new AssetManager();
  const created = await manager.create(createInput);

  assert.throws(() => manager.updateMetadata(created.id, { label: 'bad' }, { ...owner, userId: 'user-2' }), /Owner access denied/);
});

test('archive/delete', async () => {
  const { manager, created } = await createReadyAsset();
  const archived = manager.archive(created.id, owner);
  assert.equal(archived.status, 'ARCHIVED');

  const deleted = await manager.delete(created.id, owner);
  assert.equal(deleted.status, 'DELETED');
  assert.equal(await manager.storageExists(created.id), false);
  assert.deepEqual(manager.list(owner).map((item) => item.id), []);
});

test('debug snapshot', async () => {
  const { manager, created } = await createReadyAsset();
  manager.version(created.id, { parentAssetId: null, operation: 'Upload image', workflowId: 'upload-image', executionId: 'exec-upload' }, owner);
  const debug = await manager.debug(created.id, owner);

  assert.equal(debug.asset.id, 'original-photo');
  assert.deepEqual(debug.operations, ['Upload image']);
  assert.deepEqual(debug.workflow, ['upload-image']);
  assert.deepEqual(debug.execution, ['exec-upload']);
  assert.deepEqual(debug.storageMetadata, { contentType: 'image/png' });
});

test('recovery reference', async () => {
  const { manager, created } = await createReadyAsset();
  manager.version(created.id, { parentAssetId: null, operation: 'Upload image', workflowId: 'upload-image', executionId: 'exec-upload' }, owner);
  const restarted = new AssetManager({ snapshot: manager.persist() });
  const recovered = restarted.get(created.id, owner);

  assert.equal(recovered.id, 'original-photo');
  assert.deepEqual(recovered.source, { storageKey: 'storage/original-photo' });
  assert.deepEqual(restarted.history(created.id, owner).map((version) => version.operation), ['Upload image']);
});

test('asset.debug(id) singleton contract', async () => {
  const created = await asset.create({ ...createInput, id: 'singleton-asset', projectId: 'singleton-project', tenantId: 'singleton-tenant', ownerId: 'singleton-user' });
  const debug = await asset.debug(created.id);

  assert.equal(debug.asset.id, 'singleton-asset');
  assert.deepEqual(debug.versions, []);
});
