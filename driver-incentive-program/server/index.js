
import express from 'express';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Buffer } from 'buffer';
import cors from 'cors';
import crypto from 'crypto'; // For generating reset tokens
import pool from './db.js';
import cookieParser from 'cookie-parser';
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

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// eBay API Configuration
const EBAY_SANDBOX_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const EBAY_SANDBOX_BROWSE_URL = 'https://api.ebay.com/buy/browse/v1/item_summary/search';
const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID;
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET;

// Cache for eBay access token
let ebayAccessToken = null;
let ebayTokenExpiration = null;

// Get eBay Access Token via OAuth2 Client Credentials Flow
async function getEbayAccessToken() {
    try {
        // Return cached token if still valid
        if (ebayAccessToken && ebayTokenExpiration && Date.now() < ebayTokenExpiration) {
            console.log('Using cached eBay access token');
            return ebayAccessToken;
        }

        console.log('Requesting new eBay access token...');
        
        // Encode credentials in base64
        const credentials = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString('base64');
        
        const response = await fetch(EBAY_SANDBOX_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope'
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error(`eBay token request failed: ${response.status} ${response.statusText}`, errorData);
            throw new Error(`Failed to get eBay access token: ${response.statusText}`);
        }

        const data = await response.json();
        ebayAccessToken = data.access_token;
        // Set expiration 5 minutes before actual expiration (typically 3600 seconds)
        ebayTokenExpiration = Date.now() + ((data.expires_in - 300) * 1000);
        
        console.log('Successfully obtained eBay access token');
        return ebayAccessToken;
    } catch (err) {
        console.error('Error getting eBay access token:', err);
        throw err;
    }
}

// Search eBay catalog and format response
async function searchEbayCatalog(query = null, limit = 30) {
    try {
        const token = await getEbayAccessToken();
        
        // If no query provided, search clothing categories for variety
        const searchQueries = query ? [query] : ['women clothing', 'men clothing', 'shoes', 'jackets', 'accessories', 'dresses'];
        
        console.log(`Searching eBay for queries: ${searchQueries.join(', ')}`);
        
        let allProducts = [];
        
        // Search each query and combine results
        for (const searchQuery of searchQueries) {
            try {
                const searchUrl = `${EBAY_SANDBOX_BROWSE_URL}?q=${encodeURIComponent(searchQuery)}&limit=${limit}&sort=relevance`;
                
                const response = await fetch(searchUrl, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                });

                if (!response.ok) {
                    const errorData = await response.text();
                    console.error(`eBay browse request failed for "${searchQuery}": ${response.status} ${response.statusText}`, errorData);
                    continue;
                }

                const data = await response.json();
                console.log(`Found ${(data.itemSummaries || []).length} items for query: "${searchQuery}"`);
                
                // Transform eBay response to match our expected format
                // Use the image URL already included in the search summary response,
                // routing it through our local proxy to avoid CORS and hotlink issues.
                const productsFromQuery = (data.itemSummaries || []).map((item, index) => {
                    const rawImageUrl = item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl;
                    const image = rawImageUrl
                        ? `/api/proxy-image?url=${encodeURIComponent(rawImageUrl)}`
                        : `https://via.placeholder.com/100?text=No+Image`;
                    return {
                        id: item.itemId || `${searchQuery}-${index}`,
                        title: item.title,
                        description: item.shortDescription || item.condition || 'No description available',
                        price: item.price?.value || '0.00',
                        image,
                        rawImageUrl: rawImageUrl || '',
                        itemWebUrl: item.itemWebUrl || '',
                        itemId: item.itemId
                    };
                });

                allProducts = allProducts.concat(productsFromQuery);
            } catch (err) {
                console.error(`Error searching for "${searchQuery}":`, err);
            }
        }
        
        console.log(`Total items found across all queries: ${allProducts.length}`);

        // Deduplicate by itemId (eBay's unique identifier)
        const uniqueProducts = [];
        const seenItemIds = new Set();
        
        for (const product of allProducts) {
            if (!seenItemIds.has(product.id)) {
                seenItemIds.add(product.id);
                uniqueProducts.push(product);
            }
        }

        // Shuffle results to avoid having all similar items bunched together
        for (let i = uniqueProducts.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [uniqueProducts[i], uniqueProducts[j]] = [uniqueProducts[j], uniqueProducts[i]];
        }

        console.log(`Successfully fetched ${allProducts.length} products from eBay (${uniqueProducts.length} unique after deduplication).`);
        return uniqueProducts;
    } catch (err) {
        console.error('Error searching eBay catalog:', err);
        throw err;
    }
}

