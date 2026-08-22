import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function opaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function keyedDigest(secret: string, purpose: string, value: string): Buffer {
  return createHmac('sha256', secret).update(`${purpose}\0${value}`).digest();
}

export function digestMatches(actual: Buffer, expected: Buffer): boolean {
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
