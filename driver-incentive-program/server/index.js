
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

// Catalog API proxy to Fake Store API
app.get('/api/catalog', async (req, res) => {
    try {
        console.log("Fetching catalog from FakeStoreAPI...");
        
        const response = await fetch('https://fakestoreapi.com/products', {
            method: 'GET',
            headers: {
                // This header tells Cloudflare/FakeStore that the request is from a browser
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // Log the specific status code to your EC2 terminal (e.g., 403)
            console.error(`External API Error: ${response.status} ${response.statusText}`);
            return res.status(502).json({ 
                error: 'Failed to fetch catalog from external API.',
                statusCode: response.status 
            });
        }

        const products = await response.json();
        console.log(`Successfully fetched ${products.length} products.`);
        res.json(products);

    } catch (err) {
        // This catches network timeouts or DNS failures
        console.error('Internal Catalog Route Error:', err);
        res.status(500).json({ error: 'Internal server error.', details: err.message });
    }
});

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

//-- Driver Application Route ---
app.get('/api/application/organization/:org_id', async (req, res) => {
    const { org_id } = req.params;
    const { status } = req.query;
    try {
        let query = 'SELECT * FROM driver_applications WHERE sponsor_org_id = ?';
        const params = [org_id];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        const [applications] = await pool.query(query, params);
        res.json({ applications });
    } catch (error) {
        console.error('Error fetching driver applications:', error);
        res.status(500).json({ error: 'Failed to fetch driver applications' });
    }
});

app.put('/api/application/:application_id', async (req, res) => {
    try {
        const { application_id } = req.params;
        const { status, decision_reason, user_id } = req.body;

        const [result] = await pool.query(
            'UPDATE driver_applications SET status = ?, decision_reason = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE application_id = ?',
            [status, decision_reason, user_id, application_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Application not found' });
        }
        res.json({ message: 'Application updated successfully' });
    } catch (error) {
        console.error('Error updating application:', error);
        res.status(500).json({ error: 'Failed to update application' });
    }
});

app.post('/api/application', async (req, res) => {
    const { user_id, org_id } = req.body;
    try {
        const [result] = await pool.query(
            'INSERT INTO driver_applications (driver_user_id, sponsor_org_id, status) VALUES (?, ?, "pending")',
            [user_id, org_id]
        );
        res.json({ message: 'Driver application submitted successfully', application_id: result.insertId });
    } catch (error) {
        console.error('Error submitting driver application:', error);
        res.status(500).json({ error: 'Failed to submit driver application' });
    }
});

app.get('/api/application/user/:user_id', async (req, res) => {
    const { user_id } = req.params;
    const { status } = req.query;
    try {
        let query = 'SELECT * FROM driver_applications WHERE driver_user_id = ?';
        const params = [user_id];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        const [applications] = await pool.query(query, params);
        res.json({ applications });
    } catch (error) {
        console.error('Error fetching driver applications:', error);
        res.status(500).json({ error: 'Failed to fetch driver applications' });
    }
});
//-- Organization Route ---
app.post('/api/organization', async (req, res) => {
    try {
        const { name, point_value } = req.body;
        const [result] = await pool.query(
            'INSERT INTO sponsor_organization (name, point_value) VALUES (?, ?)',
            [name, point_value]
        );
        res.json({ message: 'Organization created successfully', organization_id: result.insertId });
    } catch (error) {
        console.error('Error creating organization:', error);
        res.status(500).json({ error: 'Failed to create organization' });
    }
});

app.delete('/api/organization/:sponsor_org_id', async (req, res) => { 
    try {
        const { sponsor_org_id } = req.params;
        const [result] = await pool.query('DELETE FROM sponsor_organization WHERE sponsor_org_id = ?', [sponsor_org_id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Organization not found' });
        }
        res.json({ message: 'Organization deleted successfully' });
    } catch (error) {
        console.error('Error deleting organization:', error);
        res.status(500).json({ error: 'Failed to delete organization' });
    }
});

app.get('/api/organization', async (req, res) => {
    try {
        const [orgs] = await pool.query('SELECT * FROM sponsor_organization');
        res.json({ message: 'Organizations retrieved successfully', organizations: orgs });
    } catch (error) {
        res.status(500).json({ error: 'Failed to retrieve organizations' });
    }
});

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
        const [users] = await pool.query(
            `SELECT u.*, du.current_points_balance AS points
             FROM users u
             LEFT JOIN driver_user du ON u.user_id = du.user_id AND du.sponsor_org_id = ?
             WHERE u.sponsor_org_id = ?`,
            [sponsor_org_id, sponsor_org_id]
        );
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

        // if the user has 2FA turned on, don't finish logging them
        // gen random 6 digit code and send it back so the
        // frontend can show a second step asking the user to enter the code
        if (user.two_fa_enabled) {
            // picks a random number between 100000 and 999999 (always 6 digits)
            const code = Math.floor(100000 + Math.random() * 900000).toString();

            // hash code before storing it in the DB
            const codeHash = crypto.createHash('sha256').update(code).digest('hex');

            // code expires after 10 mins
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            // save the hashed code to the two_fa_codes table
            await pool.query(
                'INSERT INTO two_fa_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)',
                [user.user_id, codeHash, expiresAt]
            );

            // frontend 2FA is required and send the plain code so
            // UI can display it to user (like how password reset shows token)
            return res.json({ requiresTwoFa: true, userId: user.user_id, twoFaCode: code });
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
    const {user_id, field, value } = req.body;

    try {
        await pool.query(`UPDATE users SET ${field} = ? WHERE user_id = ?`, [value, user_id]);
        res.json({ message: 'User field updated successfully' });
    } catch (error) {
        console.error('Error updating user field:', error);
        res.status(500).json({ error: 'Failed to update user information' });
    }
});

// --- Admin: Get User by Email ---
app.get('/api/admin/user', async (req, res) => {
    const { email } = req.query;
    
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { password_hash, ...userWithoutPassword } = users[0];
        res.json({ user: userWithoutPassword });
    } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
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

        const [driverRows] = await pool.query(
            `SELECT du.driver_status, du.sponsor_org_id, so.name AS sponsor_name
             FROM driver_user du
             LEFT JOIN sponsor_organization so ON du.sponsor_org_id = so.sponsor_org_id
             WHERE du.user_id = ?`,
            [userId]
        );
        const driverInfo = driverRows[0] || {};

        res.json({
            total_points,
            transactions,
            driver_status: driverInfo.driver_status,
            sponsor_name: driverInfo.sponsor_name,
            sponsor_org_id: driverInfo.sponsor_org_id,
        });
    } catch (error) {
        console.error('Error fetching driver points:', error);
        res.status(500).json({ error: 'Failed to fetch driver points' });
    }
});

// --- Driver Leave Sponsor Route ---
app.post('/api/driver/leave-sponsor', async (req, res) => {
    const { driverUserId } = req.body;
    if (!driverUserId) {
        return res.status(400).json({ error: 'driverUserId is required' });
    }
    try {
        const [rows] = await pool.query(
            'SELECT sponsor_org_id FROM driver_user WHERE user_id = ? AND driver_status = ?',
            [driverUserId, 'active']
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No active sponsor found for this driver' });
        }
        const { sponsor_org_id } = rows[0];

        await pool.query(
            'UPDATE driver_user SET driver_status = ?, dropped_at = NOW() WHERE user_id = ? AND sponsor_org_id = ?',
            ['dropped', driverUserId, sponsor_org_id]
        );

        await pool.query(
            'UPDATE driver_applications SET status = ?, reviewed_at = NOW() WHERE driver_user_id = ? AND sponsor_org_id = ? AND status = ?',
            ['withdrawn', driverUserId, sponsor_org_id, 'approved']
        );

        res.json({ message: 'Successfully left sponsor' });
    } catch (error) {
        console.error('Error leaving sponsor:', error);
        res.status(500).json({ error: 'Failed to leave sponsor' });
    }
});

// --- Get Drivers in Org Route ---
app.get('/api/sponsor/drivers/:sponsorUserId', async (req, res) => {
    const { sponsorUserId } = req.params;
    try {
        const [allSponsors] = await pool.query('SELECT user_id, sponsor_org_id FROM sponsor_user');

        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: `No sponsor_user row found for user_id: ${sponsorUserId}` });
        }
        const { sponsor_org_id } = sponsorRows[0];

        const [drivers] = await pool.query(
            `SELECT
                u.user_id,
                u.username,
                u.first_name,
                u.last_name,
                u.email,
                du.driver_status,
                du.current_points_balance AS total_points
             FROM driver_user du
             JOIN users u ON du.user_id = u.user_id
             WHERE du.sponsor_org_id = ?
               AND du.driver_status = 'active'`,
            [sponsor_org_id]
        );

        res.json({ sponsor_org_id, drivers });
    } catch (error) {
        console.error('Error fetching sponsor drivers:', error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});

