import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const { mockConn } = vi.hoisted(() => {
    const mockConn = {
        beginTransaction: vi.fn(),
        query: vi.fn(),
        commit: vi.fn(),
        rollback: vi.fn(),
        release: vi.fn(),
    };
    return { mockConn };
});

vi.mock('../../server/db.js', () => ({
    default: {
        query: vi.fn(),
        getConnection: vi.fn().mockResolvedValue(mockConn),
    },
}));

import { app } from '../../server/index.js';
import pool from '../../server/db.js';

const adminUser = { user_id: 1, username: 'admin1', email: 'admin@test.com', user_type: 'admin' };
const sponsorUser = { user_id: 2, username: 'sponsor1', email: 'sponsor@test.com', user_type: 'sponsor' };
const driverUser = { user_id: 3, username: 'driver1', email: 'driver@test.com', user_type: 'driver' };
const driverUser2 = { user_id: 4, username: 'driver2', email: 'driver2@test.com', user_type: 'driver' };
const adminUser2 = { user_id: 5, username: 'admin2', email: 'admin2@test.com', user_type: 'admin' };

beforeEach(() => {
    vi.clearAllMocks();
    pool.getConnection.mockResolvedValue(mockConn);
});

// ── POST /api/impersonate ──

describe('POST /api/impersonate', () => {

    // -- Authentication --

    it('returns 401 when no cookie and no actorUserId', async () => {
        const res = await request(app)
            .post('/api/impersonate')
            .send({ targetUserId: 3 });
        expect(res.status).toBe(401);
    });

    it('returns 400 when targetUserId is missing', async () => {
        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 1 });

        // Actor lookup
        pool.query.mockResolvedValueOnce([[adminUser]]);

        const res2 = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 1 });
        expect(res2.status).toBe(400);
    });

    it('returns error when actor user does not exist', async () => {
        pool.query.mockResolvedValueOnce([[]]); // empty actor lookup
        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 999, targetUserId: 3 });
        expect([401, 404]).toContain(res.status);
    });

    // -- Permission checks --

    it('returns 403 when a driver tries to impersonate', async () => {
        pool.query.mockResolvedValueOnce([[driverUser]]); // actor is driver
        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 3, targetUserId: 2 });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/only admins and sponsors/i);
    });

    it('returns 403 when admin tries to impersonate another admin', async () => {
        pool.query
            .mockResolvedValueOnce([[adminUser]])   // actor
            .mockResolvedValueOnce([[adminUser2]]);  // target
        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 1, targetUserId: 5 });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/another admin/i);
    });

    it('returns 400 when trying to impersonate yourself', async () => {
        pool.query
            .mockResolvedValueOnce([[adminUser]])  // actor
            .mockResolvedValueOnce([[adminUser]]);  // target (same)
        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 1, targetUserId: 1 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/your own identity/i);
    });

    it('returns 403 when sponsor tries to impersonate another sponsor', async () => {
        pool.query
            .mockResolvedValueOnce([[sponsorUser]])  // actor
            .mockResolvedValueOnce([[{ ...sponsorUser, user_id: 6, username: 'sponsor2' }]]);  // target is sponsor
        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 2, targetUserId: 6 });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/sponsors can only assume identity of drivers/i);
    });

    it('returns 403 when sponsor tries to impersonate driver in different org', async () => {
        pool.query
            .mockResolvedValueOnce([[sponsorUser]])                         // actor
            .mockResolvedValueOnce([[driverUser]])                          // target
            .mockResolvedValueOnce([[{ sponsor_org_id: 10 }]])              // sponsor's org
            .mockResolvedValueOnce([[{ sponsor_org_id: 20 }]]);             // driver's org (different)
        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 2, targetUserId: 3 });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/drivers in your organization/i);
    });

    it('returns 404 when target user does not exist', async () => {
        pool.query
            .mockResolvedValueOnce([[adminUser]])  // actor
            .mockResolvedValueOnce([[]]);           // target not found
        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 1, targetUserId: 999 });
        expect(res.status).toBe(404);
    });

    // -- Success cases --

    it('admin can impersonate a driver', async () => {
        pool.query
            .mockResolvedValueOnce([[adminUser]])                           // actor
            .mockResolvedValueOnce([[driverUser]])                          // target
            .mockResolvedValueOnce([{ insertId: 1 }])                      // audit log insert
            .mockResolvedValueOnce([[{ sponsor_org_id: 10 }]])             // getSponsorOrgId for driver
            .mockResolvedValueOnce([[]]);                                   // getDriverSponsors

        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 1, targetUserId: 3 });

        expect(res.status).toBe(200);
        expect(res.body.user.user_id).toBe(3);
        expect(res.body.user.user_type).toBe('driver');
        expect(res.body.user.sponsor_org_id).toBe(10);
    });

    it('admin can impersonate a sponsor', async () => {
        pool.query
            .mockResolvedValueOnce([[adminUser]])                           // actor
            .mockResolvedValueOnce([[sponsorUser]])                         // target
            .mockResolvedValueOnce([{ insertId: 1 }])                      // audit log insert
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]]);             // getSponsorOrgId for sponsor

        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 1, targetUserId: 2 });

        expect(res.status).toBe(200);
        expect(res.body.user.user_id).toBe(2);
        expect(res.body.user.user_type).toBe('sponsor');
        expect(res.body.user.sponsor_org_id).toBe(5);
    });

    it('sponsor can impersonate driver in same org', async () => {
        pool.query
            .mockResolvedValueOnce([[sponsorUser]])                         // actor
            .mockResolvedValueOnce([[driverUser]])                          // target
            .mockResolvedValueOnce([[{ sponsor_org_id: 10 }]])              // sponsor's org
            .mockResolvedValueOnce([[{ sponsor_org_id: 10 }]])              // driver's org (same)
            .mockResolvedValueOnce([{ insertId: 1 }])                       // audit log insert
            .mockResolvedValueOnce([[{ sponsor_org_id: 10 }]])              // getSponsorOrgId for response
            .mockResolvedValueOnce([[]]);                                    // getDriverSponsors

        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 2, targetUserId: 3 });

        expect(res.status).toBe(200);
        expect(res.body.user.user_id).toBe(3);
        expect(res.body.user.user_type).toBe('driver');
    });

    it('writes an audit log entry on successful impersonation', async () => {
        pool.query
            .mockResolvedValueOnce([[adminUser]])                           // actor
            .mockResolvedValueOnce([[driverUser]])                          // target
            .mockResolvedValueOnce([{ insertId: 1 }])                      // audit log insert
            .mockResolvedValueOnce([[{ sponsor_org_id: 10 }]]);            // getSponsorOrgId

        await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 1, targetUserId: 3 });

        // Third query call should be the audit log INSERT
        const auditCall = pool.query.mock.calls[2];
        expect(auditCall[0]).toMatch(/INSERT INTO impersonation_log/);
        // 'start' is hardcoded in SQL, not in the params array
        expect(auditCall[1]).toEqual([1, 'admin1', 'admin', 3, 'driver1', 'driver']);
    });

    // -- Server error --

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));
        const res = await request(app)
            .post('/api/impersonate')
            .send({ actorUserId: 1, targetUserId: 3 });
        expect(res.status).toBe(500);
    });
});

