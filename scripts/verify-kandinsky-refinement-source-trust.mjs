import manifest from '../src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json' with { type: 'json' };
import { parseSourcePointer, readBoundedPointerText } from './kandinsky-source-trust-pointer.mjs';

const HUB = 'https://huggingface.co';
const MAX_ATTEMPTS = 4;

async function fetchWithRetry(url) {
  let last;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'text/plain', 'user-agent': 'bers-f5b1-source-trust/2' },
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < MAX_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Hugging Face pointer request failed: ${url}: ${last instanceof Error ? last.message : String(last)}`);
}

function encodedRepository(repository) {
  const parts = String(repository).split('/');
  if (parts.length !== 2 || parts.some(part => !part)) throw new Error(`Invalid Hugging Face repository identity: ${repository}`);
  return parts.map(encodeURIComponent).join('/');
}

function encodedPath(path) {
  const parts = String(path).split('/');
  if (parts.length < 1 || parts.some(part => !part || part === '.' || part === '..')) throw new Error(`Invalid pinned source path: ${path}`);
  return parts.map(encodeURIComponent).join('/');
}

async function readPinnedPointer(repository, revision, path) {
  if (!/^[0-9a-f]{40}$/i.test(revision)) throw new Error(`Pinned Hugging Face revision must be a 40-hex commit: ${repository}@${revision}`);
  const url = `${HUB}/${encodedRepository(repository)}/raw/${revision}/${encodedPath(path)}`;
  const response = await fetchWithRetry(url);
  const text = await readBoundedPointerText(response, `${repository}@${revision}:${path}`);
  return parseSourcePointer(text, `${repository}@${revision}:${path}`);
}

async function assertPinnedWeights(expected, repository, revision) {
  for (const pinned of expected) {
    const remote = await readPinnedPointer(repository, revision, pinned.path);
    if (remote.size !== pinned.size) {
      throw new Error(`Pinned size drift: ${pinned.path}: manifest=${pinned.size} upstream=${remote.size}`);
    }
    if (remote.sha256 !== pinned.sha256) {
      throw new Error(`Pinned SHA-256 drift: ${pinned.path}: manifest=${pinned.sha256} upstream=${remote.sha256}`);
    }
  }
}

await assertPinnedWeights(manifest.decoder.safeWeights, manifest.decoder.repository, manifest.decoder.revision);
await assertPinnedWeights(manifest.offlinePrior.safeWeights, manifest.offlinePrior.repository, manifest.offlinePrior.revision);

console.log(JSON.stringify({
  state: 'PASS',
  trustTransport: 'BOUNDED_GIT_LFS_RAW_POINTER_SHA256_SIZE',
  decoder: { repository: manifest.decoder.repository, revision: manifest.decoder.revision, files: manifest.decoder.safeWeights.length },
  offlinePrior: { repository: manifest.offlinePrior.repository, revision: manifest.offlinePrior.revision, files: manifest.offlinePrior.safeWeights.length },
  downloadedModelBytes: 0,
}, null, 2));
