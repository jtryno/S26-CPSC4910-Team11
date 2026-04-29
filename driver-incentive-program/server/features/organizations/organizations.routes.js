import { Router } from 'express';
import pool from '../../db.js';
import { resolveSession } from '../../services/session.service.js';
import { importOrganizationUsersFromCsv, importUsersFromPipeFile } from '../../services/import.service.js';

const router = Router();

router.post('/organization', async (req, res) => {
    const actorUserId = await resolveSession(req.cookies.remember_me);
    if (!actorUserId) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const { name, point_value } = req.body;
        const [result] = await pool.query(
            'INSERT INTO sponsor_organization (name, point_value) VALUES (?, ?)',
            [name, point_value]
        );
        res.json({ message: 'Organization created successfully', organization_id: result.insertId });
    } catch (error) {
        console.error('Error creating organization:', error);
        res.status(500).json({ error: 'Failed to create organization' });
    }
});

router.get('/organization', async (_req, res) => {
    try {
        const [orgs] = await pool.query('SELECT * FROM sponsor_organization');
        res.json({ message: 'Organizations retrieved successfully', organizations: orgs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve organizations' });
    }
});

router.get('/organization/:sponsor_org_id/count', async (req, res) => {
    const { sponsor_org_id } = req.params;
    try {
        const [[{ driverCount }]] = await pool.query(
            `SELECT COUNT(*) AS driverCount FROM driver_sponsor WHERE sponsor_org_id = ? AND driver_status = 'active'`,
            [sponsor_org_id]
        );
        const [[{ sponsorCount }]] = await pool.query(
            'SELECT COUNT(*) AS sponsorCount FROM sponsor_user WHERE sponsor_org_id = ?',
            [sponsor_org_id]
        );
        const count = Number(driverCount) + Number(sponsorCount);
        res.json({ message: 'Organization member count retrieved successfully', count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve organization member count' });
    }
});

router.get('/organization/:sponsor_org_id/users', async (req, res) => {
    const { sponsor_org_id } = req.params;
    try {
        const [users] = await pool.query(
            `SELECT u.*, ds.current_points_balance AS points
             FROM users u
             JOIN driver_user du ON u.user_id = du.user_id
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id AND ds.sponsor_org_id = ? AND ds.driver_status = 'active' AND ds.is_archived = 0
             UNION
             SELECT u.*, NULL AS points
             FROM users u
             JOIN sponsor_user su ON u.user_id = su.user_id AND su.sponsor_org_id = ?`,
            [sponsor_org_id, sponsor_org_id]
        );
        res.json({ message: 'Organization users retrieved successfully', users });
    } catch (error) {
        console.error('Error fetching organization users:', error);
        res.status(500).json({ error: 'Failed to fetch organization users' });
    }
});

router.post('/organization/:sponsor_org_id/users/import', importOrganizationUsersFromCsv);
router.post('/organization/:sponsor_org_id/drivers/import', importOrganizationUsersFromCsv);
router.post('/organization/:sponsor_org_id/users/bulk-import', importUsersFromPipeFile);

router.get('/organization/:sponsor_org_id/monthly-redeemed-points', async (req, res) => {
    const { sponsor_org_id } = req.params;
    try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        const [[{ total_redeemed }]] = await pool.query(
            `SELECT COALESCE(SUM(point_amount), 0) AS total_redeemed
             FROM point_transactions
             WHERE sponsor_org_id = ?
               AND source = 'order'
               AND point_amount < 0
               AND created_at >= ?
               AND transaction_id NOT IN (
                   SELECT transaction_id FROM point_contests WHERE status = 'approved'
               )`,
            [sponsor_org_id, monthStart]
        );
        res.json({ total_redeemed: Math.abs(Number(total_redeemed)) });
    } catch (error) {
        console.error('Error fetching monthly redeemed points:', error);
        res.status(500).json({ error: 'Failed to fetch monthly redeemed points' });
    }
});

router.get('/organization/:orgId/drivers', async (req, res) => {
    const { orgId } = req.params;
    const { dateRange, driverId } = req.query;
    try {
        let query = `SELECT du.user_id, du.created_at, u.username,
                            ds.sponsor_org_id, ds.driver_status, ds.current_points_balance,
                            ds.affilated_at, ds.dropped_at, ds.drop_reason
                     FROM driver_user du
                     JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
                     JOIN users u ON du.user_id = u.user_id`;
        const params = [];
        const conditions = ['ds.is_archived = 0'];

        if (orgId && orgId !== 'undefined' && orgId !== 'null' && orgId !== 'All') {
            conditions.push('ds.sponsor_org_id = ?');
            params.push(orgId);
        }

        if (driverId && driverId !== 'undefined' && driverId !== 'null' && driverId !== 'All') {
            conditions.push('du.user_id = ?');
            params.push(driverId);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);
            if (fromDate && toDate) {
                conditions.push('du.created_at >= ? AND du.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } else if (fromDate) {
                conditions.push('du.created_at >= ? AND du.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } else if (toDate) {
                conditions.push('du.created_at >= ? AND du.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const [drivers] = await pool.query(query, params);
        res.json({ drivers });
    } catch (error) {
        console.error('Error fetching org drivers:', error);
        res.status(500).json({ error: 'Failed to fetch org drivers' });
    }
});

router.get('/organization/:org_id/drop-logs', async (req, res) => {
    const { org_id } = req.params;
    try {
        const [drops] = await pool.query(
            'SELECT * FROM org_drop_logs WHERE sponsor_org_id = ? ORDER BY created_at DESC',
            [org_id]
        );
        res.json({ message: 'Successfully retrieved drop logs', drops });
    } catch (error) {
        console.error('Error fetching org drops:', error);
        res.status(500).json({ error: 'Failed to fetch org drops' });
    }
});

router.get('/organization/:org_id/point-changes', async (req, res) => {
    const { org_id } = req.params;
    const { dateRange } = req.query;
    try {
        let query = 'SELECT * FROM point_transactions';
        const params = [];
        const conditions = [];

        if (org_id && org_id !== 'undefined' && org_id !== 'null' && org_id !== 'All') {
            conditions.push('sponsor_org_id = ?');
            params.push(org_id);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);
            if (fromDate && toDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } else if (fromDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } else if (toDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const [changes] = await pool.query(query, params);
        res.json({ message: 'Successfully retrieved point changes', changes });
    } catch (error) {
        console.error('Error fetching org point changes:', error);
        res.status(500).json({ error: 'Failed to fetch org point changes' });
    }
});

router.get('/organization/:orgId/archived-drivers', async (req, res) => {
    const { orgId } = req.params;
    try {
        const [drivers] = await pool.query(
            `SELECT du.user_id, u.username,
                    ds.sponsor_org_id, ds.driver_status, ds.current_points_balance,
                    ds.affilated_at, ds.dropped_at, ds.drop_reason
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN users u ON du.user_id = u.user_id
             WHERE ds.sponsor_org_id = ? AND ds.is_archived = 1`,
            [orgId]
        );
        res.json({ drivers });
    } catch (error) {
        console.error('Error fetching archived drivers:', error);
        res.status(500).json({ error: 'Failed to fetch archived drivers.' });
    }
});

router.get('/organization/:sponsor_org_id', async (req, res) => {
    const { sponsor_org_id } = req.params;
    try {
        const [orgs] = await pool.query(
            'SELECT * FROM sponsor_organization WHERE sponsor_org_id = ?',
            [sponsor_org_id]
        );
        if (orgs.length === 0) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        res.json({ message: 'Organization info retrieved successfully', organization: orgs[0] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch organization info' });
    }
});

router.put('/organization/:sponsor_org_id', async (req, res) => {
    const { sponsor_org_id } = req.params;
    const { field, value } = req.body;

    const ALLOWED_ORG_FIELDS = ['name', 'point_value'];
    if (!field || !ALLOWED_ORG_FIELDS.includes(field)) {
        return res.status(400).json({ error: `Invalid field. Allowed fields: ${ALLOWED_ORG_FIELDS.join(', ')}` });
    }

    try {
        const [result] = await pool.query(
            'UPDATE sponsor_organization SET ?? = ? WHERE sponsor_org_id = ?',
            [field, value, sponsor_org_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        res.json({ message: 'Organization updated successfully' });
    } catch (error) {
        console.error('Error updating organization:', error);
        res.status(500).json({ error: 'Failed to update organization' });
    }
});

router.delete('/organization/:sponsor_org_id', async (req, res) => {
    const actorUserId = await resolveSession(req.cookies.remember_me);
    if (!actorUserId) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const { sponsor_org_id } = req.params;
        const [result] = await pool.query(
            'DELETE FROM sponsor_organization WHERE sponsor_org_id = ?',
            [sponsor_org_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        res.json({ message: 'Organization deleted successfully' });
    } catch (error) {
        console.error('Error deleting organization:', error);
        res.status(500).json({ error: 'Failed to delete organization' });
    }
});

router.put('/driver/:driverId/archive', async (req, res) => {
    const { driverId } = req.params;
    const { orgId } = req.body;

    if (!orgId) {
        return res.status(400).json({ error: 'orgId is required' });
    }

    try {
        const [[row]] = await pool.query(
            'SELECT driver_sponsor_id FROM driver_sponsor WHERE driver_user_id = ? AND sponsor_org_id = ?',
            [driverId, orgId]
        );
        if (!row) {
            return res.status(404).json({ error: 'Driver-sponsor relationship not found.' });
        }

        await pool.query(
            'UPDATE driver_sponsor SET is_archived = 1 WHERE driver_user_id = ? AND sponsor_org_id = ?',
            [driverId, orgId]
        );

        res.json({ message: 'Driver archived successfully.' });
    } catch (error) {
        console.error('Error archiving driver:', error);
        res.status(500).json({ error: 'Failed to archive driver.' });
    }
});

export default router;
