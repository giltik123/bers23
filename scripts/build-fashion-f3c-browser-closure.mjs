import { mkdir, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

export const F3C_BROWSER_ENTRY = 'src/components/editor/outfits/OutfitPanel.jsx';
export const F3C_BROWSER_RUNTIME_DIR = '.test-cache/fashion-f3c-browser';

function normalizeRepositoryPath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\/+/, '');
}

export async function buildFashionF3cBrowserClosure({
  runtimeDir = F3C_BROWSER_RUNTIME_DIR,
} = {}) {
  const outfile = `${runtimeDir}/outfit-panel.mjs`;
  const metafilePath = `${runtimeDir}/outfit-panel.meta.json`;

  await mkdir(runtimeDir, { recursive: true });
  const result = await build({
    absWorkingDir: process.cwd(),
    entryPoints: [F3C_BROWSER_ENTRY],
    bundle: true,
    platform: 'browser',
    format: 'esm',
    target: ['es2022'],
    outfile,
    metafile: true,
    packages: 'external',
    alias: { '@': './src' },
    logLevel: 'silent',
  });

  const inputs = Object.freeze(
    Object.keys(result.metafile.inputs)
      .map(normalizeRepositoryPath)
      .sort((a, b) => a.localeCompare(b)),
  );

  await writeFile(metafilePath, `${JSON.stringify(result.metafile, null, 2)}\n`, 'utf8');

  return Object.freeze({
    entryPoint: F3C_BROWSER_ENTRY,
    outfile,
    metafilePath,
    inputs,
  });
}
