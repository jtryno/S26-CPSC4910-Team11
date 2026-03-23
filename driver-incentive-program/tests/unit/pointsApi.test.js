// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// ---------------------------------------------------------------------------
// Mock DB pool before importing the server.
// vi.hoisted runs before vi.mock factories so mockConn is available there.
// ---------------------------------------------------------------------------

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

beforeEach(() => {
    vi.clearAllMocks();
    // Reset getConnection to always return the fresh mockConn
    pool.getConnection.mockResolvedValue(mockConn);
    mockConn.beginTransaction.mockResolvedValue();
    mockConn.commit.mockResolvedValue();
    mockConn.rollback.mockResolvedValue();
    mockConn.release.mockReset();
    mockConn.query.mockReset();
});

// ===========================================================================
// POST /api/sponsor/points — Award / deduct points (batch)
// ===========================================================================

describe('POST /api/sponsor/points', () => {
    const validBody = {
        sponsorUserId: 99,
        driverIds: [1, 2],
        pointAmount: 50,
        reason: 'Safe driving bonus',
        source: 'manual',
    };

    // Helpers to satisfy the happy-path query chain:
    //   1. sponsor lookup → sponsor_org_id
    //   2. org limits
    //   3. (optional) monthly total check
    //   4. (optional) driver balance check
    //   5. bulk INSERT
    //   6. notification INSERTs (one per driver)
    const setupHappyPath = () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 7 }]])              // sponsor lookup
            .mockResolvedValueOnce([[{ point_upper_limit: null, point_lower_limit: null, monthly_point_limit: null }]]) // org limits (no limits)
            .mockResolvedValueOnce([{ affectedRows: 2 }])                  // bulk INSERT transactions
            .mockResolvedValue([{ affectedRows: 1 }]);                     // notifications (any remaining calls)
    };

    // ── Validation ──────────────────────────────────────────────────────────

    // Missing driverIds field entirely
    it('returns 400 when driverIds is missing', async () => {
        const { driverIds: _, ...body } = validBody;
        const res = await request(app).post('/api/sponsor/points').send(body);
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'driverIds must be a non-empty array');
    });

    // driverIds sent as a plain number instead of an array
    it('returns 400 when driverIds is not an array', async () => {
        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, driverIds: 1 });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'driverIds must be a non-empty array');
    });

    // Empty array [] is not useful — must have at least one driver
    it('returns 400 when driverIds is an empty array', async () => {
        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, driverIds: [] });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'driverIds must be a non-empty array');
    });

    // A change of 0 points does nothing — must be non-zero
    it('returns 400 when pointAmount is 0', async () => {
        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, pointAmount: 0 });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'pointAmount must be a non-zero number');
    });

    // pointAmount sent as "50" (string) instead of the number 50
    it('returns 400 when pointAmount is a string', async () => {
        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, pointAmount: '50' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'pointAmount must be a non-zero number');
    });

    // Missing reason field entirely
    it('returns 400 when reason is missing', async () => {
        const { reason: _, ...body } = validBody;
        const res = await request(app).post('/api/sponsor/points').send(body);
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'reason is required');
    });

    // A reason of all spaces is treated the same as no reason
    it('returns 400 when reason is only whitespace', async () => {
        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, reason: '   ' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'reason is required');
    });

    // Only "manual" and "recurring" are accepted sources
    it('returns 400 when source is invalid', async () => {
        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, source: 'automatic' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'source must be "manual" or "recurring"');
    });

    // ── Business logic errors ────────────────────────────────────────────────

    // sponsorUserId doesn't map to any org in sponsor_user table
    it('returns 404 when the sponsor org is not found', async () => {
        pool.query.mockResolvedValueOnce([[]]); // empty sponsor lookup
        const res = await request(app).post('/api/sponsor/points').send(validBody);
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Sponsor org not found for this user');
    });

    // Org cap is 500/month; 450 already awarded + 50*2 new = 550 which exceeds it
    it('returns 400 when awarding would exceed the monthly point limit', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[{ point_upper_limit: null, point_lower_limit: null, monthly_point_limit: 500 }]])
            .mockResolvedValueOnce([[{ month_total: '450' }]]); // 450 already used; 50*2 = 100 more = 550 > 500

        const res = await request(app).post('/api/sponsor/points').send(validBody);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/monthly point limit/i);
    });

    // Driver at 980 pts + 50 = 1030, which exceeds the org's 1000-point ceiling
    it('returns 400 when adjustment would exceed driver upper point limit', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[{ point_upper_limit: 1000, point_lower_limit: null, monthly_point_limit: null }]])
            // driver balance check — driver already at 980, adding 50 → 1030 > 1000
            .mockResolvedValueOnce([[{ user_id: 1, current_points_balance: 980 }]]);

        const res = await request(app).post('/api/sponsor/points').send({ ...validBody, driverIds: [1] });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/upper point limit/i);
    });

    // Driver has 30 pts; deducting 50 gives -20, below the org's floor of 0
    it('returns 400 when deduction would push driver below lower point limit', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[{ point_upper_limit: null, point_lower_limit: 0, monthly_point_limit: null }]])
            // driver balance check — driver has 30 points; deducting 50 → -20 < 0
            .mockResolvedValueOnce([[{ user_id: 1, current_points_balance: 30 }]]);

        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, driverIds: [1], pointAmount: -50 });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/lower point limit/i);
    });

    // ── Success paths ────────────────────────────────────────────────────────

    // Happy path: award points to one driver
    it('returns 200 and confirms points applied to a single driver', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[{ point_upper_limit: null, point_lower_limit: null, monthly_point_limit: null }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])   // bulk INSERT
            .mockResolvedValue([{ affectedRows: 1 }]);       // notifications

        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, driverIds: [1] });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Points applied to 1 driver(s)');
    });

    // Happy path: batch award to two drivers in one request
    it('returns 200 and confirms points applied to multiple drivers', async () => {
        setupHappyPath();

        const res = await request(app).post('/api/sponsor/points').send(validBody);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Points applied to 2 driver(s)');
    });

    // "recurring" is the other accepted source value besides "manual"
    it('accepts "recurring" as a valid source', async () => {
        setupHappyPath();

        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, source: 'recurring' });

        expect(res.status).toBe(200);
    });

    // Deductions work fine when the org has no configured limits
    it('allows negative pointAmount (deduction) through when limits are null', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[{ point_upper_limit: null, point_lower_limit: null, monthly_point_limit: null }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValue([{ affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, pointAmount: -25 });

        expect(res.status).toBe(200);
    });

    // Verifies the actual DB INSERT receives the right driver IDs and point value
    it('passes the correct driver IDs and point amount to the INSERT query', async () => {
        setupHappyPath();

        await request(app)
            .post('/api/sponsor/points')
            .send({ ...validBody, driverIds: [3, 4], pointAmount: 100 });

        // The INSERT VALUES call is the 3rd pool.query call (index 2)
        const insertCall = pool.query.mock.calls[2];
        const txValues = insertCall[1][0]; // nested array
        expect(txValues[0][0]).toBe(3);    // first driver id
        expect(txValues[1][0]).toBe(4);    // second driver id
        expect(txValues[0][2]).toBe(100);  // point_amount
    });

    // ── Error handling ───────────────────────────────────────────────────────

    // DB crash is caught and surfaces as a 500
    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('Connection lost'));

        const res = await request(app).post('/api/sponsor/points').send(validBody);

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to apply points');
    });
});

