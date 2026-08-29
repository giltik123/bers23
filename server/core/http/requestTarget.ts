export type ParsedCoreRequestTarget =
  | Readonly<{ ok: true; path: string }>
  | Readonly<{ ok: false; status: 400; code: 'invalid_request_target'; message: 'Request target is invalid' }>;

/** Parse the raw Node request target without allowing malformed absolute-form input to escape the server listener. */
export function parseCoreRequestTarget(rawTarget: string | undefined): ParsedCoreRequestTarget {
  try {
    return Object.freeze({ ok: true as const, path: new URL(rawTarget ?? '/', 'http://core.invalid').pathname });
  } catch {
    return Object.freeze({ ok: false as const, status: 400 as const, code: 'invalid_request_target' as const, message: 'Request target is invalid' as const });
  }
}
