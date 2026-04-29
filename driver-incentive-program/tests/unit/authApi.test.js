import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import process from 'process';

vi.mock('../../server/db.js', () => ({
    default: {
        query: vi.fn(),
        getConnection: vi.fn(),
    },
}));

vi.mock('../../server/email.js', () => ({
    sendPasswordResetEmail: vi.fn(),
    sendTwoFaCodeEmail: vi.fn(),
}));

vi.mock('../../server/services/session.service.js', () => ({
    createSession: vi.fn().mockResolvedValue('test-session-token'),
    resolveSession: vi.fn(async (token) => {
        if (!token) return null;
        const id = parseInt(token, 10);
        return Number.isFinite(id) && id > 0 ? id : null;
    }),
    deleteSession: vi.fn().mockResolvedValue(undefined),
}));

import { app } from '../../server/index.js';
import pool from '../../server/db.js';
import { sendPasswordResetEmail, sendTwoFaCodeEmail } from '../../server/email.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

// Valid password that passes isPasswordComplex (8+ chars, uppercase, number, special)
const VALID_PASSWORD = 'Password1!';
const WRONG_PASSWORD  = 'Password9!';   // different but still complex
const WEAK_PASSWORD   = 'weakpassword'; // fails complexity

function hashSecret(value) {
    return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function restoreEnvValue(name, value) {
    if (value === undefined) {
        delete process.env[name];
        return;
    }

    process.env[name] = value;
}

const baseUser = {
    user_id: 1,
    email: 'driver@test.com',
    username: 'driver1',
    first_name: 'Test',
    last_name: 'Driver',
    user_type: 'driver',
    // plaintext stored — backward-compat path
    password_hash: VALID_PASSWORD,
    failed_login_attempts: 0,
    lockout_until: null,
    last_failed_login: null,
    two_fa_enabled: false,
    is_active: 1,
};

beforeEach(() => {
    vi.resetAllMocks();
    process.env.APP_BASE_URL = 'http://localhost:5173';
    sendPasswordResetEmail.mockResolvedValue({ id: 'email_123' });
    sendTwoFaCodeEmail.mockResolvedValue({ id: 'email_456' });
});

// ─── POST /api/login ─────────────────────────────────────────────────────────

describe('POST /api/login', () => {

    it('returns 401 when email is not found', async () => {
        pool.query.mockResolvedValueOnce([[]]); // users lookup → empty

        const res = await request(app)
            .post('/api/login')
            .send({ email: 'nobody@test.com', password: VALID_PASSWORD });

        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/invalid email or password/i);
    });

    it('returns 403 when account is locked (lockout_until in the future)', async () => {
        const lockedUser = {
            ...baseUser,
            lockout_until: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
        };
        pool.query.mockResolvedValueOnce([[lockedUser]]);

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: VALID_PASSWORD });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/account locked/i);
    });

    it('returns 400 when submitted password does not meet complexity requirements', async () => {
        pool.query.mockResolvedValueOnce([[baseUser]]);

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: WEAK_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/complexity/i);
    });

    it('returns 401 on wrong password and shows remaining attempts', async () => {
        pool.query
            .mockResolvedValueOnce([[baseUser]])  // SELECT users
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE is_locked
            .mockResolvedValueOnce([{ insertId: 1 }])       // INSERT login_logs
            .mockResolvedValueOnce([{ affectedRows: 1 }]);  // UPDATE last_failed_login

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: WRONG_PASSWORD });

        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/attempt\(s\) remaining/i);
    });

    it('returns 403 and locks the account after max failed attempts', async () => {
        const almostLockedUser = { ...baseUser, failed_login_attempts: 4 };
        pool.query
            .mockResolvedValueOnce([[almostLockedUser]]) // SELECT users
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE is_locked = true
            .mockResolvedValueOnce([{ insertId: 1 }])       // INSERT login_logs (failure)
            .mockResolvedValueOnce([{ affectedRows: 1 }]);  // UPDATE lockout_until

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: WRONG_PASSWORD });

        expect(res.status).toBe(403);
        expect(res.body.message).toMatch(/account locked/i);
    });

    it('returns 200 with user data on successful login (driver, no 2FA)', async () => {
        pool.query
            .mockResolvedValueOnce([[baseUser]])           // SELECT users
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE password_hash (plaintext upgrade)
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE last_login
            .mockResolvedValueOnce([{ insertId: 1 }])     // INSERT login_logs
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]]) // getSponsorOrgId
            .mockResolvedValueOnce([[]]);                  // getDriverSponsors

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: VALID_PASSWORD });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/login successful/i);
        expect(res.body.user.user_id).toBe(baseUser.user_id);
        expect(res.body.user.sponsor_org_id).toBe(5);
        // password hash must never be sent to the client
        expect(res.body.user.password_hash).toBeUndefined();
    });

    it('sets remember_me cookie when rememberMe flag is true', async () => {
        pool.query
            .mockResolvedValueOnce([[baseUser]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 1 }])
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]])
            .mockResolvedValueOnce([[]]);                  // getDriverSponsors

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: VALID_PASSWORD, rememberMe: true });

        expect(res.status).toBe(200);
        const cookies = res.headers['set-cookie'] || [];
        expect(cookies.some(c => c.startsWith('remember_me='))).toBe(true);
    });

    it('does not set remember_me cookie when rememberMe is false', async () => {
        pool.query
            .mockResolvedValueOnce([[baseUser]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 1 }])
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]])
            .mockResolvedValueOnce([[]]);                  // getDriverSponsors

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: VALID_PASSWORD, rememberMe: false });

        expect(res.status).toBe(200);
        const cookies = res.headers['set-cookie'] || [];
        expect(cookies.some(c => c.startsWith('remember_me='))).toBe(false);
    });

    it('returns requiresTwoFa and emails a code when user has 2FA enabled', async () => {
        const twoFaUser = { ...baseUser, two_fa_enabled: true };
        pool.query
            .mockResolvedValueOnce([[twoFaUser]])           // SELECT users
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE password_hash (plaintext upgrade)
            .mockResolvedValueOnce([{ insertId: 1 }]);     // INSERT two_fa_codes

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: VALID_PASSWORD });

        expect(res.status).toBe(200);
        expect(res.body.requiresTwoFa).toBe(true);
        expect(res.body.userId).toBe(baseUser.user_id);
        expect(res.body.twoFaCode).toBeUndefined();
        expect(sendTwoFaCodeEmail).toHaveBeenCalledWith({
            to: baseUser.email,
            code: expect.stringMatching(/^\d{6}$/),
        });
    });

    it('returns 502 and invalidates the 2FA code when email sending fails', async () => {
        const twoFaUser = { ...baseUser, two_fa_enabled: true };
        sendTwoFaCodeEmail.mockRejectedValueOnce(new Error('Resend blocked recipient'));
        pool.query
            .mockResolvedValueOnce([[twoFaUser]])           // SELECT users
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE password_hash (plaintext upgrade)
            .mockResolvedValueOnce([{ insertId: 99 }])     // INSERT two_fa_codes
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE two_fa_codes used_at

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: VALID_PASSWORD });

        expect(res.status).toBe(502);
        expect(res.body.error).toMatch(/unable to send 2fa code email/i);
        expect(pool.query).toHaveBeenLastCalledWith(
            'UPDATE two_fa_codes SET used_at = NOW() WHERE code_id = ?',
            [99]
        );
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

        const res = await request(app)
            .post('/api/login')
            .send({ email: baseUser.email, password: VALID_PASSWORD });

        expect(res.status).toBe(500);
    });
});

