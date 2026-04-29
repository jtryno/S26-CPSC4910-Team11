import crypto from 'crypto';
import process from 'process';

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';

function sign(userId) {
    return crypto.createHmac('sha256', SECRET).update(String(userId)).digest('hex');
}

export async function createSession(userId) {
    const sig = sign(userId);
    return `${userId}.${sig}`;
}

export async function resolveSession(token) {
    if (!token) return null;
    const dot = token.lastIndexOf('.');
    if (dot === -1) return null;
    const userId = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = sign(userId);
    try {
        if (sig.length !== expected.length) return null;
        if (!crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    } catch {
        return null;
    }
    const id = parseInt(userId, 10);
    return Number.isFinite(id) && id > 0 ? id : null;
}

export async function deleteSession() {
    // stateless HMAC — no server-side state to clean up
}
