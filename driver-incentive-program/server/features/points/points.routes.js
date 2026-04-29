import { Router } from 'express';
import pool from '../../db.js';
import { createNotification } from '../../services/notification.service.js';

const router = Router();

router.get('/user/lifetime-points/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [users] = await pool.query('SELECT user_type FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (users[0].user_type !== 'driver') {
            return res.status(403).json({ error: 'Not a driver account' });
        }
        const [rows] = await pool.query(
            'SELECT COALESCE(SUM(point_amount), 0) AS lifetime_points FROM point_transactions WHERE driver_user_id = ?',
            [userId]
        );
        res.json({ lifetime_points: rows[0].lifetime_points });
    } catch (error) {
        console.error('Error fetching lifetime points:', error);
        res.status(500).json({ error: 'Failed to fetch lifetime points' });
    }
});

router.get('/driver/points/:userId', async (req, res) => {
    const { userId } = req.params;
    const sponsorOrgIdParam = req.query.sponsorOrgId ? Number(req.query.sponsorOrgId) : null;
    try {
        const [users] = await pool.query('SELECT user_type FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (users[0].user_type !== 'driver') {
            return res.status(403).json({ error: 'Not a driver account' });
        }

        const txParams = [userId];
        let txSponsorClause = '';
        if (sponsorOrgIdParam) {
            txSponsorClause = ' AND pt.sponsor_org_id = ?';
            txParams.push(sponsorOrgIdParam);
        }

        const [transactions] = await pool.query(
            `SELECT pt.transaction_id, pt.point_amount, pt.reason, pt.source,
                    pt.created_at, pt.sponsor_org_id, so.name AS sponsor_name
             FROM point_transactions pt
             LEFT JOIN sponsor_organization so ON pt.sponsor_org_id = so.sponsor_org_id
             WHERE pt.driver_user_id = ?${txSponsorClause}
             ORDER BY pt.created_at DESC`,
            txParams
        );

        const totalsParams = [userId];
        let totalsSponsorClause = '';
        if (sponsorOrgIdParam) {
            totalsSponsorClause = ' AND sponsor_org_id = ?';
            totalsParams.push(sponsorOrgIdParam);
        }
        const [[{ total_points }]] = await pool.query(
            `SELECT COALESCE(SUM(point_amount), 0) AS total_points
             FROM point_transactions WHERE driver_user_id = ?${totalsSponsorClause}`,
            totalsParams
        );

        const dsParams = [userId];
        let dsSponsorClause = '';
        if (sponsorOrgIdParam) {
            dsSponsorClause = ' AND ds.sponsor_org_id = ?';
            dsParams.push(sponsorOrgIdParam);
        }
        const [driverRows] = await pool.query(
            `SELECT ds.driver_status, ds.sponsor_org_id, so.name AS sponsor_name
             FROM driver_user du
             LEFT JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             LEFT JOIN sponsor_organization so ON ds.sponsor_org_id = so.sponsor_org_id
             WHERE du.user_id = ?${dsSponsorClause}`,
            dsParams
        );
        const driverInfo = driverRows[0] || {};

        res.json({
            total_points,
            transactions,
            driver_status: driverInfo.driver_status,
            sponsor_name: driverInfo.sponsor_name,
            sponsor_org_id: driverInfo.sponsor_org_id,
        });
    } catch (error) {
        console.error('Error fetching driver points:', error);
        res.status(500).json({ error: 'Failed to fetch driver points' });
    }
});

router.post('/driver/leave-sponsor', async (req, res) => {
    const { driverUserId } = req.body;
    if (!driverUserId) {
        return res.status(400).json({ error: 'driverUserId is required' });
    }
    try {
        const [rows] = await pool.query(
            'SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = ?',
            [driverUserId, 'active']
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No active sponsor found for this driver' });
        }
        const { sponsor_org_id } = rows[0];

        await pool.query(
            'UPDATE driver_sponsor SET driver_status = ?, dropped_at = NOW() WHERE driver_user_id = ? AND sponsor_org_id = ?',
            ['dropped', driverUserId, sponsor_org_id]
        );
        await pool.query(
            'UPDATE driver_applications SET status = ?, reviewed_at = NOW() WHERE driver_user_id = ? AND sponsor_org_id = ? AND status = ?',
            ['withdrawn', driverUserId, sponsor_org_id, 'approved']
        );

        res.json({ message: 'Successfully left sponsor' });
    } catch (error) {
        console.error('Error leaving sponsor:', error);
        res.status(500).json({ error: 'Failed to leave sponsor' });
    }
});