// ─── POST /api/logout ────────────────────────────────────────────────────────

describe('POST /api/logout', () => {

    it('returns 200 with a logout confirmation message', async () => {
        const res = await request(app).post('/api/logout');

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/logged out/i);
    });

    it('clears the remember_me cookie', async () => {
        const res = await request(app)
            .post('/api/logout')
            .set('Cookie', 'remember_me=1');

        const cookies = res.headers['set-cookie'] || [];
        const rememberMeCookie = cookies.find(c => c.startsWith('remember_me='));
        // Cookie is cleared by setting it with maxAge=0 / Expires in the past
        expect(rememberMeCookie).toBeDefined();
        expect(rememberMeCookie).toMatch(/expires=Thu, 01 Jan 1970|Max-Age=0/i);
    });
});

// ─── POST /api/signup ────────────────────────────────────────────────────────

describe('POST /api/signup', () => {

    it('returns 400 when password does not meet complexity requirements', async () => {
        const res = await request(app)
            .post('/api/signup')
            .send({
                firstName: 'Test', lastName: 'User',
                email: 'new@test.com', username: 'newuser',
                password: WEAK_PASSWORD, userRole: 'driver',
            });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/complexity/i);
    });

    it('returns 200 on successful driver signup with an org', async () => {
        pool.query
            .mockResolvedValueOnce([{ insertId: 10 }])    // INSERT users
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // INSERT driver_user
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT driver_sponsor

        const res = await request(app)
            .post('/api/signup')
            .send({
                firstName: 'New', lastName: 'Driver',
                phoneNumber: '5551234567',
                email: 'newdriver@test.com', username: 'newdriver',
                password: VALID_PASSWORD, userRole: 'driver', orgId: 1,
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/signup successful/i);
    });

    it('returns 200 on successful driver signup without an org', async () => {
        pool.query
            .mockResolvedValueOnce([{ insertId: 11 }])    // INSERT users
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT driver_user

        const res = await request(app)
            .post('/api/signup')
            .send({
                firstName: 'Solo', lastName: 'Driver',
                email: 'solo@test.com', username: 'solodriver',
                password: VALID_PASSWORD, userRole: 'driver',
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/signup successful/i);
    });

    it('returns 200 on successful sponsor signup', async () => {
        pool.query
            .mockResolvedValueOnce([{ insertId: 12 }])    // INSERT users
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT sponsor_user

        const res = await request(app)
            .post('/api/signup')
            .send({
                firstName: 'New', lastName: 'Sponsor',
                email: 'newsponsor@test.com', username: 'newsponsor',
                password: VALID_PASSWORD, userRole: 'sponsor',
                orgId: 2, createdByUserId: 3,
            });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/signup successful/i);
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

        const res = await request(app)
            .post('/api/signup')
            .send({
                firstName: 'Err', lastName: 'User',
                email: 'err@test.com', username: 'erruser',
                password: VALID_PASSWORD, userRole: 'driver',
            });

        expect(res.status).toBe(500);
    });
});

