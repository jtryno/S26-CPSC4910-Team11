import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

router.get('/dashboard/reviews/:driverUserId', async (req, res) => {
    const { driverUserId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT r.review_id, r.driver_user_id, r.sponsor_user_id, r.rating, r.review_text, r.created_at, r.updated_at,
                    u.username AS sponsor_username, so.name AS sponsor_org_name
             FROM sponsor_driver_reviews r
             JOIN users u ON u.user_id = r.sponsor_user_id
             LEFT JOIN sponsor_user su ON su.user_id = r.sponsor_user_id
             LEFT JOIN sponsor_organization so ON so.sponsor_org_id = su.sponsor_org_id
             WHERE r.driver_user_id = ?
             ORDER BY r.created_at DESC`,
            [driverUserId]
        );
        let total = 0;
        for (const row of rows) { total += row.rating; }
        const avgRating = total / rows.length;
        res.json({ reviews: rows, avgRating: Number(avgRating.toFixed(2)), totalReviews: rows.length });
    } catch (error) {
        console.error('Error fetching driver\'s reviews', error);
        res.status(500).json({ error: 'Failed to fetch driver reviews' });
    }
});

router.post('/driver-reviews', async (req, res) => {
    const { sponsorUserId, driverUserId, rating, reviewText } = req.body;

    if (!sponsorUserId || !driverUserId || !reviewText || reviewText.length > 500) {
        return res.status(400).json({ error: 'sponsorUserId, driverUserId, and review text (500 char or less) are required' });
    }
    if (rating == null) {
        return res.status(400).json({ error: 'rating is required' });
    }
    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
        return res.status(400).json({ error: 'rating must be an integer between 1 and 5' });
    }

    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(403).json({ error: 'Sponsor not found in any organization' });
        }
        const sponsorOrgId = sponsorRows[0].sponsor_org_id;

        const [driverRows] = await pool.query(
            'SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ?',
            [driverUserId]
        );
        if (driverRows.length === 0 || driverRows[0].sponsor_org_id !== sponsorOrgId) {
            return res.status(403).json({ error: 'You can only rate drivers in your own organization' });
        }

        await pool.query(
            `INSERT INTO sponsor_driver_reviews (sponsor_user_id, driver_user_id, rating, review_text)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                rating = VALUES(rating),
                review_text = VALUES(review_text),
                updated_at = CURRENT_TIMESTAMP`,
            [sponsorUserId, driverUserId, numRating, reviewText]
        );

        res.status(201).json({ message: 'Review saved' });
    } catch (error) {
        console.error('Error saving driver review:', error);
        res.status(500).json({ error: 'Failed to save driver review' });
    }
});

router.delete('/dashboard/reviews/:reviewId', async (req, res) => {
    const { reviewId } = req.params;
    const { sponsorUserId } = req.body;

    if (!sponsorUserId) {
        return res.status(400).json({ error: 'sponsorUserId is required' });
    }

    try {
        const [rows] = await pool.query(
            'SELECT * FROM sponsor_driver_reviews WHERE review_id = ?',
            [reviewId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Review not found' });
        }
        if (rows[0].sponsor_user_id !== Number(sponsorUserId)) {
            return res.status(403).json({ error: 'You can only delete your own reviews' });
        }

        await pool.query('DELETE FROM sponsor_driver_reviews WHERE review_id = ?', [reviewId]);
        res.json({ message: 'Review deleted' });
    } catch (error) {
        console.error('Error deleting driver review:', error);
        res.status(500).json({ error: 'Failed to delete driver review' });
    }
});

export default router;
