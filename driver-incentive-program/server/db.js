import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log("Attempting to connect to database:", process.env.DB_HOST);

dotenv.config();

// Establish a connection pool to handle multiple users
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: 3306
});

// Test the DB connection on startup
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Connection to RDS DB established successfully.');
        connection.release();
    } catch (error) {
        console.error('Failed connecting to the database:', error);
    }
}

testConnection();

export default pool;