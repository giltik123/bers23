export const CLIENT_FINANCIAL_AUTHORITY_ERROR = 'CLIENT_FINANCIAL_AUTHORITY_DISABLED';

export function requireServerFinancialAuthority(operation) {
  const error = new Error(`Financial operation "${operation}" requires the server-owned billing/transaction authority.`);
  error.code = CLIENT_FINANCIAL_AUTHORITY_ERROR;
  error.operation = operation;
  error.retryable = false;
  throw error;
}