// ===========================================================================
// GET /api/driver/points/:userId — Driver points history
// ===========================================================================

describe('GET /api/driver/points/:userId', () => {
    const sampleTransactions = [
        {
            transaction_id: 1,
            point_amount: 100,
            reason: 'Safe driving',
            source: 'manual',
            created_at: '2026-03-01T10:00:00Z',
            sponsor_org_id: 7,
            sponsor_name: 'TruckCo',
        },
    ];

    // userId doesn't exist in the users table
    it('returns 404 when the user does not exist', async () => {
        pool.query.mockResolvedValueOnce([[]]); // no users row

        const res = await request(app).get('/api/driver/points/999');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'User not found');
    });

    // Sponsors and admins are blocked — only drivers have point history
    it('returns 403 when the user is not a driver', async () => {
        pool.query.mockResolvedValueOnce([[{ user_type: 'sponsor' }]]);

        const res = await request(app).get('/api/driver/points/5');
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'Not a driver account');
    });

    // Full success: returns transaction list, running total, driver status, and org info
    it('returns 200 with transactions and summary data for a valid driver', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_type: 'driver' }]])           // user type check
            .mockResolvedValueOnce([sampleTransactions])                   // transaction list
            .mockResolvedValueOnce([[{ total_points: 350 }]])              // total_points
            .mockResolvedValueOnce([[{ driver_status: 'active', sponsor_org_id: 7, sponsor_name: 'TruckCo' }]]); // driver info

        const res = await request(app).get('/api/driver/points/10');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('total_points', 350);
        expect(Array.isArray(res.body.transactions)).toBe(true);
        expect(res.body.transactions).toHaveLength(1);
        expect(res.body).toHaveProperty('driver_status', 'active');
        expect(res.body).toHaveProperty('sponsor_name', 'TruckCo');
        expect(res.body).toHaveProperty('sponsor_org_id', 7);
    });

    // New driver with no history returns an empty array and 0 total, not null
    it('returns an empty transactions array and zero total when driver has no transactions', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_type: 'driver' }]])
            .mockResolvedValueOnce([[]])                                    // no transactions
            .mockResolvedValueOnce([[{ total_points: 0 }]])
            .mockResolvedValueOnce([[{ driver_status: 'active', sponsor_org_id: 7, sponsor_name: 'TruckCo' }]]);

        const res = await request(app).get('/api/driver/points/10');

        expect(res.status).toBe(200);
        expect(res.body.total_points).toBe(0);
        expect(res.body.transactions).toEqual([]);
    });

    // Missing driver_user row doesn't crash — status fields are just undefined
    it('still returns 200 when driver has no driver_user row (graceful fallback)', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_type: 'driver' }]])
            .mockResolvedValueOnce([sampleTransactions])
            .mockResolvedValueOnce([[{ total_points: 100 }]])
            .mockResolvedValueOnce([[]]); // no driver_user row

        const res = await request(app).get('/api/driver/points/10');

        expect(res.status).toBe(200);
        // driverInfo falls back to {}
        expect(res.body.driver_status).toBeUndefined();
    });

    // DB crash is caught and surfaces as a 500
    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB timeout'));

        const res = await request(app).get('/api/driver/points/10');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch driver points');
    });
});