// --- Sponsor Settings Routes ---
app.get('/api/sponsor/settings/:sponsorUserId', async (req, res) => {
    const { sponsorUserId } = req.params;
    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor org not found for this user' });
        }
        const { sponsor_org_id } = sponsorRows[0];

        const [orgRows] = await pool.query(
            'SELECT point_upper_limit, point_lower_limit, monthly_point_limit FROM sponsor_organization WHERE sponsor_org_id = ?',
            [sponsor_org_id]
        );
        res.json(orgRows[0]);
    } catch (error) {
        console.error('Error fetching sponsor settings:', error);
        res.status(500).json({ error: 'Failed to fetch sponsor settings' });
    }
});

app.put('/api/sponsor/settings', async (req, res) => {
    const { sponsorUserId, point_upper_limit, point_lower_limit, monthly_point_limit } = req.body;
    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor org not found for this user' });
        }
        const { sponsor_org_id } = sponsorRows[0];

        await pool.query(
            'UPDATE sponsor_organization SET point_upper_limit = ?, point_lower_limit = ?, monthly_point_limit = ? WHERE sponsor_org_id = ?',
            [
                point_upper_limit !== '' && point_upper_limit != null ? parseInt(point_upper_limit, 10) : null,
                point_lower_limit !== '' && point_lower_limit != null ? parseInt(point_lower_limit, 10) : null,
                monthly_point_limit !== '' && monthly_point_limit != null ? parseInt(monthly_point_limit, 10) : null,
                sponsor_org_id,
            ]
        );

        res.json({ message: 'Settings saved successfully' });
    } catch (error) {
        console.error('Error saving sponsor settings:', error);
        res.status(500).json({ error: 'Failed to save sponsor settings' });
    }
});