router.post('/driver/drop', async (req, res) => {
    const { driverId, drop_reason } = req.body;

    if (!driverId) {
        return res.status(400).json({ error: 'driverId is required' });
    }

    try {
        const [orgIdArray] = await pool.query(
            `SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = 'active'`,
            [driverId]
        );

        if (orgIdArray.length === 0) {
            return res.status(400).json({ error: 'Driver is not currently in an organization' });
        }

        const sponsor_org_id = orgIdArray[0].sponsor_org_id;
        const [orgRows] = await pool.query('SELECT name FROM sponsor_organization WHERE sponsor_org_id = ?', [sponsor_org_id]);
        const orgName = orgRows[0].name;

        await pool.query(
            'UPDATE driver_sponsor SET driver_status = ?, dropped_at = NOW(), drop_reason = ? WHERE driver_user_id = ? AND sponsor_org_id = ?',
            ['dropped', drop_reason || null, driverId, sponsor_org_id]
        );

        let msg;
        if (drop_reason) {
            msg = `You have been removed from ${orgName}. Reason: ${drop_reason}`;
        } else {
            msg = `You have been removed from ${orgName}.`;
        }

        const [user] = await pool.query('SELECT * FROM users WHERE user_id = ?', [driverId]);
        await pool.query(
            'INSERT INTO org_drop_logs (user_id, username, user_type, reason, sponsor_org_id) VALUES (?, ?, ?, ?, ?)',
            [driverId, user[0].username, user[0].user_type, drop_reason || 'None', sponsor_org_id]
        );

        await createNotification(driverId, 'dropped', msg);

        res.json({ message: 'Driver removed from organization' });
    } catch (error) {
        console.error('Error dropping driver:', error);
        res.status(500).json({ error: 'Failed to remove driver from organization' });
    }
});

router.get('/sponsor/drivers/:sponsorUserId', async (req, res) => {
    const { sponsorUserId } = req.params;
    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: `No sponsor_user row found for user_id: ${sponsorUserId}` });
        }
        const { sponsor_org_id } = sponsorRows[0];

        const [drivers] = await pool.query(
            `SELECT u.user_id, u.username, u.first_name, u.last_name, u.email,
                    ds.driver_status, ds.current_points_balance AS total_points
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN users u ON du.user_id = u.user_id
             WHERE ds.sponsor_org_id = ?
               AND ds.driver_status = 'active'
               AND u.user_type = 'driver'`,
            [sponsor_org_id]
        );

        res.json({ sponsor_org_id, drivers });
    } catch (error) {
        console.error('Error fetching sponsor drivers:', error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});

router.get('/sponsor/settings/:sponsorUserId', async (req, res) => {
    const { sponsorUserId } = req.params;
    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor org not found for this user' });
        }
        const { sponsor_org_id } = sponsorRows[0];

        const [orgRows] = await pool.query(
            'SELECT point_upper_limit, point_lower_limit, monthly_point_limit, point_value FROM sponsor_organization WHERE sponsor_org_id = ?',
            [sponsor_org_id]
        );
        res.json(orgRows[0]);
    } catch (error) {
        console.error('Error fetching sponsor settings:', error);
        res.status(500).json({ error: 'Failed to fetch sponsor settings' });
    }
});

router.get('/sponsor/monthly-points/:sponsorUserId', async (req, res) => {
    const { sponsorUserId } = req.params;
    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor org not found for this user' });
        }
        const { sponsor_org_id } = sponsorRows[0];

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const [[{ month_awarded, month_deducted }]] = await pool.query(
            `SELECT
                COALESCE(SUM(CASE WHEN point_amount > 0 THEN point_amount ELSE 0 END), 0) AS month_awarded,
                COALESCE(SUM(CASE WHEN point_amount < 0 THEN point_amount ELSE 0 END), 0) AS month_deducted
             FROM point_transactions
             WHERE sponsor_org_id = ? AND created_by_user_id = ? AND created_at >= ?`,
            [sponsor_org_id, sponsorUserId, monthStart]
        );

        res.json({ month_awarded, month_deducted });
    } catch (error) {
        console.error('Error fetching monthly points:', error);
        res.status(500).json({ error: 'Failed to fetch monthly points' });
    }
});