// ===========================================================================
// GET /api/user/lifetime-points/:userId — Lifetime points earned
// ===========================================================================

describe('GET /api/user/lifetime-points/:userId', () => {
    // userId not found in users table
    it('returns 404 when the user does not exist', async () => {
        pool.query.mockResolvedValueOnce([[]]); // no user

        const res = await request(app).get('/api/user/lifetime-points/999');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'User not found');
    });

    // Only drivers accumulate lifetime points — admins/sponsors are blocked
    it('returns 403 when the user is not a driver', async () => {
        pool.query.mockResolvedValueOnce([[{ user_type: 'admin' }]]);

        const res = await request(app).get('/api/user/lifetime-points/5');
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'Not a driver account');
    });

    // Returns the all-time sum of every point transaction for this driver
    it('returns 200 with lifetime_points for a valid driver', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_type: 'driver' }]])
            .mockResolvedValueOnce([[{ lifetime_points: 1250 }]]);

        const res = await request(app).get('/api/user/lifetime-points/10');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('lifetime_points', 1250);
    });

    // Driver with no history returns 0, not null (COALESCE in the query)
    it('returns 0 lifetime points when driver has no transactions', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_type: 'driver' }]])
            .mockResolvedValueOnce([[{ lifetime_points: 0 }]]);

        const res = await request(app).get('/api/user/lifetime-points/10');

        expect(res.status).toBe(200);
        expect(res.body.lifetime_points).toBe(0);
    });

    // DB crash is caught and surfaces as a 500
    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app).get('/api/user/lifetime-points/10');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch lifetime points');
    });
});

// ===========================================================================
// GET /api/sponsor/monthly-points/:sponsorUserId — Monthly points by sponsor
// ===========================================================================

describe('GET /api/sponsor/monthly-points/:sponsorUserId', () => {
    // sponsorUserId has no matching row in sponsor_user table
    it('returns 404 when the sponsor has no associated org', async () => {
        pool.query.mockResolvedValueOnce([[]]); // no sponsor_user row

        const res = await request(app).get('/api/sponsor/monthly-points/99');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Sponsor org not found for this user');
    });

    // Returns this month's totals split into awarded (+) and deducted (-) amounts
    it('returns 200 with month_awarded and month_deducted', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[{ month_awarded: 500, month_deducted: -50 }]]);

        const res = await request(app).get('/api/sponsor/monthly-points/99');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('month_awarded', 500);
        expect(res.body).toHaveProperty('month_deducted', -50);
    });

    // Sponsor with no activity this month gets 0s, not null
    it('returns 0 values when no transactions exist this month', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[{ month_awarded: 0, month_deducted: 0 }]]);

        const res = await request(app).get('/api/sponsor/monthly-points/99');

        expect(res.status).toBe(200);
        expect(res.body.month_awarded).toBe(0);
        expect(res.body.month_deducted).toBe(0);
    });

    // DB crash is caught and surfaces as a 500
    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('Timeout'));

        const res = await request(app).get('/api/sponsor/monthly-points/99');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch monthly points');
    });
});

