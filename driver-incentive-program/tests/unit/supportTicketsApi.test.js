// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// vi.hoisted runs before vi.mock factories so mockConn is available there.

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

// POST /api/support-tickets — Create a new ticket

describe('POST /api/support-tickets', () => {
    const validBody = {
        userId: 1,
        sponsorOrgId: null,
        title: 'My ticket title',
        description: 'Some description here',
        category: 'general',
    };

    // -- Validation --

    // title is required
    it('returns 400 when title is missing', async () => {
        const { title: _, ...body } = validBody;
        const res = await request(app).post('/api/support-tickets').send(body);
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Title is required.');
    });

    // title must not be blank whitespace
    it('returns 400 when title is empty string', async () => {
        const res = await request(app)
            .post('/api/support-tickets')
            .send({ ...validBody, title: '   ' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Title is required.');
    });

    // description is required
    it('returns 400 when description is missing', async () => {
        const { description: _, ...body } = validBody;
        const res = await request(app).post('/api/support-tickets').send(body);
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Description is required.');
    });

    // category must be 'general' or 'security' or 'catalog_order'
    it('returns 400 when category is an invalid value', async () => {
        const res = await request(app)
            .post('/api/support-tickets')
            .send({ ...validBody, category: 'billing' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Invalid category. Must be general, security, or catalog_order.');
    });

    // -- Success paths --

    // general ticket without a subject driver
    it('returns 200 and ticket_id on success with category general', async () => {
        pool.query.mockResolvedValueOnce([{ insertId: 42 }]);
        const res = await request(app).post('/api/support-tickets').send(validBody);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('ticket_id', 42);
        expect(res.body).toHaveProperty('message', 'Ticket created successfully');
    });

    // security ticket with a subject driver attached
    it('returns 200 and ticket_id on success with category security and subjectDriverId', async () => {
        pool.query.mockResolvedValueOnce([{ insertId: 55 }]);
        const res = await request(app)
            .post('/api/support-tickets')
            .send({ ...validBody, category: 'security', subjectDriverId: 7 });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('ticket_id', 55);
    });

    // category defaults to general when omitted
    it('returns 200 when category is omitted (defaults to general)', async () => {
        pool.query.mockResolvedValueOnce([{ insertId: 10 }]);
        const { category: _, ...body } = validBody;
        const res = await request(app).post('/api/support-tickets').send(body);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('ticket_id', 10);
    });
});

// GET /api/support-tickets/user/:userId - Get tickets for a user 

describe('GET /api/support-tickets/user/:userId', () => {
    it('returns 200 with tickets array when tickets exist', async () => {
        const fakeTickets = [
            { ticket_id: 1, title: 'Ticket One', status: 'open', category: 'general' },
            { ticket_id: 2, title: 'Ticket Two', status: 'resolved', category: 'security' },
        ];
        pool.query.mockResolvedValueOnce([fakeTickets]);
        const res = await request(app).get('/api/support-tickets/user/1');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('tickets');
        expect(res.body.tickets).toHaveLength(2);
    });

    it('returns 200 with empty array when user has no tickets', async () => {
        pool.query.mockResolvedValueOnce([[]]);
        const res = await request(app).get('/api/support-tickets/user/99');
        expect(res.status).toBe(200);
        expect(res.body.tickets).toEqual([]);
    });
});


// PUT /api/support-tickets/:ticketId/status — Update ticket status

describe('PUT /api/support-tickets/:ticketId/status — admin path', () => {
    // status must be one of the three allowed values
    it('returns 400 when status is invalid', async () => {
        const res = await request(app)
            .put('/api/support-tickets/1/status')
            .send({ status: 'closed' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Invalid status. Must be open, in_progress, or resolved.');
    });

    // status is missing entirely
    it('returns 400 when status is missing', async () => {
        const res = await request(app)
            .put('/api/support-tickets/1/status')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    // admin sets in_progress
    it('returns 200 when admin sets status to in_progress', async () => {
        pool.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])           // UPDATE status
            .mockResolvedValueOnce([[{ user_id: 5 }]])              // SELECT user_id for notification
            .mockResolvedValueOnce([{ insertId: 1 }]);              // INSERT notification
        const res = await request(app)
            .put('/api/support-tickets/1/status')
            .send({ status: 'in_progress' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Ticket updated successfully');
    });

    // admin sets resolved
    it('returns 200 when admin sets status to resolved', async () => {
        pool.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])           // UPDATE status
            .mockResolvedValueOnce([[{ user_id: 5 }]])              // SELECT user_id for notification
            .mockResolvedValueOnce([{ insertId: 1 }]);              // INSERT notification
        const res = await request(app)
            .put('/api/support-tickets/1/status')
            .send({ status: 'resolved' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Ticket updated successfully');
    });

    // ticket not found
    it('returns 404 when ticket does not exist', async () => {
        pool.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
        const res = await request(app)
            .put('/api/support-tickets/999/status')
            .send({ status: 'resolved' });
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Ticket not found.');
    });
});

describe('PUT /api/support-tickets/:ticketId/status — sponsor path', () => {
    // sponsors cannot set status to in_progress
    it('returns 403 when sponsor tries to set status to in_progress', async () => {
        const res = await request(app)
            .put('/api/support-tickets/1/status')
            .send({ status: 'in_progress', userId: 10, userType: 'sponsor' });
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'Sponsors can only mark tickets as resolved.');
    });

    // sponsor resolves their own ticket (ticket.user_id matches userId)
    it('returns 200 when sponsor resolves their own ticket', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]])      // sponsor_user lookup
            .mockResolvedValueOnce([[{ ticket_id: 1, user_id: 10, sponsor_org_id: 5 }]]) // ticket lookup
            .mockResolvedValueOnce([{ affectedRows: 1 }]);          // UPDATE status
        const res = await request(app)
            .put('/api/support-tickets/1/status')
            .send({ status: 'resolved', userId: 10, userType: 'sponsor' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Ticket updated successfully');
    });

    // sponsor resolves a driver ticket that belongs to their org, and includes a note
    it('returns 200 and inserts comment when sponsor resolves an org driver ticket with a note', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]])       // sponsor_user lookup
            .mockResolvedValueOnce([[{ ticket_id: 2, user_id: 99, sponsor_org_id: 5 }]]) // ticket lookup (different user)
            .mockResolvedValueOnce([{ affectedRows: 1 }])            // UPDATE status
            .mockResolvedValueOnce([{ insertId: 77 }]);              // INSERT comment (note)
        const res = await request(app)
            .put('/api/support-tickets/2/status')
            .send({ status: 'resolved', userId: 10, userType: 'sponsor', note: 'Issue addressed.' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Ticket updated successfully');
    });

    // sponsor cannot resolve a ticket outside their org
    it('returns 403 when sponsor tries to resolve a ticket outside their org', async () => {
        pool.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]])       // sponsor_user lookup (org 5)
            .mockResolvedValueOnce([[{ ticket_id: 3, user_id: 88, sponsor_org_id: 9 }]]); // ticket belongs to org 9
        const res = await request(app)
            .put('/api/support-tickets/3/status')
            .send({ status: 'resolved', userId: 10, userType: 'sponsor' });
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error');
    });
});

