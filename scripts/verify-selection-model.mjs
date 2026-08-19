import { createPublicKey, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const root = new URL('../src/platform/creative/local-ai/models/', import.meta.url);
const manifestBytes = await readFile(new URL('interactive-segmentation.manifest.json', root));
const manifest = JSON.parse(manifestBytes);
const signature = Buffer.from((await readFile(new URL('interactive-segmentation.manifest.sig', root), 'utf8')).trim(), 'base64');
const publicKey = createPublicKey(await readFile(new URL('interactive-segmentation.public-key.pem', root), 'utf8'));
if (!verify(null, manifestBytes, publicKey, signature)) throw new Error('MODEL_SIGNATURE_INVALID: manifest signature verification failed');
const tampered = Buffer.from(manifestBytes); tampered[tampered.length - 2] ^= 1;
if (verify(null, tampered, publicKey, signature)) throw new Error('Tampered manifest was accepted');
if (manifest.status !== 'CANDIDATE') throw new Error('Selection model must remain CANDIDATE during acceptance');
for (const name of ['encoder', 'decoder']) {
  const artifact = manifest.artifacts?.[name];
  if (!artifact || !URL.canParse(artifact.url) || new URL(artifact.url).protocol !== 'https:') throw new Error(`${name}: external HTTPS URL required`);
  if (!Number.isSafeInteger(artifact.size) || artifact.size < 1) throw new Error(`${name}: exact size required`);
  if (!/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new Error(`${name}: SHA-256 required`);
  if (!artifact.signatureUrl || !URL.canParse(artifact.signatureUrl)) throw new Error(`${name}: detached signature URL required`);
}
if (/PRIVATE KEY/.test(await readFile(new URL('interactive-segmentation.public-key.pem', root), 'utf8'))) throw new Error('Private signing material detected');
console.log(`Verified signed manifest ${manifest.modelId}@${manifest.version} (${manifest.status}); artifacts=2`);
