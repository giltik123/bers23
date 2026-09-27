import fs from 'node:fs';
import path from 'node:path';

const capturePath = process.env.BERS_R3M_AUTH_EMAIL_CAPTURE_FILE;
if (!capturePath) throw new Error('BERS_R3M_AUTH_EMAIL_CAPTURE_FILE is required by the R3m test preload');

fs.mkdirSync(path.dirname(capturePath), { recursive: true });
fs.writeFileSync(capturePath, '', { encoding: 'utf8', mode: 0o600 });

const originalFetch = globalThis.fetch.bind(globalThis);
let sequence = 0;

globalThis.fetch = async (input, init) => {
  const rawUrl = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input?.url;

  if (rawUrl !== 'https://api.resend.com/emails') return originalFetch(input, init);

  const headers = new Headers(init?.headers);
  const bodyText = typeof init?.body === 'string' ? init.body : '';
  let payload;
  try { payload = JSON.parse(bodyText); }
  catch { throw new Error('R3m Resend capture received a non-JSON email payload'); }

  const record = Object.freeze({
    sequence: ++sequence,
    to: Array.isArray(payload?.to) ? payload.to : [],
    from: payload?.from,
    subject: payload?.subject,
    text: payload?.text,
    idempotencyKey: headers.get('idempotency-key'),
  });
  fs.appendFileSync(capturePath, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });

  return new Response(JSON.stringify({ id: `r3m-email-${sequence}` }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