// --- Sponsor Award/Deduct Points ---
app.post('/api/sponsor/points', async (req, res) => {
    const { sponsorUserId, driverIds, pointAmount, reason, source } = req.body;

    if (!driverIds || !Array.isArray(driverIds) || driverIds.length === 0) {
        return res.status(400).json({ error: 'driverIds must be a non-empty array' });
    }
    if (typeof pointAmount !== 'number' || pointAmount === 0) {
        return res.status(400).json({ error: 'pointAmount must be a non-zero number' });
    }
    if (!reason || !reason.trim()) {
        return res.status(400).json({ error: 'reason is required' });
    }
    const validSources = ['manual', 'recurring'];
    if (!validSources.includes(source)) {
        return res.status(400).json({ error: 'source must be "manual" or "recurring"' });
    }

    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor org not found for this user' });
        }
        const { sponsor_org_id } = sponsorRows[0];

        // getr org limits
        const [orgRows] = await pool.query(
            'SELECT point_upper_limit, point_lower_limit, monthly_point_limit FROM sponsor_organization WHERE sponsor_org_id = ?',
            [sponsor_org_id]
        );
        const { point_upper_limit, point_lower_limit, monthly_point_limit } = orgRows[0];

        // check monthly org limit
        if (monthly_point_limit != null) {
            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);
            const [[{ month_total }]] = await pool.query(
                'SELECT COALESCE(SUM(point_amount), 0) AS month_total FROM point_transactions WHERE sponsor_org_id = ? AND created_at >= ?',
                [sponsor_org_id, monthStart]
            );
            const projected = Number(month_total) + pointAmount * driverIds.length;
            if (projected > monthly_point_limit) {
                return res.status(400).json({
                    error: `This would exceed your organization's monthly point limit of ${monthly_point_limit}. Monthly total so far: ${month_total}.`,
                });
            }
        }

        // check driver upper/lower limits
        if (point_upper_limit != null || point_lower_limit != null) {
            const placeholders = driverIds.map(() => '?').join(', ');
            const [balanceRows] = await pool.query(
                `SELECT user_id, current_points_balance FROM driver_user WHERE user_id IN (${placeholders})`,
                driverIds
            );
            for (const driver of balanceRows) {
                const projected = driver.current_points_balance + pointAmount;
                if (point_upper_limit != null && projected > point_upper_limit) {
                    return res.status(400).json({
                        error: `This adjustment would push one or more drivers above the upper point limit of ${point_upper_limit}.`,
                    });
                }
                if (point_lower_limit != null && projected < point_lower_limit) {
                    return res.status(400).json({
                        error: `This adjustment would push one or more drivers below the lower point limit of ${point_lower_limit}.`,
                    });
                }
            }
        }

        // Insert a transaction row for each driver. The DB trigger updates current_points_balance automatically
        const txValues = driverIds.map(id => [id, sponsor_org_id, pointAmount, reason.trim(), source, sponsorUserId]);
        await pool.query(
            'INSERT INTO point_transactions (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id) VALUES ?',
            [txValues]
        );

        res.json({ message: `Points applied to ${driverIds.length} driver(s)` });
    } catch (error) {
        console.error('Error applying points:', error);
        res.status(500).json({ error: 'Failed to apply points' });
    }
});

