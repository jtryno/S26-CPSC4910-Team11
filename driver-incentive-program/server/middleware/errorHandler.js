import process from 'process';
import pool from '../db.js';

// eslint-disable-next-line no-unused-vars
export async function errorHandler(err, req, res, _next) {
    const statusCode = err.status || err.statusCode || 500;
    console.error(`[${req.method}] ${req.path} →`, err.message);

    if (process.env.NODE_ENV !== 'test') {
        try {
            await pool.query(
                `INSERT INTO server_error_log (route, method, status_code, message, stack_trace)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    req.path,
                    req.method,
                    statusCode,
                    err.message?.slice(0, 1000) ?? 'Unknown error',
                    err.stack?.slice(0, 4000) ?? null,
                ]
            );
        } catch (_logErr) {
            // Don't let logging failures cascade
        }
    }

    if (!res.headersSent) {
        res.status(statusCode).json({ error: err.message || 'Internal server error' });
    }
}
