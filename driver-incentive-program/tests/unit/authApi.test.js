import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../server/db.js', () => ({
    default: {
        query: vi.fn(),
        getConnection: vi.fn(),
    },
}));

import { app } from '../../server/index.js';
import pool from '../../server/db.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

// Valid password that passes isPasswordComplex (8+ chars, uppercase, number, special)
const VALID_PASSWORD = 'Password1!';
const WRONG_PASSWORD  = 'Password9!';   // different but still complex
const WEAK_PASSWORD   = 'weakpassword'; // fails complexity

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

const sponsorUser = { ...baseUser, user_id: 2, email: 'sponsor@test.com', username: 'sponsor1', user_type: 'sponsor' };
const adminUser   = { ...baseUser, user_id: 3, email: 'admin@test.com',   username: 'admin1',   user_type: 'admin'   };

beforeEach(() => {
    vi.resetAllMocks();
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

    it('returns requiresTwoFa and a code when user has 2FA enabled', async () => {
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
        expect(res.body.twoFaCode).toMatch(/^\d{6}$/); // 6-digit string
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

    it('returns 404 when the email is not registered', async () => {
        pool.query.mockResolvedValueOnce([[]]); // SELECT users - empty

        const res = await request(app)
            .post('/api/password-reset/request')
            .send({ email: 'nobody@test.com' });

        expect(res.status).toBe(404);
        expect(res.body.message).toMatch(/user not found/i);
    });

    it('returns 200 with a reset token on success', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_id: 1 }]])  // SELECT users
            .mockResolvedValueOnce([{ insertId: 1 }]);   // INSERT password_reset_tokens

        const res = await request(app)
            .post('/api/password-reset/request')
            .send({ email: baseUser.email });

        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(typeof res.body.token).toBe('string');
        expect(res.body.token.length).toBeGreaterThan(0);
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

    it('returns 400 when the new password does not meet complexity requirements', async () => {
        const res = await request(app)
            .post('/api/password-reset/confirm')
            .send({ token: 'sometoken', newPassword: WEAK_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/complexity/i);
    });

    it('returns 400 when the token is invalid or already used', async () => {
        pool.query.mockResolvedValueOnce([[]]); // SELECT tokens - empty (invalid/used)

        const res = await request(app)
            .post('/api/password-reset/confirm')
            .send({ token: 'invalid_token', newPassword: VALID_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/invalid or used token/i);
    });

    it('returns 400 when the token has expired', async () => {
        const expiredToken = {
            token_id: 1,
            user_id: 1,
            token_hash: 'sometoken',
            expires_at: new Date(Date.now() - 60 * 1000), // 1 minute ago
            used_at: null,
        };
        pool.query.mockResolvedValueOnce([[expiredToken]]);

        const res = await request(app)
            .post('/api/password-reset/confirm')
            .send({ token: 'sometoken', newPassword: VALID_PASSWORD });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/expired/i);
    });

    it('returns 200 on a successful password reset', async () => {
        const validToken = {
            token_id: 1,
            user_id: 1,
            token_hash: 'validtoken',
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
            .send({ token: 'validtoken', newPassword: VALID_PASSWORD });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/password reset successfully/i);
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

    it('returns 401 when the code is invalid or already used', async () => {
        pool.query.mockResolvedValueOnce([[]]); // SELECT two_fa_codes - no match

        const res = await request(app)
            .post('/api/2fa/verify')
            .send({ userId: 1, code: '000000' });

        expect(res.status).toBe(401);
        expect(res.body.message).toMatch(/invalid or already used/i);
    });

    it('returns 400 when the 2FA code has expired', async () => {
        const expiredCode = {
            code_id: 1,
            user_id: 1,
            code_hash: 'somehash',
            expires_at: new Date(Date.now() - 60 * 1000), // 1 minute ago
            used_at: null,
        };
        pool.query.mockResolvedValueOnce([[expiredCode]]);

        const res = await request(app)
            .post('/api/2fa/verify')
            .send({ userId: 1, code: '123456' });

        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/expired/i);
    });

    it('returns 200 with user data when the 2FA code is valid', async () => {
        const validCode = {
            code_id: 1,
            user_id: 1,
            code_hash: 'somehash',
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
            .send({ userId: 1, code: '123456' });

        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/login successful/i);
        expect(res.body.user.user_id).toBe(baseUser.user_id);
        expect(res.body.user.password_hash).toBeUndefined();
    });

    it('sets remember_me cookie when rememberMe is true', async () => {
        const validCode = {
            code_id: 1,
            user_id: 1,
            code_hash: 'somehash',
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
            .send({ userId: 1, code: '123456', rememberMe: true });

        expect(res.status).toBe(200);
        const cookies = res.headers['set-cookie'] || [];
        expect(cookies.some(c => c.startsWith('remember_me='))).toBe(true);
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
