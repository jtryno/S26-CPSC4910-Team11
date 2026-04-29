import { Router } from 'express';
import pool from '../../db.js';
import { createNotification } from '../../services/notification.service.js';

const router = Router();

router.post('/orders', async (req, res) => {
    const { driverUserId, sponsorOrgId, cartId, placedByUserId } = req.body;
    if (!driverUserId || !sponsorOrgId || !cartId) {
        return res.status(400).json({ error: 'driverUserId, sponsorOrgId, and cartId are required' });
    }
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[cartRow]] = await conn.query(
            'SELECT cart_id FROM carts WHERE cart_id = ? AND driver_user_id = ? AND status = ?',
            [cartId, driverUserId, 'active']
        );
        if (!cartRow) {
            await conn.rollback();
            return res.status(400).json({ error: 'Cart not found or already checked out' });
        }

        const [items] = await conn.query(
            `SELECT ci.item_id, ci.quantity, cat.points_price, cat.last_price_value,
                    cat.availability_status, cat.is_active
             FROM cart_items ci
             JOIN catalog_items cat ON ci.item_id = cat.item_id
             WHERE ci.cart_id = ?`,
            [cartId]
        );
        if (items.length === 0) {
            await conn.rollback();
            return res.status(400).json({ error: 'Cart is empty' });
        }

        for (const item of items) {
            if (!item.is_active || item.availability_status === 'out_of_stock') {
                await conn.rollback();
                return res.status(400).json({ error: `Item ${item.item_id} is no longer available` });
            }
        }

        const totalPoints = items.reduce((sum, item) => sum + (item.points_price * item.quantity), 0);

        const [[driverRow]] = await conn.query(
            'SELECT current_points_balance FROM driver_sponsor WHERE driver_user_id = ? AND sponsor_org_id = ?',
            [driverUserId, sponsorOrgId]
        );
        if (!driverRow || driverRow.current_points_balance < totalPoints) {
            await conn.rollback();
            return res.status(400).json({
                error: `Insufficient points. Need ${totalPoints}, have ${driverRow?.current_points_balance ?? 0}`
            });
        }

        const [orderResult] = await conn.query(
            'INSERT INTO orders (driver_user_id, sponsor_org_id, placed_by_user_id, cart_id, status) VALUES (?, ?, ?, ?, ?)',
            [driverUserId, sponsorOrgId, placedByUserId || driverUserId, cartId, 'placed']
        );
        const orderId = orderResult.insertId;

        const orderItemValues = items.map(item => [
            orderId, item.item_id, item.quantity, item.points_price, item.last_price_value
        ]);
        await conn.query(
            'INSERT INTO order_items (order_id, item_id, quantity, points_price_at_purchase, price_usd_at_purchase) VALUES ?',
            [orderItemValues]
        );

        await conn.query(
            `INSERT INTO point_transactions
               (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id)
             VALUES (?, ?, ?, ?, 'order', ?)`,
            [driverUserId, sponsorOrgId, -totalPoints, `Order #${orderId}`, placedByUserId || driverUserId]
        );

        await conn.query(
            'UPDATE carts SET status = ?, updated_at = NOW() WHERE cart_id = ?',
            ['checked_out', cartId]
        );

        await conn.commit();
        await createNotification(driverUserId, 'order_placed', `Your order #${orderId} was placed successfully for ${totalPoints.toLocaleString()} points.`, { related_order_id: orderId });

        const [orderItems] = await pool.query(
            `SELECT oi.item_id, oi.quantity, oi.points_price_at_purchase, oi.price_usd_at_purchase,
                    ci.title, ci.image_url
             FROM order_items oi
             JOIN catalog_items ci ON oi.item_id = ci.item_id
             WHERE oi.order_id = ?`,
            [orderId]
        );

        const totalUsd = orderItems.reduce((sum, i) => sum + (i.price_usd_at_purchase * i.quantity), 0);
        const remainingBalance = driverRow.current_points_balance - totalPoints;

        res.json({
            message: 'Order placed successfully',
            order_id: orderId,
            points_spent: totalPoints,
            total_usd: totalUsd,
            remaining_balance: remainingBalance,
            items: orderItems,
        });
    } catch (error) {
        await conn.rollback();
        console.error('Error placing order:', error);
        res.status(500).json({ error: 'Failed to place order' });
    } finally {
        conn.release();
    }
});

