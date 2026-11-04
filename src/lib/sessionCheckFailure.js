// Session verification is Core-owned. Only explicit 401/403 is an auth denial;
// network/server errors are not evidence that the user's cookie was revoked.
export function classifySessionCheckFailure(error) {
  if (error?.status === 401 || error?.status === 403) {
    return { type: 'auth_required', message: 'Authentication required' };
  }
  // Never surface arbitrary backend/network error text in a public route.
  return { type: 'unknown', message: 'Unable to verify session' };
}