router.put('/sponsor/settings', async (req, res) => {
    const { sponsorUserId, point_upper_limit, point_lower_limit, monthly_point_limit } = req.body;
    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor org not found for this user' });
        }
        const { sponsor_org_id } = sponsorRows[0];

        await pool.query(
            'UPDATE sponsor_organization SET point_upper_limit = ?, point_lower_limit = ?, monthly_point_limit = ? WHERE sponsor_org_id = ?',
            [
                point_upper_limit !== '' && point_upper_limit != null ? parseInt(point_upper_limit, 10) : null,
                point_lower_limit !== '' && point_lower_limit != null ? parseInt(point_lower_limit, 10) : null,
                monthly_point_limit !== '' && monthly_point_limit != null ? parseInt(monthly_point_limit, 10) : null,
                sponsor_org_id,
            ]
        );

        res.json({ message: 'Settings saved successfully' });
    } catch (error) {
        console.error('Error saving sponsor settings:', error);
        res.status(500).json({ error: 'Failed to save sponsor settings' });
    }
});

router.post('/sponsor/points', async (req, res) => {
    const { sponsorUserId, driverIds, pointAmount, reason, source } = req.body;

    if (!driverIds || !Array.isArray(driverIds) || driverIds.length === 0) {
        return res.status(400).json({ error: 'driverIds must be a non-empty array' });
    }
    if (typeof pointAmount !== 'number' || pointAmount === 0) {
        return res.status(400).json({ error: 'pointAmount must be a non-zero number' });
    }
    if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'reason is required' });
    }
    const validSources = ['manual', 'recurring'];
    if (!validSources.includes(source)) {
        return res.status(400).json({ error: 'source must be "manual" or "recurring"' });
    }

    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor org not found for this user' });
        }
        const { sponsor_org_id } = sponsorRows[0];

        const [orgRows] = await pool.query(
            'SELECT point_upper_limit, point_lower_limit, monthly_point_limit FROM sponsor_organization WHERE sponsor_org_id = ?',
            [sponsor_org_id]
        );
        const { point_upper_limit, point_lower_limit, monthly_point_limit } = orgRows[0];

        if (monthly_point_limit != null) {
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            const [[{ month_total }]] = await pool.query(
                'SELECT COALESCE(SUM(point_amount), 0) AS month_total FROM point_transactions WHERE sponsor_org_id = ? AND created_at >= ?',
                [sponsor_org_id, monthStart]
            );
            const projected = Number(month_total) + pointAmount * driverIds.length;
            if (projected > monthly_point_limit) {
                return res.status(400).json({
                    error: `This would exceed your organization's monthly point limit of ${monthly_point_limit}. Monthly total so far: ${month_total}.`,
                });
            }
        }

        if (point_upper_limit != null || point_lower_limit != null) {
            const placeholders = driverIds.map(() => '?').join(', ');
            const [balanceRows] = await pool.query(
                `SELECT driver_user_id AS user_id, current_points_balance
                 FROM driver_sponsor WHERE driver_user_id IN (${placeholders}) AND sponsor_org_id = ?`,
                [...driverIds, sponsor_org_id]
            );
            for (const driver of balanceRows) {
                const projected = driver.current_points_balance + pointAmount;
                if (point_upper_limit != null && projected > point_upper_limit) {
                    return res.status(400).json({
                        error: `This adjustment would push one or more drivers above the upper point limit of ${point_upper_limit}.`,
                    });
                }
                if (point_lower_limit != null && projected < point_lower_limit) {
                    return res.status(400).json({
                        error: `This adjustment would push one or more drivers below the lower point limit of ${point_lower_limit}.`,
                    });
                }
            }
        }

        const txValues = driverIds.map(id => [id, sponsor_org_id, pointAmount, reason.trim(), source, sponsorUserId]);
        await pool.query(
            'INSERT INTO point_transactions (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id) VALUES ?',
            [txValues]
        );

        const action = pointAmount > 0 ? 'added to' : 'deducted from';
        const absAmount = Math.abs(pointAmount);
        for (const driverId of driverIds) {
            await createNotification(driverId, 'points_changed', `${absAmount} point(s) were ${action} your account. Reason: ${reason}`);
        }
        res.json({ message: `Points applied to ${driverIds.length} driver(s)` });
    } catch (error) {
        console.error('Error applying points:', error);
        res.status(500).json({ error: 'Failed to apply points' });
    }
});

