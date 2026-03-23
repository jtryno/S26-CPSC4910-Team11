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

beforeEach(() => {
    vi.clearAllMocks();
    pool.getConnection.mockResolvedValue(mockConn);
    mockConn.beginTransaction.mockResolvedValue();
    mockConn.commit.mockResolvedValue();
    mockConn.rollback.mockResolvedValue();
    mockConn.release.mockReset();
    mockConn.query.mockReset();
});

// GET /api/user/:userId/download-data — Download personal data

describe('GET /api/user/:userId/download-data', () => {

    // -- Authorization --

    it('returns 403 when requestingUserId is missing', async () => {
        const res = await request(app).get('/api/user/1/download-data');
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'You can only download your own data.');
    });

    it('returns 403 when requestingUserId does not match userId', async () => {
        const res = await request(app).get('/api/user/1/download-data?requestingUserId=2');
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'You can only download your own data.');
    });

    // -- User not found --

    it('returns 404 when user does not exist', async () => {
        pool.query.mockResolvedValueOnce([[]]);  // empty users result
        const res = await request(app).get('/api/user/999/download-data?requestingUserId=999');
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'User not found');
    });

    // -- Driver success --

    it('returns 200 with downloadable JSON for a driver user', async () => {
        const fakeUser = {
            user_id: 1, first_name: 'Jane', last_name: 'Doe',
            phone_number: '(555) 123-4567', email: 'jane@test.com',
            username: 'janedoe', user_type: 'driver',
            two_fa_enabled: 0, created_at: '2025-01-01',
        };

        pool.query
            .mockResolvedValueOnce([[fakeUser]])                                    // user profile
            .mockResolvedValueOnce([[{ sponsor_org_id: 1, driver_status: 'active',  // driver info
                current_points_balance: 500,
                affilated_at: '2025-02-01', dropped_at: null, drop_reason: null,
                sponsor_org_name: 'Acme Trucking' }]])
            .mockResolvedValueOnce([[{ transaction_id: 10, point_amount: 100 }]])   // point transactions
            .mockResolvedValueOnce([[{ order_id: 5, status: 'completed' }]])        // orders
            .mockResolvedValueOnce([[{ application_id: 3, status: 'approved' }]])   // applications
            .mockResolvedValueOnce([[]])                                            // point contests
            .mockResolvedValueOnce([[{ log_id: 1, result: 'success' }]])            // login history
            .mockResolvedValueOnce([[]])                                            // password change logs
            .mockResolvedValueOnce([[{ notification_id: 1, message: 'test' }]])     // notifications
            .mockResolvedValueOnce([[{ points_changed_enabled: 1 }]])               // notif prefs
            .mockResolvedValueOnce([[]])                                            // support tickets
            .mockResolvedValueOnce([[]])                                            // sent messages
            .mockResolvedValueOnce([[]]);                                           // received messages

        const res = await request(app).get('/api/user/1/download-data?requestingUserId=1');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/application\/json/);
        expect(res.headers['content-disposition']).toMatch(/attachment/);

        const data = JSON.parse(res.text);
        expect(data.profile.user_id).toBe(1);
        expect(data.profile.email).toBe('jane@test.com');
        expect(data.driverInfo.sponsor_org_name).toBe('Acme Trucking');
        expect(data.pointTransactions).toHaveLength(1);
        expect(data.orders).toHaveLength(1);
        expect(data.applications).toHaveLength(1);
        expect(data.loginHistory).toHaveLength(1);
        expect(data.exportedAt).toBeDefined();
        // Ensure no sensitive fields are present
        expect(data.profile).not.toHaveProperty('password_hash');
        expect(data.profile).not.toHaveProperty('password');
    });

    // -- Sponsor success --

    it('returns 200 with downloadable JSON for a sponsor user', async () => {
        const fakeUser = {
            user_id: 2, first_name: 'Bob', last_name: 'Smith',
            phone_number: '(555) 999-0000', email: 'bob@sponsor.com',
            username: 'bobsmith', user_type: 'sponsor',
            two_fa_enabled: 1, created_at: '2025-01-15',
        };

        pool.query
            .mockResolvedValueOnce([[fakeUser]])                                        // user profile
            .mockResolvedValueOnce([[{ sponsor_org_id: 3, sponsor_org_name: 'FastHaul', // sponsor info
                point_value: 0.01 }]])
            .mockResolvedValueOnce([[]])                                                // login history
            .mockResolvedValueOnce([[]])                                                // password change logs
            .mockResolvedValueOnce([[]])                                                // notifications
            .mockResolvedValueOnce([[]])                                                // notif prefs
            .mockResolvedValueOnce([[]])                                                // support tickets
            .mockResolvedValueOnce([[]])                                                // sent messages
            .mockResolvedValueOnce([[]]);                                               // received messages

        const res = await request(app).get('/api/user/2/download-data?requestingUserId=2');

        expect(res.status).toBe(200);
        const data = JSON.parse(res.text);
        expect(data.profile.user_type).toBe('sponsor');
        expect(data.sponsorInfo.sponsor_org_name).toBe('FastHaul');
        // driver-specific fields should not exist for sponsors
        expect(data).not.toHaveProperty('driverInfo');
        expect(data).not.toHaveProperty('pointTransactions');
        expect(data).not.toHaveProperty('orders');
    });

    // -- Admin success --

    it('returns 200 with downloadable JSON for an admin user', async () => {
        const fakeUser = {
            user_id: 3, first_name: 'Admin', last_name: 'User',
            phone_number: null, email: 'admin@system.com',
            username: 'admin1', user_type: 'admin',
            two_fa_enabled: 1, created_at: '2024-12-01',
        };

        pool.query
            .mockResolvedValueOnce([[fakeUser]])   // user profile
            .mockResolvedValueOnce([[]])            // login history
            .mockResolvedValueOnce([[]])            // password change logs
            .mockResolvedValueOnce([[]])            // notifications
            .mockResolvedValueOnce([[]])            // notif prefs
            .mockResolvedValueOnce([[]])            // support tickets
            .mockResolvedValueOnce([[]])            // sent messages
            .mockResolvedValueOnce([[]]);           // received messages

        const res = await request(app).get('/api/user/3/download-data?requestingUserId=3');

        expect(res.status).toBe(200);
        const data = JSON.parse(res.text);
        expect(data.profile.user_type).toBe('admin');
        // no driver or sponsor specific data
        expect(data).not.toHaveProperty('driverInfo');
        expect(data).not.toHaveProperty('sponsorInfo');
    });

    // -- Server error --

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection failed'));
        const res = await request(app).get('/api/user/1/download-data?requestingUserId=1');
        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to download personal data');
    });
});