// PUT /api/support-tickets/:ticketId/reopen — Reopen a resolved ticket

describe('PUT /api/support-tickets/:ticketId/reopen', () => {
    // ticket must be in resolved status
    it('returns 400 when ticket is not resolved', async () => {
        pool.query.mockResolvedValueOnce([[{ ticket_id: 1, user_id: 5, sponsor_org_id: null, status: 'open' }]]);
        const res = await request(app)
            .put('/api/support-tickets/1/reopen')
            .send({ userId: 5, userType: 'driver' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'Only resolved tickets can be reopened.');
    });

    // caller must own the ticket
    it('returns 403 when user does not own the ticket', async () => {
        pool.query.mockResolvedValueOnce([[{ ticket_id: 1, user_id: 5, sponsor_org_id: null, status: 'resolved' }]]);
        const res = await request(app)
            .put('/api/support-tickets/1/reopen')
            .send({ userId: 99, userType: 'driver' });
        expect(res.status).toBe(403);
        expect(res.body).toHaveProperty('error', 'You can only reopen your own tickets.');
    });

    // ticket not found
    it('returns 404 when ticket does not exist', async () => {
        pool.query.mockResolvedValueOnce([[undefined]]);
        const res = await request(app)
            .put('/api/support-tickets/999/reopen')
            .send({ userId: 1, userType: 'driver' });
        expect(res.status).toBe(404);
        expect(res.body).toHaveProperty('error', 'Ticket not found.');
    });

    // owner successfully reopens their resolved ticket
    it('returns 200 when ticket owner reopens a resolved ticket', async () => {
        pool.query
            .mockResolvedValueOnce([[{ ticket_id: 1, user_id: 5, sponsor_org_id: null, status: 'resolved' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE
        const res = await request(app)
            .put('/api/support-tickets/1/reopen')
            .send({ userId: 5, userType: 'driver' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Ticket reopened successfully.');
    });

    // sponsor reopens a resolved ticket from their org
    it('returns 200 when sponsor reopens a resolved ticket from their org', async () => {
        pool.query
            .mockResolvedValueOnce([[{ ticket_id: 2, user_id: 99, sponsor_org_id: 5, status: 'resolved' }]]) // ticket (different user)
            .mockResolvedValueOnce([[{ sponsor_org_id: 5 }]])    // sponsor_user lookup
            .mockResolvedValueOnce([{ affectedRows: 1 }]);        // UPDATE
        const res = await request(app)
            .put('/api/support-tickets/2/reopen')
            .send({ userId: 10, userType: 'sponsor' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('message', 'Ticket reopened successfully.');
    });
});

// POST /api/ticket-comments — Add a comment to a ticket

describe('POST /api/ticket-comments', () => {
    const validBody = { ticket_id: 1, user_id: 5, body: 'This is a comment.' };

    // body is required
    it('returns 400 when body is missing', async () => {
        const res = await request(app)
            .post('/api/ticket-comments')
            .send({ ticket_id: 1, user_id: 5 });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    // body must not be blank whitespace
    it('returns 400 when body is blank', async () => {
        const res = await request(app)
            .post('/api/ticket-comments')
            .send({ ticket_id: 1, user_id: 5, body: '   ' });
        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error');
    });

    // success — returns the inserted comment with user info
    it('returns 201 with comment on success', async () => {
        const fakeComment = {
            comment_id: 10,
            user_id: 5,
            body: 'This is a comment.',
            created_at: new Date().toISOString(),
            username: 'jdoe',
            first_name: 'John',
            last_name: 'Doe',
            user_type: 'driver',
        };
        pool.query
            .mockResolvedValueOnce([{ insertId: 10 }])        // INSERT
            .mockResolvedValueOnce([[fakeComment]]);            // re-fetch with JOIN
        const res = await request(app)
            .post('/api/ticket-comments')
            .send(validBody);
        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('comment');
        expect(res.body.comment).toHaveProperty('first_name', 'John');
    });
});