// ─── GET /api/session ────────────────────────────────────────────────────────

describe('GET /api/session', () => {

    it('returns 401 when no remember_me cookie is present', async () => {
        const res = await request(app).get('/api/session');

        expect(res.status).toBe(401);
        expect(res.body.loggedIn).toBe(false);
    });

    it('returns 401 when the user referenced by the cookie no longer exists', async () => {
        pool.query.mockResolvedValueOnce([[]]); // SELECT users - empty, returns 401 before getSponsorOrgId

        const res = await request(app)
            .get('/api/session')
            .set('Cookie', 'remember_me=999');

        expect(res.status).toBe(401);
        expect(res.body.loggedIn).toBe(false);
    });

    it('returns 200 with user data for a valid session cookie', async () => {
        const sessionUser = { user_id: 1, email: baseUser.email, username: baseUser.username, user_type: 'driver' };
        pool.query
            .mockResolvedValueOnce([[sessionUser]])         // SELECT users
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]]) // getSponsorOrgId
            .mockResolvedValueOnce([[]]);                    // getDriverSponsors

        const res = await request(app)
            .get('/api/session')
            .set('Cookie', 'remember_me=1');

        expect(res.status).toBe(200);
        expect(res.body.loggedIn).toBe(true);
        expect(res.body.user.user_id).toBe(1);
        expect(res.body.user.sponsor_org_id).toBe(5);
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

        const res = await request(app)
            .get('/api/session')
            .set('Cookie', 'remember_me=1');

        expect(res.status).toBe(500);
    });
});

// ─── POST /api/password-reset/request ────────────────────────────────────────

