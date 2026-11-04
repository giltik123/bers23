import { access, mkdir, writeFile } from 'node:fs/promises';
import { androidAssetLinks, parseAndroidReleaseConfig } from './android-release-config.mjs';

const config = parseAndroidReleaseConfig();
try {
  await access('dist/index.html');
} catch {
  throw new Error('dist/index.html is missing; run the production web build before rendering asset links');
}

const directory = 'dist/.well-known';
await mkdir(directory, { recursive: true });
await writeFile(
  `${directory}/assetlinks.json`,
  `${JSON.stringify(androidAssetLinks(config), null, 2)}\n`,
  { encoding: 'utf8', flag: 'w' },
);
console.log('Rendered dist/.well-known/assetlinks.json with public signing-certificate fingerprints.');
