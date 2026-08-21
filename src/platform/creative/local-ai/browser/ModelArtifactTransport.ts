const RELEASE_PREFIX = 'https://github.com/giltik123/bers23/releases/download/mobilesam-vit-t-v1.0.2/';
const RELAY_PREFIX = '/api/core/models/mobilesam-vit-t/1.0.2/';
const ARTIFACTS = new Set([
  'mobilesam-encoder.onnx',
  'mobilesam-encoder.onnx.sig',
  'mobilesam-decoder.onnx',
  'mobilesam-decoder.onnx.sig',
]);

/** Maps an already signature-verified release identity onto the same-origin byte relay. */
export class ModelArtifactTransport {
  private readonly fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) { this.fetcher = fetcher; }

  relayUrl(signedUrl: string): string {
    const url = new URL(signedUrl);
    const name = url.pathname.slice(url.pathname.lastIndexOf('/') + 1);
    if (url.href !== `${RELEASE_PREFIX}${name}` || !ARTIFACTS.has(name)) throw new Error('MODEL_ARTIFACT_URL_NOT_ALLOWED');
    return `${RELAY_PREFIX}${name}`;
  }

  fetch(signedUrl: string) { return this.fetcher(this.relayUrl(signedUrl)); }
}
