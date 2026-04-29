import crypto from 'crypto';
import process from 'process';
import pool from '../db.js';
import { hashSecret } from '../utils/password.js';

export async function createPasswordResetToken(userId, connection = pool) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSecret(token);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const queryResult = await connection.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [userId, tokenHash, expiresAt]
    );
    const result = Array.isArray(queryResult) ? queryResult[0] : queryResult;

    return { token, expiresAt, tokenId: result?.insertId };
}

export function getAppBaseUrl() {
    const configuredUrl = process.env.APP_BASE_URL || process.env.FRONTEND_URL;
    const baseUrl = configuredUrl || (process.env.NODE_ENV === 'test' ? 'http://localhost:5173' : null);
    if (!baseUrl) {
        throw new Error('APP_BASE_URL or FRONTEND_URL must be configured');
    }

    const parsedUrl = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('APP_BASE_URL or FRONTEND_URL must use http or https');
    }

    return parsedUrl.toString().replace(/\/+$/, '');
}

export function createPasswordResetUrl(token, appBaseUrl) {
    if (typeof appBaseUrl !== 'string' || appBaseUrl.trim() === '') {
        throw new Error('App base URL is required to create password reset URL');
    }

    const resetUrl = new URL(`${appBaseUrl}/password-reset`);
    resetUrl.searchParams.set('token', token);
    return resetUrl.toString();
}

export function createOnboardingPath(token) {
    return `/password-reset?token=${encodeURIComponent(token)}&mode=onboarding`;
}
