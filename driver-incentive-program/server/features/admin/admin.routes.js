import { Router } from 'express';
import pool from '../../db.js';
import { importUsersFromPipeFile } from '../../services/import.service.js';

const router = Router();

router.get('/admin/statistics', async (_req, res) => {
    try {
        const [[userCounts]] = await pool.query(`
            SELECT
                COUNT(*)                                           AS total_users,
                SUM(user_type = 'driver')                         AS total_drivers,
                SUM(user_type = 'sponsor')                        AS total_sponsors,
                SUM(user_type = 'admin')                          AS total_admins,
                SUM(is_active = 1)                                AS active_users,
                SUM(is_active = 0)                                AS inactive_users
            FROM users
        `);

        const [[orgCounts]] = await pool.query(`
            SELECT COUNT(*) AS total_orgs FROM sponsor_organization
        `);

        const [[orderCounts]] = await pool.query(`
            SELECT
                COUNT(*)                                                        AS total_orders,
                SUM(o.status = 'placed')                                        AS placed_orders,
                SUM(o.status = 'shipped')                                       AS shipped_orders,
                SUM(o.status = 'delivered')                                     AS delivered_orders,
                SUM(o.status = 'cancelled')                                     AS canceled_orders,
                COALESCE(SUM(oi.points_price_at_purchase * oi.quantity), 0)     AS total_points_spent
            FROM orders o
            LEFT JOIN order_items oi ON o.order_id = oi.order_id
        `);

        const [[catalogCounts]] = await pool.query(`
            SELECT COUNT(*) AS total_catalog_items FROM catalog_items WHERE is_active = 1
        `);

        const [[ticketCounts]] = await pool.query(`
            SELECT
                COUNT(*)                           AS total_tickets,
                SUM(status = 'open')               AS open_tickets,
                SUM(status = 'resolved')           AS resolved_tickets
            FROM support_tickets
        `);

        res.json({
            users: userCounts,
            organizations: orgCounts,
            orders: orderCounts,
            catalog: catalogCounts,
            tickets: ticketCounts,
            generated_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching admin statistics:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

router.get('/admin/errors', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    try {
        const [rows] = await pool.query(
            `SELECT error_id, route, method, status_code, message, stack_trace, occurred_at
             FROM server_error_log
             ORDER BY occurred_at DESC
             LIMIT ? OFFSET ?`,
            [limit, offset]
        );
        const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM server_error_log');
        res.json({ errors: rows, total, limit, offset });
    } catch (error) {
        console.error('Error fetching error log:', error);
        res.status(500).json({ error: 'Failed to fetch error log' });
    }
});

router.get('/admin/driver-activity', async (req, res) => {
    const { orgId, dateRange } = req.query;

    try {
        let fromDate = null;
        let toDate = null;

        if (dateRange) {
            const parsed = JSON.parse(dateRange);
            fromDate = parsed.fromDate || null;
            toDate = parsed.toDate || fromDate;
        }

        const orgFilterParsed = parseInt(orgId);
        const orgFilter = isNaN(orgFilterParsed) ? null : orgFilterParsed;

        const query = `
            SELECT
                u.user_id, u.username, u.first_name, u.last_name, u.last_login, u.is_active,
                GROUP_CONCAT(DISTINCT so.name SEPARATOR ', ') AS sponsor_names,
                COUNT(DISTINCT CASE WHEN ll.result = 'success' AND (? IS NULL OR (ll.login_date >= ? AND ll.login_date < DATE_ADD(?, INTERVAL 1 DAY))) THEN ll.log_id END) AS successful_logins,
                COUNT(DISTINCT CASE WHEN ll.result = 'failure' AND (? IS NULL OR (ll.login_date >= ? AND ll.login_date < DATE_ADD(?, INTERVAL 1 DAY))) THEN ll.log_id END) AS failed_logins,
                COALESCE(SUM(CASE WHEN (? IS NULL OR (pt.created_at >= ? AND pt.created_at < DATE_ADD(?, INTERVAL 1 DAY))) THEN pt.point_amount END), 0) AS points_in_period,
                COUNT(DISTINCT CASE WHEN (? IS NULL OR (o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY))) THEN o.order_id END) AS orders_in_period
            FROM users u
            JOIN driver_user du ON du.user_id = u.user_id
            LEFT JOIN driver_sponsor ds ON ds.driver_user_id = u.user_id AND (? IS NULL OR ds.sponsor_org_id = ?)
            LEFT JOIN sponsor_organization so ON so.sponsor_org_id = ds.sponsor_org_id
            LEFT JOIN login_logs ll ON ll.user_id = u.user_id
            LEFT JOIN point_transactions pt ON pt.driver_user_id = u.user_id AND (? IS NULL OR pt.sponsor_org_id = ?)
            LEFT JOIN orders o ON o.driver_user_id = u.user_id AND (? IS NULL OR o.sponsor_org_id = ?)
            WHERE (? IS NULL OR ds.sponsor_org_id = ?)
            GROUP BY u.user_id, u.username, u.first_name, u.last_name, u.last_login, u.is_active
            ORDER BY u.last_login DESC
        `;

        const params = [
            fromDate, fromDate, toDate,
            fromDate, fromDate, toDate,
            fromDate, fromDate, toDate,
            fromDate, fromDate, toDate,
            orgFilter, orgFilter,
            orgFilter, orgFilter,
            orgFilter, orgFilter,
            orgFilter, orgFilter,
        ];

        const [drivers] = await pool.query(query, params);
        res.json({ message: 'Driver activity retrieved successfully', drivers });
    } catch (error) {
        console.error('Error fetching driver activity:', error);
        res.status(500).json({ error: 'Failed to fetch driver activity' });
    }
});

router.get('/admin/sponsor-activity', async (req, res) => {
    const { dateRange } = req.query;

    try {
        let fromDate = null;
        let toDate = null;

        if (dateRange) {
            const parsed = JSON.parse(dateRange);
            fromDate = parsed.fromDate || null;
            toDate = parsed.toDate || fromDate;
        }

        const query = `
            SELECT
                so.sponsor_org_id, so.name,
                COUNT(DISTINCT CASE WHEN ds.driver_status = 'active' THEN ds.driver_user_id END) AS active_drivers,
                COALESCE(SUM(CASE WHEN (? IS NULL OR (pt.created_at >= ? AND pt.created_at < DATE_ADD(?, INTERVAL 1 DAY))) THEN pt.point_amount END), 0) AS points_awarded_in_period,
                COUNT(DISTINCT CASE WHEN (? IS NULL OR (o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY))) THEN o.order_id END) AS orders_in_period,
                MAX(u.last_login) AS most_recent_sponsor_login
            FROM sponsor_organization so
            LEFT JOIN driver_sponsor ds ON ds.sponsor_org_id = so.sponsor_org_id
            LEFT JOIN point_transactions pt ON pt.sponsor_org_id = so.sponsor_org_id
            LEFT JOIN orders o ON o.sponsor_org_id = so.sponsor_org_id
            LEFT JOIN sponsor_user su ON su.sponsor_org_id = so.sponsor_org_id
            LEFT JOIN users u ON u.user_id = su.user_id
            GROUP BY so.sponsor_org_id, so.name
            ORDER BY points_awarded_in_period DESC
        `;

        const params = [
            fromDate, fromDate, toDate,
            fromDate, fromDate, toDate,
        ];

        const [orgs] = await pool.query(query, params);
        res.json({ message: 'Sponsor activity retrieved successfully', orgs });
    } catch (error) {
        console.error('Error fetching sponsor activity:', error);
        res.status(500).json({ error: 'Failed to fetch sponsor activity' });
    }
});

router.get('/admin/catalog-status', async (_req, res) => {
    try {
        const [[row]] = await pool.query(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'catalog_disabled'"
        );
        res.json({ catalog_disabled: row?.setting_value === '1' });
    } catch (error) {
        console.error('Error fetching catalog status:', error);
        res.status(500).json({ error: 'Failed to fetch catalog status' });
    }
});

router.put('/admin/catalog-status', async (req, res) => {
    const { disabled, userId } = req.body;
    if (typeof disabled !== 'boolean' || !userId) {
        return res.status(400).json({ error: 'disabled (boolean) and userId are required' });
    }
    try {
        const [[user]] = await pool.query('SELECT user_type FROM users WHERE user_id = ?', [userId]);
        if (!user || user.user_type !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        await pool.query(
            "UPDATE system_settings SET setting_value = ? WHERE setting_key = 'catalog_disabled'",
            [disabled ? '1' : '0']
        );
        res.json({ catalog_disabled: disabled });
    } catch (error) {
        console.error('Error updating catalog status:', error);
        res.status(500).json({ error: 'Failed to update catalog status' });
    }
});

router.post('/admin/users/bulk-import', importUsersFromPipeFile);

export default router;
