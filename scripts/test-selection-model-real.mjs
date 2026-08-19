import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const packDir = process.env.SELECTION_MODEL_PACK_DIR;
if (!packDir) {
  console.error('SELECTION_MODEL_PACK_DIR is required. Production model weights are never read from the repository.');
  process.exit(2);
}
const modelRoot = new URL('../src/platform/creative/local-ai/models/', import.meta.url);
const manifestBytes = await readFile(new URL('interactive-segmentation.manifest.json', modelRoot));
const manifest = JSON.parse(manifestBytes);
const key = createPublicKey(await readFile(new URL('interactive-segmentation.public-key.pem', modelRoot), 'utf8'));
const manifestSig = Buffer.from((await readFile(new URL('interactive-segmentation.manifest.sig', modelRoot), 'utf8')).trim(), 'base64');
if (!verify(null, manifestBytes, key, manifestSig)) throw new Error('MODEL_SIGNATURE_INVALID: manifest');
for (const name of ['encoder', 'decoder']) {
  const file = join(packDir, `${name}.onnx`), signatureFile = `${file}.sig`, metadata = manifest.artifacts[name];
  const size = (await stat(file)).size;
  if (size !== metadata.size) throw new Error(`MODEL_DIGEST_MISMATCH: ${name} size ${size} != ${metadata.size}`);
  const bytes = await readFile(file), digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== metadata.sha256) throw new Error(`MODEL_DIGEST_MISMATCH: ${name} SHA-256`);
  const signature = Buffer.from((await readFile(signatureFile, 'utf8')).trim(), 'base64');
  if (!verify(null, bytes, key, signature)) throw new Error(`MODEL_SIGNATURE_INVALID: ${name}`);
}
console.log(`Verified external MobileSAM pack ${manifest.modelId}@${manifest.version}. Runtime benchmark adapter may now load it through OnnxLocalRuntime.`);