// ===========================================================================
// GET /api/organization/:sponsor_org_id/monthly-redeemed-points
// ===========================================================================

describe('GET /api/organization/:sponsor_org_id/monthly-redeemed-points', () => {
    // DB returns a negative sum (deductions); route converts it to positive with Math.abs
    it('returns 200 with total_redeemed as a positive number', async () => {
        pool.query.mockResolvedValueOnce([[{ total_redeemed: -300 }]]);

        const res = await request(app).get('/api/organization/7/monthly-redeemed-points');

        expect(res.status).toBe(200);
        // The route applies Math.abs, so we should get a positive value
        expect(res.body).toHaveProperty('total_redeemed', 300);
    });

    // No catalog purchases this month returns 0, not null
    it('returns 0 when no redemptions this month', async () => {
        pool.query.mockResolvedValueOnce([[{ total_redeemed: 0 }]]);

        const res = await request(app).get('/api/organization/7/monthly-redeemed-points');

        expect(res.status).toBe(200);
        expect(res.body.total_redeemed).toBe(0);
    });

    // DB crash is caught and surfaces as a 500
    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app).get('/api/organization/7/monthly-redeemed-points');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch monthly redeemed points');
    });
});

// ===========================================================================
// POST /api/point-contest — Driver submits a point dispute
// ===========================================================================

describe('POST /api/point-contest', () => {
    const validContest = {
        transaction_id: 5,
        driver_user_id: 10,
        sponsor_org_id: 7,
        reason: 'I did not violate that rule',
    };

    // Can't dispute without knowing which transaction to contest
    it('returns 400 when transaction_id is missing', async () => {
        const { transaction_id: _, ...body } = validContest;
        const res = await request(app).post('/api/point-contest').send(body);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/required/i);
    });

    // Must identify which driver is filing the contest
    it('returns 400 when driver_user_id is missing', async () => {
        const { driver_user_id: _, ...body } = validContest;
        const res = await request(app).post('/api/point-contest').send(body);
        expect(res.status).toBe(400);
    });

    // Must identify which org the disputed transaction belongs to
    it('returns 400 when sponsor_org_id is missing', async () => {
        const { sponsor_org_id: _, ...body } = validContest;
        const res = await request(app).post('/api/point-contest').send(body);
        expect(res.status).toBe(400);
    });

    // Driver must explain why they're disputing the deduction
    it('returns 400 when reason is missing', async () => {
        const { reason: _, ...body } = validContest;
        const res = await request(app).post('/api/point-contest').send(body);
        expect(res.status).toBe(400);
    });

    // Whitespace-only reason is treated as empty
    it('returns 400 when reason is only whitespace', async () => {
        const res = await request(app)
            .post('/api/point-contest')
            .send({ ...validContest, reason: '   ' });
        expect(res.status).toBe(400);
    });

    // Can only contest a negative (deduction) transaction that belongs to this driver
    it('returns 404 when the transaction does not belong to the driver or is not a deduction', async () => {
        pool.query.mockResolvedValueOnce([[]]); // no matching transaction

        const res = await request(app).post('/api/point-contest').send(validContest);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Transaction not found or is not a deduction');
    });

    // Prevents filing two disputes for the same transaction
    it('returns 409 when a pending contest already exists for this transaction', async () => {
        pool.query
            .mockResolvedValueOnce([[{ transaction_id: 5, point_amount: -50 }]]) // tx found
            .mockResolvedValueOnce([[{ contest_id: 99 }]]);                       // existing pending contest

        const res = await request(app).post('/api/point-contest').send(validContest);

        expect(res.status).toBe(409);
        expect(res.body).toHaveProperty('error', 'A pending contest already exists for this transaction');
    });

    // Happy path: contest created, new contest_id returned
    it('returns 200 with contest_id on successful submission', async () => {
        pool.query
            .mockResolvedValueOnce([[{ transaction_id: 5, point_amount: -50 }]]) // tx found
            .mockResolvedValueOnce([[]])                                           // no existing contest
            .mockResolvedValueOnce([{ insertId: 42 }]);                           // INSERT result

        const res = await request(app).post('/api/point-contest').send(validContest);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Contest submitted successfully');
        expect(res.body).toHaveProperty('contest_id', 42);
    });

    // Leading/trailing spaces are stripped before the reason is saved to DB
    it('trims whitespace from reason before inserting', async () => {
        pool.query
            .mockResolvedValueOnce([[{ transaction_id: 5, point_amount: -50 }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 1 }]);

        await request(app)
            .post('/api/point-contest')
            .send({ ...validContest, reason: '  Bad deduction  ' });

        const insertCall = pool.query.mock.calls[2];
        const params = insertCall[1];
        expect(params[3]).toBe('Bad deduction'); // trimmed reason in 4th param
    });

    // DB crash is caught and surfaces as a 500
    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app).post('/api/point-contest').send(validContest);

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to submit point contest');
    });
});