describe('POST /api/password-reset/request', () => {

    it('returns a generic success message when the email is not registered', async () => {
        pool.query.mockResolvedValueOnce([[]]); // SELECT users - empty

        const res = await request(app)
            .post('/api/password-reset/request')
            .send({ email: 'nobody@test.com' });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/reset link has been sent/i);
        expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns 200 and emails a reset link on success', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_id: 1, email: baseUser.email }]])  // SELECT users
            .mockResolvedValueOnce([{ insertId: 1 }]);   // INSERT password_reset_tokens

        const res = await request(app)
            .post('/api/password-reset/request')
            .set('Origin', 'https://attacker.example')
            .send({ email: baseUser.email });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/reset link has been sent/i);
        expect(res.body.token).toBeUndefined();
        const resetUrl = sendPasswordResetEmail.mock.calls[0][0].resetUrl;
        const token = new URL(resetUrl).searchParams.get('token');
        expect(pool.query).toHaveBeenNthCalledWith(
            2,
            'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [1, hashSecret(token), expect.any(Date)]
        );
        expect(sendPasswordResetEmail).toHaveBeenCalledWith({
            to: baseUser.email,
            resetUrl: expect.stringMatching(/^http:\/\/localhost:5173\/password-reset\?token=/),
        });
    });

    it('returns 500 and does not create a token when the app base URL is missing outside tests', async () => {
        const originalNodeEnv = process.env.NODE_ENV;
        const originalAppBaseUrl = process.env.APP_BASE_URL;
        const originalFrontendUrl = process.env.FRONTEND_URL;

        try {
            process.env.NODE_ENV = 'staging';
            delete process.env.APP_BASE_URL;
            delete process.env.FRONTEND_URL;
            pool.query.mockResolvedValueOnce([[{ user_id: 1, email: baseUser.email }]]); // SELECT users

            const res = await request(app)
                .post('/api/password-reset/request')
                .send({ email: baseUser.email });

            expect(res.status).toBe(500);
            expect(pool.query).toHaveBeenCalledTimes(1);
            expect(sendPasswordResetEmail).not.toHaveBeenCalled();
        } finally {
            restoreEnvValue('NODE_ENV', originalNodeEnv);
            restoreEnvValue('APP_BASE_URL', originalAppBaseUrl);
            restoreEnvValue('FRONTEND_URL', originalFrontendUrl);
        }
    });

    it('returns 502 and invalidates the reset token when email sending fails', async () => {
        sendPasswordResetEmail.mockRejectedValueOnce(new Error('Resend blocked recipient'));
        pool.query
            .mockResolvedValueOnce([[{ user_id: 1, email: baseUser.email }]])  // SELECT users
            .mockResolvedValueOnce([{ insertId: 77 }])                         // INSERT password_reset_tokens
            .mockResolvedValueOnce([{ affectedRows: 1 }]);                     // UPDATE password_reset_tokens used_at

        const res = await request(app)
            .post('/api/password-reset/request')
            .send({ email: baseUser.email });

        expect(res.status).toBe(502);
        expect(res.body.error).toMatch(/unable to send password reset email/i);
        expect(pool.query).toHaveBeenLastCalledWith(
            'UPDATE password_reset_tokens SET used_at = NOW() WHERE token_id = ?',
            [77]
        );
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

        const res = await request(app)
            .post('/api/password-reset/request')
            .send({ email: baseUser.email });

        expect(res.status).toBe(500);
    });
});

// ─── POST /api/password-reset/confirm ────────────────────────────────────────

