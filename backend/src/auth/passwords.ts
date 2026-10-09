import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(scryptCallback);
const PREFIX = '$scrypt$';
const KEY_LENGTH = 64;

export function isPasswordHash(value: string) {
  return value.startsWith(PREFIX) || value.startsWith('$argon2');
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('base64url');
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${PREFIX}${salt}$${key.toString('base64url')}`;
}

export async function verifyPassword(stored: string, password: string) {
  if (stored.startsWith(PREFIX)) {
    const [, , salt, hash] = stored.split('$');
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64url');
    const actual = (await scrypt(password, salt, expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  // Hashes antigos em Argon2 dependiam de modulo nativo; em hospedagem compartilhada
  // eles nao sao verificaveis de forma portavel. Usuarios com esse hash devem ter a
  // senha redefinida/importada novamente.
  if (stored.startsWith('$argon2')) return false;

  return stored === password;
}
