// EditingProvider — the interface every AI editing provider must implement.
// Providers are pluggable: the EditingEngine only talks to this contract,
// so GPT Image, Flux, Ideogram etc. can be added without touching Editor or Planner.
export class EditingProvider {
  constructor(config) { this.config = config; this.cancelled = false; }

  get name() { return this.config.name; }

  // ({ imageUrl, prompt, maskUrl, resolution }) → { image_url, provider, generation_time_ms, credits_used }
  async editImage() { throw new Error(`${this.name}: editImage() not implemented`); }

  cancel() { this.cancelled = true; }
  resetCancel() { this.cancelled = false; }

  // → { ok: boolean, provider }
  async healthCheck() { throw new Error(`${this.name}: healthCheck() not implemented`); }

  // ({ imageUrl, prompt }) → { valid, errors[] }
  validateRequest() { throw new Error(`${this.name}: validateRequest() not implemented`); }

  // Structured request → provider payload
  preparePayload() { throw new Error(`${this.name}: preparePayload() not implemented`); }

  // Raw provider response → { image_url, generation_time_ms, credits_used }
  parseResponse() { throw new Error(`${this.name}: parseResponse() not implemented`); }
}