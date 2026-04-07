// @vitest-environment node
import {describe, it, expect, vi, beforeEach} from 'vitest';
import request from 'supertest';

vi.mock('../../server/db.js', () => ({
    default: {
        query: vi.fn(),
        getConnection: vi.fn().mockResolvedValue({release: vi.fn()}),
    },
}));

import {app} from '../../server/index.js';
import pool from '../../server/db.js';

beforeEach(() => vi.clearAllMocks());

// -- GET /api/catalog/reviews/:itemId --

describe('GET /api/catalog/reviews/:itemId', () => {
    it('returns 200 with reviews array, avgRating, and totalReviews', async () => {
        pool.query.mockResolvedValueOnce([[
            {review_id: 1, item_id: 10, driver_user_id: 5, driver_username: 'test_driver', rating: 4, review_text: 'Great!', sponsor_reply: null, reply_username: null, reply_at: null, created_at: '2026-01-01T00:00:00Z'},
        ]]);

        const res = await request(app).get('/api/catalog/reviews/10');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reviews');
        expect(res.body).toHaveProperty('avgRating');
        expect(res.body).toHaveProperty('totalReviews');
        expect(res.body.reviews).toHaveLength(1);
    });

    it('returns avgRating as the average of all review ratings', async () => {
        pool.query.mockResolvedValueOnce([[
            {review_id: 1, rating: 4, review_text: 'Good', driver_user_id: 5, driver_username: 'a', sponsor_reply: null, reply_username: null, reply_at: null, created_at: '2026-01-01'},
            {review_id: 2, rating: 2, review_text: 'Bad', driver_user_id: 6, driver_username: 'b', sponsor_reply: null, reply_username: null, reply_at: null, created_at: '2026-01-01'},
        ]]);

        const res = await request(app).get('/api/catalog/reviews/10');

        expect(res.status).toBe(200);
        expect(res.body.avgRating).toBeCloseTo(3.0);
        expect(res.body.totalReviews).toBe(2);
    });

    it('returns empty reviews array and 0 totalReviews when no reviews exist', async () => {
        pool.query.mockResolvedValueOnce([[]]);

        const res = await request(app).get('/api/catalog/reviews/10');

        expect(res.status).toBe(200);
        expect(res.body.reviews).toHaveLength(0);
        expect(res.body.totalReviews).toBe(0);
    });

    it('includes sponsor_reply field on each review', async () => {
        pool.query.mockResolvedValueOnce([[
            {review_id: 1, rating: 5, review_text: 'Love it', driver_user_id: 5, driver_username: 'a', sponsor_reply: 'Thank you!', reply_username: 'sponsor1', reply_at: '2026-01-02', created_at: '2026-01-01'},
        ]]);

        const res = await request(app).get('/api/catalog/reviews/10');

        expect(res.body.reviews[0]).toHaveProperty('sponsor_reply', 'Thank you!');
        expect(res.body.reviews[0]).toHaveProperty('reply_username', 'sponsor1');
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app).get('/api/catalog/reviews/10');

        expect(res.status).toBe(500);
    });
});

// -- POST /api/catalog/reviews --

describe('POST /api/catalog/reviews', () => {
    const validBody = {
        itemId: 10,
        driverUserId: 5,
        rating: 4,
        reviewText: 'Really good product!',
    };

    it('returns 201 and creates a new review', async () => {
        pool.query
            .mockResolvedValueOnce([[{item_id: 10}]])   // item org check
            .mockResolvedValueOnce([{insertId: 99}])     // insert
            .mockResolvedValueOnce([[{review_id: 99, driver_username: 'test_driver'}]]); // fetch saved

        const res = await request(app)
            .post('/api/catalog/reviews')
            .send(validBody);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('review');
    });

    it('returns 400 when itemId is missing', async () => {
        const res = await request(app)
            .post('/api/catalog/reviews')
            .send({driverUserId: 5, rating: 4, reviewText: 'Good'});

        expect(res.status).toBe(400);
    });

    it('returns 400 when rating is missing', async () => {
        const res = await request(app)
            .post('/api/catalog/reviews')
            .send({itemId: 10, driverUserId: 5, reviewText: 'Good'});

        expect(res.status).toBe(400);
    });

    it('returns 400 when reviewText is missing', async () => {
        const res = await request(app)
            .post('/api/catalog/reviews')
            .send({itemId: 10, driverUserId: 5, rating: 4});

        expect(res.status).toBe(400);
    });

    it('returns 400 when rating is out of range', async () => {
        const res = await request(app)
            .post('/api/catalog/reviews')
            .send({...validBody, rating: 6});

        expect(res.status).toBe(400);
    });

    it('returns 400 when review text exceeds character limit', async () => {
        const res = await request(app)
            .post('/api/catalog/reviews')
            .send({...validBody, reviewText: 'a'.repeat(601)});

        expect(res.status).toBe(400);
    });

    it('updates existing review when driver already reviewed the item', async () => {
        pool.query
            .mockResolvedValueOnce([[{item_id: 10}]])   // item org check
            .mockResolvedValueOnce([{affectedRows: 1}]) // upsert
            .mockResolvedValueOnce([[{review_id: 5, driver_username: 'test_driver'}]]); // fetch saved

        const res = await request(app)
            .post('/api/catalog/reviews')
            .send(validBody);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('review');
    });

    it('returns 403 when item is not in driver org', async () => {
        pool.query.mockResolvedValueOnce([[]]); // item org check fails

        const res = await request(app)
            .post('/api/catalog/reviews')
            .send(validBody);

        expect(res.status).toBe(403);
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app)
            .post('/api/catalog/reviews')
            .send(validBody);

        expect(res.status).toBe(500);
    });
});