// ===========================================================================
// GET /api/point-contest/organization/:org_id — List contests for an org
// ===========================================================================

describe('GET /api/point-contest/organization/:org_id', () => {
    const sampleContests = [
        {
            contest_id: 1,
            transaction_id: 5,
            driver_user_id: 10,
            sponsor_org_id: 7,
            reason: 'Wrong deduction',
            status: 'pending',
            point_amount: -50,
            driver_username: 'jdoe',
        },
    ];

    // No ?status query param — returns all contests regardless of status
    it('returns 200 with all contests when no status filter is provided', async () => {
        pool.query.mockResolvedValueOnce([sampleContests]);

        const res = await request(app).get('/api/point-contest/organization/7');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('contests');
        expect(Array.isArray(res.body.contests)).toBe(true);
        expect(res.body.contests).toHaveLength(1);
    });

    // ?status=pending narrows results to only unreviewed contests
    it('returns 200 with filtered contests when status=pending is provided', async () => {
        pool.query.mockResolvedValueOnce([sampleContests]);

        const res = await request(app).get('/api/point-contest/organization/7?status=pending');

        expect(res.status).toBe(200);
        expect(res.body.contests).toHaveLength(1);
    });

    // No matching contests returns an empty array, not a 404
    it('returns an empty array when no contests match the filter', async () => {
        pool.query.mockResolvedValueOnce([[]]);

        const res = await request(app).get('/api/point-contest/organization/7?status=approved');

        expect(res.status).toBe(200);
        expect(res.body.contests).toEqual([]);
    });

    // Verifies the status value is actually passed through to the DB query
    it('includes the status filter in the query when provided', async () => {
        pool.query.mockResolvedValueOnce([[]]);

        await request(app).get('/api/point-contest/organization/7?status=rejected');

        const queryCall = pool.query.mock.calls[0];
        const params = queryCall[1];
        // org_id is always first, status filter is second when present
        expect(params).toContain('7');
        expect(params).toContain('rejected');
    });

    // DB crash is caught and surfaces as a 500
    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app).get('/api/point-contest/organization/7');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch point contests');
    });
});

// ===========================================================================
// PUT /api/point-contest/:contest_id — Review (approve/reject) a contest
// ===========================================================================

