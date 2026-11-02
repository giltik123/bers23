const APPLICATION_ID_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;
const VERSION_NAME_PATTERN = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const SHA256_PATTERN = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function invalid(message) {
  throw new Error(message);
}

export function parseAndroidReleaseConfig(env = process.env) {
  const configuredUrl = env.BERS_ANDROID_URL?.trim();
  if (!configuredUrl) invalid('BERS_ANDROID_URL is required');

  let url;
  try {
    url = new URL(configuredUrl);
  } catch {
    invalid('BERS_ANDROID_URL must be a valid HTTPS origin');
  }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.pathname !== '/' || url.search || url.hash || (url.port && url.port !== '443')) {
    invalid('BERS_ANDROID_URL must be an HTTPS origin without a path, credentials, query or fragment');
  }
  if (url.hostname === 'localhost' || url.hostname.endsWith('.local') ||
      url.hostname.endsWith('.example') || url.hostname.endsWith('.invalid') ||
      url.hostname.endsWith('.test')) {
    invalid('BERS_ANDROID_URL must identify the real public BERS origin');
  }

  const applicationId = env.BERS_ANDROID_APPLICATION_ID?.trim() || '';
  if (!APPLICATION_ID_PATTERN.test(applicationId) || applicationId.endsWith('.example')) {
    invalid('BERS_ANDROID_APPLICATION_ID must be a real reverse-domain application id');
  }

  const versionCodeText = env.BERS_ANDROID_VERSION_CODE?.trim() || '';
  if (!/^[1-9]\d*$/.test(versionCodeText)) invalid('BERS_ANDROID_VERSION_CODE must be a positive integer');
  const versionCode = Number(versionCodeText);
  if (!Number.isSafeInteger(versionCode) || versionCode > 2_100_000_000) {
    invalid('BERS_ANDROID_VERSION_CODE is outside the Android-supported range');
  }

  const versionName = env.BERS_ANDROID_VERSION_NAME?.trim() || '';
  if (!VERSION_NAME_PATTERN.test(versionName) || versionName === '0.0.0') {
    invalid('BERS_ANDROID_VERSION_NAME must be a non-zero semantic release version');
  }

  const fingerprints = [...new Set((env.BERS_ANDROID_SHA256_FINGERPRINTS || '')
    .split(',').map((value) => value.trim().toUpperCase()).filter(Boolean))];
  if (fingerprints.length === 0 || fingerprints.some((value) => !SHA256_PATTERN.test(value))) {
    invalid('BERS_ANDROID_SHA256_FINGERPRINTS must contain colon-separated SHA-256 certificate fingerprints');
  }

  return Object.freeze({
    origin: url.origin,
    applicationId,
    versionCode,
    versionName,
    fingerprints: Object.freeze(fingerprints.sort()),
  });
}

export function androidAssetLinks(config) {
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: config.applicationId,
      sha256_cert_fingerprints: [...config.fingerprints],
    },
  }];
}
