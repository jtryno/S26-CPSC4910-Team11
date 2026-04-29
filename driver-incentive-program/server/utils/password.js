import crypto from 'crypto';

export const SCRYPT_PREFIX = 'scrypt$';
export const SCRYPT_KEYLEN = 64;
export const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

export const MAX_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MINUTES = 30;

export function isPasswordComplex(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return password.length >= minLength && hasUpperCase && hasNumber && hasSpecialChar;
}

export function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
    return `${SCRYPT_PREFIX}${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

export function isScryptHash(stored) {
    return typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX);
}

export function verifyScryptPassword(password, stored) {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const salt = Buffer.from(parts[1], 'base64');
    const expected = Buffer.from(parts[2], 'base64');
    const actual = crypto.scryptSync(password, salt, expected.length, SCRYPT_OPTIONS);
    return crypto.timingSafeEqual(actual, expected);
}

export function hashSecret(value) {
    return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}
