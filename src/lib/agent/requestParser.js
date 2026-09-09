// Legacy/advisory parser facade only.
//
// The historical implementation routed planning prompts through the production
// Creative execution transport and therefore crossed the provider/execution
// authority boundary. A dedicated schema-bound AEE advisory parser transport is
// required before natural-language parsing is re-enabled. Until then this
// compatibility parser is deliberately fail-closed.
class RequestParser {
  async parse() {
    const error = new Error(
      'AGENT_INTENT_PARSING_NOT_WIRED: legacy Agent LLM parsing is disabled; use the bounded canonical Agent surface until an AEE parser transport is admitted',
    );
    error.code = 'AGENT_INTENT_PARSING_NOT_WIRED';
    error.retryable = false;
    throw error;
  }
}

export const requestParser = new RequestParser();