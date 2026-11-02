import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { androidAssetLinks, parseAndroidReleaseConfig } from '../scripts/android-release-config.mjs';

const fingerprint = 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99';
const valid = {
  BERS_ANDROID_URL: 'https://app.bers.dev',
  BERS_ANDROID_APPLICATION_ID: 'dev.bers.app',
  BERS_ANDROID_VERSION_CODE: '7',
  BERS_ANDROID_VERSION_NAME: '1.2.3',
  BERS_ANDROID_SHA256_FINGERPRINTS: fingerprint.toLowerCase(),
};

test('release configuration binds one HTTPS origin, package, version and public signing identity', () => {
  const config = parseAndroidReleaseConfig(valid);
  assert.equal(config.origin, 'https://app.bers.dev');
  assert.equal(config.applicationId, 'dev.bers.app');
  assert.equal(config.versionCode, 7);
  assert.deepEqual(config.fingerprints, [fingerprint]);
  assert.deepEqual(androidAssetLinks(config), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'dev.bers.app',
      sha256_cert_fingerprints: [fingerprint],
    },
  }]);
});

test('release preflight rejects insecure, local, placeholder and non-origin URLs', () => {
  for (const value of [
    'http://app.bers.dev', 'https://localhost', 'https://app.bers.example',
    'https://app.bers.dev/editor', 'https://app.bers.dev/?token=secret',
    'https://user:password@app.bers.dev', 'https://app.bers.dev:8443',
  ]) {
    assert.throws(() => parseAndroidReleaseConfig({ ...valid, BERS_ANDROID_URL: value }));
  }
});

test('release preflight rejects placeholder identity, invalid versions and malformed fingerprints', () => {
  for (const patch of [
    { BERS_ANDROID_APPLICATION_ID: 'app.bers.example' },
    { BERS_ANDROID_APPLICATION_ID: 'not-a-package' },
    { BERS_ANDROID_VERSION_CODE: '0' },
    { BERS_ANDROID_VERSION_CODE: '1.5' },
    { BERS_ANDROID_VERSION_NAME: '0.0.0' },
    { BERS_ANDROID_VERSION_NAME: 'development' },
    { BERS_ANDROID_SHA256_FINGERPRINTS: '' },
    { BERS_ANDROID_SHA256_FINGERPRINTS: 'not-a-fingerprint' },
  ]) {
    assert.throws(() => parseAndroidReleaseConfig({ ...valid, ...patch }));
  }
});

test('Android shell is a minimal SDK 36 TWA without dangerous permissions or a second Auth channel', () => {
  const gradle = readFileSync('android/app/build.gradle', 'utf8');
  const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
  assert.match(gradle, /compileSdk 36/);
  assert.match(gradle, /targetSdk 36/);
  assert.match(gradle, /minSdk 24/);
  assert.match(gradle, /androidbrowserhelper:2\.7\.4/);
  assert.match(manifest, /com\.google\.androidbrowserhelper\.trusted\.LauncherActivity/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:allowBackup="false"/);
  assert.equal((manifest.match(/<uses-permission/g) || []).length, 1);
  assert.match(manifest, /android\.permission\.INTERNET/);
  assert.doesNotMatch(`${gradle}\n${manifest}`, /WebView|Capacitor|localStorage|sessionStorage|SameSite=None/i);
});

test('web manifest is installable and debug evidence cannot be mistaken for signed release evidence', () => {
  const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.length > 0);
  const debugScript = readFileSync('scripts/build-android-debug.sh', 'utf8');
  assert.match(debugScript, /lintDebug assembleDebug/);
  assert.doesNotMatch(debugScript, /bundleRelease|assembleRelease|KEYSTORE_PASSWORD/);
  const gitignore = readFileSync('.gitignore', 'utf8');
  assert.match(gitignore, /\*.jks/);
  assert.match(gitignore, /android\/local\.properties/);
});
