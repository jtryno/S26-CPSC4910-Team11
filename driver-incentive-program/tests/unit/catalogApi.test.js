// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Mock DB pool before importing the server
vi.mock('../../server/db.js', () => ({
    default: {
        query: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({ release: vi.fn() }),
    },
}));

import { app } from '../../server/index.js';
import pool from '../../server/db.js';

// ─── GET /api/catalog/org/:sponsorOrgId ───────────────────────────────────────

describe('GET /api/catalog/org/:sponsorOrgId', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 200 with items array', async () => {
        pool.query.mockResolvedValueOnce([[
            { item_id: 1, title: 'Widget', is_featured: 0, driver_purchase_count: 0 },
        ]]);

        const res = await request(app).get('/api/catalog/org/1');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('items');
        expect(res.body.items).toHaveLength(1);
    });

    it('includes driver_purchase_count on each item (#6222)', async () => {
        pool.query.mockResolvedValueOnce([[
            { item_id: 1, title: 'Popular Item', is_featured: 0, driver_purchase_count: 7 },
        ]]);

        const res = await request(app).get('/api/catalog/org/1');

        expect(res.body.items[0]).toHaveProperty('driver_purchase_count', 7);
    });

    it('includes is_featured on each item (#6249)', async () => {
        pool.query.mockResolvedValueOnce([[
            { item_id: 2, title: 'Featured Item', is_featured: 1, driver_purchase_count: 0 },
        ]]);

        const res = await request(app).get('/api/catalog/org/1');

        expect(res.body.items[0]).toHaveProperty('is_featured', 1);
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB connection lost'));

        const res = await request(app).get('/api/catalog/org/1');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch catalog');
    });
});

// ─── POST /api/catalog/org/:sponsorOrgId/items ────────────────────────────────

describe('POST /api/catalog/org/:sponsorOrgId/items — category field (#6282)', () => {
    beforeEach(() => vi.clearAllMocks());

    const baseBody = {
        ebay_item_id: 'ebay-abc-123',
        title: 'Test Product',
        last_price_value: '25.00',
    };

    it('returns 400 when required fields are missing', async () => {
        const res = await request(app)
            .post('/api/catalog/org/1/items')
            .send({ title: 'Missing price' });

        expect(res.status).toBe(400);
    });

    it('stores category in DB when provided', async () => {
        pool.query
            .mockResolvedValueOnce([[{ point_value: '0.01' }]])
            .mockResolvedValueOnce([{ insertId: 5 }]);

        const res = await request(app)
            .post('/api/catalog/org/1/items')
            .send({ ...baseBody, category: 'Electronics' });

        expect(res.status).toBe(201);
        const insertParams = pool.query.mock.calls[1][1];
        expect(insertParams).toContain('Electronics');
    });

    it('stores null for category when not provided', async () => {
        pool.query
            .mockResolvedValueOnce([[{ point_value: '0.01' }]])
            .mockResolvedValueOnce([{ insertId: 6 }]);

        const res = await request(app)
            .post('/api/catalog/org/1/items')
            .send(baseBody);

        expect(res.status).toBe(201);
        const insertParams = pool.query.mock.calls[1][1];
        // category is the last param
        expect(insertParams[insertParams.length - 1]).toBeNull();
    });

    it('returns 404 when org does not exist', async () => {
        pool.query.mockResolvedValueOnce([[]]); // org not found

        const res = await request(app)
            .post('/api/catalog/org/999/items')
            .send(baseBody);

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Organization not found');
    });

    it('returns 201 with item_id on success', async () => {
        pool.query
            .mockResolvedValueOnce([[{ point_value: '0.01' }]])
            .mockResolvedValueOnce([{ insertId: 42 }]);

        const res = await request(app)
            .post('/api/catalog/org/1/items')
            .send(baseBody);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('item_id', 42);
    });
});

// ─── PUT /api/catalog/items/:itemId/featured (#6249) ─────────────────────────

describe('PUT /api/catalog/items/:itemId/featured', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 200 with success message when featuring an item', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/catalog/items/1/featured')
            .send({ is_featured: true });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Featured status updated');
    });

    it('returns 200 when unfeaturing an item', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/catalog/items/1/featured')
            .send({ is_featured: false });

        expect(res.status).toBe(200);
    });

    it('writes 1 to DB when is_featured is true', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app)
            .put('/api/catalog/items/3/featured')
            .send({ is_featured: true });

        const params = pool.query.mock.calls[0][1];
        expect(params[0]).toBe(1);
    });

    it('writes 0 to DB when is_featured is false', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app)
            .put('/api/catalog/items/3/featured')
            .send({ is_featured: false });

        const params = pool.query.mock.calls[0][1];
        expect(params[0]).toBe(0);
    });

    it('passes the correct item_id to DB', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app)
            .put('/api/catalog/items/7/featured')
            .send({ is_featured: true });

        const params = pool.query.mock.calls[0][1];
        expect(params[1]).toBe('7');
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app)
            .put('/api/catalog/items/1/featured')
            .send({ is_featured: true });

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to update featured status');
    });
});