// Static sub-paths before generic dynamic
router.get('/orders/driver/:driverUserId', async (req, res) => {
    const { driverUserId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT o.order_id, o.status, o.created_at, o.cancel_reason, o.cancelled_at,
                    o.delivery_name, o.delivery_address, o.delivery_city, o.delivery_state, o.delivery_zip,
                    so.name AS sponsor_name,
                    SUM(oi.points_price_at_purchase * oi.quantity) AS total_points,
                    SUM(oi.price_usd_at_purchase * oi.quantity) AS total_usd,
                    COUNT(oi.order_item_id) AS item_count
             FROM orders o
             JOIN sponsor_organization so ON o.sponsor_org_id = so.sponsor_org_id
             JOIN order_items oi ON o.order_id = oi.order_id
             WHERE o.driver_user_id = ?
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`,
            [driverUserId]
        );
        res.json({ orders: rows });
    } catch (error) {
        console.error('Error fetching driver orders:', error);
        res.status(500).json({ error: 'Failed to fetch order history' });
    }
});

router.get('/orders/org/:sponsorOrgId', async (req, res) => {
    const { sponsorOrgId } = req.params;
    const { driverUserId } = req.query;
    try {
        const params = [sponsorOrgId];
        let driverFilter = '';
        if (driverUserId) {
            driverFilter = 'AND o.driver_user_id = ?';
            params.push(driverUserId);
        }
        const [rows] = await pool.query(
            `SELECT o.order_id, o.driver_user_id, o.status, o.created_at,
                    o.cancel_reason, o.cancelled_at,
                    u.username AS driver_username,
                    SUM(oi.points_price_at_purchase * oi.quantity) AS total_points,
                    SUM(oi.price_usd_at_purchase * oi.quantity) AS total_usd,
                    COUNT(oi.order_item_id) AS item_count
             FROM orders o
             JOIN users u ON o.driver_user_id = u.user_id
             JOIN order_items oi ON o.order_id = oi.order_id
             WHERE o.sponsor_org_id = ? ${driverFilter}
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`,
            params
        );
        res.json({ orders: rows });
    } catch (error) {
        console.error('Error fetching org orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Dynamic :orderId routes
router.get('/orders/:orderId/items', async (req, res) => {
    const { orderId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT oi.*, cat.title, cat.image_url, cat.item_web_url, cat.description
             FROM order_items oi
             JOIN catalog_items cat ON oi.item_id = cat.item_id
             WHERE oi.order_id = ?`,
            [orderId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching order items:', error);
        res.status(500).json({ error: 'Failed to fetch order items' });
    }
});

router.put('/orders/:orderId/delivery', async (req, res) => {
    const { orderId } = req.params;
    const { driverUserId, delivery_name, delivery_address, delivery_city, delivery_state, delivery_zip } = req.body;
    if (!driverUserId) return res.status(400).json({ error: 'driverUserId is required' });
    try {
        const [[order]] = await pool.query(
            'SELECT order_id FROM orders WHERE order_id = ? AND driver_user_id = ?',
            [orderId, driverUserId]
        );
        if (!order) return res.status(404).json({ error: 'Order not found' });
        await pool.query(
            `UPDATE orders SET delivery_name = ?, delivery_address = ?, delivery_city = ?,
             delivery_state = ?, delivery_zip = ? WHERE order_id = ?`,
            [delivery_name || null, delivery_address || null, delivery_city || null,
             delivery_state || null, delivery_zip || null, orderId]
        );
        res.json({ message: 'Delivery details updated' });
    } catch (error) {
        console.error('Error updating delivery details:', error);
        res.status(500).json({ error: 'Failed to update delivery details' });
    }
});

router.put('/orders/:orderId/cancel', async (req, res) => {
    const { orderId } = req.params;
    const { driverUserId, cancel_reason } = req.body;
    if (!driverUserId) return res.status(400).json({ error: 'driverUserId is required' });
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(
            'SELECT order_id, status, sponsor_org_id FROM orders WHERE order_id = ? AND driver_user_id = ?',
            [orderId, driverUserId]
        );
        if (!order) {
            await conn.rollback();
            return res.status(404).json({ error: 'Order not found' });
        }
        if (order.status !== 'placed') {
            await conn.rollback();
            return res.status(400).json({ error: 'Only placed orders can be cancelled' });
        }

        const [[tx]] = await conn.query(
            'SELECT transaction_id, point_amount FROM point_transactions WHERE driver_user_id = ? AND sponsor_org_id = ? AND source = ? AND reason = ? AND point_amount < 0',
            [driverUserId, order.sponsor_org_id, 'order', `Order #${orderId}`]
        );

        await conn.query(
            'UPDATE orders SET status = ?, cancel_reason = ?, cancelled_at = NOW() WHERE order_id = ?',
            ['cancelled', cancel_reason || null, orderId]
        );

        if (tx) {
            const refundAmount = Math.abs(tx.point_amount);
            await conn.query(
                `INSERT INTO point_transactions
                   (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id)
                 VALUES (?, ?, ?, ?, 'order', ?)`,
                [driverUserId, order.sponsor_org_id, refundAmount, `Refund for cancelled Order #${orderId}`, driverUserId]
            );
        }

        await conn.commit();

        const refundMsg = tx
            ? ` ${Math.abs(tx.point_amount).toLocaleString()} point(s) have been refunded to your account.`
            : '';
        await createNotification(driverUserId, 'order_placed', `Your order #${orderId} has been cancelled.${refundMsg}`, { related_order_id: Number(orderId) });

        res.json({ message: 'Order cancelled', points_refunded: tx ? Math.abs(tx.point_amount) : 0 });
    } catch (error) {
        await conn.rollback();
        console.error('Error cancelling order:', error);
        res.status(500).json({ error: 'Failed to cancel order' });
    } finally {
        conn.release();
    }
});

router.patch('/orders/:orderId/status', async (req, res) => {
    const { orderId } = req.params;
    const { status, userId } = req.body;
    if (!status || !userId) return res.status(400).json({ error: 'status and userId are required' });
    try {
        const [[order]] = await pool.query(
            'SELECT order_id, status, driver_user_id, sponsor_org_id FROM orders WHERE order_id = ?',
            [orderId]
        );
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (status === 'shipped') {
            if (order.status !== 'placed') {
                return res.status(400).json({ error: 'Only placed orders can be marked as shipped' });
            }
        } else if (status === 'delivered') {
            if (order.status !== 'shipped') {
                return res.status(400).json({ error: 'Only shipped orders can be confirmed as delivered' });
            }
            if (order.driver_user_id !== parseInt(userId)) {
                return res.status(403).json({ error: 'Only the ordering driver can confirm delivery' });
            }
        } else {
            return res.status(400).json({ error: 'Invalid status. Use "shipped" or "delivered"' });
        }

        await pool.query(
            'UPDATE orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
            [status, orderId]
        );
        res.json({ message: `Order marked as ${status}` });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

export default router;
