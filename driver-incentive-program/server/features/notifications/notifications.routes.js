import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

// Static sub-paths before dynamic to prevent shadowing
router.get('/notifications/preferences/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [preferences] = await pool.query(
            'SELECT points_changed_enabled, order_placed_enabled FROM notification_preferences WHERE user_id = ?',
            [userId]
        );
        if (preferences.length === 0) {
            return res.json({ points_changed_enabled: 1, order_placed_enabled: 1 });
        }
        res.json(preferences[0]);
    } catch (error) {
        console.error('Error getting notification preferences:', error);
        res.status(500).json({ error: 'Failed to fetch notification preferences' });
    }
});

router.get('/notifications/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [notifications] = await pool.query(
            `SELECT notification_id, category, message, related_order_id, related_transaction_id, related_application_id, created_at, read_at
             FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        res.json({ notifications });
    } catch (error) {
        console.error('Error getting notifications:', error);
        res.status(500).json({ error: 'Failed getting notifications' });
    }
});

router.put('/notifications/user/:userId/read-all', async (req, res) => {
    const { userId } = req.params;
    try {
        await pool.query(
            'UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
            [userId]
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

router.put('/notifications/preferences/:userId', async (req, res) => {
    const { userId } = req.params;
    const { points_changed_enabled, order_placed_enabled } = req.body;
    try {
        await pool.query(
            'UPDATE notification_preferences SET points_changed_enabled = ?, order_placed_enabled = ?, updated_at = NOW() WHERE user_id = ?',
            [points_changed_enabled, order_placed_enabled, userId]
        );
        res.json({ message: 'Preferences updated successfully' });
    } catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({ error: 'Failed to update notification preferences' });
    }
});

router.put('/notifications/:notificationId/read', async (req, res) => {
    const { notificationId } = req.params;
    try {
        await pool.query(
            'UPDATE notifications SET read_at = NOW() WHERE notification_id = ? AND read_at IS NULL',
            [notificationId]
        );
        res.json({ message: 'Notification marked as read' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

export default router;