// Catalog API endpoint - now using eBay API
app.get('/api/catalog', async (req, res) => {
    try {
        const query = req.query.q || 'electronics';
        const limit = req.query.limit || 30;
        
        console.log("Fetching catalog from eBay API...");
        const products = await searchEbayCatalog(query, limit);
        
        // Log first product image URL for debugging
        if (products.length > 0) {
            console.log('First product image URL:', products[0].image);
        }
        
        res.json(products);

    } catch (err) {
        // This catches network timeouts or eBay API errors
        console.error('Internal Catalog Route Error:', err);
        res.status(502).json({ error: 'Failed to fetch catalog from eBay API.', details: err.message });
    }
});

// Image proxy endpoint to handle CORS issues with third-party seller images
app.get('/api/proxy-image', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ error: 'url parameter is required' });
    }

    try {
        console.log('Proxying image:', url);
        
        // Create an abort controller for timeout
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
            console.warn(`Failed to fetch image (${response.status}), returning placeholder:`, url);
            // Return a simple SVG placeholder instead of failing
            const placeholderSVG = '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" font-size="12" text-anchor="middle" dominant-baseline="middle" fill="#999">No Image</text></svg>';
            res.set('Content-Type', 'image/svg+xml');
            res.set('Access-Control-Allow-Origin', '*');
            return res.send(placeholderSVG);
        }

        // Get the image as a buffer
        const imageBuffer = await response.arrayBuffer();
        
        // Set appropriate content-type and cache headers
        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.set('Access-Control-Allow-Origin', '*'); // Allow all origins to access
        
        // Send the image buffer
        res.send(Buffer.from(imageBuffer));
    } catch (err) {
        console.error('Error proxying image:', err.message);
        // Return SVG placeholder on error
        const placeholderSVG = '<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" font-size="12" text-anchor="middle" dominant-baseline="middle" fill="#999">Error</text></svg>';
        res.set('Content-Type', 'image/svg+xml');
        res.set('Access-Control-Allow-Origin', '*');
        res.send(placeholderSVG);
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

//required notificationss
const MANDATORY_CATEGORIES = ['dropped', 'password_changed'];
//"extras" parameter is if it has a related_something in the db, if not present for that notification type pass in null
async function createNotification(userId, category, message, extras = {}) {
    try {
        if(!MANDATORY_CATEGORIES.includes(category)) {

            //null if not in preferences table
            const prefColumnMap = {'points_changed': 'points_changed_enabled', 'order_placed': 'order_placed_enabled', 'application_status': null};

            const prefColumn = prefColumnMap[category];

            //if it has a corresponding spot in preferences table
            if (prefColumn) {
                const [prefRows] = await pool.query('SELECT ?? FROM notification_preferences WHERE user_id = ?',[prefColumn, userId]);

                //first check makes sure new user has  enabled preferneces
                if(prefRows.length > 0 && prefRows[0][prefColumn] === 0) {
                    return;
                }
            }
        }


        const {related_order_id = null, related_transaction_id = null, related_application_id = null} = extras;

        await pool.query(
            `INSERT INTO notifications (user_id, category, message, related_order_id, related_transaction_id, related_application_id, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
            [userId, category, message, related_order_id, related_transaction_id, related_application_id]
        );

    } catch (error) {
        console.error('Failed to create notification:', error);
    }
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
        if(status === 'approved' || status === 'rejected') {
            const [appInfo] = await pool.query('SELECT driver_user_id, sponsor_org_id FROM driver_applications WHERE application_id = ?', [application_id]);
            if(appInfo.length > 0) {
                const {driver_user_id, sponsor_org_id} = appInfo[0];
                const [orgRows] = await pool.query('SELECT name FROM sponsor_organization WHERE sponsor_org_id = ?', [sponsor_org_id]);
                const orgName = orgRows[0].name;
                let msg;
                if (status === 'approved') {
                    msg = `Your application to join ${orgName} was approved.`;
                    await pool.query(
                        'UPDATE driver_user SET sponsor_org_id = ?, driver_status = "active", dropped_at = NULL, drop_reason = NULL WHERE user_id = ?',
                        [sponsor_org_id, driver_user_id]
                    );
                } else {
                    msg = `Your application to join ${orgName} was rejected. Reason: ${decision_reason || 'No reason provided.'}`;
                }
                await createNotification(driver_user_id, 'application_status', msg, {related_application_id: Number(application_id)});
            }
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
             LEFT JOIN driver_user du ON u.user_id = du.user_id
             WHERE u.sponsor_org_id = ?`,
            [sponsor_org_id]
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

        const { password_hash: _, ...userNoPassword } = user;
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
        
        await createNotification(tokens[0].user_id, 'password_changed', 'Your password was successfully changed. If you did not initiate this, please contact support.');

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

// --- Signup Route ---
app.post('/api/signup', async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, email, username, password, userRole, orgId } = req.body;
        if (!isPasswordComplex(password)) {
            return res.status(400).json({ message: 'Password does not meet complexity requirements.' });
        }
        const passwordHash = hashPassword(password);
        await pool.query("INSERT INTO users (first_name, last_name, phone_number, email, username, password_hash, user_type, sponsor_org_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [firstName, lastName, phoneNumber, email, username, passwordHash, userRole, orgId],
        );
        res.json({ message: 'Signup successful' });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Server error during signup' });
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

        const { password_hash: _, ...userWithoutPassword } = users[0];
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
            'UPDATE driver_user SET driver_status = ?, sponsor_org_id = NULL, dropped_at = NOW() WHERE user_id = ? AND sponsor_org_id = ?',
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
            'SELECT point_upper_limit, point_lower_limit, monthly_point_limit, point_value FROM sponsor_organization WHERE sponsor_org_id = ?',
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

        let action;
        if(pointAmount > 0) {
            action = 'added to';
        } else {
            action = 'deducted from';
        }
        const absAmount = Math.abs(pointAmount);
        for(const driverId of driverIds) {
            await createNotification(driverId, 'points_changed', `${absAmount} point(s) were ${action} your account. Reason: ${reason}`);
        }
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
        const { password_hash: _, ...userNoPassword } = user;

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

// --- notification route ---
// --- get notification preferences ---
app.get('/api/notifications/preferences/:userId', async (req, res) => {
    const {userId} = req.params;
    try {
        const [preferences] = await pool.query('SELECT points_changed_enabled, order_placed_enabled FROM notification_preferences WHERE user_id = ?',
            [userId]
        );
            //if preferences never changed manually everything is enabled 
        if(preferences.length === 0) {
            return res.json({points_changed_enabled: 1, order_placed_enabled: 1});
        }

        res.json(preferences[0])
    } catch (error) {
        console.error('Error getting notification preferences:', error);
        res.status(500).json({error: 'Failed to fetch notification preferences'});
    }
});

// --- get all notifications ---
app.get('/api/notifications/:userId', async (req, res) => {
    const {userId} = req.params;
    try {
        //sorted by newest first
        const [notifications] = await pool.query(`SELECT notification_id, category, message, related_order_id, related_transaction_id, related_application_id, created_at, read_at
             FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        res.json({notifications});
    } catch (error) {
        console.error('Error getting notificationls:', error);
        res.status(500).json({error: 'Failed getting notifications'});
    }
});

// --- mark a notification as read ---
app.put('/api/notifications/:notificationId/read', async (req, res) => {
    const {notificationId} = req.params;
    try {
        //NOW() is current time
        await pool.query('UPDATE notifications SET read_at = NOW() WHERE notification_id = ? AND read_at IS NULL',
            [notificationId]
        );
        res.json({message: 'Notification marked as read'});
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({error: 'Failed to mark notification as read'});
    }
});

// --- mark all notifications as read ---
app.put('/api/notifications/user/:userId/read-all', async (req, res) => {
    const {userId} = req.params;
    try {
        await pool.query('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL',
            [userId]
        );
        res.json({message: 'All notifications marked as read'});
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({error: 'Failed to mark all notifications as read'});
    }
});

// --- update notification preferecnes ---
app.put('/api/notifications/preferences/:userId', async (req, res) => {
    const {userId} = req.params;
    const {points_changed_enabled, order_placed_enabled} = req.body;
    try {
        await pool.query('UPDATE notification_preferences SET points_changed_enabled = ?, order_placed_enabled = ?, updated_at = NOW() WHERE user_id = ?',
            [points_changed_enabled, order_placed_enabled, userId]
        );
        res.json({message: 'Preferences updated successfully'});
    } catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({error: 'Failed to update notification preferences'});
    }
});

// --- Drop driver from organization ---
app.post('/api/driver/drop', async (req, res) => {
    const {driverId, drop_reason} = req.body;

    if(!driverId) {
        return res.status(400).json({error: 'driverId is required'});
    }

    try {
        //get users org id so we can get org name to show who dropped them
        const [orgIdArray] = await pool.query('SELECT sponsor_org_id FROM driver_user WHERE user_id = ?',[driverId]);

        if(orgIdArray.length === 0) {
            return res.status(404).json({error: 'Driver not found'});
        }

        const sponsor_org_id = orgIdArray[0].sponsor_org_id;

        if(sponsor_org_id === null) {
            return res.status(400).json({error: 'Driver is not currently in an organization'});
        }

        const [orgRows] = await pool.query('SELECT name FROM sponsor_organization WHERE sponsor_org_id = ?', [sponsor_org_id]);

        const orgName = orgRows[0].name;

        await pool.query(
            'UPDATE driver_user SET sponsor_org_id = NULL, driver_status = "dropped", dropped_at = NOW(), drop_reason = ? WHERE user_id = ?', [drop_reason || null, driverId]);

        await pool.query(
            'UPDATE users SET sponsor_org_id = NULL WHERE user_id = ?', [driverId]);

        let msg;
        if(drop_reason) {
            msg = `You have been removed from ${orgName}. Reason: ${drop_reason}`;
        } else {
            msg = `You have been removed from ${orgName}.`;
        }

        await createNotification(driverId, 'dropped', msg);

        res.json({message: 'Driver removed from organization'});
    } catch (error) {
        console.error('Error dropping driver:', error);
        res.status(500).json({error: 'Failed to remove driver from organization'});
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

// ─── Catalog Management Routes ───────────────────────────────────────────────

// GET /api/catalog/org/:sponsorOrgId — active items for a sponsor's catalog
app.get('/api/catalog/org/:sponsorOrgId', async (req, res) => {
    const { sponsorOrgId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT ci.*, so.point_value
             FROM catalog_items ci
             JOIN sponsor_organization so ON ci.sponsor_org_id = so.sponsor_org_id
             WHERE ci.sponsor_org_id = ? AND ci.is_active = 1
             ORDER BY ci.created_at DESC`,
            [sponsorOrgId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching org catalog:', error);
        res.status(500).json({ error: 'Failed to fetch catalog' });
    }
});

// POST /api/catalog/org/:sponsorOrgId/items — sponsor adds eBay item to catalog
app.post('/api/catalog/org/:sponsorOrgId/items', async (req, res) => {
    const { sponsorOrgId } = req.params;
    const { ebay_item_id, title, item_web_url, image_url, description, last_price_value } = req.body;
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
                points_price, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', 'in_stock', NOW(), ?, 1)`,
            [sponsorOrgId, ebay_item_id, title, item_web_url || null, image_url || null,
             description || null, last_price_value, points_price]
        );
        res.status(201).json({ message: 'Item added to catalog', item_id: result.insertId });
    } catch (error) {
        console.error('Error adding catalog item:', error);
        res.status(500).json({ error: 'Failed to add item to catalog' });
    }
});

// DELETE /api/catalog/items/:itemId — sponsor soft-removes item (is_active = 0)
app.delete('/api/catalog/items/:itemId', async (req, res) => {
    const { itemId } = req.params;
    try {
        await pool.query(
            'UPDATE catalog_items SET is_active = 0, updated_at = NOW() WHERE item_id = ?',
            [itemId]
        );
        res.json({ message: 'Item removed from catalog' });
    } catch (error) {
        console.error('Error removing catalog item:', error);
        res.status(500).json({ error: 'Failed to remove item' });
    }
});

// ─── Cart Routes ──────────────────────────────────────────────────────────────

// POST /api/cart — get-or-create active cart for driver+org
app.post('/api/cart', async (req, res) => {
    const { driverUserId, sponsorOrgId } = req.body;
    if (!driverUserId || !sponsorOrgId) {
        return res.status(400).json({ error: 'driverUserId and sponsorOrgId are required' });
    }
    try {
        const [existing] = await pool.query(
            'SELECT cart_id FROM carts WHERE driver_user_id = ? AND sponsor_org_id = ? AND status = "active" LIMIT 1',
            [driverUserId, sponsorOrgId]
        );
        if (existing.length > 0) {
            return res.json({ cart_id: existing[0].cart_id });
        }
        const [result] = await pool.query(
            'INSERT INTO carts (driver_user_id, sponsor_org_id, created_by_user_id, status) VALUES (?, ?, ?, "active")',
            [driverUserId, sponsorOrgId, driverUserId]
        );
        res.status(201).json({ cart_id: result.insertId });
    } catch (error) {
        console.error('Error creating cart:', error);
        res.status(500).json({ error: 'Failed to create cart' });
    }
});

// GET /api/cart/:cartId — contents of a cart
app.get('/api/cart/:cartId', async (req, res) => {
    const { cartId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT ci.*, cat.title, cat.image_url, cat.item_web_url, cat.description
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

// POST /api/cart/:cartId/items — add (or increment) an item in the cart
app.post('/api/cart/:cartId/items', async (req, res) => {
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

// DELETE /api/cart/:cartId/items/:itemId — remove item from cart
app.delete('/api/cart/:cartId/items/:itemId', async (req, res) => {
    const { cartId, itemId } = req.params;
    try {
        await pool.query('DELETE FROM cart_items WHERE cart_id = ? AND item_id = ?', [cartId, itemId]);
        res.json({ message: 'Item removed from cart' });
    } catch (error) {
        console.error('Error removing cart item:', error);
        res.status(500).json({ error: 'Failed to remove item from cart' });
    }
});

// ─── Checkout / Order Routes ──────────────────────────────────────────────────

// POST /api/orders — checkout cart (atomic transaction)
app.post('/api/orders', async (req, res) => {
    const { driverUserId, sponsorOrgId, cartId } = req.body;
    if (!driverUserId || !sponsorOrgId || !cartId) {
        return res.status(400).json({ error: 'driverUserId, sponsorOrgId, and cartId are required' });
    }
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        // 1. Verify cart belongs to driver and is still active
        const [[cartRow]] = await conn.query(
            'SELECT cart_id FROM carts WHERE cart_id = ? AND driver_user_id = ? AND status = "active"',
            [cartId, driverUserId]
        );
        if (!cartRow) {
            await conn.rollback();
            return res.status(400).json({ error: 'Cart not found or already checked out' });
        }

        // 2. Load cart items with current catalog prices
        const [items] = await conn.query(
            `SELECT ci.item_id, ci.quantity, cat.points_price, cat.last_price_value,
                    cat.availability_status, cat.is_active
             FROM cart_items ci
             JOIN catalog_items cat ON ci.item_id = cat.item_id
             WHERE ci.cart_id = ?`,
            [cartId]
        );
        if (items.length === 0) {
            await conn.rollback();
            return res.status(400).json({ error: 'Cart is empty' });
        }

        // 3. Validate all items are still available
        for (const item of items) {
            if (!item.is_active || item.availability_status === 'out_of_stock') {
                await conn.rollback();
                return res.status(400).json({ error: `Item ${item.item_id} is no longer available` });
            }
        }

        // 4. Calculate total points cost using current catalog prices
        const totalPoints = items.reduce((sum, item) => sum + (item.points_price * item.quantity), 0);

        // 5. Check driver has enough points
        const [[driverRow]] = await conn.query(
            'SELECT current_points_balance FROM driver_user WHERE user_id = ? AND sponsor_org_id = ?',
            [driverUserId, sponsorOrgId]
        );
        if (!driverRow || driverRow.current_points_balance < totalPoints) {
            await conn.rollback();
            return res.status(400).json({
                error: `Insufficient points. Need ${totalPoints}, have ${driverRow?.current_points_balance ?? 0}`
            });
        }

        // 6. Create order record
        const [orderResult] = await conn.query(
            'INSERT INTO orders (driver_user_id, sponsor_org_id, placed_by_user_id, cart_id, status) VALUES (?, ?, ?, ?, "placed")',
            [driverUserId, sponsorOrgId, driverUserId, cartId]
        );
        const orderId = orderResult.insertId;

        // 7. Bulk insert order_items (snapshot prices at purchase time)
        const orderItemValues = items.map(item => [
            orderId, item.item_id, item.quantity, item.points_price, item.last_price_value
        ]);
        await conn.query(
            'INSERT INTO order_items (order_id, item_id, quantity, points_price_at_purchase, price_usd_at_purchase) VALUES ?',
            [orderItemValues]
        );

        // 8. Deduct points — DB trigger auto-updates driver_user.current_points_balance
        await conn.query(
            `INSERT INTO point_transactions
               (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id)
             VALUES (?, ?, ?, ?, 'order', ?)`,
            [driverUserId, sponsorOrgId, -totalPoints, `Order #${orderId}`, driverUserId]
        );

        // 9. Mark cart as checked out
        await conn.query(
            'UPDATE carts SET status = "checked_out", updated_at = NOW() WHERE cart_id = ?',
            [cartId]
        );

        await conn.commit();
        await createNotification(driverUserId, 'order_placed', `Your order #${orderId} was placed successfully for ${totalPoints.toLocaleString()} points.`, {related_order_id: orderId});
        res.json({ message: 'Order placed successfully', order_id: orderId, points_spent: totalPoints });
    } catch (error) {
        await conn.rollback();
        console.error('Error placing order:', error);
        res.status(500).json({ error: 'Failed to place order' });
    } finally {
        conn.release();
    }
});

// ─── Order History Routes ─────────────────────────────────────────────────────

// GET /api/orders/driver/:driverUserId — driver's purchase history
app.get('/api/orders/driver/:driverUserId', async (req, res) => {
    const { driverUserId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT o.order_id, o.status, o.created_at, o.cancel_reason, o.cancelled_at,
                    so.name AS sponsor_name,
                    SUM(oi.points_price_at_purchase * oi.quantity) AS total_points,
                    SUM(oi.price_usd_at_purchase * oi.quantity) AS total_usd,
                    COUNT(oi.order_item_id) AS item_count
             FROM orders o
             JOIN sponsor_organization so ON o.sponsor_org_id = so.sponsor_org_id
             JOIN order_items oi ON o.order_id = oi.order_id
             WHERE o.driver_user_id = ?
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`,
            [driverUserId]
        );
        res.json({ orders: rows });
    } catch (error) {
        console.error('Error fetching driver orders:', error);
        res.status(500).json({ error: 'Failed to fetch order history' });
    }
});

// GET /api/orders/:orderId/items — line items for a specific order
app.get('/api/orders/:orderId/items', async (req, res) => {
    const { orderId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT oi.*, cat.title, cat.image_url, cat.item_web_url, cat.description
             FROM order_items oi
             JOIN catalog_items cat ON oi.item_id = cat.item_id
             WHERE oi.order_id = ?`,
            [orderId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching order items:', error);
        res.status(500).json({ error: 'Failed to fetch order items' });
    }
});

// GET /api/orders/org/:sponsorOrgId — sponsor views all org orders, optional ?driverUserId filter
app.get('/api/orders/org/:sponsorOrgId', async (req, res) => {
    const { sponsorOrgId } = req.params;
    const { driverUserId } = req.query;
    try {
        const params = [sponsorOrgId];
        let driverFilter = '';
        if (driverUserId) {
            driverFilter = 'AND o.driver_user_id = ?';
            params.push(driverUserId);
        }
        const [rows] = await pool.query(
            `SELECT o.order_id, o.driver_user_id, o.status, o.created_at,
                    o.cancel_reason, o.cancelled_at,
                    u.username AS driver_username,
                    SUM(oi.points_price_at_purchase * oi.quantity) AS total_points,
                    SUM(oi.price_usd_at_purchase * oi.quantity) AS total_usd,
                    COUNT(oi.order_item_id) AS item_count
             FROM orders o
             JOIN users u ON o.driver_user_id = u.user_id
             JOIN order_items oi ON o.order_id = oi.order_id
             WHERE o.sponsor_org_id = ? ${driverFilter}
             GROUP BY o.order_id
             ORDER BY o.created_at DESC`,
            params
        );
        res.json({ orders: rows });
    } catch (error) {
        console.error('Error fetching org orders:', error);
        res.status(500).json({ error: 'Failed to fetch orders' });
    }
});

// Support Tickets

// creates new support ticket, called when a driver or sponsor submits the form
// sponsorOrgId can be null if the user isn't affiliated with an org
app.post('/api/support-tickets', async (req, res) => {
    const { userId, sponsorOrgId, title, description } = req.body;
    // make sure both fields are filled in before inserting
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required.' });
    }
    if (!description || !description.trim()) {
        return res.status(400).json({ error: 'Description is required.' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO support_tickets (user_id, sponsor_org_id, title, description) VALUES (?, ?, ?, ?)',
            [userId, sponsorOrgId || null, title.trim(), description.trim()]
        );
        res.json({ message: 'Ticket created successfully', ticket_id: result.insertId });
    } catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({ error: 'Failed to create support ticket.' });
    }
});

// returns all tickets submitted by a specific user, used in driver/sponsor view
app.get('/api/support-tickets/user/:userId', async (req, res) => {
    try {
        const [tickets] = await pool.query(
            'SELECT * FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC',
            [req.params.userId]
        );
        res.json({ tickets });
    } catch (error) {
        console.error('Error fetching user support tickets:', error);
        res.status(500).json({ error: 'Failed to fetch support tickets.' });
    }
});

// updates the status of a ticket, only admins can do this (in progress or resolved)
app.put('/api/support-tickets/:ticketId/status', async (req, res) => {
    const { status } = req.body;
    const validStatuses = ['open', 'in_progress', 'resolved'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be open, in_progress, or resolved.' });
    }
    try {
        const [result] = await pool.query(
            'UPDATE support_tickets SET status = ? WHERE ticket_id = ?',
            [status, req.params.ticketId]
        );
        // if no rows were affected the ticket id doesn't exist
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }
        res.json({ message: 'Ticket updated successfully' });
    } catch (error) {
        console.error('Error updating support ticket status:', error);
        res.status(500).json({ error: 'Failed to update ticket status.' });
    }
});

// returns all tickets in the system for the admin view
// JOINs on users and sponsor_organization so the admin can see who submitted each ticket and what org they're in
app.get('/api/support-tickets', async (_req, res) => {
    try {
        const [tickets] = await pool.query(
            `SELECT st.*, u.first_name, u.last_name, u.email,
                    so.name AS org_name
             FROM support_tickets st
             JOIN users u ON st.user_id = u.user_id
             LEFT JOIN sponsor_organization so ON st.sponsor_org_id = so.sponsor_org_id
             ORDER BY st.created_at DESC`
        );
        res.json({ tickets });
    } catch (error) {
        console.error('Error fetching all support tickets:', error);
        res.status(500).json({ error: 'Failed to fetch support tickets.' });
    }
});

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

export { app };
