// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../../server/db.js', () => ({
    default: {
        query: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
    },
}));

import { app } from '../../server/index.js';
import pool from '../../server/db.js';

// ─── GET /api/health (#5617) ──────────────────────────────────────────────────

describe('GET /api/health', () => {
    it('returns 200 with status ok', async () => {
        const res = await request(app).get('/api/health');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'ok');
    });

    it('includes an uptime field (non-negative integer)', async () => {
        const res = await request(app).get('/api/health');

        expect(typeof res.body.uptime).toBe('number');
        expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    });

    it('includes a timestamp field in ISO format', async () => {
        const res = await request(app).get('/api/health');

        expect(res.body).toHaveProperty('timestamp');
        expect(() => new Date(res.body.timestamp)).not.toThrow();
        expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
    });

    it('does not require authentication (no DB call made)', async () => {
        const callsBefore = pool.query.mock.calls.length;
        await request(app).get('/api/health');
        expect(pool.query.mock.calls.length).toBe(callsBefore);
    });
});

// ─── GET /api/admin/statistics (#5961) ───────────────────────────────────────

describe('GET /api/admin/statistics', () => {
    beforeEach(() => vi.clearAllMocks());

    const mockAllQueries = () => {
        pool.query
            // user counts
            .mockResolvedValueOnce([[{
                total_users: 20, total_drivers: 12, total_sponsors: 6,
                total_admins: 2, active_users: 18, inactive_users: 2,
            }]])
            // org counts
            .mockResolvedValueOnce([[{ total_orgs: 4 }]])
            // order counts
            .mockResolvedValueOnce([[{
                total_orders: 50, placed_orders: 10, shipped_orders: 15,
                delivered_orders: 20, canceled_orders: 5, total_points_spent: 5000,
            }]])
            // catalog counts
            .mockResolvedValueOnce([[{ total_catalog_items: 30 }]])
            // ticket counts
            .mockResolvedValueOnce([[{ total_tickets: 8, open_tickets: 3, resolved_tickets: 5 }]]);
    };

    it('returns 200 with a users section', async () => {
        mockAllQueries();

        const res = await request(app).get('/api/admin/statistics');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('users');
    });

    it('returns correct total_users count', async () => {
        mockAllQueries();

        const res = await request(app).get('/api/admin/statistics');

        expect(res.body.users.total_users).toBe(20);
    });

    it('returns organizations section with total_orgs', async () => {
        mockAllQueries();

        const res = await request(app).get('/api/admin/statistics');

        expect(res.body).toHaveProperty('organizations');
        expect(res.body.organizations.total_orgs).toBe(4);
    });

    it('returns orders section with total_orders', async () => {
        mockAllQueries();

        const res = await request(app).get('/api/admin/statistics');

        expect(res.body).toHaveProperty('orders');
        expect(res.body.orders.total_orders).toBe(50);
    });

    it('returns orders section with total_points_spent', async () => {
        mockAllQueries();

        const res = await request(app).get('/api/admin/statistics');

        expect(res.body.orders.total_points_spent).toBe(5000);
    });

    it('returns catalog section with total_catalog_items', async () => {
        mockAllQueries();

        const res = await request(app).get('/api/admin/statistics');

        expect(res.body).toHaveProperty('catalog');
        expect(res.body.catalog.total_catalog_items).toBe(30);
    });

    it('returns tickets section with open_tickets', async () => {
        mockAllQueries();

        const res = await request(app).get('/api/admin/statistics');

        expect(res.body).toHaveProperty('tickets');
        expect(res.body.tickets.open_tickets).toBe(3);
    });

    it('includes a generated_at ISO timestamp', async () => {
        mockAllQueries();

        const res = await request(app).get('/api/admin/statistics');

        expect(res.body).toHaveProperty('generated_at');
        expect(() => new Date(res.body.generated_at)).not.toThrow();
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB down'));

        const res = await request(app).get('/api/admin/statistics');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch statistics');
    });
});

// ─── GET /api/admin/errors (#5981) ───────────────────────────────────────────

describe('GET /api/admin/errors', () => {
    beforeEach(() => vi.clearAllMocks());

    const makeError = (overrides = {}) => ({
        error_id: 1,
        route: '/api/catalog/org/1',
        method: 'GET',
        status_code: 500,
        message: 'DB connection lost',
        stack_trace: 'Error: DB connection lost\n    at ...',
        occurred_at: '2026-04-01T10:00:00.000Z',
        ...overrides,
    });

    it('returns 200 with an errors array', async () => {
        pool.query
            .mockResolvedValueOnce([[makeError()]])
            .mockResolvedValueOnce([[{ total: 1 }]]);

        const res = await request(app).get('/api/admin/errors');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('errors');
        expect(Array.isArray(res.body.errors)).toBe(true);
    });

    it('returns total count in the response', async () => {
        pool.query
            .mockResolvedValueOnce([[makeError()]])
            .mockResolvedValueOnce([[{ total: 42 }]]);

        const res = await request(app).get('/api/admin/errors');

        expect(res.body.total).toBe(42);
    });

    it('returns error rows with expected fields', async () => {
        pool.query
            .mockResolvedValueOnce([[makeError()]])
            .mockResolvedValueOnce([[{ total: 1 }]]);

        const res = await request(app).get('/api/admin/errors');

        const err = res.body.errors[0];
        expect(err).toHaveProperty('error_id');
        expect(err).toHaveProperty('route');
        expect(err).toHaveProperty('method');
        expect(err).toHaveProperty('status_code');
        expect(err).toHaveProperty('message');
        expect(err).toHaveProperty('occurred_at');
    });

    it('respects the limit query param (capped at 200)', async () => {
        pool.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await request(app).get('/api/admin/errors?limit=10');

        const passedLimit = pool.query.mock.calls[0][1][0];
        expect(passedLimit).toBe(10);
    });

    it('caps limit at 200 even when a larger value is passed', async () => {
        pool.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await request(app).get('/api/admin/errors?limit=9999');

        const passedLimit = pool.query.mock.calls[0][1][0];
        expect(passedLimit).toBe(200);
    });

    it('respects the offset query param', async () => {
        pool.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await request(app).get('/api/admin/errors?offset=25');

        const passedOffset = pool.query.mock.calls[0][1][1];
        expect(passedOffset).toBe(25);
    });

    it('returns an empty errors array when no errors exist', async () => {
        pool.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        const res = await request(app).get('/api/admin/errors');

        expect(res.status).toBe(200);
        expect(res.body.errors).toHaveLength(0);
        expect(res.body.total).toBe(0);
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('Query failed'));

        const res = await request(app).get('/api/admin/errors');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch error log');
    });
});
