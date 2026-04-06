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

/**
 * Helper: mock the pool.query calls that the handler + authorizeOrganizationImport
 * make for a sponsor requester targeting their own org.
 *
 * Call order:
 *   1. handler  — SELECT user_type
 *   2. authorize — SELECT user_id, user_type
 *   3. authorize — SELECT sponsor_org_id FROM sponsor_user
 *   4. authorize — SELECT ... FROM sponsor_organization
 */
function mockSponsorAuth(orgId = 7, userId = 55) {
    pool.query
        .mockResolvedValueOnce([[{ user_type: 'sponsor' }]])               // handler user_type
        .mockResolvedValueOnce([[{ user_id: userId, user_type: 'sponsor' }]]) // authorize requester
        .mockResolvedValueOnce([[{ sponsor_org_id: orgId }]])              // authorize sponsor_user
        .mockResolvedValueOnce([[{ sponsor_org_id: orgId, name: 'My Org' }]]); // authorize org
}

/**
 * Helper: mock the pool.query call for an admin requester.
 * Admins skip authorizeOrganizationImport, so only 1 pool.query call.
 */
function mockAdminAuth() {
    pool.query.mockResolvedValueOnce([[{ user_type: 'admin' }]]);
}

/**
 * Helper: mock the mockConn.query calls for creating a brand-new user
 * (sponsor caller, D or S type). The first call resolves the org name.
 */
function mockNewUserCreation(sponsorOrgName = 'My Org', insertId = 201) {
    mockConn.query
        .mockResolvedValueOnce([[{ name: sponsorOrgName }]])  // org name lookup
        .mockResolvedValueOnce([[]])                          // no existing user by email
        .mockResolvedValueOnce([[]])                          // username available
        .mockResolvedValueOnce([{ insertId }])                // INSERT INTO users
        .mockResolvedValueOnce([{ affectedRows: 1 }])         // INSERT IGNORE INTO driver_user (drivers) / INSERT INTO sponsor_user (sponsors)
        .mockResolvedValueOnce([{ affectedRows: 1 }])         // INSERT INTO driver_sponsor (drivers only; unused for sponsors)
        .mockResolvedValueOnce([{ affectedRows: 1 }]);        // INSERT INTO password_reset_tokens
}

// ---------- Sponsor route ----------

