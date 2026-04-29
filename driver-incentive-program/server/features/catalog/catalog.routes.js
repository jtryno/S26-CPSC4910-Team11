import { Buffer } from 'buffer';
import { Router } from 'express';
import pool from '../../db.js';
import { searchEbayCatalog, ALLOWED_PROXY_HOSTS } from '../../services/catalog.service.js';
import { createNotification } from '../../services/notification.service.js';

const router = Router();

const REVIEW_CHAR_LIMIT = 600;

// Static routes before dynamic
router.get('/catalog', async (req, res) => {
    try {
        const query = req.query.q || 'electronics';
        const limit = req.query.limit || 30;
        const products = await searchEbayCatalog(query, limit);
        res.json(products);
    } catch (err) {
        console.error('Internal Catalog Route Error:', err);
        res.status(502).json({ error: 'Failed to fetch catalog from eBay API.', details: err.message });
    }
});

router.get('/proxy-image', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: 'url parameter is required' });
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        return res.status(400).json({ error: 'Invalid URL' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol) || !ALLOWED_PROXY_HOSTS.includes(parsedUrl.hostname)) {
        return res.status(400).json({ error: 'URL not permitted' });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': 'https://www.ebay.com/'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            const placeholderSVG = '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" font-size="12" text-anchor="middle" dominant-baseline="middle" fill="#999">No Image</text></svg>';
            res.set('Content-Type', 'image/svg+xml');
            res.set('Access-Control-Allow-Origin', '*');
            return res.send(placeholderSVG);
        }

        const imageBuffer = await response.arrayBuffer();
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(Buffer.from(imageBuffer));
    } catch (err) {
        console.error('Error proxying image:', err.message);
        const placeholderSVG = '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" font-size="12" text-anchor="middle" dominant-baseline="middle" fill="#999">Error</text></svg>';
        res.set('Content-Type', 'image/svg+xml');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(placeholderSVG);
    }
});

