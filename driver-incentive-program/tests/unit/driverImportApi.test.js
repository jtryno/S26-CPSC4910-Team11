// @vitest-environment node
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

describe('POST /api/organization/:sponsor_org_id/users/import', () => {
    const validCsv = [
        'first_name,last_name,email',
        'Jamie,Lee,jamie.lee@example.com',
    ].join('\n');

    it('returns 400 when requestingUserId is missing', async () => {
        const res = await request(app)
            .post('/api/organization/7/users/import')
            .send({ csvText: validCsv });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'requestingUserId is required');
    });

    it('returns 400 when csvText is missing', async () => {
        const res = await request(app)
            .post('/api/organization/7/users/import')
            .send({ requestingUserId: 99 });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'csvText is required');
    });

    it('returns 403 when the requesting user is not a sponsor or admin', async () => {
        pool.query.mockResolvedValueOnce([[{ user_id: 55, user_type: 'driver' }]]);

        const res = await request(app)
            .post('/api/organization/7/users/import')
            .send({ requestingUserId: 55, csvText: validCsv });

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'Only sponsors and admins can import organization users');
    });

    it('returns 403 when a sponsor targets a different organization', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_id: 55, user_type: 'sponsor' }]])
            .mockResolvedValueOnce([[{ sponsor_org_id: 3 }]]);

        const res = await request(app)
            .post('/api/organization/7/users/import')
            .send({ requestingUserId: 55, csvText: validCsv });

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'Sponsors can only import users into their own organization');
    });

    it('returns 400 when userRole is invalid', async () => {
        const res = await request(app)
            .post('/api/organization/7/users/import')
            .send({ requestingUserId: 99, userRole: 'admin', csvText: validCsv });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'userRole must be "driver" or "sponsor"');
    });

    it('returns 400 when the CSV is missing required headers', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_id: 99, user_type: 'admin' }]])
            .mockResolvedValueOnce([[{ sponsor_org_id: 7, name: 'Acme Logistics' }]]);

        const res = await request(app)
            .post('/api/organization/7/users/import')
            .send({
                requestingUserId: 99,
                userRole: 'driver',
                csvText: 'first_name,email\nJamie,jamie.lee@example.com',
            });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/missing required headers/i);
        expect(res.body.error).toMatch(/lastName/i);
    });

    it('returns 200 and imports a driver with an onboarding link when password is blank', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_id: 99, user_type: 'admin' }]])
            .mockResolvedValueOnce([[{ sponsor_org_id: 7, name: 'Acme Logistics' }]]);

        mockConn.query
            .mockResolvedValueOnce([[]])                     // email uniqueness check
            .mockResolvedValueOnce([[]])                     // generated username uniqueness check
            .mockResolvedValueOnce([{ insertId: 201 }])      // users insert
            .mockResolvedValueOnce([{ affectedRows: 1 }])    // driver_user insert
            .mockResolvedValueOnce([{ affectedRows: 1 }]);   // password_reset_tokens insert

        const res = await request(app)
            .post('/api/organization/7/users/import')
            .send({ requestingUserId: 99, userRole: 'driver', csvText: validCsv });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('importedCount', 1);
        expect(res.body).toHaveProperty('failedCount', 0);
        expect(res.body).toHaveProperty('importedRole', 'driver');
        expect(res.body.results[0]).toHaveProperty('status', 'imported');
        expect(res.body.results[0]).toHaveProperty('userRole', 'driver');
        expect(res.body.results[0]).toHaveProperty('username', 'jamie.lee'.replace('.', '_'));
        expect(typeof res.body.results[0].onboardingToken).toBe('string');
        expect(res.body.results[0].onboardingPath).toMatch(/^\/password-reset\?token=/);
        expect(res.body.results[0]).not.toHaveProperty('temporaryPassword');
        expect(mockConn.beginTransaction).toHaveBeenCalledTimes(1);
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.release).toHaveBeenCalledTimes(1);
    });

    it('returns 200 and imports a sponsor user into sponsor_user', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_id: 99, user_type: 'admin' }]])
            .mockResolvedValueOnce([[{ sponsor_org_id: 7, name: 'Acme Logistics' }]]);

        mockConn.query
            .mockResolvedValueOnce([[]])                     // email uniqueness check
            .mockResolvedValueOnce([[]])                     // generated username uniqueness check
            .mockResolvedValueOnce([{ insertId: 301 }])      // users insert
            .mockResolvedValueOnce([{ affectedRows: 1 }])    // sponsor_user insert
            .mockResolvedValueOnce([{ affectedRows: 1 }]);   // password_reset_tokens insert

        const res = await request(app)
            .post('/api/organization/7/users/import')
            .send({ requestingUserId: 99, userRole: 'sponsor', csvText: validCsv });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('importedRole', 'sponsor');
        expect(res.body.results[0]).toHaveProperty('userRole', 'sponsor');
        expect(mockConn.query.mock.calls[2][1][6]).toBe('sponsor');
        expect(mockConn.query.mock.calls[3][0]).toBe('INSERT INTO sponsor_user (user_id, sponsor_org_id, created_by_user_id) VALUES (?, ?, ?)');
        expect(mockConn.query.mock.calls[3][1]).toEqual([301, '7', 99]);
        expect(res.body.results[0].onboardingPath).toMatch(/^\/password-reset\?token=/);
    });

    it('continues importing later rows when one row fails', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_id: 99, user_type: 'admin' }]])
            .mockResolvedValueOnce([[{ sponsor_org_id: 7, name: 'Acme Logistics' }]]);

        mockConn.query
            .mockResolvedValueOnce([[{ user_id: 5 }]])   // first row email already exists
            .mockResolvedValueOnce([[]])                 // second row email uniqueness
            .mockResolvedValueOnce([[]])                 // second row username uniqueness
            .mockResolvedValueOnce([{ insertId: 202 }])  // second row user insert
            .mockResolvedValueOnce([{ affectedRows: 1 }]) // second row driver insert
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // second row password_reset_tokens insert

        const res = await request(app)
            .post('/api/organization/7/users/import')
            .send({
                requestingUserId: 99,
                userRole: 'driver',
                csvText: [
                    'first_name,last_name,email',
                    'Jamie,Lee,jamie.lee@example.com',
                    'Taylor,Rivera,taylor.rivera@example.com',
                ].join('\n'),
            });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('importedCount', 1);
        expect(res.body).toHaveProperty('failedCount', 1);
        expect(res.body.results[0]).toHaveProperty('status', 'failed');
        expect(res.body.results[1]).toHaveProperty('status', 'imported');
        expect(res.body.results[0].error).toMatch(/email already exists/i);
        expect(mockConn.rollback).toHaveBeenCalledTimes(1);
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.release).toHaveBeenCalledTimes(1);
    });
});