describe('POST /api/organization/:id/users/bulk-import (sponsor)', () => {
    const url = '/api/organization/7/users/bulk-import';

    // --- Input validation ---

    it('returns 400 when requestingUserId is missing', async () => {
        const res = await request(app).post(url)
            .send({ fileText: 'D||Joe|Driver|joe@test.com' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'requestingUserId is required');
    });

    it('returns 400 when fileText is missing', async () => {
        const res = await request(app).post(url)
            .send({ requestingUserId: 55 });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'fileText is required');
    });

    it('returns 403 when the requesting user is a driver', async () => {
        pool.query.mockResolvedValueOnce([[{ user_type: 'driver' }]]);

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'D||Joe|Driver|joe@test.com' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/only sponsors and admins/i);
    });

    it('returns 403 when a sponsor targets a different organization', async () => {
        pool.query
            .mockResolvedValueOnce([[{ user_type: 'sponsor' }]])               // handler
            .mockResolvedValueOnce([[{ user_id: 55, user_type: 'sponsor' }]])  // authorize requester
            .mockResolvedValueOnce([[{ sponsor_org_id: 3 }]]);                 // different org

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'D||Joe|Driver|joe@test.com' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/own organization/i);
    });

    // --- Line-level validation ---

    it('fails lines with invalid type', async () => {
        mockAdminAuth();

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText: 'X|Org|Bad|Type|bad@test.com' });

        expect(res.status).toBe(200);
        expect(res.body.failedCount).toBe(1);
        expect(res.body.results[0].status).toBe('failed');
        expect(res.body.results[0].error).toMatch(/invalid type/i);
    });

    it('fails O type lines when requester is a sponsor', async () => {
        mockSponsorAuth();

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'O|New Org' });

        expect(res.status).toBe(200);
        expect(res.body.failedCount).toBe(1);
        expect(res.body.results[0].error).toMatch(/sponsors cannot use/i);
    });

    it('fails D/S lines missing required fields', async () => {
        mockAdminAuth();

        const fileText = [
            'D|Org||Driver|joe@test.com',
            'S|Org|Jill||jill@test.com',
            'D|Org|Tom|Smith|',
        ].join('\n');

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText });

        expect(res.status).toBe(200);
        expect(res.body.failedCount).toBe(3);
        res.body.results.forEach(r => {
            expect(r.status).toBe('failed');
            expect(r.error).toMatch(/required/i);
        });
    });

    it('fails when points are present without a reason', async () => {
        mockAdminAuth();

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText: 'D|Org|Joe|Driver|joe@test.com|50' });

        expect(res.status).toBe(200);
        expect(res.body.failedCount).toBe(1);
        expect(res.body.results[0].error).toMatch(/reason is required/i);
    });

    it('fails when points are not a positive integer', async () => {
        mockAdminAuth();

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText: 'D|Org|Joe|Driver|joe@test.com|-5|Bad' });

        expect(res.status).toBe(200);
        expect(res.body.failedCount).toBe(1);
        expect(res.body.results[0].error).toMatch(/positive integer/i);
    });

    // --- Successful sponsor imports ---

    it('creates a new driver for a sponsor upload and auto-accepts', async () => {
        mockSponsorAuth();
        mockNewUserCreation();

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'D||Joe|Driver|joe@test.com' });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(1);
        expect(res.body.results[0].status).toBe('imported');
        expect(res.body.results[0].type).toBe('D');
        expect(res.body.results[0].onboardingPath).toMatch(/^\/password-reset\?token=/);

        // Verify driver_sponsor insert used status='active' (auto-accept)
        const driverInsertCall = mockConn.query.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes('INSERT INTO driver_sponsor')
        );
        expect(driverInsertCall).toBeTruthy();
        expect(driverInsertCall[0]).toContain('active');
        expect(mockConn.beginTransaction).toHaveBeenCalled();
        expect(mockConn.commit).toHaveBeenCalled();
    });

    it('creates a new sponsor user', async () => {
        mockSponsorAuth();
        mockNewUserCreation('My Org', 301);

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'S||Jill|Sponsor|jill@test.com' });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(1);
        expect(res.body.results[0].type).toBe('S');
        expect(res.body.results[0].status).toBe('imported');

        const sponsorInsertCall = mockConn.query.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes('INSERT INTO sponsor_user')
        );
        expect(sponsorInsertCall).toBeTruthy();
    });

    it('warns when sponsor upload provides org name but still succeeds', async () => {
        mockSponsorAuth();
        mockNewUserCreation();

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'D|Some Org|Joe|Driver|joe@test.com' });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(1);
        expect(res.body.results[0].status).toBe('imported');
        expect(res.body.results[0].warnings).toContain('Organization name ignored for sponsor upload.');
    });

    it('warns when points are assigned to a sponsor user and ignores them', async () => {
        mockSponsorAuth();
        mockNewUserCreation('My Org', 301);

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'S||Jill|Sponsor|jill@test.com|100|Bonus' });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(1);
        expect(res.body.results[0].warnings).toEqual(
            expect.arrayContaining([expect.stringMatching(/points cannot be assigned to sponsor/i)])
        );
        // No point_transactions insert should happen
        const pointInsertCall = mockConn.query.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes('INSERT INTO point_transactions')
        );
        expect(pointInsertCall).toBeUndefined();
    });

    it('adds points to a new driver when points and reason are provided', async () => {
        mockSponsorAuth();
        mockNewUserCreation();
        // Extra query for point_transactions INSERT
        mockConn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'D||Joe|Driver|joe@test.com|75|Welcome bonus' });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(1);
        expect(res.body.results[0].pointsAdded).toBe(75);

        const pointInsertCall = mockConn.query.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes('INSERT INTO point_transactions')
        );
        expect(pointInsertCall).toBeTruthy();
        expect(pointInsertCall[1]).toContain(75);
        expect(pointInsertCall[1]).toContain('Welcome bonus');
        expect(pointInsertCall[1]).toContain('bulk_upload');
    });

    it('adds points to an existing driver already in the org', async () => {
        mockSponsorAuth();

        mockConn.query
            .mockResolvedValueOnce([[{ name: 'My Org' }]])                     // org name lookup
            .mockResolvedValueOnce([[{ user_id: 100, user_type: 'driver' }]])  // existing user
            .mockResolvedValueOnce([[{ user_id: 100 }]])                       // already in this org
            .mockResolvedValueOnce([{ affectedRows: 1 }]);                     // point_transactions

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'D||Joe|Driver|joe@test.com|50|Update' });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(1);
        expect(res.body.results[0].status).toBe('imported');
        expect(res.body.results[0].pointsAdded).toBe(50);
        expect(res.body.results[0].message).toMatch(/existing driver/i);
    });

    it('continues processing when one line fails', async () => {
        mockSponsorAuth();
        // Line 1 (X type) fails at validation — no DB calls
        // Line 2 (valid D) needs mockConn queries
        mockNewUserCreation();

        const fileText = [
            'X||Bad|Type|bad@test.com',
            'D||Joe|Driver|joe@test.com',
        ].join('\n');

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(1);
        expect(res.body.failedCount).toBe(1);
        expect(res.body.results.find(r => r.status === 'failed').error).toMatch(/invalid type/i);
        expect(res.body.results.find(r => r.status === 'imported').email).toBe('joe@test.com');
    });

    it('returns results sorted by line number', async () => {
        mockSponsorAuth();

        const fileText = [
            'X||Bad|Type|bad1@test.com',
            'X||Bad|Type|bad2@test.com',
        ].join('\n');

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText });

        expect(res.status).toBe(200);
        const lineNumbers = res.body.results.map(r => r.lineNumber);
        expect(lineNumbers).toEqual([...lineNumbers].sort((a, b) => a - b));
    });
});

