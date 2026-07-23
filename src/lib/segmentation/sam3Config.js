// SAM3 provider configuration — single source of truth for the fal.ai SAM 3 provider.
// The API key itself lives ONLY as a backend secret (FAL_KEY); the browser never sees it.

export const SAM3_CONFIG = {
  providerName: 'fal-ai/sam-3',
  apiEndpoint: 'https://fal.run/fal-ai/sam-3/image', // called server-side only
  apiKeySecret: 'FAL_KEY', // name of the backend secret holding the key
  timeoutMs: 60_000,
  retryCount: 3,
  maxImageDimension: 2048, // px — larger images are downscaled (never upscaled)
  maxFileSizeBytes: 10 * 1024 * 1024,
  supportedFormats: ['image/jpeg', 'image/png', 'image/webp'],
  healthStatus: 'unknown', // unknown | healthy | unavailable — updated by healthCheck()
};