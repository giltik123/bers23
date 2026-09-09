// Legacy/advisory parser facade only.
//
// The historical implementation sent planning prompts through
// `coreClient.integrations.Core.InvokeLLM`, which maps to `/creative/execute` and
// therefore crosses the canonical Creative execution/provider boundary. Planning
// must never consume that authority. AEE natural-language parsing will be added
// later behind its own advisory, schema-bound parser transport; until then this
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