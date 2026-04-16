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


describe('GET /api/dashboard/reviews/:driverUserId', () => {
    const makeReview = (overrides = {}) => ({
        review_id: 1,
        driver_user_id: 10,
        sponsor_user_id: 2,
        rating: 4,
        review_text: 'stink driver!',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        sponsor_username: 'sponsor1',
        sponsor_org_name: 'we be sponsors',
        ...overrides,
    });

    it('returns 200 with reviews, avgRating, and totalReviews', async () => {
        pool.query.mockResolvedValueOnce([[makeReview()]]);

        const res = await request(app).get('/api/dashboard/reviews/10');

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('reviews');
        expect(res.body).toHaveProperty('avgRating');
        expect(res.body).toHaveProperty('totalReviews', 1);
    });

    it('returns an empty reviews array when no reviews exist', async () => {
        pool.query.mockResolvedValueOnce([[]]);

        const res = await request(app).get('/api/dashboard/reviews/10');

        expect(res.status).toBe(200);
        expect(res.body.reviews).toHaveLength(0);
        expect(res.body.totalReviews).toBe(0);
    });

    it('correctly computes average rating', async () => {
        pool.query.mockResolvedValueOnce([[
            makeReview({rating: 4}),
            makeReview({review_id: 2, sponsor_user_id: 3, rating: 2}),
        ]]);

        const res = await request(app).get('/api/dashboard/reviews/10');

        expect(res.status).toBe(200);
        expect(res.body.avgRating).toBeCloseTo(3.0);
        expect(res.body.totalReviews).toBe(2);
    });

    it('includes sponsor_username and sponsor_org_name on each review', async () => {
        pool.query.mockResolvedValueOnce([[
            makeReview({sponsor_username: 'bob_sponsor', sponsor_org_name: 'chicken whopper'}),
        ]]);

        const res = await request(app).get('/api/dashboard/reviews/10');

        expect(res.body.reviews[0]).toHaveProperty('sponsor_username', 'bob_sponsor');
        expect(res.body.reviews[0]).toHaveProperty('sponsor_org_name', 'chicken whopper');
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app).get('/api/dashboard/reviews/10');

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to fetch driver reviews');
    });
});

// ---------------------------------------------------------------------------
// POST /api/driver-reviews
// ---------------------------------------------------------------------------

describe('POST /api/driver-reviews', () => {
    const validBody = {
        sponsorUserId: 2,
        driverUserId: 10,
        rating: 4,
        reviewText: 'Solid performance overall.',
    };

    it('returns 201 when a valid review is submitted', async () => {
        pool.query
            .mockResolvedValueOnce([[{sponsor_org_id: 7}]])
            .mockResolvedValueOnce([[{sponsor_org_id: 7}]])
            .mockResolvedValueOnce([{affectedRows: 1}]);

        const res = await request(app)
            .post('/api/driver-reviews')
            .send(validBody);

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('message', 'Review saved');
    });

    it('returns 400 when sponsorUserId is missing', async () => {
        const res = await request(app)
            .post('/api/driver-reviews')
            .send({driverUserId: 10, rating: 4, reviewText: 'Good.'});

        expect(res.status).toBe(400);
    });

    it('returns 400 when driverUserId is missing', async () => {
        const res = await request(app)
            .post('/api/driver-reviews')
            .send({sponsorUserId: 2, rating: 4, reviewText: 'Good.'});

        expect(res.status).toBe(400);
    });

    it('returns 400 when reviewText is missing', async () => {
        const res = await request(app)
            .post('/api/driver-reviews')
            .send({sponsorUserId: 2, driverUserId: 10, rating: 4});

        expect(res.status).toBe(400);
    });

    it('returns 400 when rating is missing', async () => {
        const res = await request(app)
            .post('/api/driver-reviews')
            .send({sponsorUserId: 2, driverUserId: 10, reviewText: 'Good.'});

        expect(res.status).toBe(400);
    });

    it('returns 400 when rating is above 5', async () => {
        const res = await request(app)
            .post('/api/driver-reviews')
            .send({...validBody, rating: 6});

        expect(res.status).toBe(400);
    });

    it('returns 400 when rating is below 1', async () => {
        const res = await request(app)
            .post('/api/driver-reviews')
            .send({...validBody, rating: 0});

        expect(res.status).toBe(400);
    });

    it('returns 400 when reviewText exceeds 500 characters', async () => {
        const res = await request(app)
            .post('/api/driver-reviews')
            .send({...validBody, reviewText: 'a'.repeat(501)});

        expect(res.status).toBe(400);
    });

    it('returns 403 when sponsor is not found in any organization', async () => {
        pool.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .post('/api/driver-reviews')
            .send(validBody);

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'Sponsor not found in any organization');
    });

    it('returns 403 when driver does not belong to the same org as the sponsor', async () => {
        pool.query
            .mockResolvedValueOnce([[{sponsor_org_id: 7}]])
            .mockResolvedValueOnce([[{sponsor_org_id: 99}]]);

        const res = await request(app)
            .post('/api/driver-reviews')
            .send(validBody);

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'You can only rate drivers in your own organization');
    });

    it('returns 403 when driver has no org affiliation at all', async () => {
        pool.query
            .mockResolvedValueOnce([[{sponsor_org_id: 7}]])
            .mockResolvedValueOnce([[]]);

        const res = await request(app)
            .post('/api/driver-reviews')
            .send(validBody);

        expect(res.status).toBe(403);
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app)
            .post('/api/driver-reviews')
            .send(validBody);

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to save driver review');
    });
});

// ---------------------------------------------------------------------------
// DELETE /api/dashboard/reviews/:reviewId
// ---------------------------------------------------------------------------

describe('DELETE /api/dashboard/reviews/:reviewId', () => {
    it('returns 200 when the review is successfully deleted', async () => {
        pool.query
            .mockResolvedValueOnce([[{review_id: 1, sponsor_user_id: 2}]])
            .mockResolvedValueOnce([{affectedRows: 1}]);

        const res = await request(app)
            .delete('/api/dashboard/reviews/1')
            .send({sponsorUserId: 2});

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Review deleted');
    });

    it('returns 400 when sponsorUserId is missing', async () => {
        const res = await request(app)
            .delete('/api/dashboard/reviews/1')
            .send({});

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'sponsorUserId is required');
    });

    it('returns 404 when review does not exist', async () => {
        pool.query.mockResolvedValueOnce([[]]);

        const res = await request(app)
            .delete('/api/dashboard/reviews/999')
            .send({sponsorUserId: 2});

        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Review not found');
    });

    it('returns 403 when sponsor tries to delete another sponsors review', async () => {
        pool.query.mockResolvedValueOnce([[{review_id: 1, sponsor_user_id: 99}]]);

        const res = await request(app)
            .delete('/api/dashboard/reviews/1')
            .send({sponsorUserId: 2});

        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'You can only delete your own reviews');
    });

    it('returns 500 when a database error occurs', async () => {
        pool.query.mockRejectedValueOnce(new Error('DB error'));

        const res = await request(app)
            .delete('/api/dashboard/reviews/1')
            .send({sponsorUserId: 2});

        expect(res.status).toBe(500);
        expect(res.body).toHaveProperty('error', 'Failed to delete driver review');
    });
});