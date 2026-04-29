import { Router } from 'express';
import pool from '../../db.js';
import { buildUserPayload } from '../../services/org.service.js';

const router = Router();

const ALLOWED_USER_FIELDS = new Set([
    'username', 'email', 'phone_number', 'first_name', 'last_name',
    'profile_picture', 'bio', 'address', 'city', 'state', 'zip'
]);

router.get('/admin/user', async (req, res) => {
    const { email } = req.query;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }
    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const { password_hash: _, ...userWithoutPassword } = users[0];
        res.json({ user: userWithoutPassword });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

router.delete('/admin/user/:userId', async (req, res) => {
    const { userId } = req.params;
    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }
    try {
        const [users] = await pool.query('SELECT user_id, user_type FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { user_type } = users[0];
        if (user_type === 'driver') {
            await pool.query(
                'UPDATE driver_sponsor SET driver_status = ?, dropped_at = NOW() WHERE driver_user_id = ? AND driver_status = ?',
                ['dropped', userId, 'active']
            );
        }

        await pool.query('UPDATE users SET is_active = 0 WHERE user_id = ?', [userId]);
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

router.post('/user/leave-organization', async (req, res) => {
    const { user_id, user_type, sponsor_org_id: requestedOrgId } = req.body;
    if (!user_id || !user_type) {
        return res.status(400).json({ error: 'user_id and user_type are required' });
    }
    try {
        if (user_type === 'driver') {
            let sponsor_org_id = requestedOrgId ? Number(requestedOrgId) : null;

            if (sponsor_org_id) {
                const [check] = await pool.query(
                    `SELECT 1 FROM driver_sponsor WHERE driver_user_id = ? AND sponsor_org_id = ? AND driver_status = 'active'`,
                    [user_id, sponsor_org_id]
                );
                if (check.length === 0) {
                    return res.status(404).json({ error: 'Not an active member of the specified organization' });
                }
            } else {
                const [rows] = await pool.query(
                    `SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = 'active'`,
                    [user_id]
                );
                if (rows.length === 0) {
                    return res.status(404).json({ error: 'No active organization found for this driver' });
                }
                sponsor_org_id = rows[0].sponsor_org_id;
            }
            await pool.query(
                'UPDATE driver_sponsor SET driver_status = ?, dropped_at = NOW() WHERE driver_user_id = ? AND sponsor_org_id = ?',
                ['dropped', user_id, sponsor_org_id]
            );
            await pool.query(
                'UPDATE driver_applications SET status = ?, reviewed_at = NOW() WHERE driver_user_id = ? AND sponsor_org_id = ? AND status = ?',
                ['withdrawn', user_id, sponsor_org_id, 'approved']
            );
        } else if (user_type === 'sponsor') {
            const [rows] = await pool.query(
                'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
                [user_id]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'No organization found for this sponsor' });
            }
            await pool.query('DELETE FROM sponsor_user WHERE user_id = ?', [user_id]);
        } else {
            return res.status(400).json({ error: 'Invalid user_type' });
        }
        res.json({ message: 'Successfully left organization' });
    } catch (error) {
        console.error('Error leaving organization:', error);
        res.status(500).json({ error: 'Failed to leave organization' });
    }
});

router.put('/user', async (req, res) => {
    const { user_id, field, value } = req.body;

    if (field === 'sponsor_org_id') {
        return res.status(400).json({ error: 'Use dedicated org membership endpoints to manage organization membership.' });
    }

    if (!ALLOWED_USER_FIELDS.has(field)) {
        return res.status(400).json({ error: 'Invalid field' });
    }

    try {
        await pool.query(`UPDATE users SET ${field} = ? WHERE user_id = ?`, [value, user_id]);
        res.json({ message: 'User field updated successfully' });
    } catch (error) {
        console.error('Error updating user field:', error);
        res.status(500).json({ error: 'Failed to update user information' });
    }
});

router.get('/user/:userId/download-data', async (req, res) => {
    const { userId } = req.params;
    const requestingUserId = req.query.requestingUserId;

    if (!requestingUserId || String(requestingUserId) !== String(userId)) {
        return res.status(403).json({ error: 'You can only download your own data.' });
    }

    try {
        const [users] = await pool.query(
            `SELECT user_id, first_name, last_name, phone_number, email, username,
                    user_type, two_fa_enabled, created_at
             FROM users WHERE user_id = ?`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const data = { profile: user };

        if (user.user_type === 'driver') {
            const [driverInfo] = await pool.query(
                `SELECT ds.sponsor_org_id, ds.driver_status, ds.current_points_balance,
                        ds.affilated_at, ds.dropped_at, ds.drop_reason,
                        so.name AS sponsor_org_name
                 FROM driver_user du
                 LEFT JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
                 LEFT JOIN sponsor_organization so ON ds.sponsor_org_id = so.sponsor_org_id
                 WHERE du.user_id = ?`,
                [userId]
            );
            data.driverInfo = driverInfo[0] || null;

            const [pointTransactions] = await pool.query(
                `SELECT transaction_id, sponsor_org_id, point_amount, reason, source, created_at
                 FROM point_transactions WHERE driver_user_id = ? ORDER BY created_at DESC`,
                [userId]
            );
            data.pointTransactions = pointTransactions;

            const [orders] = await pool.query(
                `SELECT order_id, sponsor_org_id, status, created_at,
                        delivery_name, delivery_address, delivery_city, delivery_state, delivery_zip,
                        cancel_reason, cancelled_at
                 FROM orders WHERE driver_user_id = ? ORDER BY created_at DESC`,
                [userId]
            );
            data.orders = orders;

            const [applications] = await pool.query(
                `SELECT application_id, sponsor_org_id, status, decision_reason, applied_at, reviewed_at
                 FROM driver_applications WHERE driver_user_id = ? ORDER BY applied_at DESC`,
                [userId]
            );
            data.applications = applications;

            const [pointContests] = await pool.query(
                `SELECT contest_id, transaction_id, sponsor_org_id, reason, status, created_at
                 FROM point_contests WHERE driver_user_id = ? ORDER BY created_at DESC`,
                [userId]
            );
            data.pointContests = pointContests;
        }

        if (user.user_type === 'sponsor') {
            const [sponsorInfo] = await pool.query(
                `SELECT su.sponsor_org_id, so.name AS sponsor_org_name, so.point_value
                 FROM sponsor_user su
                 LEFT JOIN sponsor_organization so ON su.sponsor_org_id = so.sponsor_org_id
                 WHERE su.user_id = ?`,
                [userId]
            );
            data.sponsorInfo = sponsorInfo[0] || null;
        }

        const [loginHistory] = await pool.query(
            `SELECT log_id, login_date, result, failure_reason
             FROM login_logs WHERE user_id = ? ORDER BY login_date DESC`,
            [userId]
        );
        data.loginHistory = loginHistory;

        const [passwordChangeLogs] = await pool.query(
            `SELECT log_id, change_type, created_at
             FROM password_change_log WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.passwordChangeLogs = passwordChangeLogs;

        const [notifications] = await pool.query(
            `SELECT notification_id, category, message, read_at, created_at
             FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.notifications = notifications;

        const [notifPrefs] = await pool.query(
            `SELECT points_changed_enabled, order_placed_enabled
             FROM notification_preferences WHERE user_id = ?`,
            [userId]
        );
        data.notificationPreferences = notifPrefs[0] || null;

        const [supportTickets] = await pool.query(
            `SELECT ticket_id, sponsor_org_id, title, description, category, status, created_at, updated_at
             FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.supportTickets = supportTickets;

        const [sentMessages] = await pool.query(
            `SELECT message_id, recipient_id, sponsor_org_id, message_type, message_subject, body, created_at
             FROM messages WHERE sender_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.sentMessages = sentMessages;

        const [receivedMessages] = await pool.query(
            `SELECT message_id, sender_id, sponsor_org_id, message_type, message_subject, body, read_at, created_at
             FROM messages WHERE recipient_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.receivedMessages = receivedMessages;

        data.exportedAt = new Date().toISOString();

        const filename = `personal-data-${userId}-${Date.now()}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error downloading personal data:', error);
        res.status(500).json({ error: 'Failed to download personal data' });
    }
});

router.get('/user/:user_id', async (req, res) => {
    const { user_id } = req.params;
    try {
        const [users] = await pool.query(
            'SELECT user_id, email, username, user_type FROM users WHERE user_id = ?',
            [user_id]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = users[0];
        const userPayload = await buildUserPayload(user);
        res.json({ user: userPayload });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

router.get('/driver/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await pool.query('SELECT * FROM driver_user WHERE user_id = ?', [userId]);
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        res.json({ driver: rows[0] });
    } catch (error) {
        console.error('Error fetching driver details:', error);
        res.status(500).json({ error: 'Failed to fetch driver details' });
    }
});

export default router;