describe('PUT /api/point-contest/:contest_id', () => {
    const baseBody = {
        status: 'rejected',
        decision_reason: 'Evidence insufficient',
        reviewed_by_user_id: 99,
    };

    // Any status value other than "approved" or "rejected" is invalid
    it('returns 400 when status is not "approved" or "rejected"', async () => {
        const res = await request(app)
            .put('/api/point-contest/1')
            .send({ ...baseBody, status: 'pending' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'status must be "approved" or "rejected"');
    });

    // Must record which admin/sponsor performed the review
    it('returns 400 when reviewed_by_user_id is missing', async () => {
        const { reviewed_by_user_id: _, ...body } = baseBody;
        const res = await request(app).put('/api/point-contest/1').send(body);
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'reviewed_by_user_id is required');
    });

    // Can only review contests that are currently in "pending" status
    it('returns 404 when the contest does not exist or is already reviewed', async () => {
        pool.query.mockResolvedValueOnce([[]]); // no pending contest

        const res = await request(app).put('/api/point-contest/999').send(baseBody);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Contest not found or already reviewed');
    });

    // Rejection only updates the contest status — no new point transaction is created
    it('returns 200 and rejects the contest without creating a reversal transaction', async () => {
        pool.query
            .mockResolvedValueOnce([[{ contest_id: 1, transaction_id: 5, driver_user_id: 10, sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE contest

        const res = await request(app)
            .put('/api/point-contest/1')
            .send({ ...baseBody, status: 'rejected' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Contest rejected successfully');
        // Only 2 queries: SELECT + UPDATE (no INSERT for rejection)
        expect(pool.query.mock.calls).toHaveLength(2);
    });

    // Approval auto-creates a new point_transaction to reverse the original deduction
    it('returns 200 and creates a reversal transaction when the contest is approved', async () => {
        pool.query
            .mockResolvedValueOnce([[{ contest_id: 1, transaction_id: 5, driver_user_id: 10, sponsor_org_id: 7 }]]) // SELECT pending contest
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE contest status
            .mockResolvedValueOnce([[{ transaction_id: 5, driver_user_id: 10, sponsor_org_id: 7, point_amount: -50 }]]) // SELECT original tx
            .mockResolvedValueOnce([{ insertId: 200 }]);   // INSERT reversal tx

        const res = await request(app)
            .put('/api/point-contest/1')
            .send({ ...baseBody, status: 'approved' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Contest approved successfully');
        // 4 queries: SELECT contest + UPDATE + SELECT tx + INSERT reversal
        expect(pool.query.mock.calls).toHaveLength(4);
    });

    // The reversal point_amount is always positive even though the original was negative
    it('inserts a positive reversal amount (abs value) when approving', async () => {
        pool.query
            .mockResolvedValueOnce([[{ contest_id: 1, transaction_id: 5, driver_user_id: 10, sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ transaction_id: 5, driver_user_id: 10, sponsor_org_id: 7, point_amount: -75 }]])
            .mockResolvedValueOnce([{ insertId: 201 }]);

        await request(app)
            .put('/api/point-contest/1')
            .send({ ...baseBody, status: 'approved' });

        const insertCall = pool.query.mock.calls[3]; // 4th query = INSERT reversal
        const params = insertCall[1];
        // point_amount should be positive 75 (reversal of -75)
        expect(params[2]).toBe(75);
        expect(params[3]).toContain('reversal');
    });

    // decision_reason is optional — omitting it stores NULL in the DB
    it('stores null for decision_reason when it is not provided', async () => {
        pool.query
            .mockResolvedValueOnce([[{ contest_id: 1, transaction_id: 5, driver_user_id: 10, sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const { decision_reason: _, ...body } = baseBody;
        await request(app).put('/api/point-contest/1').send(body);

        const updateCall = pool.query.mock.calls[1];
        const params = updateCall[1];
        // decision_reason (index 1) should be null
        expect(params[1]).toBeNull();
    });

    // DB crash is caught and surfaces as a 500
    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB timeout'));

        const res = await request(app).put('/api/point-contest/1').send(baseBody);

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to review point contest');
    });
});

// ===========================================================================
// POST /api/orders — Checkout (points redemption)
// ===========================================================================

describe('POST /api/orders (points redemption)', () => {
    const validOrder = {
        driverUserId: 10,
        sponsorOrgId: 7,
        cartId: 55,
    };

    // Helpers for the connection mock
    const setupCheckout = (overrides = {}) => {
        const defaults = {
            cartRow: { cart_id: 55 },
            items: [{ item_id: 1, quantity: 2, points_price: 100, last_price_value: '10.00', availability_status: 'available', is_active: 1 }],
            driverBalance: 500,
            orderId: 88,
        };
        const cfg = { ...defaults, ...overrides };

        mockConn.query
            .mockResolvedValueOnce([[cfg.cartRow]])                     // cart validation
            .mockResolvedValueOnce([cfg.items])                         // cart items
            .mockResolvedValueOnce([[{ current_points_balance: cfg.driverBalance }]]) // driver balance
            .mockResolvedValueOnce([{ insertId: cfg.orderId }])         // INSERT order
            .mockResolvedValueOnce([{}])                                // INSERT order_items
            .mockResolvedValueOnce([{}])                                // INSERT point_transaction (deduction)
            .mockResolvedValueOnce([{}]);                               // UPDATE cart status
        // After commit, pool.query is used for:
        //   1. createNotification: pref lookup (order_placed_enabled)
        //   2. createNotification: INSERT notification
        //   3. Fetch order items for response summary
        pool.query
            .mockResolvedValueOnce([[{ order_placed_enabled: 1 }]])      // createNotification: pref check
            .mockResolvedValueOnce([{}])                                 // createNotification: INSERT notification
            .mockResolvedValueOnce([cfg.items.map(i => ({               // Fetch order items for summary
                item_id: i.item_id,
                quantity: i.quantity,
                points_price_at_purchase: i.points_price,
                price_usd_at_purchase: parseFloat(i.last_price_value),
                title: `Item ${i.item_id}`,
                image_url: null,
            }))]);
    };

    // All three fields (driverUserId, sponsorOrgId, cartId) are required
    it('returns 400 when driverUserId is missing', async () => {
        const { driverUserId: _, ...body } = validOrder;
        const res = await request(app).post('/api/orders').send(body);
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'driverUserId, sponsorOrgId, and cartId are required');
    });

    // Missing sponsorOrgId is rejected before any DB call
    it('returns 400 when sponsorOrgId is missing', async () => {
        const { sponsorOrgId: _, ...body } = validOrder;
        const res = await request(app).post('/api/orders').send(body);
        expect(res.status).toBe(400);
    });

    // Missing cartId is rejected before any DB call
    it('returns 400 when cartId is missing', async () => {
        const { cartId: _, ...body } = validOrder;
        const res = await request(app).post('/api/orders').send(body);
        expect(res.status).toBe(400);
    });

    // Cart must exist, belong to this driver, and still be active (not already checked out)
    it('returns 400 when the cart is not found or already checked out', async () => {
        mockConn.query.mockResolvedValueOnce([[undefined]]); // no cart row

        const res = await request(app).post('/api/orders').send(validOrder);

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Cart not found or already checked out');
        expect(mockConn.rollback).toHaveBeenCalled();
    });

    // Can't checkout with nothing in the cart
    it('returns 400 when the cart is empty', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ cart_id: 55 }]]) // cart found
            .mockResolvedValueOnce([[]]); // empty items

        const res = await request(app).post('/api/orders').send(validOrder);

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Cart is empty');
        expect(mockConn.rollback).toHaveBeenCalled();
    });

    // Out-of-stock items block the whole checkout
    it('returns 400 when an item is out of stock', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ cart_id: 55 }]])
            .mockResolvedValueOnce([[{ item_id: 1, quantity: 1, points_price: 50, last_price_value: '5.00', availability_status: 'out_of_stock', is_active: 1 }]]);

        const res = await request(app).post('/api/orders').send(validOrder);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/no longer available/i);
        expect(mockConn.rollback).toHaveBeenCalled();
    });

    // Deactivated catalog items (is_active=0) also block checkout
    it('returns 400 when an item is inactive (is_active = 0)', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ cart_id: 55 }]])
            .mockResolvedValueOnce([[{ item_id: 1, quantity: 1, points_price: 50, last_price_value: '5.00', availability_status: 'available', is_active: 0 }]]);

        const res = await request(app).post('/api/orders').send(validOrder);

        expect(res.status).toBe(400);
        expect(mockConn.rollback).toHaveBeenCalled();
    });

    // Driver's balance (100) is less than the cart total (500) — checkout is blocked
    it('returns 400 when the driver has insufficient points', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ cart_id: 55 }]])
            .mockResolvedValueOnce([[{ item_id: 1, quantity: 1, points_price: 500, last_price_value: '50.00', availability_status: 'available', is_active: 1 }]])
            .mockResolvedValueOnce([[{ current_points_balance: 100 }]]); // only 100 points, need 500

        const res = await request(app).post('/api/orders').send(validOrder);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/insufficient points/i);
        expect(mockConn.rollback).toHaveBeenCalled();
    });

    // Happy path: order created, points deducted, order_id and points_spent returned
    it('returns 200 with order_id and points_spent on successful checkout', async () => {
        setupCheckout();

        const res = await request(app).post('/api/orders').send(validOrder);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Order placed successfully');
        expect(res.body).toHaveProperty('order_id', 88);
        expect(res.body).toHaveProperty('points_spent', 200); // 2 items * 100 pts each
    });

    // Verifies the DB transaction is committed (not rolled back) on a successful order
    it('commits the transaction on success', async () => {
        setupCheckout();

        await request(app).post('/api/orders').send(validOrder);

        expect(mockConn.commit).toHaveBeenCalled();
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });

    // points_spent = sum of (points_price × qty) across all items — here 3 × 150 = 450
    it('correctly calculates total_points as sum of (points_price * quantity)', async () => {
        // 3 items, 150 pts each = 450 total
        mockConn.query
            .mockResolvedValueOnce([[{ cart_id: 55 }]])
            .mockResolvedValueOnce([[{ item_id: 1, quantity: 3, points_price: 150, last_price_value: '15.00', availability_status: 'available', is_active: 1 }]])
            .mockResolvedValueOnce([[{ current_points_balance: 1000 }]])
            .mockResolvedValueOnce([{ insertId: 88 }])
            .mockResolvedValueOnce([{}])
            .mockResolvedValueOnce([{}])
            .mockResolvedValueOnce([{}]);
        pool.query
            .mockResolvedValueOnce([[{ order_placed_enabled: 1 }]])      // createNotification: pref check
            .mockResolvedValueOnce([{}])                                 // createNotification: INSERT
            .mockResolvedValueOnce([[{                                   // Fetch order items for summary
                item_id: 1, quantity: 3,
                points_price_at_purchase: 150,
                price_usd_at_purchase: 15.00,
                title: 'Item 1', image_url: null,
            }]]);

        const res = await request(app).post('/api/orders').send(validOrder);

        expect(res.status).toBe(200);
        expect(res.body.points_spent).toBe(450);
    });

    // DB crash mid-transaction rolls everything back and returns 500
    it('rolls back and returns 500 when a database error occurs', async () => {
        mockConn.query.mockRejectedValueOnce(new Error('Deadlock'));

        const res = await request(app).post('/api/orders').send(validOrder);

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to place order');
        expect(mockConn.rollback).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });
});

