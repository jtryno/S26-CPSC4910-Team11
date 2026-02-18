import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import crypto from 'crypto'; // For generating reset tokens
import pool from './db.js';
import cookieParser from 'cookie-parser';

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

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Helper: Password Complexity Validation 
const isPasswordComplex = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    return password.length >= minLength && hasUpperCase && hasNumber && hasSpecialChar;
};

const SCRYPT_PREFIX = 'scrypt$';
const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 };

// acc lockout settings
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 30;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS);
  return `${SCRYPT_PREFIX}${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

function isScryptHash(stored) {
  return typeof stored === 'string' && stored.startsWith(SCRYPT_PREFIX);
}

function verifyScryptPassword(password, stored) {
  // stored format: "scrypt$<saltBase64>$<hashBase64>"
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;

  const salt = Buffer.from(parts[1], 'base64');
  const expected = Buffer.from(parts[2], 'base64');
  const actual = crypto.scryptSync(password, salt, expected.length, SCRYPT_OPTIONS);

  return crypto.timingSafeEqual(actual, expected);
}

// --- About Page Route ---
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

//-- Organization Route ---
app.get('/api/organization/:sponsor_org_id', async (req, res) => {
    const { sponsor_org_id } = req.params;
    
    try {
        const [orgs] = await pool.query('SELECT * FROM sponsor_organization WHERE sponsor_org_id = ?', [sponsor_org_id]);
        
        if (orgs.length === 0) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        
        const org = orgs[0];
        res.json({message: 'Organization info retrieved successfully', organization: org});
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch organization info' });
    }
});

app.get('/api/organization/:sponsor_org_id/count', async (req, res) => {
    const { sponsor_org_id } = req.params;

    try {
        const response = await pool.query('SELECT COUNT(*) AS count FROM users WHERE sponsor_org_id = ?', [sponsor_org_id]);
        const count = response[0][0].count;
        res.json({ message: 'Organization member count retrieved successfully', count });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve organization member count' });
    }
});

app.put('/api/organization/:sponsor_org_id', async (req, res) => {
    const { sponsor_org_id } = req.params;
    const { field, value } = req.body;

    try {
        const [result] = await pool.query(
            `UPDATE sponsor_organization SET ${field} = ? WHERE sponsor_org_id = ?`,
            [value, sponsor_org_id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Organization not found' });
        }

        res.json({ message: 'Organization updated successfully' });
    } catch (error) {
        console.error('Error updating organization:', error);
        res.status(500).json({ error: 'Failed to update organization' });
    }
});

app.get('/api/organization/:sponsor_org_id/users', async (req, res) => {
    const { sponsor_org_id } = req.params;

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE sponsor_org_id = ?', [sponsor_org_id]);
        res.json({ message: 'Organization users retrieved successfully', users });
    } catch (error) {
        console.error('Error fetching organization users:', error);
        res.status(500).json({ error: 'Failed to fetch organization users' });
    }
});

// --- Login Route  ---
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Parameterized query prevents SQL Injection
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = users[0];

        // check if acc is locked
        if (user.lockout_until && new Date() < new Date(user.lockout_until)) {
            const remainingMinutes = Math.ceil((new Date(user.lockout_until) - new Date()) / 60000);
            return res.status(403).json({
                message: `Account locked due to too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`
            });
        }

        // if lockout_until has passed = auto unlock
        if (user.lockout_until && new Date() >= new Date(user.lockout_until)) {
            await pool.query(
                'UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, last_failed_login = NULL WHERE user_id = ?',
                [user.user_id]
            );
        }

        // Verify complexity requirement even at login to prompt updates if needed
        if (!isPasswordComplex(password)) {
            return res.status(400).json({ message: 'Security update required: Password does not meet complexity standards.' });
        }

        const stored = user.password_hash;

        let ok = false;

        if (isScryptHash(stored)) {
        ok = verifyScryptPassword(password, stored);
        } else {
        // Backward-compat: DB currently stores plaintext despite the column name
        ok = password === stored;
        }

        /* reset login attempts/unlock account in sql db: UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_failed_login = NULL WHERE email = 'hello@test.com'; */
        if (!ok) {
            const newFails = user.failed_login_attempts + 1;
            const shouldLock = newFails >= 5;

            await pool.query('UPDATE users SET failed_login_attempts = ?, is_locked = ? WHERE user_id = ?', [newFails, shouldLock, user.user_id]);
            await pool.query('INSERT INTO login_logs (username, login_date) VALUES (?, NOW())', [`FAILED: ${email}`]);

            const newAttempts = (user.failed_login_attempts || 0) + 1;

            if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
                // lock account for 30 mins
                const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
                await pool.query(
                    'UPDATE users SET failed_login_attempts = ?, lockout_until = ?, last_failed_login = NOW() WHERE user_id = ?',
                    [newAttempts, lockUntil, user.user_id]
                );
                return res.status(403).json({
                    message: `Account locked due to too many failed login attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`
                });
            } else {
                // increment counter and show remaining attempts
                await pool.query(
                    'UPDATE users SET failed_login_attempts = ?, last_failed_login = NOW() WHERE user_id = ?',
                    [newAttempts, user.user_id]
                );
                const attemptsLeft = MAX_LOGIN_ATTEMPTS - newAttempts;
                return res.status(401).json({
                    message: `Invalid email or password. ${attemptsLeft} attempt(s) remaining before account lockout.`
                });
            }
        }

        // If it was plaintext, upgrade-in-place to a one-way hash
        if (!isScryptHash(stored)) {
        const upgraded = hashPassword(password);
        await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [upgraded, user.user_id]);
        }

        // reset failed login attempts on successful login
        if (user.failed_login_attempts > 0 || user.lockout_until) {
            await pool.query(
                'UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, last_failed_login = NULL WHERE user_id = ?',
                [user.user_id]
            );
        }

        const { password_hash, ...userNoPassword } = user;
        if (req.body.rememberMe) {
            res.cookie('remember_me', user.user_id, { 
                maxAge: 10 * 24 * 60 * 60 * 1000, // this is 10 daysm, time is just measured in ms
                httpOnly: true, 
                sameSite: 'lax' //basic security to make sure cookie can't be stolen
            });
        }

        await pool.query('UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE user_id = ?', [user.user_id]);
        await pool.query('INSERT INTO login_logs (username, login_date) VALUES (?, NOW())', [`SUCCESS: ${email}`]);
        
        return res.json({ message: 'Login successful', user: userNoPassword });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// --- Password Reset Request ---
app.post('/api/password-reset/request', async (req, res) => {
    const { email } = req.body;
    try {
        const [users] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ message: 'User not found' });

        const token = crypto.randomBytes(32).toString('hex');
        //  Link expires in 24 hours
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); 

        await pool.query(
            'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
            [users[0].user_id, token, expiresAt]
        );

        res.json({ message: 'Reset token generated', token }); 
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate reset link' });
    }
});

// --- Password Reset Confirm ---
app.post('/api/password-reset/confirm', async (req, res) => {
    const { token, newPassword } = req.body;

    // Enforce complexity on reset
    if (!isPasswordComplex(newPassword)) {
        return res.status(400).json({ message: 'Password does not meet complexity requirements.' });
    }

    try {
        const [tokens] = await pool.query(
            'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL',
            [token]
        );

        if (tokens.length === 0) return res.status(400).json({ message: 'Invalid or used token' });

        // Check if token is older than 24 hours - requirement
        if (new Date() > new Date(tokens[0].expires_at)) {
            return res.status(400).json({ message: 'Token has expired' });
        }

        const newHash = hashPassword(newPassword);
        await pool.query(
            'UPDATE users SET password_hash = ?, failed_login_attempts = 0, lockout_until = NULL, last_failed_login = NULL WHERE user_id = ?',
            [newHash, tokens[0].user_id]
        );
        await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_id = ?', [tokens[0].token_id]);

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error during password reset' });
    }
});

const PORT = process.env.PORT || 5000;

app.get('/api/session', async (req, res) => {
    const userId = req.cookies.remember_me;

    if (!userId) {
        return res.status(401).json({ loggedIn: false });
    }

    try {
        const [users] = await pool.query('SELECT user_id, email, username FROM users WHERE user_id = ?', [userId]);
        if (users.length > 0) {
            res.json({ loggedIn: true, user: users[0] });
        } else {
            res.status(401).json({ loggedIn: false });
        }
    } catch (error) {
        res.status(500).json({ error: 'Session check failed' });
    }
});

// --- Logout Route ---
app.post('/api/logout', (req, res) => {
    res.clearCookie('remember_me');
    res.json({ message: 'Logged out successfully' });
});

// --- Update User Route ---
app.put('/api/user', async (req, res) => {
    const { email, field, value } = req.body;

    try {
        const [users] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const userId = users[0].user_id;
        await pool.query(`UPDATE users SET ${field} = ? WHERE user_id = ?`, [value, userId]);

        res.json({ message: 'User field updated successfully' });
    } catch (error) {
        console.error('Error updating user field:', error);
        res.status(500).json({ error: 'Failed to update user information' });
    }
});

// --- Lifetime Points Route ---
app.get('/api/user/lifetime-points/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [users] = await pool.query('SELECT user_type FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (users[0].user_type !== 'driver') {
            return res.status(403).json({ error: 'Not a driver account' });
        }

        const [rows] = await pool.query(
            'SELECT COALESCE(SUM(point_amount), 0) AS lifetime_points FROM point_transactions WHERE driver_user_id = ?',
            [userId]
        );
        res.json({ lifetime_points: rows[0].lifetime_points });
    } catch (error) {
        console.error('Error fetching lifetime points:', error);
        res.status(500).json({ error: 'Failed to fetch lifetime points' });
    }
});

// --- Driver Join Sponsor Route ----
app.get('/api/driver/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [rows] = await pool.query(
            'SELECT * FROM driver_user WHERE user_id = ?',
            [userId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        
        res.json({ driver: rows[0] });
    } catch (error) {
        console.error('Error fetching driver details:', error);
        res.status(500).json({ error: 'Failed to fetch driver details' });
    }
});
// --- Driver Points History Route ---
app.get('/api/driver/points/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const [users] = await pool.query('SELECT user_type FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (users[0].user_type !== 'driver') {
            return res.status(403).json({ error: 'Not a driver account' });
        }

        const [transactions] = await pool.query(
            `SELECT 
                pt.transaction_id,
                pt.point_amount,
                pt.reason,
                pt.source,
                pt.created_at,
                pt.sponsor_org_id,
                so.name AS sponsor_name
             FROM point_transactions pt
             LEFT JOIN sponsor_organization so ON pt.sponsor_org_id = so.sponsor_org_id
             WHERE pt.driver_user_id = ?
             ORDER BY pt.created_at DESC`,
            [userId]
        );

        const [[{ total_points }]] = await pool.query(
            'SELECT COALESCE(SUM(point_amount), 0) AS total_points FROM point_transactions WHERE driver_user_id = ?',
            [userId]
        );

        res.json({ total_points, transactions });
    } catch (error) {
        console.error('Error fetching driver points:', error);
        res.status(500).json({ error: 'Failed to fetch driver points' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});