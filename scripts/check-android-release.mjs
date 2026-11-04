import { parseAndroidReleaseConfig } from './android-release-config.mjs';

const config = parseAndroidReleaseConfig();
console.log(
  `Android release preflight passed: ${config.applicationId}, ${config.origin}, ` +
  `version ${config.versionName} (${config.versionCode}), ` +
  `${config.fingerprints.length} public certificate fingerprint(s).`,
);
