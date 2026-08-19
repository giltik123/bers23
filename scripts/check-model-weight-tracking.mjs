import { execFileSync } from 'node:child_process';

const forbidden = /(^|\/)(?:\.local-models|models\/(?:releases|cache|downloads))(?:\/|$)|\.(?:onnx|ort|bin|ckpt|safetensors|pt|pth)$/i;
const threshold = Number(process.env.MODEL_GIT_BLOB_LIMIT_BYTES || 5 * 1024 * 1024);
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const lines = (value) => value ? value.split('\n').filter(Boolean) : [];

const tracked = lines(git('ls-files')).filter((path) => forbidden.test(path));
const base = (() => {
  for (const candidate of ['main', 'origin/main']) {
    try { return git('merge-base', candidate, 'HEAD'); } catch { /* try the next canonical base */ }
  }
  try { return git('rev-parse', 'HEAD^'); } catch { return git('rev-parse', 'HEAD'); }
})();
const changed = new Set([
  ...lines(git('diff', '--name-only', '--diff-filter=ACMR', base, 'HEAD')),
  ...lines(git('diff', '--name-only', '--diff-filter=ACMR')),
  ...lines(git('diff', '--cached', '--name-only', '--diff-filter=ACMR')),
]);
const forbiddenChanges = [...changed].filter((path) => forbidden.test(path));
const history = lines(git('log', '--format=', '--name-only', `${base}..HEAD`)).filter((path) => forbidden.test(path));
const large = [];
for (const path of changed) {
  try {
    const spec = lines(git('ls-tree', '-r', '-l', 'HEAD', '--', path))[0];
    if (!spec) continue;
    const match = spec.match(/^\d+\s+\w+\s+[0-9a-f]+\s+(\d+)\t(.+)$/);
    if (match && Number(match[1]) > threshold) large.push(`${match[2]} (${match[1]} bytes)`);
  } catch { /* uncommitted files are checked by the diff/path policy */ }
}

const failures = [
  tracked.length && `tracked model weights:\n${tracked.join('\n')}`,
  forbiddenChanges.length && `model weights in branch/diff:\n${forbiddenChanges.join('\n')}`,
  history.length && `model weights in feature history:\n${[...new Set(history)].join('\n')}`,
  large.length && `new Git blobs exceed ${threshold} bytes:\n${large.join('\n')}`,
].filter(Boolean);
if (failures.length) throw new Error(failures.join('\n\n'));
console.log(`Model weight guard passed (tracked=0, branch-history=0, large-new-blobs=0, base=${base.slice(0, 12)})`);