router.post('/point-contest', async (req, res) => {
    const { transaction_id, driver_user_id, sponsor_org_id, reason } = req.body;

    if (!transaction_id || !driver_user_id || !sponsor_org_id || !reason?.trim()) {
        return res.status(400).json({ error: 'transaction_id, driver_user_id, sponsor_org_id, and reason are required' });
    }

    try {
        const [txRows] = await pool.query(
            'SELECT * FROM point_transactions WHERE transaction_id = ? AND driver_user_id = ? AND point_amount < 0',
            [transaction_id, driver_user_id]
        );
        if (txRows.length === 0) {
            return res.status(404).json({ error: 'Transaction not found or is not a deduction' });
        }

        const [existing] = await pool.query(
            'SELECT contest_id FROM point_contests WHERE transaction_id = ? AND status = ?',
            [transaction_id, 'pending']
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'A pending contest already exists for this transaction' });
        }

        const [result] = await pool.query(
            'INSERT INTO point_contests (transaction_id, driver_user_id, sponsor_org_id, reason) VALUES (?, ?, ?, ?)',
            [transaction_id, driver_user_id, sponsor_org_id, reason.trim()]
        );

        res.json({ message: 'Contest submitted successfully', contest_id: result.insertId });
    } catch (error) {
        console.error('Error submitting point contest:', error);
        res.status(500).json({ error: 'Failed to submit point contest' });
    }
});

router.get('/point-contest/organization/:org_id', async (req, res) => {
    const { org_id } = req.params;
    const { status } = req.query;

    try {
        let query = `
            SELECT pc.*, pt.point_amount, pt.reason AS transaction_reason, pt.source,
                   pt.created_at AS transaction_date, u.username AS driver_username
            FROM point_contests pc
            JOIN point_transactions pt ON pc.transaction_id = pt.transaction_id
            JOIN users u ON pc.driver_user_id = u.user_id
            WHERE pc.sponsor_org_id = ?
        `;
        const params = [org_id];

        if (status) {
            query += ' AND pc.status = ?';
            params.push(status);
        }

        query += ' ORDER BY pc.created_at DESC';

        const [contests] = await pool.query(query, params);
        res.json({ contests });
    } catch (error) {
        console.error('Error fetching point contests:', error);
        res.status(500).json({ error: 'Failed to fetch point contests' });
    }
});

router.put('/point-contest/:contest_id', async (req, res) => {
    const { contest_id } = req.params;
    const { status, decision_reason, reviewed_by_user_id } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'status must be "approved" or "rejected"' });
    }
    if (!reviewed_by_user_id) {
        return res.status(400).json({ error: 'reviewed_by_user_id is required' });
    }

    try {
        const [contestRows] = await pool.query(
            'SELECT * FROM point_contests WHERE contest_id = ? AND status = ?',
            [contest_id, 'pending']
        );
        if (contestRows.length === 0) {
            return res.status(404).json({ error: 'Contest not found or already reviewed' });
        }

        const contest = contestRows[0];

        await pool.query(
            'UPDATE point_contests SET status = ?, decision_reason = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE contest_id = ?',
            [status, decision_reason || null, reviewed_by_user_id, contest_id]
        );

        if (status === 'approved') {
            const [txRows] = await pool.query(
                'SELECT * FROM point_transactions WHERE transaction_id = ?',
                [contest.transaction_id]
            );
            if (txRows.length > 0) {
                const original = txRows[0];
                await pool.query(
                    'INSERT INTO point_transactions (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
                    [
                        original.driver_user_id,
                        original.sponsor_org_id,
                        Math.abs(original.point_amount),
                        `Contest approved — reversal of transaction #${contest.transaction_id}`,
                        'manual',
                        reviewed_by_user_id,
                    ]
                );
            }
        }

        res.json({ message: `Contest ${status} successfully` });
    } catch (error) {
        console.error('Error reviewing point contest:', error);
        res.status(500).json({ error: 'Failed to review point contest' });
    }
});

export default router;