describe('POST /api/password-reset/confirm', () => {

    it('returns 400 when the reset token is missing', async () => {
        const res = await request(app)
            .post('/api/password-reset/confirm')
            .send({ newPassword: VALID_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/reset token is required/i);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('returns 400 when the new password does not meet complexity requirements', async () => {
        const res = await request(app)
            .post('/api/password-reset/confirm')
            .send({ token: 'sometoken', newPassword: WEAK_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/complexity/i);
    });

    it('returns 400 when the token is invalid or already used', async () => {
        pool.query.mockResolvedValueOnce([[]]); // SELECT tokens - empty (invalid/used)
        const token = 'invalid_token';

        const res = await request(app)
            .post('/api/password-reset/confirm')
            .send({ token, newPassword: VALID_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid or used token/i);
        expect(pool.query).toHaveBeenNthCalledWith(
            1,
            'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL',
            [hashSecret(token)]
        );
    });

    it('returns 400 when the token has expired', async () => {
        const token = 'sometoken';
        const expiredToken = {
            token_id: 1,
            user_id: 1,
            token_hash: hashSecret(token),
            expires_at: new Date(Date.now() - 60 * 1000), // 1 minute ago
            used_at: null,
        };
        pool.query.mockResolvedValueOnce([[expiredToken]]);

        const res = await request(app)
            .post('/api/password-reset/confirm')
            .send({ token, newPassword: VALID_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/expired/i);
        expect(pool.query).toHaveBeenNthCalledWith(
            1,
            'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL',
            [hashSecret(token)]
        );
    });

    it('returns 200 on a successful password reset', async () => {
        const token = 'validtoken';
        const validToken = {
            token_id: 1,
            user_id: 1,
            token_hash: hashSecret(token),
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
            used_at: null,
        };
        pool.query
            .mockResolvedValueOnce([[validToken]])         // SELECT tokens
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE users password_hash
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE token used_at
            .mockResolvedValueOnce([{ insertId: 1 }])     // INSERT notifications (createNotification)
            .mockResolvedValueOnce([[{ username: 'driver1' }]]) // SELECT username for change_log
            .mockResolvedValueOnce([{ insertId: 1 }]);    // INSERT password_change_log

        const res = await request(app)
            .post('/api/password-reset/confirm')
            .send({ token, newPassword: VALID_PASSWORD });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/password reset successfully/i);
        expect(pool.query).toHaveBeenNthCalledWith(
            1,
            'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL',
            [hashSecret(token)]
        );
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

        const res = await request(app)
            .post('/api/password-reset/confirm')
            .send({ token: 'sometoken', newPassword: VALID_PASSWORD });

        expect(res.status).toBe(500);
    });
});

// ─── POST /api/2fa/verify ────────────────────────────────────────────────────

describe('POST /api/2fa/verify', () => {

    it('returns 400 when the 2FA code is missing', async () => {
        const res = await request(app)
            .post('/api/2fa/verify')
            .send({ userId: 1 });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/2fa code is required/i);
        expect(pool.query).not.toHaveBeenCalled();
    });

    it('returns 401 when the code is invalid or already used', async () => {
        pool.query.mockResolvedValueOnce([[]]); // SELECT two_fa_codes - no match
        const code = '000000';

        const res = await request(app)
            .post('/api/2fa/verify')
            .send({ userId: 1, code });

        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/invalid or already used/i);
        expect(pool.query).toHaveBeenNthCalledWith(
            1,
            'SELECT * FROM two_fa_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
            [1, hashSecret(code)]
        );
    });

    it('returns 400 when the 2FA code has expired', async () => {
        const code = '123456';
        const expiredCode = {
            code_id: 1,
            user_id: 1,
            code_hash: hashSecret(code),
            expires_at: new Date(Date.now() - 60 * 1000), // 1 minute ago
            used_at: null,
        };
        pool.query.mockResolvedValueOnce([[expiredCode]]);

        const res = await request(app)
            .post('/api/2fa/verify')
            .send({ userId: 1, code });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/expired/i);
        expect(pool.query).toHaveBeenNthCalledWith(
            1,
            'SELECT * FROM two_fa_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
            [1, hashSecret(code)]
        );
    });

    it('returns 200 with user data when the 2FA code is valid', async () => {
        const code = '123456';
        const validCode = {
            code_id: 1,
            user_id: 1,
            code_hash: hashSecret(code),
            expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 min from now
            used_at: null,
        };
        pool.query
            .mockResolvedValueOnce([[validCode]])           // SELECT two_fa_codes
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE code used_at
            .mockResolvedValueOnce([[baseUser]])            // SELECT users
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE last_login
            .mockResolvedValueOnce([{ insertId: 1 }])      // INSERT login_logs
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]]) // getSponsorOrgId
            .mockResolvedValueOnce([[]]);                    // getDriverSponsors

        const res = await request(app)
            .post('/api/2fa/verify')
            .send({ userId: 1, code });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/login successful/i);
        expect(res.body.user.user_id).toBe(baseUser.user_id);
        expect(res.body.user.password_hash).toBeUndefined();
        expect(pool.query).toHaveBeenNthCalledWith(
            1,
            'SELECT * FROM two_fa_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
            [1, hashSecret(code)]
        );
    });

    it('sets remember_me cookie when rememberMe is true', async () => {
        const code = '123456';
        const validCode = {
            code_id: 1,
            user_id: 1,
            code_hash: hashSecret(code),
            expires_at: new Date(Date.now() + 10 * 60 * 1000),
            used_at: null,
        };
        pool.query
            .mockResolvedValueOnce([[validCode]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[baseUser]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 1 }])
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]])
            .mockResolvedValueOnce([[]]);                    // getDriverSponsors

        const res = await request(app)
            .post('/api/2fa/verify')
            .send({ userId: 1, code, rememberMe: true });

        expect(res.status).toBe(200);
        const cookies = res.headers['set-cookie'] || [];
        expect(cookies.some(c => c.startsWith('remember_me='))).toBe(true);
        expect(pool.query).toHaveBeenNthCalledWith(
            1,
            'SELECT * FROM two_fa_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
            [1, hashSecret(code)]
        );
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

        const res = await request(app)
            .post('/api/2fa/verify')
            .send({ userId: 1, code: '123456' });

        expect(res.status).toBe(500);
    });
});

// ─── PUT /api/2fa/toggle ─────────────────────────────────────────────────────

describe('PUT /api/2fa/toggle', () => {

    it('returns 404 when the user email is not found', async () => {
        pool.query.mockResolvedValueOnce([[]]); // SELECT users - empty

        const res = await request(app)
            .put('/api/2fa/toggle')
            .send({ email: 'nobody@test.com', enabled: true });

        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/user not found/i);
    });

    it('returns 200 and enables 2FA', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_id: 1 }]])    // SELECT users
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE two_fa_enabled

        const res = await request(app)
            .put('/api/2fa/toggle')
            .send({ email: baseUser.email, enabled: true });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/enabled/i);
    });

    it('returns 200 and disables 2FA', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_id: 1 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/2fa/toggle')
            .send({ email: baseUser.email, enabled: false });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/disabled/i);
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));

        const res = await request(app)
            .put('/api/2fa/toggle')
            .send({ email: baseUser.email, enabled: true });

        expect(res.status).toBe(500);
    });
});