// ---------- Admin route ----------

describe('POST /api/admin/users/bulk-import', () => {
    const url = '/api/admin/users/bulk-import';

    it('returns 400 when requestingUserId is missing', async () => {
        const res = await request(app).post(url)
            .send({ fileText: 'O|New Org' });

        expect(res.status).toBe(400);
        expect(res.body).toHaveProperty('error', 'requestingUserId is required');
    });

    it('returns 403 when requester is a driver', async () => {
        pool.query.mockResolvedValueOnce([[{ user_type: 'driver' }]]);

        const res = await request(app).post(url)
            .send({ requestingUserId: 55, fileText: 'O|New Org' });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/only sponsors and admins/i);
    });

    it('creates a new organization via O type line', async () => {
        mockAdminAuth();

        mockConn.query
            .mockResolvedValueOnce([[]])                // org not found
            .mockResolvedValueOnce([{ insertId: 10 }]); // org INSERT

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText: 'O|Brand New Org' });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(1);
        expect(res.body.results[0].type).toBe('O');
        expect(res.body.results[0].status).toBe('imported');
        expect(res.body.results[0].message).toMatch(/created/i);

        const orgInsertCall = mockConn.query.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes('INSERT INTO sponsor_organization')
        );
        expect(orgInsertCall).toBeTruthy();
        expect(orgInsertCall[1]).toContain('Brand New Org');
    });

    it('reuses an existing organization via O type line', async () => {
        mockAdminAuth();

        mockConn.query
            .mockResolvedValueOnce([[{ sponsor_org_id: 5, name: 'Existing Org' }]]);

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText: 'O|Existing Org' });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(1);
        expect(res.body.results[0].message).toMatch(/already exists/i);
    });

    it('fails D line when org name is not found (admin)', async () => {
        mockAdminAuth();

        mockConn.query.mockResolvedValueOnce([[]]);  // org not in DB

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText: 'D|Nonexistent Org|Joe|Driver|joe@test.com' });

        expect(res.status).toBe(200);
        expect(res.body.failedCount).toBe(1);
        expect(res.body.results[0].error).toMatch(/not found/i);
    });

    it('creates org then adds driver to it in the same file', async () => {
        mockAdminAuth();

        mockConn.query
            // O line: org lookup + insert
            .mockResolvedValueOnce([[]])                          // org not found
            .mockResolvedValueOnce([{ insertId: 10 }])            // org INSERT
            // D line: user creation (admin resolves org from orgMap, no extra org query)
            .mockResolvedValueOnce([[]])                          // no existing user
            .mockResolvedValueOnce([[]])                          // username available
            .mockResolvedValueOnce([{ insertId: 201 }])          // users INSERT
            .mockResolvedValueOnce([{ affectedRows: 1 }])         // driver_user INSERT
            .mockResolvedValueOnce([{ affectedRows: 1 }]);        // password_reset_tokens

        const fileText = [
            'O|New Org',
            'D|New Org|Joe|Driver|joe@test.com',
        ].join('\n');

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText });

        expect(res.status).toBe(200);
        expect(res.body.importedCount).toBe(2);
        expect(res.body.results.find(r => r.type === 'O').status).toBe('imported');
        expect(res.body.results.find(r => r.type === 'D').status).toBe('imported');
    });

    it('fails O line when org name is missing', async () => {
        mockAdminAuth();

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText: 'O|' });

        expect(res.status).toBe(200);
        expect(res.body.failedCount).toBe(1);
        expect(res.body.results[0].error).toMatch(/organization name is required/i);
    });

    it('handles a full mixed file with O, D, S, and errors', async () => {
        mockAdminAuth();

        mockConn.query
            // O line: create org
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([{ insertId: 10 }])
            // D line with points: create driver (org resolved from orgMap — no org query)
            .mockResolvedValueOnce([[]])                          // no existing user
            .mockResolvedValueOnce([[]])                          // username
            .mockResolvedValueOnce([{ insertId: 201 }])           // users INSERT
            .mockResolvedValueOnce([{ affectedRows: 1 }])         // INSERT IGNORE INTO driver_user
            .mockResolvedValueOnce([{ affectedRows: 1 }])         // INSERT INTO driver_sponsor
            .mockResolvedValueOnce([{ affectedRows: 1 }])         // password_reset_tokens
            .mockResolvedValueOnce([{ affectedRows: 1 }])         // point_transactions INSERT
            // S line: create sponsor (org resolved from orgMap — no org query)
            .mockResolvedValueOnce([[]])                          // no existing user
            .mockResolvedValueOnce([[]])                          // username
            .mockResolvedValueOnce([{ insertId: 301 }])           // users INSERT
            .mockResolvedValueOnce([{ affectedRows: 1 }])         // sponsor_user INSERT
            .mockResolvedValueOnce([{ affectedRows: 1 }]);        // password_reset_tokens

        const fileText = [
            'O|Test Org',
            'D|Test Org|Joe|Driver|joe@test.com|100|Welcome',
            'S|Test Org|Jill|Sponsor|jill@test.com',
            'X|Test Org|Bad|Type|bad@test.com',
            'D|Test Org||NoFirst|nofirst@test.com',
        ].join('\n');

        const res = await request(app).post(url)
            .send({ requestingUserId: 99, fileText });

        expect(res.status).toBe(200);
        // O + D + S = 3 imported; X (invalid type) + missing first name = 2 failed
        expect(res.body.importedCount).toBe(3);
        expect(res.body.failedCount).toBe(2);
    });
});
