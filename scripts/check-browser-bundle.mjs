import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const assetsDirectory = 'dist/assets';
const files = (await readdir(assetsDirectory)).filter((file) => file.endsWith('.js'));

// Match module/secret signatures rather than harmless product words such as "sharpen".
// External model URLs and names are expected metadata; model bytes and signing
// secrets are not. Weight tracking is enforced separately by the repository scan.
const forbidden = [
  'require("sharp")',
  'from"sharp"',
  "from'sharp'",
  'node-postgres',
  'BEGIN PRIVATE KEY',
  'PRIVATE KEY-----',
  'JWT_SECRET',
  'server/core/providers',
];

for (const file of files) {
  const text = await readFile(`${assetsDirectory}/${file}`, 'utf8');
  for (const token of forbidden) {
    if (text.includes(token)) {
      throw new Error(`Browser bundle contains forbidden server token ${token} in ${file}`);
    }
  }
}

// These budgets protect the measured route-splitting result, not Vite's warning
// threshold. Keep a small allowance for ordinary changes and lower the limits
// when chunks shrink; do not raise them merely to silence a regression.
const html = await readFile('dist/index.html', 'utf8');
const entryMatch = html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="\/assets\/([^"]+\.js)"/i);
if (!entryMatch) throw new Error('Browser bundle budget could not identify the main entry script');

const budgets = [
  { label: 'main entry', file: entryMatch[1], maxBytes: 450_000, maxGzipBytes: 140_000 },
  { label: 'Editor route', prefix: 'Editor-', maxBytes: 510_000, maxGzipBytes: 145_000 },
  { label: 'Recipe Panel', prefix: 'RecipePanel-', maxBytes: 25_000, maxGzipBytes: 9_000 },
];

for (const budget of budgets) {
  const matches = budget.file
    ? [budget.file]
    : files.filter((file) => file.startsWith(budget.prefix));
  if (matches.length !== 1 || !files.includes(matches[0])) {
    throw new Error(`Browser bundle budget expected exactly one ${budget.label} chunk, found ${matches.length}`);
  }

  const file = matches[0];
  const contents = await readFile(`${assetsDirectory}/${file}`);
  const gzipBytes = gzipSync(contents).length;
  if (contents.length > budget.maxBytes || gzipBytes > budget.maxGzipBytes) {
    throw new Error(
      `${budget.label} budget exceeded in ${file}: ` +
      `${contents.length}/${budget.maxBytes} bytes minified, ` +
      `${gzipBytes}/${budget.maxGzipBytes} bytes gzip`,
    );
  }

  console.log(
    `${budget.label}: ${(contents.length / 1000).toFixed(2)} kB ` +
    `(${(gzipBytes / 1000).toFixed(2)} kB gzip) — within budget`,
  );
}

console.log(`Browser bundle guard passed (${files.length} JavaScript chunks)`);
