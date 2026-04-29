import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

router.post('/messages', async (req, res) => {
    const { sender_id, recipient_id, sponsor_org_id, message_type, message_subject, body } = req.body;

    if (!sender_id || !message_type) {
        return res.status(400).json({ error: 'sender_id and message_type cannot be null' });
    }
    const validTypes = ['direct', 'org_announcement', 'global_announcement', 'org_chat'];
    if (!validTypes.includes(message_type)) {
        return res.status(400).json({ error: 'message type is not valid' });
    }
    if (message_type === 'direct' && !recipient_id) {
        return res.status(400).json({ error: 'recipient id is required for dms' });
    }
    if ((message_type === 'org_announcement' || message_type === 'org_chat') && !sponsor_org_id) {
        return res.status(400).json({ error: 'sponsor_org_id is required for org messages' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO messages (sender_id, recipient_id, sponsor_org_id, message_type, message_subject, body, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [sender_id, recipient_id || null, sponsor_org_id || null, message_type, message_subject || null, body]
        );
        res.status(201).json({ message: 'Message sent successfully', message_id: result.insertId });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Static sub-paths before dynamic /:messageId
router.get('/messages/announcements/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [userRows] = await pool.query('SELECT user_type FROM users WHERE user_id = ?', [userId]);
        if (userRows.length === 0) return res.status(404).json({ error: 'User not found' });
        const userType = userRows[0].user_type;
        let orgIds = [];
        if (userType === 'driver') {
            const [rows] = await pool.query(
                `SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = 'active'`,
                [userId]
            );
            orgIds = rows.map(row => row.sponsor_org_id);
        } else if (userType === 'sponsor') {
            const [rows] = await pool.query(
                'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ? AND sponsor_org_id IS NOT NULL',
                [userId]
            );
            orgIds = rows.map(row => row.sponsor_org_id);
        }

        let query;
        let params;

        if (orgIds.length > 0) {
            const placeholders = orgIds.map(() => '?').join(', ');
            query = `SELECT m.*, u.username AS sender_username, u.first_name, u.last_name
                     FROM messages m JOIN users u ON m.sender_id = u.user_id
                     WHERE m.message_type = 'global_announcement'
                        OR (m.message_type = 'org_announcement' AND m.sponsor_org_id IN (${placeholders}))
                     ORDER BY m.created_at DESC`;
            params = orgIds;
        } else {
            query = `SELECT m.*, u.username AS sender_username, u.first_name, u.last_name
                     FROM messages m JOIN users u ON m.sender_id = u.user_id
                     WHERE m.message_type = 'global_announcement'
                     ORDER BY m.created_at DESC`;
            params = [];
        }

        const [messages] = await pool.query(query, params);
        res.json({ messages });
    } catch (error) {
        console.error('Error getting announcements:', error);
        res.status(500).json({ error: 'Failed to fetch announcements' });
    }
});

router.get('/messages/thread/:userId/:otherUserId', async (req, res) => {
    const { userId, otherUserId } = req.params;
    try {
        const [messages] = await pool.query(
            `SELECT m.*, u.username AS sender_username
             FROM messages m JOIN users u ON m.sender_id = u.user_id
             WHERE m.message_type = 'direct'
               AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?))
             ORDER BY m.created_at ASC`,
            [userId, otherUserId, otherUserId, userId]
        );
        res.json({ messages });
    } catch (error) {
        console.error('Error get message thread:', error);
        res.status(500).json({ error: 'Failed to get message thread' });
    }
});

router.get('/messages/org/chat/:sponsorOrgId', async (req, res) => {
    const { sponsorOrgId } = req.params;
    try {
        const [messages] = await pool.query(
            `SELECT m.*, u.username AS sender_username, u.user_type AS sender_type
             FROM messages m JOIN users u ON m.sender_id = u.user_id
             WHERE m.message_type = 'org_chat' AND m.sponsor_org_id = ?
             ORDER BY m.created_at ASC`,
            [sponsorOrgId]
        );
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching org chat:', error);
        res.status(500).json({ error: 'Failed to fetch org chat' });
    }
});

router.get('/messages/org/drivers/:sponsorUserId', async (req, res) => {
    const { sponsorUserId } = req.params;
    try {
        const [sponsorRows] = await pool.query('SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?', [sponsorUserId]);
        if (sponsorRows.length === 0) return res.status(404).json({ error: 'no sponsor' });
        const { sponsor_org_id } = sponsorRows[0];

        const [drivers] = await pool.query(
            `SELECT u.user_id, u.username, u.first_name, u.last_name
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN users u ON du.user_id = u.user_id
             WHERE ds.sponsor_org_id = ? AND ds.driver_status = 'active'
             ORDER BY u.username ASC`,
            [sponsor_org_id]
        );
        res.json({ drivers, sponsor_org_id });
    } catch (error) {
        console.error('Error fetching org drivers:', error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});

router.get('/messages/sponsor/:driverUserId', async (req, res) => {
    const { driverUserId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT u.user_id, u.username, u.first_name, u.last_name, ds.sponsor_org_id, so.name AS org_name
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN sponsor_user su ON ds.sponsor_org_id = su.sponsor_org_id
             JOIN users u ON su.user_id = u.user_id
             JOIN sponsor_organization so ON ds.sponsor_org_id = so.sponsor_org_id
             WHERE du.user_id = ? AND ds.driver_status = 'active'
             ORDER BY so.name ASC, u.username ASC`,
            [driverUserId]
        );
        res.json({ sponsors: rows });
    } catch (error) {
        console.error('Error fetching sponsor users:', error);
        res.status(500).json({ error: 'Failed to fetch sponsors' });
    }
});

router.put('/messages/:messageId/read', async (req, res) => {
    const { messageId } = req.params;
    try {
        await pool.query('UPDATE messages SET read_at = NOW() WHERE message_id = ? AND read_at IS NULL', [messageId]);
        res.json({ message: 'Marked as read' });
    } catch (error) {
        console.error('Error marking message as read:', error);
        res.status(500).json({ error: 'Failed to mark message as read' });
    }
});

export default router;
