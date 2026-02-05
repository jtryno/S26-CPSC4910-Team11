import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import pool from './db.js'; // Importing the DB connection pool

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log("Attempting to connect to host:", process.env.DB_HOST);

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/about', async (req, res) => {
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});