// --- 2FA Verify Route ---
// called after the user enters their 6-digit code on login
// finishes login process if the code is correct
app.post('/api/2fa/verify', async (req, res) => {
    const { userId, code, rememberMe } = req.body;

    try {
        // hash the code the user submitted so can compare it to what is in DB
        // plain code never stored, only hash
        const codeHash = crypto.createHash('sha256').update(code).digest('hex');

        // look up a matching & unused code for curr user
        const [rows] = await pool.query(
            'SELECT * FROM two_fa_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
            [userId, codeHash]
        );

        // no match means wrong code or already used code
        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid or already used 2FA code' });
        }

        // Check if code is still within the 10 min window
        if (new Date() > new Date(rows[0].expires_at)) {
            return res.status(400).json({ message: '2FA code has expired. Please log in again.' });
        }

        // mark code as used so it cant be reused
        await pool.query('UPDATE two_fa_codes SET used_at = NOW() WHERE code_id = ?', [rows[0].code_id]);

        // Fetch full user row to return to the frontend (same as login)
        const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
        const user = users[0];
        const { password_hash, ...userNoPassword } = user;

        // Set the remember me cookie now that 2FA passed (same as login)
        if (rememberMe) {
            res.cookie('remember_me', user.user_id, {
                maxAge: 10 * 24 * 60 * 60 * 1000,
                httpOnly: true,
                sameSite: 'lax'
            });
        }

        // Update last login time and log the success
        await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);
        await pool.query('INSERT INTO login_logs (username, login_date) VALUES (?, NOW())', [`SUCCESS: ${user.email}`]);

        return res.json({ message: 'Login successful', user: userNoPassword });
    } catch (error) {
        console.error('2FA verify error:', error);
        res.status(500).json({ error: 'Server error during 2FA verification' });
    }
});

// --- 2FA Toggle Route ---
// from the acc page when the user clicks Enable/Disable 2FA.
// flips the two_fa_enabled flag (0 or 1) in the users table.
app.put('/api/2fa/toggle', async (req, res) => {
    const { email, enabled } = req.body;

    try {
        const [users] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        // enabled is a boolean from the frontend; convert to 1 or 0 for MySQL
        await pool.query('UPDATE users SET two_fa_enabled = ? WHERE user_id = ?', [enabled ? 1 : 0, users[0].user_id]);

        res.json({ message: `2FA ${enabled ? 'enabled' : 'disabled'} successfully` });
    } catch (error) {
        console.error('Error toggling 2FA:', error);
        res.status(500).json({ error: 'Failed to update 2FA setting' });
    }
});

