import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

router.post('/favorites', async (req, res) => {
    const { driverUserId, itemId } = req.body;
    if (!driverUserId || !itemId) return res.status(400).json({ error: 'driverUserId and itemId are required' });
    try {
        await pool.query(
            'INSERT IGNORE INTO driver_favorites (driver_user_id, item_id) VALUES (?, ?)',
            [driverUserId, itemId]
        );
        res.json({ message: 'Added to favorites' });
    } catch (error) {
        console.error('Error adding favorite:', error);
        res.status(500).json({ error: 'Failed to add favorite' });
    }
});

router.delete('/favorites/:driverUserId/:itemId', async (req, res) => {
    const { driverUserId, itemId } = req.params;
    try {
        await pool.query(
            'DELETE FROM driver_favorites WHERE driver_user_id = ? AND item_id = ?',
            [driverUserId, itemId]
        );
        res.json({ message: 'Removed from favorites' });
    } catch (error) {
        console.error('Error removing favorite:', error);
        res.status(500).json({ error: 'Failed to remove favorite' });
    }
});

router.get('/favorites/:driverUserId', async (req, res) => {
    const { driverUserId } = req.params;
    const { sponsorOrgId } = req.query;
    if (!sponsorOrgId) return res.status(400).json({ error: 'sponsorOrgId query param required' });
    try {
        const [rows] = await pool.query(
            `SELECT ci.item_id, ci.title, ci.image_url, ci.item_web_url, ci.last_price_value,
                    ci.points_price, ci.availability_status
             FROM driver_favorites df
             JOIN catalog_items ci ON df.item_id = ci.item_id
             WHERE df.driver_user_id = ? AND ci.sponsor_org_id = ? AND ci.is_active = 1
             ORDER BY df.created_at DESC`,
            [driverUserId, sponsorOrgId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching favorites:', error);
        res.status(500).json({ error: 'Failed to fetch favorites' });
    }
});

router.post('/cart', async (req, res) => {
    const { driverUserId, sponsorOrgId, createdByUserId } = req.body;
    if (!driverUserId || !sponsorOrgId) {
        return res.status(400).json({ error: 'driverUserId and sponsorOrgId are required' });
    }
    try {
        const [existing] = await pool.query(
            'SELECT cart_id FROM carts WHERE driver_user_id = ? AND sponsor_org_id = ? AND status = ? LIMIT 1',
            [driverUserId, sponsorOrgId, 'active']
        );
        if (existing.length > 0) {
            return res.json({ cart_id: existing[0].cart_id });
        }
        const [result] = await pool.query(
            'INSERT INTO carts (driver_user_id, sponsor_org_id, created_by_user_id, status) VALUES (?, ?, ?, ?)',
            [driverUserId, sponsorOrgId, createdByUserId || driverUserId, 'active']
        );
        res.status(201).json({ cart_id: result.insertId });
    } catch (error) {
        console.error('Error creating cart:', error);
        res.status(500).json({ error: 'Failed to create cart' });
    }
});

router.get('/cart/:cartId', async (req, res) => {
    const { cartId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT ci.*, cat.title, cat.image_url, cat.item_web_url, cat.description,
                    cat.is_active, cat.availability_status AS current_availability
             FROM cart_items ci
             JOIN catalog_items cat ON ci.item_id = cat.item_id
             WHERE ci.cart_id = ?`,
            [cartId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
});

router.post('/cart/:cartId/items', async (req, res) => {
    const { cartId } = req.params;
    const { itemId, quantity = 1 } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId is required' });
    try {
        const [itemRows] = await pool.query(
            'SELECT item_id, points_price, last_price_value, availability_status, is_active FROM catalog_items WHERE item_id = ? AND is_active = 1',
            [itemId]
        );
        if (itemRows.length === 0) return res.status(404).json({ error: 'Item not found or unavailable' });
        const item = itemRows[0];

        const [existing] = await pool.query(
            'SELECT cart_item_id, quantity FROM cart_items WHERE cart_id = ? AND item_id = ?',
            [cartId, itemId]
        );
        if (existing.length > 0) {
            await pool.query(
                'UPDATE cart_items SET quantity = quantity + ? WHERE cart_item_id = ?',
                [quantity, existing[0].cart_item_id]
            );
        } else {
            await pool.query(
                `INSERT INTO cart_items (cart_id, item_id, quantity, points_price_at_add, price_usd_at_add, availability_at_add)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [cartId, itemId, quantity, item.points_price, item.last_price_value, item.availability_status]
            );
        }
        res.json({ message: 'Item added to cart' });
    } catch (error) {
        console.error('Error adding item to cart:', error);
        res.status(500).json({ error: 'Failed to add item to cart' });
    }
});

router.delete('/cart/:cartId/items/:itemId', async (req, res) => {
    const { cartId, itemId } = req.params;
    try {
        await pool.query('DELETE FROM cart_items WHERE cart_id = ? AND item_id = ?', [cartId, itemId]);
        res.json({ message: 'Item removed from cart' });
    } catch (error) {
        console.error('Error removing cart item:', error);
        res.status(500).json({ error: 'Failed to remove item from cart' });
    }
});

export default router;
