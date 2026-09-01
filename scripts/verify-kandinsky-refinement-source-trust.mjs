import manifest from '../src/platform/creative/local-ai/models/kandinsky-2-2-refinement-feasibility.manifest.json' with { type: 'json' };

const HUB = 'https://huggingface.co';
const MAX_ATTEMPTS = 4;

async function fetchWithRetry(url) {
  let last;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'user-agent': 'bers-f5b1-source-trust/1' },
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
      return response;
    } catch (error) {
      last = error;
      if (attempt < MAX_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, attempt * 750));
    }
  }
  throw new Error(`Hugging Face metadata request failed: ${url}: ${last instanceof Error ? last.message : String(last)}`);
}

function nextLink(value) {
  if (!value) return undefined;
  for (const part of value.split(',')) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return undefined;
}

async function repoTree(repository, revision) {
  const files = [];
  let url = `${HUB}/api/models/${repository}/tree/${revision}?recursive=true&expand=true`;
  while (url) {
    const response = await fetchWithRetry(url);
    const page = await response.json();
    if (!Array.isArray(page)) throw new Error(`Unexpected Hugging Face tree payload for ${repository}@${revision}`);
    files.push(...page);
    url = nextLink(response.headers.get('link'));
  }
  return files;
}

function assertPinnedWeights(tree, expected, repository, revision) {
  const byPath = new Map(tree.filter(item => item?.type === 'file' || item?.path).map(item => [String(item.path), item]));
  for (const pinned of expected) {
    const remote = byPath.get(pinned.path);
    if (!remote) throw new Error(`Pinned file missing upstream: ${repository}@${revision}:${pinned.path}`);
    const remoteSize = Number(remote.lfs?.size ?? remote.size);
    const remoteSha = String(remote.lfs?.sha256 ?? '').toLowerCase();
    if (remoteSize !== pinned.size) {
      throw new Error(`Pinned size drift: ${pinned.path}: manifest=${pinned.size} upstream=${remoteSize}`);
    }
    if (remoteSha !== pinned.sha256) {
      throw new Error(`Pinned SHA-256 drift: ${pinned.path}: manifest=${pinned.sha256} upstream=${remoteSha || '<missing-lfs-sha>'}`);
    }
  }
}

const decoderTree = await repoTree(manifest.decoder.repository, manifest.decoder.revision);
assertPinnedWeights(decoderTree, manifest.decoder.safeWeights, manifest.decoder.repository, manifest.decoder.revision);

const priorTree = await repoTree(manifest.offlinePrior.repository, manifest.offlinePrior.revision);
assertPinnedWeights(priorTree, manifest.offlinePrior.safeWeights, manifest.offlinePrior.repository, manifest.offlinePrior.revision);

console.log(JSON.stringify({
  state: 'PASS',
  decoder: { repository: manifest.decoder.repository, revision: manifest.decoder.revision, files: manifest.decoder.safeWeights.length },
  offlinePrior: { repository: manifest.offlinePrior.repository, revision: manifest.offlinePrior.revision, files: manifest.offlinePrior.safeWeights.length },
  downloadedModelBytes: 0,
}, null, 2));
