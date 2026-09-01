import { createHash } from 'node:crypto';
import manifest from '../src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json' with { type: 'json' };

const decoderPaths = Object.freeze([
  'model_index.json',
  'unet/config.json',
  'movq/config.json',
  'scheduler/scheduler_config.json',
]);
const priorPaths = Object.freeze([
  'model_index.json',
  'prior/config.json',
  'scheduler/scheduler_config.json',
  'image_encoder/config.json',
  'image_processor/preprocessor_config.json',
  'text_encoder/config.json',
  'tokenizer/tokenizer_config.json',
  'tokenizer/special_tokens_map.json',
  'tokenizer/vocab.json',
  'tokenizer/merges.txt',
]);

async function fetchBytes(repository, revision, path) {
  const url = `https://huggingface.co/${repository}/resolve/${revision}/${path}`;
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'bers-f5b1-config-inventory/1' } });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 5 * 1024 * 1024) throw new Error(`Refusing unexpectedly large config artifact ${path}: ${bytes.byteLength} bytes`);
      return bytes;
    } catch (error) {
      last = error;
      if (attempt < 4) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Cannot inventory ${repository}@${revision}:${path}: ${last instanceof Error ? last.message : String(last)}`);
}

async function inventory(repository, revision, paths) {
  const files = [];
  for (const path of paths) {
    const bytes = await fetchBytes(repository, revision, path);
    files.push(Object.freeze({
      path,
      size: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }));
  }
  return Object.freeze({ repository, revision, files: Object.freeze(files) });
}

const evidence = Object.freeze({
  schema: 'BERS_F5B1_KANDINSKY_CONFIG_INVENTORY_V1',
  decoder: await inventory(manifest.decoder.repository, manifest.decoder.revision, decoderPaths),
  offlinePrior: await inventory(manifest.offlinePrior.repository, manifest.offlinePrior.revision, priorPaths),
  modelBytesDownloaded: 0,
  authorityGranted: false,
});

console.log(JSON.stringify(evidence, null, 2));
