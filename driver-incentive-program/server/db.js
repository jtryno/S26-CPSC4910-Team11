import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import process from 'process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEnvPath = path.join(__dirname, '.env');
const rootEnvPath = path.join(__dirname, '../.env');
if (fs.existsSync(serverEnvPath)) {
    dotenv.config({ path: serverEnvPath });
    console.log('Loaded env from', serverEnvPath);
} else if (fs.existsSync(rootEnvPath)) {
    dotenv.config({ path: rootEnvPath });
    console.log('Loaded env from', rootEnvPath);
} else {
    dotenv.config();
    console.log('No .env found in server or root; using process.env');
}

console.log("Attempting to connect to database:", process.env.DB_HOST);

const dbPort = Number(process.env.DB_PORT || 3306);
const dbSslCa = process.env.DB_SSL_CA?.replace(/\\n/g, '\n');
const dbSslCaPath = process.env.DB_SSL_CA_PATH;
const dbSslEnabled = ['true', '1', 'required', 'require'].includes(
  String(process.env.DB_SSL || process.env.DB_SSL_MODE || '').toLowerCase()
);

function readSslCa(caPath) {
  if (!caPath) {
    return undefined;
  }

  const resolvedPath = path.isAbsolute(caPath)
    ? caPath
    : path.resolve(__dirname, '..', caPath);

  return fs.readFileSync(resolvedPath, 'utf8');
}

const sslCa = dbSslCa || readSslCa(dbSslCaPath);
const sslConfig = dbSslEnabled || sslCa
  ? {
      ...(sslCa ? { ca: sslCa } : {}),
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    }
  : undefined;

// Establish a connection pool to handle multiple users
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: dbPort,
  ...(sslConfig ? { ssl: sslConfig } : {})
});

// Test the DB connection on startup
async function testConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('Connection to database established successfully.');
        connection.release();
    } catch (error) {
        console.error('Failed connecting to the database:', error);
    }
}

testConnection();

export default pool;