router.get('/catalog/org/:sponsorOrgId', async (req, res) => {
    const { sponsorOrgId } = req.params;
    try {
        const [[setting]] = await pool.query(
            "SELECT setting_value FROM system_settings WHERE setting_key = 'catalog_disabled'"
        );
        if (setting?.setting_value === '1') {
            return res.status(503).json({ maintenance: true, message: 'Catalog is temporarily unavailable for maintenance.' });
        }
        const [rows] = await pool.query(
            `SELECT ci.*, so.point_value,
                (SELECT COUNT(DISTINCT o.driver_user_id)
                 FROM order_items oi
                 JOIN orders o ON oi.order_id = o.order_id
                 WHERE oi.item_id = ci.item_id AND o.status != 'cancelled') AS driver_purchase_count
             FROM catalog_items ci
             JOIN sponsor_organization so ON ci.sponsor_org_id = so.sponsor_org_id
             WHERE ci.sponsor_org_id = ? AND ci.is_active = 1
             ORDER BY ci.is_featured DESC, ci.created_at DESC`,
            [sponsorOrgId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching org catalog:', error);
        res.status(500).json({ error: 'Failed to fetch catalog' });
    }
});

router.post('/catalog/org/:sponsorOrgId/items', async (req, res) => {
    const { sponsorOrgId } = req.params;
    const { ebay_item_id, title, item_web_url, image_url, description, last_price_value, category } = req.body;
    if (!ebay_item_id || !title || !last_price_value) {
        return res.status(400).json({ error: 'ebay_item_id, title, and last_price_value are required' });
    }
    try {
        const [orgRows] = await pool.query(
            'SELECT point_value FROM sponsor_organization WHERE sponsor_org_id = ?',
            [sponsorOrgId]
        );
        if (orgRows.length === 0) return res.status(404).json({ error: 'Organization not found' });

        const { point_value } = orgRows[0];
        const points_price = Math.ceil(parseFloat(last_price_value) / parseFloat(point_value));

        const [result] = await pool.query(
            `INSERT INTO catalog_items
               (sponsor_org_id, ebay_item_id, title, item_web_url, image_url, description,
                last_price_value, last_price_currency, availability_status, last_api_refresh_at,
                points_price, is_active, category)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', 'in_stock', NOW(), ?, 1, ?)`,
            [sponsorOrgId, ebay_item_id, title, item_web_url || null, image_url || null,
             description || null, last_price_value, points_price, category || null]
        );
        res.status(201).json({ message: 'Item added to catalog', item_id: result.insertId });
    } catch (error) {
        console.error('Error adding catalog item:', error);
        res.status(500).json({ error: 'Failed to add item to catalog' });
    }
});

router.post('/catalog/viewed', async (req, res) => {
    const { driverUserId, itemId } = req.body;
    if (!driverUserId || !itemId) return res.status(400).json({ error: 'driverUserId and itemId are required' });
    try {
        await pool.query(
            'INSERT INTO recently_viewed (driver_user_id, item_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE viewed_at = NOW()',
            [driverUserId, itemId]
        );
        res.json({ message: 'Recorded' });
    } catch (error) {
        console.error('Error recording view:', error);
        res.status(500).json({ error: 'Failed to record view' });
    }
});

router.post('/catalog/reviews', async (req, res) => {
    const { itemId, driverUserId, rating, reviewText } = req.body;

    if (!itemId || !driverUserId || !rating || !reviewText) {
        return res.status(400).json({ error: 'itemId, driverUserId, rating, and reviewText are required' });
    }
    if (rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    if (reviewText.length > REVIEW_CHAR_LIMIT) {
        return res.status(400).json({ error: `Review must be ${REVIEW_CHAR_LIMIT} characters or fewer` });
    }

    try {
        const [itemRows] = await pool.query(
            `SELECT ci.item_id FROM catalog_items ci
             JOIN driver_sponsor ds ON ci.sponsor_org_id = ds.sponsor_org_id
             WHERE ci.item_id = ? AND ds.driver_user_id = ? AND ds.driver_status = 'active' AND ci.is_active = 1`,
            [itemId, driverUserId]
        );
        if (itemRows.length === 0) {
            return res.status(403).json({ error: 'Item not found in organization catalog' });
        }

        await pool.query(
            `INSERT INTO catalog_reviews (item_id, driver_user_id, rating, review_text)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE rating = VALUES(rating), review_text = VALUES(review_text), updated_at = NOW()`,
            [itemId, driverUserId, rating, reviewText]
        );

        const [[saved]] = await pool.query(
            `SELECT cr.*, u.username AS driver_username FROM catalog_reviews cr
             JOIN users u ON cr.driver_user_id = u.user_id
             WHERE cr.item_id = ? AND cr.driver_user_id = ?`,
            [itemId, driverUserId]
        );

        res.status(201).json({ review: saved });
    } catch (error) {
        console.error('Error saving review:', error);
        res.status(500).json({ error: 'Failed to save review' });
    }
});

router.get('/catalog/viewed/:driverUserId', async (req, res) => {
    const { driverUserId } = req.params;
    const { sponsorOrgId } = req.query;
    if (!sponsorOrgId) return res.status(400).json({ error: 'sponsorOrgId query param required' });
    try {
        const [rows] = await pool.query(
            `SELECT ci.item_id, ci.title, ci.image_url, ci.item_web_url, ci.last_price_value,
                    ci.points_price, ci.availability_status, rv.viewed_at
             FROM recently_viewed rv
             JOIN catalog_items ci ON rv.item_id = ci.item_id
             WHERE rv.driver_user_id = ? AND ci.sponsor_org_id = ? AND ci.is_active = 1
             ORDER BY rv.viewed_at DESC LIMIT 8`,
            [driverUserId, sponsorOrgId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching recently viewed:', error);
        res.status(500).json({ error: 'Failed to fetch recently viewed' });
    }
});

router.get('/catalog/drivers/:sponsorOrgId', async (req, res) => {
    const { sponsorOrgId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT u.user_id, u.username, u.first_name, u.last_name
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN users u ON du.user_id = u.user_id
             WHERE ds.sponsor_org_id = ? AND ds.driver_status = 'active'
             ORDER BY u.username ASC`,
            [sponsorOrgId]
        );
        res.json({ drivers: rows });
    } catch (error) {
        console.error('Error fetching org drivers:', error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});

router.get('/catalog/recommendations/:sponsorOrgId', async (req, res) => {
    const { sponsorOrgId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT ci.item_id, ci.title, ci.image_url, ci.item_web_url,
                    ci.last_price_value, ci.points_price, ci.category, ci.description,
                    COUNT(DISTINCT ci.sponsor_org_id) AS org_count
             FROM catalog_items ci
             WHERE ci.is_active = 1
               AND ci.sponsor_org_id != ?
               AND ci.ebay_item_id NOT IN (
                 SELECT ebay_item_id FROM catalog_items WHERE sponsor_org_id = ? AND is_active = 1
               )
             GROUP BY ci.ebay_item_id
             ORDER BY org_count DESC LIMIT 12`,
            [sponsorOrgId, sponsorOrgId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching recommendations:', error);
        res.status(500).json({ error: 'Failed to fetch recommendations' });
    }
});

router.get('/catalog/reviews/:itemId', async (req, res) => {
    const { itemId } = req.params;
    try {
        const [reviews] = await pool.query(
            `SELECT cr.review_id, cr.item_id, cr.driver_user_id,
                u.username AS driver_username, cr.rating, cr.review_text,
                cr.sponsor_reply, cr.reply_at, cr.reply_by_user_id,
                ru.username AS reply_username, cr.created_at, cr.updated_at
             FROM catalog_reviews cr
             JOIN users u ON cr.driver_user_id = u.user_id
             LEFT JOIN users ru ON cr.reply_by_user_id = ru.user_id
             WHERE cr.item_id = ? ORDER BY cr.created_at DESC`,
            [itemId]
        );

        let avgRating = null;
        if (reviews.length > 0) {
            const total = reviews.reduce((sum, curr) => sum + curr.rating, 0);
            avgRating = total / reviews.length;
        }

        res.json({ reviews, avgRating, totalReviews: reviews.length });
    } catch (error) {
        console.error('Error fetching catalog reviews:', error);
        res.status(500).json({ error: 'Failed to fetch reviews' });
    }
});

router.post('/catalog/reviews/:reviewId/reply', async (req, res) => {
    const { reviewId } = req.params;
    const { sponsorUserId, replyText } = req.body;

    if (!sponsorUserId || !replyText) {
        return res.status(400).json({ error: 'sponsorUserId and replyText are required' });
    }

    try {
        const [[review]] = await pool.query(
            `SELECT cr.review_id, ci.sponsor_org_id FROM catalog_reviews cr
             JOIN catalog_items ci ON cr.item_id = ci.item_id WHERE cr.review_id = ?`,
            [reviewId]
        );
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }

        const [[sponsorRow]] = await pool.query(
            `SELECT user_id FROM users WHERE user_id = ? AND user_type IN ('sponsor', 'admin')`,
            [sponsorUserId]
        );
        if (!sponsorRow) {
            return res.status(403).json({ error: 'Only sponsors or admins can reply to reviews' });
        }

        await pool.query(
            `UPDATE catalog_reviews SET sponsor_reply = ?, reply_at = NOW(), reply_by_user_id = ? WHERE review_id = ?`,
            [replyText, sponsorUserId, reviewId]
        );

        const [[updated]] = await pool.query(
            `SELECT cr.*, u.username AS driver_username, ru.username AS reply_username
             FROM catalog_reviews cr
             JOIN users u ON cr.driver_user_id = u.user_id
             LEFT JOIN users ru ON cr.reply_by_user_id = ru.user_id
             WHERE cr.review_id = ?`,
            [reviewId]
        );

        res.json({ review: updated });
    } catch (error) {
        console.error('Error saving sponsor reply:', error);
        res.status(500).json({ error: 'Failed to save reply' });
    }
});

router.delete('/catalog/items/:itemId', async (req, res) => {
    const { itemId } = req.params;
    try {
        const [[item]] = await pool.query(
            'SELECT title, sponsor_org_id FROM catalog_items WHERE item_id = ? AND is_active = 1',
            [itemId]
        );
        await pool.query('UPDATE catalog_items SET is_active = 0, updated_at = NOW() WHERE item_id = ?', [itemId]);
        if (item) {
            const [drivers] = await pool.query(
                `SELECT driver_user_id AS user_id FROM driver_sponsor WHERE sponsor_org_id = ? AND driver_status = 'active'`,
                [item.sponsor_org_id]
            );
            for (const driver of drivers) {
                await createNotification(driver.user_id, 'catalog_item_removed', `"${item.title}" has been removed from your organization's catalog and is no longer available.`);
            }
            const [sponsorUsers] = await pool.query(
                'SELECT user_id FROM sponsor_user WHERE sponsor_org_id = ?',
                [item.sponsor_org_id]
            );
            for (const su of sponsorUsers) {
                await createNotification(su.user_id, 'catalog_item_removed', `"${item.title}" was removed from your catalog.`);
            }
        }
        res.json({ message: 'Item removed from catalog' });
    } catch (error) {
        console.error('Error removing catalog item:', error);
        res.status(500).json({ error: 'Failed to remove item' });
    }
});

router.delete('/catalog/reviews/:reviewId', async (req, res) => {
    const { reviewId } = req.params;
    const { driverUserId } = req.body;

    if (!driverUserId) {
        return res.status(400).json({ error: 'driverUserId is required' });
    }

    try {
        const [[review]] = await pool.query(
            'SELECT review_id, driver_user_id FROM catalog_reviews WHERE review_id = ?',
            [reviewId]
        );
        if (!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
        if (review.driver_user_id !== Number(driverUserId)) {
            return res.status(403).json({ error: 'You can only delete your own review' });
        }
        await pool.query('DELETE FROM catalog_reviews WHERE review_id = ?', [reviewId]);
        res.json({ message: 'Review deleted' });
    } catch (error) {
        console.error('Error deleting review:', error);
        res.status(500).json({ error: 'Failed to delete review' });
    }
});

router.put('/catalog/items/:itemId/availability', async (req, res) => {
    const { itemId } = req.params;
    const { availability_status } = req.body;
    if (!['in_stock', 'out_of_stock'].includes(availability_status)) {
        return res.status(400).json({ error: 'availability_status must be "in_stock" or "out_of_stock"' });
    }
    try {
        const [[item]] = await pool.query(
            'SELECT title, sponsor_org_id FROM catalog_items WHERE item_id = ? AND is_active = 1',
            [itemId]
        );
        if (!item) return res.status(404).json({ error: 'Item not found' });

        await pool.query(
            'UPDATE catalog_items SET availability_status = ?, updated_at = NOW() WHERE item_id = ?',
            [availability_status, itemId]
        );

        if (availability_status === 'out_of_stock') {
            const [sponsorUsers] = await pool.query(
                'SELECT user_id FROM sponsor_user WHERE sponsor_org_id = ?',
                [item.sponsor_org_id]
            );
            for (const su of sponsorUsers) {
                await createNotification(su.user_id, 'item_out_of_stock', `"${item.title}" is now out of stock in your catalog.`);
            }
        }

        res.json({ message: `Availability updated to ${availability_status}` });
    } catch (error) {
        console.error('Error updating availability:', error);
        res.status(500).json({ error: 'Failed to update availability' });
    }
});

router.put('/catalog/items/:itemId/featured', async (req, res) => {
    const { itemId } = req.params;
    const { is_featured } = req.body;
    try {
        await pool.query(
            'UPDATE catalog_items SET is_featured = ?, updated_at = NOW() WHERE item_id = ?',
            [is_featured ? 1 : 0, itemId]
        );
        res.json({ message: 'Featured status updated' });
    } catch (error) {
        console.error('Error updating featured status:', error);
        res.status(500).json({ error: 'Failed to update featured status' });
    }
});

router.put('/catalog/items/:itemId/sale-price', async (req, res) => {
    const { itemId } = req.params;
    const { sale_price } = req.body;
    const price = sale_price !== undefined && sale_price !== '' ? parseFloat(sale_price) : null;
    try {
        const [[currentItem]] = await pool.query(
            'SELECT sale_price, last_price_value, title FROM catalog_items WHERE item_id = ?',
            [itemId]
        );
        await pool.query(
            'UPDATE catalog_items SET sale_price = ?, updated_at = NOW() WHERE item_id = ?',
            [price, itemId]
        );

        const isNewSale = price !== null && (currentItem.sale_price === null || price < parseFloat(currentItem.sale_price));
        if (isNewSale) {
            const [favoriteDrivers] = await pool.query(
                `SELECT df.driver_user_id FROM driver_favorites df
                 JOIN driver_sponsor ds ON df.driver_user_id = ds.driver_user_id
                 JOIN catalog_items ci ON df.item_id = ci.item_id
                 WHERE df.item_id = ? AND ds.sponsor_org_id = ci.sponsor_org_id AND ds.driver_status = 'active'`,
                [itemId]
            );
            if (favoriteDrivers.length > 0) {
                const notifValues = favoriteDrivers.map(d => [
                    d.driver_user_id, 'price_drop',
                    `Price drop on "${currentItem.title}"! Now on sale.`,
                    new Date(),
                ]);
                await pool.query(
                    `INSERT INTO notifications (user_id, category, message, created_at) VALUES ?`,
                    [notifValues]
                );
            }
        }
        res.json({ message: 'Sale price updated' });
    } catch (error) {
        console.error('Error updating sale price:', error);
        res.status(500).json({ error: 'Failed to update sale price' });
    }
});

router.put('/catalog/items/:itemId/customize', async (req, res) => {
    const { itemId } = req.params;
    const {
        custom_title, custom_description, custom_image_url, custom_points_price,
        hide_price, hide_web_url, misc_info, estimated_delivery_days,
    } = req.body;
    try {
        await pool.query(
            `UPDATE catalog_items SET
                custom_title = ?, custom_description = ?, custom_image_url = ?,
                custom_points_price = ?, hide_price = ?, hide_web_url = ?,
                misc_info = ?, estimated_delivery_days = ?, updated_at = NOW()
             WHERE item_id = ?`,
            [
                custom_title || null,
                custom_description || null,
                custom_image_url || null,
                custom_points_price ? parseInt(custom_points_price) : null,
                hide_price ? 1 : 0,
                hide_web_url ? 1 : 0,
                misc_info || null,
                estimated_delivery_days ? parseInt(estimated_delivery_days) : null,
                itemId,
            ]
        );
        res.json({ message: 'Item updated' });
    } catch (error) {
        console.error('Error customizing catalog item:', error);
        res.status(500).json({ error: 'Failed to update item' });
    }
});

export default router;
