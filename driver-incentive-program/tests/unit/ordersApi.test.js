// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock the DB pool before importing the server
vi.mock('../../server/db.js', () => ({
    default: {
        query: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
    },
}));

import { app } from '../../server/index.js';
import pool from '../../server/db.js';

// ---------------------------------------------------------------------------
// PUT /api/orders/:orderId/delivery
// ---------------------------------------------------------------------------

describe('PUT /api/orders/:orderId/delivery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const validBody = {
        driverUserId: 1,
        delivery_name: 'John Driver',
        delivery_address: '123 Main St',
        delivery_city: 'Atlanta',
        delivery_state: 'GA',
        delivery_zip: '30301',
    };

    it('returns 400 when driverUserId is missing', async () => {
        const res = await request(app)
            .put('/api/orders/5/delivery')
            .send({ delivery_name: 'John Driver' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'driverUserId is required');
    });

    it('returns 404 when the order does not belong to the driver', async () => {
        // SELECT returns empty — order not found or belongs to different driver
        pool.query.mockResolvedValueOnce([[]]); // no matching row

        const res = await request(app)
            .put('/api/orders/99/delivery')
            .send(validBody);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Order not found');
    });

    it('returns 200 and updates delivery details when order belongs to driver', async () => {
        pool.query
            .mockResolvedValueOnce([[{ order_id: 5 }]])  // SELECT — order found
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE

        const res = await request(app)
            .put('/api/orders/5/delivery')
            .send(validBody);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Delivery details updated');
    });

    it('passes all delivery fields to the UPDATE query', async () => {
        pool.query
            .mockResolvedValueOnce([[{ order_id: 5 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app)
            .put('/api/orders/5/delivery')
            .send(validBody);

        const updateCall = pool.query.mock.calls[1];
        const params = updateCall[1];

        expect(params).toContain('John Driver');
        expect(params).toContain('123 Main St');
        expect(params).toContain('Atlanta');
        expect(params).toContain('GA');
        expect(params).toContain('30301');
    });

    it('stores null for delivery fields that are empty strings', async () => {
        pool.query
            .mockResolvedValueOnce([[{ order_id: 5 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app)
            .put('/api/orders/5/delivery')
            .send({ driverUserId: 1, delivery_name: '', delivery_address: '' });

        const updateCall = pool.query.mock.calls[1];
        const params = updateCall[1];

        // Empty strings are coerced to null
        expect(params[0]).toBeNull(); // delivery_name
        expect(params[1]).toBeNull(); // delivery_address
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection lost'));

        const res = await request(app)
            .put('/api/orders/5/delivery')
            .send(validBody);

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to update delivery details');
    });
});