// --- Admin delete user route  ---
app.delete('/api/admin/user/:userId', async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        const [users] = await pool.query('SELECT user_id, user_type FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const { user_type } = users[0];

        if (user_type === 'driver') {
            await pool.query(
                'UPDATE driver_user SET driver_status = ? WHERE user_id = ?',
                ['unaffiliated', userId]
            );
        }

        await pool.query('UPDATE users SET is_active = 0 WHERE user_id = ?', [userId]);

        res.json({ message: `User deleted successfully` });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

// --- Sponsor User Monthly Point Amount Awarded & Deducted Route ---
app.get('/api/sponsor/monthly-points/:sponsorUserId', async (req, res) => {
    const { sponsorUserId } = req.params;
    try {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [sponsorUserId]
        );
        if (sponsorRows.length === 0) {
            return res.status(404).json({ error: 'Sponsor org not found for this user' });
        }
        const { sponsor_org_id } = sponsorRows[0];

        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const [[{ month_awarded, month_deducted }]] = await pool.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN point_amount > 0 THEN point_amount ELSE 0 END), 0) AS month_awarded,
                COALESCE(SUM(CASE WHEN point_amount < 0 THEN point_amount ELSE 0 END), 0) AS month_deducted
             FROM point_transactions 
             WHERE sponsor_org_id = ? 
             AND created_by_user_id = ? 
             AND created_at >= ?`,
            [sponsor_org_id, sponsorUserId, monthStart]
        );

        res.json({ month_awarded, month_deducted });
    } catch (error) {
        console.error('Error fetching monthly points:', error);
        res.status(500).json({ error: 'Failed to fetch monthly points' });
    }
});

// Driver submit a contest
app.post('/api/point-contest', async (req, res) => {
    const { transaction_id, driver_user_id, sponsor_org_id, reason } = req.body;

    if (!transaction_id || !driver_user_id || !sponsor_org_id || !reason?.trim()) {
        return res.status(400).json({ error: 'transaction_id, driver_user_id, sponsor_org_id, and reason are required' });
    }

    try {
        // Verify the transaction belongs to this driver and is a deduction
        const [txRows] = await pool.query(
            'SELECT * FROM point_transactions WHERE transaction_id = ? AND driver_user_id = ? AND point_amount < 0',
            [transaction_id, driver_user_id]
        );
        if (txRows.length === 0) {
            return res.status(404).json({ error: 'Transaction not found or is not a deduction' });
        }

        // Prevent duplicate pending contests for the same transaction
        const [existing] = await pool.query(
            'SELECT contest_id FROM point_contests WHERE transaction_id = ? AND status = "pending"',
            [transaction_id]
        );
        if (existing.length > 0) {
            return res.status(409).json({ error: 'A pending contest already exists for this transaction' });
        }

        const [result] = await pool.query(
            'INSERT INTO point_contests (transaction_id, driver_user_id, sponsor_org_id, reason) VALUES (?, ?, ?, ?)',
            [transaction_id, driver_user_id, sponsor_org_id, reason.trim()]
        );

        res.json({ message: 'Contest submitted successfully', contest_id: result.insertId });
    } catch (error) {
        console.error('Error submitting point contest:', error);
        res.status(500).json({ error: 'Failed to submit point contest' });
    }
});

// Get point contests for an organization (sponsor/admin)
app.get('/api/point-contest/organization/:org_id', async (req, res) => {
    const { org_id } = req.params;
    const { status } = req.query;

    try {
        let query = `
            SELECT 
                pc.*,
                pt.point_amount,
                pt.reason AS transaction_reason,
                pt.source,
                pt.created_at AS transaction_date,
                u.username AS driver_username
            FROM point_contests pc
            JOIN point_transactions pt ON pc.transaction_id = pt.transaction_id
            JOIN users u ON pc.driver_user_id = u.user_id
            WHERE pc.sponsor_org_id = ?
        `;
        const params = [org_id];

        if (status) {
            query += ' AND pc.status = ?';
            params.push(status);
        }

        query += ' ORDER BY pc.created_at DESC';

        const [contests] = await pool.query(query, params);
        res.json({ contests });
    } catch (error) {
        console.error('Error fetching point contests:', error);
        res.status(500).json({ error: 'Failed to fetch point contests' });
    }
});

// Review a point contest (sponsor/admin)
app.put('/api/point-contest/:contest_id', async (req, res) => {
    const { contest_id } = req.params;
    const { status, decision_reason, reviewed_by_user_id } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'status must be "approved" or "rejected"' });
    }
    if (!reviewed_by_user_id) {
        return res.status(400).json({ error: 'reviewed_by_user_id is required' });
    }

    try {
        const [contestRows] = await pool.query(
            'SELECT * FROM point_contests WHERE contest_id = ? AND status = "pending"',
            [contest_id]
        );
        if (contestRows.length === 0) {
            return res.status(404).json({ error: 'Contest not found or already reviewed' });
        }

        const contest = contestRows[0];

        await pool.query(
            'UPDATE point_contests SET status = ?, decision_reason = ?, reviewed_by_user_id = ?, reviewed_at = NOW() WHERE contest_id = ?',
            [status, decision_reason || null, reviewed_by_user_id, contest_id]
        );

        // If approved, reverse the original deduction
        if (status === 'approved') {
            const [txRows] = await pool.query(
                'SELECT * FROM point_transactions WHERE transaction_id = ?',
                [contest.transaction_id]
            );
            if (txRows.length > 0) {
                const original = txRows[0];
                await pool.query(
                    'INSERT INTO point_transactions (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
                    [
                        original.driver_user_id,
                        original.sponsor_org_id,
                        Math.abs(original.point_amount), // reverse the deduction
                        `Contest approved — reversal of transaction #${contest.transaction_id}`,
                        'manual',
                        reviewed_by_user_id,
                    ]
                );
            }
        }

        res.json({ message: `Contest ${status} successfully` });
    } catch (error) {
        console.error('Error reviewing point contest:', error);
        res.status(500).json({ error: 'Failed to review point contest' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});