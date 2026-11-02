const CODE_KEYS = Object.freeze({
  invalid_credentials: 'authUi.invalidLogin',
  invalid_verification: 'authUi.invalidCode',
  invalid_reset_token: 'authUi.invalidLink',
  oauth_failed: 'errors.authentication',
  oauth_not_enabled: 'errors.authentication',
  unauthenticated: 'errors.sessionExpired',
  auth_rate_limited: 'errors.rateLimited',
  project_not_found: 'editor.projectNotFound',
  project_source_conflict: 'errors.projectChanged',
  bounded_agent_project_source_conflict: 'errors.projectChanged',
  bounded_aee_project_source_conflict: 'errors.projectChanged',
  agent_intent_stale_project: 'errors.projectChanged',
  aee_plan_agent_intent_stale_project: 'errors.projectChanged',
  workflow_continuation_project_source_conflict: 'errors.projectChanged',
  workflow_continuation_conflict: 'errors.conflict',
  execution_run_not_found: 'errors.executionRunNotFound',
  automation_not_found: 'errors.automationNotFound',
  automation_revision_conflict: 'errors.conflict',
  automation_invocation_revision_conflict: 'errors.conflict',
  body_too_large: 'errors.uploadTooLarge',
  unsupported_media_type: 'errors.unsupportedFile',
  invalid_json: 'errors.validation',
  invalid_json_body: 'errors.validation',
  invalid_project_id: 'errors.validation',
  csrf_denied: 'errors.permission',
  origin_denied: 'errors.permission',
  invalid_final_lineage: 'errors.conflict',
  model_artifact_not_found: 'errors.modelUnavailable',
});

let activeTranslator;

export function setCoreErrorTranslator(translate) {
  activeTranslator = typeof translate === 'function' ? translate : undefined;
}

const STATUS_KEYS = Object.freeze({
  400: 'errors.validation',
  401: 'errors.sessionExpired',
  403: 'errors.permission',
  404: 'errors.notFound',
  409: 'errors.conflict',
  413: 'errors.uploadTooLarge',
  415: 'errors.unsupportedFile',
  422: 'errors.validation',
  429: 'errors.rateLimited',
});

export function coreErrorMessageKey(status, code) {
  const normalizedCode = typeof code === 'string' ? code.trim().toLowerCase() : '';
  if (Object.prototype.hasOwnProperty.call(CODE_KEYS, normalizedCode)) return CODE_KEYS[normalizedCode];

  const numericStatus = Number(status);
  if (numericStatus >= 500 && numericStatus <= 599) return 'errors.serviceUnavailable';
  return STATUS_KEYS[numericStatus] || 'errors.generic';
}

export function resolveCoreErrorPresentation(status, code, translate) {
  const key = coreErrorMessageKey(status, code);
  let translated;
  try {
    const translator = typeof translate === 'function' ? translate : activeTranslator;
    translated = typeof translator === 'function' ? translator(key) : undefined;
  } catch {
    translated = undefined;
  }
  const message = typeof translated === 'string' && translated.trim() && translated !== key
    ? translated
    : 'Something went wrong.';
  return Object.freeze({ key, message });
}
