import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const keyLength = 64;
const options = Object.freeze({ N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const dummySalt = Buffer.alloc(16, 0xa5);
const dummyHash = Buffer.alloc(keyLength, 0x5a);

export type PasswordCredential = Readonly<{ algorithm: 'scrypt-v1'; salt: Buffer; hash: Buffer }>;

export async function hashPassword(password: string): Promise<PasswordCredential> {
  validateProvisionedPassword(password);
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return Object.freeze({ algorithm: 'scrypt-v1', salt, hash });
}

export async function verifyPassword(password: string, credential?: PasswordCredential): Promise<boolean> {
  if (typeof password !== 'string' || password.length < 1 || password.length > 1024) {
    await derive('invalid-password-shape', dummySalt);
    return false;
  }
  const salt = credential?.salt ?? dummySalt;
  const expected = credential?.hash ?? dummyHash;
  const actual = await derive(password, salt);
  return actual.length === expected.length && timingSafeEqual(actual, expected) && Boolean(credential);
}

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error); else resolve(Buffer.from(derivedKey));
    });
  });
}

function validateProvisionedPassword(password: string) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 1024) {
    throw Object.assign(new Error('Password must contain between 12 and 1024 characters'), { status: 400, code: 'invalid_password' });
  }
}