// ===========================================================================
// PUT /api/orders/:orderId/cancel — Cancel order and refund points
// ===========================================================================

describe('PUT /api/orders/:orderId/cancel (points refund)', () => {
    const validCancel = { driverUserId: 10, cancel_reason: 'Changed my mind' };

    // Must know who is requesting the cancellation
    it('returns 400 when driverUserId is missing', async () => {
        const res = await request(app).put('/api/orders/88/cancel').send({});
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'driverUserId is required');
    });

    // Drivers can only cancel their own orders
    it('returns 404 when the order does not belong to the driver', async () => {
        mockConn.query.mockResolvedValueOnce([[undefined]]); // no order found

        const res = await request(app).put('/api/orders/88/cancel').send(validCancel);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Order not found');
        expect(mockConn.rollback).toHaveBeenCalled();
    });

    // Only "placed" orders can be cancelled — delivered/canceled ones cannot
    it('returns 400 when the order status is not "placed"', async () => {
        mockConn.query.mockResolvedValueOnce([[{ order_id: 88, status: 'delivered', sponsor_org_id: 7 }]]);

        const res = await request(app).put('/api/orders/88/cancel').send(validCancel);

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Only placed orders can be cancelled');
        expect(mockConn.rollback).toHaveBeenCalled();
    });

    // Happy path: order cancelled and the original point deduction is refunded
    it('returns 200 and refunds points when a matching deduction exists', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ order_id: 88, status: 'placed', sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[{ transaction_id: 5, point_amount: -200 }]]) // original deduction
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE order status
            .mockResolvedValueOnce([{ insertId: 300 }]);   // INSERT refund transaction

        const res = await request(app).put('/api/orders/88/cancel').send(validCancel);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Order cancelled');
        expect(res.body).toHaveProperty('points_refunded', 200);
        expect(mockConn.commit).toHaveBeenCalled();
    });

    // If no matching deduction is found, cancellation still succeeds with 0 refund
    it('returns 200 with 0 points_refunded when no matching transaction found', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ order_id: 88, status: 'placed', sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[undefined]]) // no matching deduction
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE order

        const res = await request(app).put('/api/orders/88/cancel').send(validCancel);

        expect(res.status).toBe(200);
        expect(res.body.points_refunded).toBe(0);
    });

    // Refund transaction amount is always positive (points going back to the driver)
    it('inserts a positive refund transaction when approving cancellation', async () => {
        mockConn.query
            .mockResolvedValueOnce([[{ order_id: 88, status: 'placed', sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([[{ transaction_id: 5, point_amount: -350 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ insertId: 301 }]);

        await request(app).put('/api/orders/88/cancel').send(validCancel);

        const insertCall = mockConn.query.mock.calls[3];
        const params = insertCall[1];
        // point_amount should be +350 (refund)
        expect(params[2]).toBe(350);
        expect(params[3]).toContain('Refund');
    });

    // DB crash mid-transaction rolls everything back and returns 500
    it('rolls back and returns 500 when a database error occurs', async () => {
        mockConn.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app).put('/api/orders/88/cancel').send(validCancel);

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to cancel order');
        expect(mockConn.rollback).toHaveBeenCalled();
        expect(mockConn.release).toHaveBeenCalled();
    });
});