// ── POST /api/impersonate/exit ──

describe('POST /api/impersonate/exit', () => {

    it('returns 401 when no cookie and no actorUserId', async () => {
        const res = await request(app)
            .post('/api/impersonate/exit')
            .send({});
        expect(res.status).toBe(401);
    });

    it('returns the real user data on exit', async () => {
        // No impersonating cookie in supertest, so audit block is skipped.
        // Only queries: real user lookup + getSponsorOrgId
        pool.query
            .mockResolvedValueOnce([[adminUser]])    // real user lookup for response
            .mockResolvedValueOnce([[]]);             // getSponsorOrgId (admin has none)

        const res = await request(app)
            .post('/api/impersonate/exit')
            .send({ actorUserId: 1 });

        expect(res.status).toBe(200);
        expect(res.body.user.user_id).toBe(1);
        expect(res.body.user.user_type).toBe('admin');
    });

    it('returns 401 when real user no longer exists', async () => {
        pool.query.mockResolvedValueOnce([[]]);  // real user not found

        const res = await request(app)
            .post('/api/impersonate/exit')
            .send({ actorUserId: 999 });

        expect(res.status).toBe(401);
    });

    it('returns error when the user lookup query fails', async () => {
        // When the query rejects, the try/catch should return 500
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));
        const res = await request(app)
            .post('/api/impersonate/exit')
            .send({ actorUserId: 1 });
        expect([401, 500]).toContain(res.status);
    });
});