// ─── PUT /api/catalog/items/:itemId/sale-price (#6224) ───────────────────────

describe('PUT /api/catalog/items/:itemId/sale-price', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 200 with success message when setting a sale price', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/catalog/items/1/sale-price')
            .send({ sale_price: '7.99' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Sale price updated');
    });

    it('stores the parsed float value in DB', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app)
            .put('/api/catalog/items/1/sale-price')
            .send({ sale_price: '7.99' });

        const params = pool.query.mock.calls[0][1];
        expect(params[0]).toBeCloseTo(7.99);
    });

    it('stores null when sale_price is an empty string (removes sale)', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/catalog/items/1/sale-price')
            .send({ sale_price: '' });

        expect(res.status).toBe(200);
        const params = pool.query.mock.calls[0][1];
        expect(params[0]).toBeNull();
    });

    it('stores null when sale_price is omitted from body (removes sale)', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app)
            .put('/api/catalog/items/1/sale-price')
            .send({});

        const params = pool.query.mock.calls[0][1];
        expect(params[0]).toBeNull();
    });

    it('passes the correct item_id to DB', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app)
            .put('/api/catalog/items/5/sale-price')
            .send({ sale_price: '3.50' });

        const params = pool.query.mock.calls[0][1];
        expect(params[1]).toBe('5');
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app)
            .put('/api/catalog/items/1/sale-price')
            .send({ sale_price: '5.00' });

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to update sale price');
    });
});

// ─── PUT /api/catalog/items/:itemId/customize ─────────────────────────────────

describe('PUT /api/catalog/items/:itemId/customize', () => {
    beforeEach(() => vi.clearAllMocks());

    const validBody = {
        custom_title: 'My Custom Name',
        custom_description: 'Sponsor-written description',
        custom_image_url: 'https://example.com/img.jpg',
        custom_points_price: 500,
        hide_price: false,
        hide_web_url: false,
        misc_info: 'Ships from warehouse',
        estimated_delivery_days: 7,
    };

    it('returns 200 with success message on valid update', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app)
            .put('/api/catalog/items/1/customize')
            .send(validBody);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Item updated');
    });

    it('stores custom_title in the UPDATE params', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app).put('/api/catalog/items/1/customize').send(validBody);

        const params = pool.query.mock.calls[0][1];
        expect(params).toContain('My Custom Name');
    });

    it('stores custom_points_price as an integer', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app).put('/api/catalog/items/1/customize').send({ ...validBody, custom_points_price: '750' });

        const params = pool.query.mock.calls[0][1];
        expect(params).toContain(750);
    });

    it('stores null for custom_title when omitted', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app).put('/api/catalog/items/1/customize').send({ hide_price: false, hide_web_url: false });

        const params = pool.query.mock.calls[0][1];
        expect(params[0]).toBeNull(); // custom_title
    });

    it('stores 1 for hide_price when true', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app).put('/api/catalog/items/1/customize').send({ ...validBody, hide_price: true });

        const params = pool.query.mock.calls[0][1];
        expect(params[4]).toBe(1); // hide_price is index 4
    });

    it('stores 0 for hide_price when false', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app).put('/api/catalog/items/1/customize').send({ ...validBody, hide_price: false });

        const params = pool.query.mock.calls[0][1];
        expect(params[4]).toBe(0);
    });

    it('stores 1 for hide_web_url when true', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app).put('/api/catalog/items/1/customize').send({ ...validBody, hide_web_url: true });

        const params = pool.query.mock.calls[0][1];
        expect(params[5]).toBe(1); // hide_web_url is index 5
    });

    it('stores estimated_delivery_days as an integer', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app).put('/api/catalog/items/1/customize').send({ ...validBody, estimated_delivery_days: '14' });

        const params = pool.query.mock.calls[0][1];
        expect(params[7]).toBe(14); // estimated_delivery_days is index 7
    });

    it('passes the correct item_id as the last param', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        await request(app).put('/api/catalog/items/42/customize').send(validBody);

        const params = pool.query.mock.calls[0][1];
        expect(params[params.length - 1]).toBe('42');
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app).put('/api/catalog/items/1/customize').send(validBody);

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to update item');
    });
});
