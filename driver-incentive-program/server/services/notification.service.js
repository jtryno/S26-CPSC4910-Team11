import pool from '../db.js';

const MANDATORY_CATEGORIES = ['dropped', 'password_changed'];

export async function createNotification(userId, category, message, extras = {}) {
    try {
        if (!MANDATORY_CATEGORIES.includes(category)) {
            const prefColumnMap = {
                'points_changed': 'points_changed_enabled',
                'order_placed': 'order_placed_enabled',
                'application_status': null,
                'catalog_item_removed': null,
                'item_out_of_stock': null,
                'ticket_updated': null,
                'price_drop': null,
            };

            const prefColumn = prefColumnMap[category];

            if (prefColumn) {
                const [prefRows] = await pool.query(
                    'SELECT ?? FROM notification_preferences WHERE user_id = ?',
                    [prefColumn, userId]
                );

                if (prefRows.length > 0 && prefRows[0][prefColumn] === 0) {
                    return;
                }
            }
        }

        const { related_order_id = null, related_transaction_id = null, related_application_id = null } = extras;

        await pool.query(
            `INSERT INTO notifications (user_id, category, message, related_order_id, related_transaction_id, related_application_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [userId, category, message, related_order_id, related_transaction_id, related_application_id]
        );
    } catch (error) {
        console.error('Failed to create notification:', error);
    }
}
