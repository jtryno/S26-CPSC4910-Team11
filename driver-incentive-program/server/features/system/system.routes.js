import process from 'process';
import { Router } from 'express';
import pool from '../../db.js';

const router = Router();

router.get('/about', async (_req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT team_number, version_number, release_date, product_name, product_description FROM about_info ORDER BY about_info_id DESC LIMIT 1'
        );
        if (rows.length > 0) {
            res.json(rows[0]);
        } else {
            res.status(404).json({ message: 'No about information found.' });
        }
    } catch (error) {
        console.error('Error fetching about info:', error);
        res.status(500).json({ error: 'Failed to fetch about info' });
    }
});

router.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
    });
});

export default router;