// -- POST /api/catalog/reviews/:reviewId/reply --

describe('POST /api/catalog/reviews/:reviewId/reply', () => {
    const validBody = {sponsorUserId: 2, replyText: 'Thank you for your feedback!'};

    it('returns 200 when reply is saved successfully', async () => {
        pool.query
            .mockResolvedValueOnce([[{review_id: 1, sponsor_org_id: 1}]])  // review lookup
            .mockResolvedValueOnce([[{user_id: 2}]])                        // sponsor check
            .mockResolvedValueOnce([{affectedRows: 1}])                     // UPDATE
            .mockResolvedValueOnce([[{review_id: 1, sponsor_reply: 'Thank you for your feedback!'}]]); // fetch updated

        const res = await request(app)
            .post('/api/catalog/reviews/1/reply')
            .send(validBody);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('review');
    });

    it('returns 400 when replyText is missing', async () => {
        const res = await request(app)
            .post('/api/catalog/reviews/1/reply')
            .send({sponsorUserId: 2});

        expect(res.status).toBe(400);
    });

    it('returns 400 when sponsorUserId is missing', async () => {
        const res = await request(app)
            .post('/api/catalog/reviews/1/reply')
            .send({replyText: 'Thanks!'});

        expect(res.status).toBe(400);
    });

    it('returns 404 when review does not exist', async () => {
        pool.query.mockResolvedValueOnce([[]]); // review not found

        const res = await request(app)
            .post('/api/catalog/reviews/999/reply')
            .send(validBody);

        expect(res.status).toBe(404);
    });

    it('stores the reply text and sponsorUserId in the DB', async () => {
        pool.query
            .mockResolvedValueOnce([[{review_id: 1, sponsor_org_id: 1}]])  // review lookup
            .mockResolvedValueOnce([[{user_id: 2}]])                        // sponsor check
            .mockResolvedValueOnce([{affectedRows: 1}])                     // UPDATE
            .mockResolvedValueOnce([[{review_id: 1}]]);                     // fetch updated

        await request(app)
            .post('/api/catalog/reviews/1/reply')
            .send(validBody);

        const params = pool.query.mock.calls[2][1];
        expect(params).toContain('Thank you for your feedback!');
        expect(params).toContain(2);
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app)
            .post('/api/catalog/reviews/1/reply')
            .send(validBody);

        expect(res.status).toBe(500);
    });
});

// -- DELETE /api/catalog/reviews/:reviewId --

describe('DELETE /api/catalog/reviews/:reviewId', () => {
    it('returns 200 when review is deleted successfully', async () => {
        pool.query
            .mockResolvedValueOnce([[{review_id: 1, driver_user_id: 5}]])
            .mockResolvedValueOnce([{affectedRows: 1}]);

        const res = await request(app)
            .delete('/api/catalog/reviews/1')
            .send({driverUserId: 5});

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message');
    });

    it('returns 403 when driver tries to delete another driver\'s review', async () => {
        pool.query.mockResolvedValueOnce([[{review_id: 1, driver_user_id: 99}]]);

        const res = await request(app)
            .delete('/api/catalog/reviews/1')
            .send({driverUserId: 5});

        expect(res.status).toBe(403);
    });

    it('returns 404 when review does not exist', async () => {
        pool.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .delete('/api/catalog/reviews/999')
            .send({driverUserId: 5});

        expect(res.status).toBe(404);
    });

    it('returns 400 when driverUserId is missing', async () => {
        const res = await request(app)
            .delete('/api/catalog/reviews/1')
            .send({});

        expect(res.status).toBe(400);
    });

    it('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app)
            .delete('/api/catalog/reviews/1')
            .send({driverUserId: 5});

        expect(res.status).toBe(500);
    });
});