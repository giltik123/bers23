import assert from 'node:assert/strict';
import test from 'node:test';

import { createCreativeEditApplicationService } from '../src/application/creative/CreativeEditApplicationService.js';
import { CoreMaskArtifactPort } from '../src/application/selection/CoreMaskArtifactPort.js';

test('production application adapters import in Node and use injected clients', async () => {
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof document, 'undefined');
  assert.equal(typeof localStorage, 'undefined');
  assert.equal(import.meta.env, undefined);

  const maskCalls: unknown[] = [];
  const creativeCalls: unknown[] = [];
  const client = {
    artifacts: {
      async persistMask(input: unknown) {
        maskCalls.push(input);
        return { artifactId: 'server-mask-id', role: 'MASK', state: 'READY', encoding: 'ALPHA_8_LOSSLESS', coordinateSpace: 'ORIGINAL', producerOperation: 'MANUAL_SELECTION' };
      },
    },
    creative: {
      async execute(input: unknown) {
        creativeCalls.push(input);
        return { executionId: 'execution-id', status: 'SUCCESS', finalArtifactId: 'final-id', imageUrl: '/delivery' };
      },
      cancel() {},
      status() {},
    },
  };

  const alpha = new Uint8Array([255]);
  const mask = await new CoreMaskArtifactPort('project-id', 'source-image-id', client).persist(
    { width: 1, height: 1, alpha, coordinateSpace: 'ORIGINAL' },
    { coordinateSpace: 'ORIGINAL', encoding: 'ALPHA_8_LOSSLESS', sourceImageArtifactId: 'source-image-id' },
  );
  assert.equal(mask.id, 'server-mask-id');
  assert.deepEqual(maskCalls, [{ projectId: 'project-id', sourceImageArtifactId: 'source-image-id', parentMaskArtifactId: undefined, width: 1, height: 1, alpha }]);

  const result = await createCreativeEditApplicationService(client).execute({
    projectId: 'project-id', instruction: '  edit  ', inputArtifactId: 'input-id', maskArtifactIds: ['server-mask-id'],
  });
  assert.equal(result.executionId, 'execution-id');
  assert.deepEqual(creativeCalls, [{
    projectId: 'project-id', instruction: 'edit', selectedObjectIds: [], inputArtifactId: 'input-id',
    maskArtifactIds: ['server-mask-id'], preserveMode: undefined, clientRequestId: undefined,
  }]);
});
