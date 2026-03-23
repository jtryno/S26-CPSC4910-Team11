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

describe('POST /api/user/leave-organization', () => {
    it('deletes the sponsor_user row when a sponsor leaves an organization', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 7 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .post('/api/user/leave-organization')
            .send({ user_id: 42, user_type: 'sponsor' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Successfully left organization');
        expect(pool.query.mock.calls[1][0]).toBe('DELETE FROM sponsor_user WHERE user_id = ?');
        expect(pool.query.mock.calls[1][1]).toEqual([42]);
    });

    it('returns 404 when a sponsor has no sponsor_user row', async () => {
        pool.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .post('/api/user/leave-organization')
            .send({ user_id: 42, user_type: 'sponsor' });

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'No organization found for this sponsor');
    });
});
