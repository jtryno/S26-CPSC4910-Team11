import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

router.get('/logs/password-change-logs/:org_id', async (req, res) => {
    const { org_id } = req.params;
    const { dateRange } = req.query;

    try {
        let query = 'SELECT * FROM password_change_log';
        const params = [];
        const conditions = [];

        if (org_id && org_id !== 'undefined' && org_id !== 'null' && org_id !== 'All') {
            conditions.push('user_id IN (SELECT driver_user_id FROM driver_sponsor WHERE sponsor_org_id = ?)');
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

        const [logs] = await pool.query(query, params);
        res.json({ message: 'Logs retrieved successfully', logs });
    } catch (error) {
        console.error('Error fetching password change logs:', error);
        res.status(500).json({ error: 'Failed to fetch password change logs' });
    }
});

router.get('/logs/login-attempt-logs/:org_id', async (req, res) => {
    const { org_id } = req.params;
    const { dateRange } = req.query;

    try {
        let query = 'SELECT * FROM login_logs';
        const params = [];
        const conditions = [];

        if (org_id && org_id !== 'undefined' && org_id !== 'null' && org_id !== 'All') {
            conditions.push('user_id IN (SELECT driver_user_id FROM driver_sponsor WHERE sponsor_org_id = ?)');
            params.push(org_id);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);
            if (fromDate && toDate) {
                conditions.push('login_date >= ? AND login_date < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } else if (fromDate) {
                conditions.push('login_date >= ? AND login_date < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } else if (toDate) {
                conditions.push('login_date >= ? AND login_date < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const [logs] = await pool.query(query, params);
        res.json({ message: 'Logs retrieved successfully', logs });
    } catch (error) {
        console.error('Error fetching login attempt logs:', error);
        res.status(500).json({ error: 'Failed to fetch login attempt logs' });
    }
});

router.get('/sales', async (req, res) => {
    const { orgId, driverId, dateRange } = req.query;
    try {
        let query = 'SELECT orders.*, order_items.price_usd_at_purchase FROM orders JOIN order_items ON orders.order_id = order_items.order_id';
        const params = [];
        const conditions = [];

        if (orgId && orgId !== 'undefined' && orgId !== 'null' && orgId !== 'All') {
            conditions.push('orders.sponsor_org_id = ?');
            params.push(orgId);
        }

        if (driverId && driverId !== 'undefined' && driverId !== 'null' && driverId !== 'All') {
            conditions.push('orders.driver_user_id = ?');
            params.push(driverId);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);
            if (fromDate && toDate) {
                conditions.push('orders.created_at >= ? AND orders.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } else if (fromDate) {
                conditions.push('orders.created_at >= ? AND orders.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } else if (toDate) {
                conditions.push('orders.created_at >= ? AND orders.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const [sales] = await pool.query(query, params);
        res.json({ sales });
    } catch (error) {
        console.error('Error fetching sales data:', error);
        res.status(500).json({ error: 'Failed to fetch sales data' });
    }
});

router.get('/sales/items', async (req, res) => {
    const { orderId, orgId, dateRange } = req.query;
    try {
        let query = `SELECT order_items.*, orders.sponsor_org_id, orders.created_at FROM order_items JOIN orders ON order_items.order_id = orders.order_id WHERE orders.status != 'cancelled'`;
        const conditions = [];
        const params = [];

        if (orderId && orderId !== 'undefined' && orderId !== 'null' && orderId !== 'All') {
            conditions.push('order_items.order_id = ?');
            params.push(orderId);
        }

        if (orgId && orgId !== 'undefined' && orgId !== 'null' && orgId !== 'All') {
            conditions.push('orders.sponsor_org_id = ?');
            params.push(orgId);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);
            if (fromDate && toDate) {
                conditions.push('orders.created_at >= ? AND orders.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } else if (fromDate) {
                conditions.push('orders.created_at >= ? AND orders.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } else if (toDate) {
                conditions.push('orders.created_at >= ? AND orders.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' AND ' + conditions.join(' AND ');
        }

        const [items] = await pool.query(query, params);
        res.json({ items });
    } catch (error) {
        console.error('Error fetching order items:', error);
        res.status(500).json({ error: 'Failed to fetch order items' });
    }
});

router.get('/transaction-comments/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT tc.comment_id, tc.user_id, tc.body, tc.created_at,
                    u.username, u.first_name, u.last_name, u.user_type
             FROM transaction_comments tc
             JOIN users u ON tc.user_id = u.user_id
             WHERE tc.transaction_id = ?
             ORDER BY tc.created_at ASC`,
            [transactionId]
        );
        res.json({ comments: rows });
    } catch (error) {
        console.error('Error fetching transaction comments:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

router.post('/transaction-comments', async (req, res) => {
    const { transaction_id, user_id, body } = req.body;
    if (!transaction_id || !user_id || !body?.trim()) {
        return res.status(400).json({ error: 'transaction_id, user_id, and body are required' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO transaction_comments (transaction_id, user_id, body) VALUES (?, ?, ?)',
            [transaction_id, user_id, body.trim()]
        );
        const [[comment]] = await pool.query(
            `SELECT tc.comment_id, tc.user_id, tc.body, tc.created_at,
                    u.username, u.first_name, u.last_name, u.user_type
             FROM transaction_comments tc
             JOIN users u ON tc.user_id = u.user_id
             WHERE tc.comment_id = ?`,
            [result.insertId]
        );
        res.status(201).json({ comment });
    } catch (error) {
        console.error('Error adding transaction comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

router.get('/sponsor/transaction-comments/:sponsorOrgId', async (req, res) => {
    const { sponsorOrgId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT pt.transaction_id, pt.driver_user_id, pt.point_amount, pt.reason,
                    pt.source, pt.created_at,
                    u.username, u.first_name, u.last_name,
                    COUNT(tc.comment_id) AS comment_count,
                    MAX(tc.created_at) AS last_comment_at
             FROM point_transactions pt
             JOIN transaction_comments tc ON pt.transaction_id = tc.transaction_id
             JOIN users u ON pt.driver_user_id = u.user_id
             WHERE pt.sponsor_org_id = ?
             GROUP BY pt.transaction_id
             ORDER BY last_comment_at DESC`,
            [sponsorOrgId]
        );
        res.json({ transactions: rows });
    } catch (error) {
        console.error('Error fetching sponsor transaction comments:', error);
        res.status(500).json({ error: 'Failed to fetch transaction comments' });
    }
});

export default router;
