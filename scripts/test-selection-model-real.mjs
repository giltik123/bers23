import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
  const candidates = [join(packDir, `${name}.onnx`), join(packDir, `mobilesam-${name}.onnx`)];
  const file = candidates.find(existsSync) ?? candidates[0], signatureFile = `${file}.sig`, metadata = manifest.artifacts[name];
  const size = (await stat(file)).size;
  if (size !== metadata.size) throw new Error(`MODEL_DIGEST_MISMATCH: ${name} size ${size} != ${metadata.size}`);
  const bytes = await readFile(file), digest = createHash('sha256').update(bytes).digest('hex');
  if (digest !== metadata.sha256) throw new Error(`MODEL_DIGEST_MISMATCH: ${name} SHA-256`);
  const signature = Buffer.from((await readFile(signatureFile, 'utf8')).trim(), 'base64');
  if (!verify(null, bytes, key, signature)) throw new Error(`MODEL_SIGNATURE_INVALID: ${name}`);
}
const inference = spawnSync(process.env.PYTHON ?? 'python3', [new URL('./run-mobilesam-inference.py', import.meta.url).pathname, packDir], { encoding: 'utf8' });
if (inference.status !== 0) throw new Error(`REAL_MOBILESAM_INFERENCE_FAILED: ${inference.stderr || inference.stdout || `exit ${inference.status}`}`);
const evidence = JSON.parse(inference.stdout.trim());
if (evidence.provider !== 'CPUExecutionProvider' || !(evidence.coverage > 0 && evidence.coverage < 1)) throw new Error('REAL_MOBILESAM_INFERENCE_INVALID');
console.log(`ONNX GRAPH SANITY TEST: verified external MobileSAM pack ${manifest.modelId}@${manifest.version}; ${evidence.provider} coverage=${evidence.coverage.toFixed(4)}, latencyMs=${evidence.latencyMs}. This is not production local-runtime or browser-WASM proof.`);
