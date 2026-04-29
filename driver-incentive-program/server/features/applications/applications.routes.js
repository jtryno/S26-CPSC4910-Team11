import { Router } from 'express';
import pool from '../../db.js';
import { createNotification } from '../../services/notification.service.js';

const router = Router();

// Static segments before dynamic (:application_id) to prevent shadowing
router.get('/application/organization/:org_id', async (req, res) => {
    const { org_id } = req.params;
    const { dateRange, status } = req.query;
    try {
        let query = 'SELECT * FROM driver_applications';
        const params = [];
        const conditions = [];

        if (org_id && org_id !== 'undefined' && org_id !== 'null' && org_id !== 'All') {
            conditions.push('sponsor_org_id = ?');
            params.push(org_id);
        }

        if (status && status !== 'undefined') {
            conditions.push('status = ?');
            params.push(status);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);
            if (fromDate && toDate) {
                conditions.push('applied_at >= ? AND applied_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } else if (fromDate) {
                conditions.push('applied_at >= ? AND applied_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } else if (toDate) {
                conditions.push('applied_at >= ? AND applied_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const [applications] = await pool.query(query, params);
        res.json({ applications });
    } catch (error) {
        console.error('Error fetching org applications:', error);
        res.status(500).json({ error: 'Failed to fetch applications' });
    }
});

router.get('/application/user/:user_id', async (req, res) => {
    const { user_id } = req.params;
    const { status } = req.query;
    try {
        let query = 'SELECT * FROM driver_applications WHERE driver_user_id = ?';
        const params = [user_id];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        const [applications] = await pool.query(query, params);
        res.json({ applications });
    } catch (error) {
        console.error('Error fetching driver applications:', error);
        res.status(500).json({ error: 'Failed to fetch driver applications' });
    }
});

router.post('/application', async (req, res) => {
    const { user_id, org_id } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO driver_applications (driver_user_id, sponsor_org_id, status) VALUES (?, ?, ?)',
            [user_id, org_id, 'pending']
        );
        res.json({ message: 'Driver application submitted successfully', application_id: result.insertId });
    } catch (error) {
        console.error('Error submitting driver application:', error);
        res.status(500).json({ error: 'Failed to submit driver application' });
    }
});

router.put('/application/:application_id', async (req, res) => {
    try {
        const { application_id } = req.params;
        const { status, decision_reason, user_id } = req.body;

        const [result] = await pool.query(
            'UPDATE driver_applications SET status = ?, decision_reason = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE application_id = ?',
            [status, decision_reason, user_id, application_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }
        if (status === 'approved' || status === 'rejected') {
            const [appInfo] = await pool.query(
                'SELECT driver_user_id, sponsor_org_id FROM driver_applications WHERE application_id = ?',
                [application_id]
            );
            if (appInfo.length > 0) {
                const { driver_user_id, sponsor_org_id } = appInfo[0];
                const [orgRows] = await pool.query('SELECT name FROM sponsor_organization WHERE sponsor_org_id = ?', [sponsor_org_id]);
                const orgName = orgRows[0].name;
                const [reviewerRows] = await pool.query('SELECT first_name, last_name FROM users WHERE user_id = ?', [user_id]);
                const reviewerName = reviewerRows.length > 0
                    ? `${reviewerRows[0].first_name} ${reviewerRows[0].last_name}`
                    : 'a sponsor';
                let msg;
                if (status === 'approved') {
                    msg = `Your application to join ${orgName} was approved by ${reviewerName}.`;
                    await pool.query(
                        `INSERT INTO driver_sponsor (driver_user_id, sponsor_org_id, driver_status, affilated_at)
                         VALUES (?, ?, 'active', NOW())
                         ON DUPLICATE KEY UPDATE driver_status = 'active', affilated_at = NOW(), dropped_at = NULL, drop_reason = NULL, is_archived = 0`,
                        [driver_user_id, sponsor_org_id]
                    );
                } else {
                    msg = `Your application to join ${orgName} was rejected. Reason: ${decision_reason || 'No reason provided.'}`;
                }
                await createNotification(driver_user_id, 'application_status', msg, { related_application_id: Number(application_id) });
            }
        }
        res.json({ message: 'Application updated successfully' });
    } catch (error) {
        console.error('Error updating application:', error);
        res.status(500).json({ error: 'Failed to update application' });
    }
});

router.delete('/application/:application_id', async (req, res) => {
    const { application_id } = req.params;
    try {
        const [result] = await pool.query(
            'UPDATE driver_applications SET status = ? WHERE application_id = ? AND status = ?',
            ['withdrawn', application_id, 'pending']
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Application not found or already reviewed' });
        }
        res.json({ message: 'Application withdrawn successfully' });
    } catch (error) {
        console.error('Error withdrawing application:', error);
        res.status(500).json({ error: 'Failed to withdraw application' });
    }
});

export default router;
