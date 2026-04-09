
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
                        itemId: item.itemId,
                        category: item.categories?.[0]?.categoryName || null,
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

// Helper: Get sponsor_org_id from the appropriate role table (not from users)
async function getSponsorOrgId(userId, userType) {
    if (userType === 'driver') {
        const [rows] = await pool.query(
            'SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = "active" AND is_archived = 0',
            [userId]
        );
        return rows.length > 0 ? rows[0].sponsor_org_id : null;
    } else if (userType === 'sponsor') {
        const [rows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [userId]
        );
        return rows.length > 0 ? rows[0].sponsor_org_id : null;
    }
    return null;
}

// Maps common CSV header variants onto the fields our importer understands.
const DRIVER_IMPORT_HEADER_ALIASES = {
    firstname: 'firstName',
    lastname: 'lastName',
    email: 'email',
    username: 'username',
    password: 'password',
    phonenumber: 'phoneNumber',
    phone: 'phoneNumber',
    mobile: 'phoneNumber',
};

const DRIVER_IMPORT_REQUIRED_HEADERS = ['firstName', 'lastName', 'email'];
const DRIVER_IMPORT_MAX_ROWS = 250;

// Normalizes header text so variants like "first_name" and "First Name" map the same way.
function normalizeCsvHeader(header) {
    return String(header || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

// Parses raw CSV text into rows while still handling quoted commas and line breaks.
function parseCsvText(text) {
    const input = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let value = '';
    let inQuotes = false;

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        const nextChar = input[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                value += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(value);
            value = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                index += 1;
            }
            row.push(value);
            rows.push(row);
            row = [];
            value = '';
            continue;
        }

        value += char;
    }

    if (inQuotes) {
        throw new Error('CSV contains an unterminated quoted field.');
    }

    row.push(value);
    rows.push(row);

    return rows.filter(currentRow => currentRow.some(cell => String(cell || '').trim() !== ''));
}

// Uses a lightweight check to catch obviously invalid email values before DB work starts.
function isLikelyEmail(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return false;

    const parts = trimmed.split('@');
    if (parts.length !== 2) return false;

    return parts[0].length > 0 &&
        parts[1].includes('.') &&
        !parts[1].startsWith('.') &&
        !parts[1].endsWith('.');
}

// Formats 10-digit phone numbers into the same display format the app already uses.
function formatPhoneNumber(value) {
    const digitsOnly = String(value || '').replace(/\D/g, '');
    if (!digitsOnly) return null;
    if (digitsOnly.length !== 10) return null;

    return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 10)}`;
}

// Converts uploaded usernames into the lowercase underscore format we store in the DB.
function sanitizeUsername(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

// Builds a strong placeholder password for accounts that still need to finish onboarding.
function generateTemporaryPassword() {
    const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lowercase = 'abcdefghijkmnopqrstuvwxyz';
    const digits = '23456789';
    const special = '!@#$%^&*';
    const allChars = uppercase + lowercase + digits + special;
    const chars = [
        uppercase[crypto.randomInt(0, uppercase.length)],
        lowercase[crypto.randomInt(0, lowercase.length)],
        digits[crypto.randomInt(0, digits.length)],
        special[crypto.randomInt(0, special.length)],
    ];

    while (chars.length < 12) {
        chars.push(allChars[crypto.randomInt(0, allChars.length)]);
    }

    for (let index = chars.length - 1; index > 0; index -= 1) {
        const swapIndex = crypto.randomInt(0, index + 1);
        [chars[index], chars[swapIndex]] = [chars[swapIndex], chars[index]];
    }

    return chars.join('');
}

// Finds an unused username by checking both this CSV batch and the existing users table.
async function findAvailableUsername(connection, desiredBase, reservedUsernames = new Set()) {
    let base = sanitizeUsername(desiredBase);
    if (!base || base.length < 3) {
        base = `driver_${crypto.randomInt(1000, 10000)}`;
    }

    let candidate = base;
    let suffix = 1;

    while (true) {
        const normalizedCandidate = candidate.toLowerCase();
        if (!reservedUsernames.has(normalizedCandidate)) {
            const [rows] = await connection.query(
                'SELECT user_id FROM users WHERE username = ? LIMIT 1',
                [candidate]
            );

            if (rows.length === 0) {
                return candidate;
            }
        }

        suffix += 1;
        candidate = `${base}_${suffix}`;
    }
}

// Creates the password reset token we reuse for onboarding links and normal resets.
async function createPasswordResetToken(userId, connection = pool) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await connection.query(
        'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [userId, token, expiresAt]
    );

    return { token, expiresAt };
}

// Creates a consistent error object so helper functions can bubble clean 4xx responses back up.
function createHttpError(status, message, details = {}) {
    const error = new Error(message);
    error.status = status;
    Object.assign(error, details);
    return error;
}

// Treats rows with only empty cells as blank so they can be skipped cleanly.
function isNonEmptyCsvRow(row) {
    return row.some(cell => String(cell || '').trim() !== '');
}

// Shapes failed row results so the modal can render them the same way every time.
function buildFailedImportResult(baseResult, errorMessage) {
    return {
        ...baseResult,
        status: 'failed',
        error: errorMessage,
    };
}

// Confirms the acting user can import into this organization and returns the org record.
async function authorizeOrganizationImport(requestingUserId, sponsorOrgId) {
    const [requesterRows] = await pool.query(
        'SELECT user_id, user_type FROM users WHERE user_id = ?',
        [requestingUserId]
    );

    if (requesterRows.length === 0) {
        throw createHttpError(404, 'Requesting user not found');
    }

    const requester = requesterRows[0];
    if (!['admin', 'sponsor'].includes(requester.user_type)) {
        throw createHttpError(403, 'Only sponsors and admins can import organization users');
    }

    if (requester.user_type === 'sponsor') {
        const [sponsorRows] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [requestingUserId]
        );

        if (
            sponsorRows.length === 0 ||
            Number(sponsorRows[0].sponsor_org_id) !== Number(sponsorOrgId)
        ) {
            throw createHttpError(403, 'Sponsors can only import users into their own organization');
        }
    }

    const [organizationRows] = await pool.query(
        'SELECT sponsor_org_id, name FROM sponsor_organization WHERE sponsor_org_id = ?',
        [sponsorOrgId]
    );

    if (organizationRows.length === 0) {
        throw createHttpError(404, 'Organization not found');
    }

    return organizationRows[0];
}

// Parses the upload once and validates the shared CSV rules before we touch any data rows.
function parseOrganizationImportCsv(csvText) {
    let parsedRows;

    try {
        parsedRows = parseCsvText(csvText);
    } catch (error) {
        throw createHttpError(400, error.message);
    }

    if (parsedRows.length < 2) {
        throw createHttpError(400, 'CSV must include a header row and at least one user row');
    }

    const rawHeaders = parsedRows[0];
    const headers = rawHeaders.map(
        header => DRIVER_IMPORT_HEADER_ALIASES[normalizeCsvHeader(header)] || null
    );
    const duplicateHeaders = [...new Set(
        headers.filter((header, index) => header && headers.indexOf(header) !== index)
    )];

    if (duplicateHeaders.length > 0) {
        throw createHttpError(
            400,
            `CSV contains duplicate supported headers: ${duplicateHeaders.join(', ')}`
        );
    }

    const missingHeaders = DRIVER_IMPORT_REQUIRED_HEADERS.filter(header => !headers.includes(header));
    if (missingHeaders.length > 0) {
        throw createHttpError(
            400,
            `CSV is missing required headers: ${missingHeaders.join(', ')}`
        );
    }

    const dataRows = parsedRows.slice(1);
    const nonEmptyDataRows = dataRows.filter(isNonEmptyCsvRow);

    if (nonEmptyDataRows.length === 0) {
        throw createHttpError(400, 'CSV does not contain any user rows');
    }

    if (nonEmptyDataRows.length > DRIVER_IMPORT_MAX_ROWS) {
        throw createHttpError(
            400,
            `CSV import is limited to ${DRIVER_IMPORT_MAX_ROWS} rows at a time`
        );
    }

    return { headers, dataRows };
}

// Maps one raw CSV row onto the normalized field names used by the importer.
function mapOrganizationImportRow(headers, row) {
    const rowData = {};

    headers.forEach((header, index) => {
        if (header) {
            rowData[header] = String(row[index] || '').trim();
        }
    });

    return rowData;
}

// Builds the shared result shape the UI uses for both imported and failed rows.
function createImportBaseResult(rowData, rowNumber, userRole) {
    return {
        rowNumber,
        firstName: String(rowData.firstName || '').trim(),
        lastName: String(rowData.lastName || '').trim(),
        email: String(rowData.email || '').trim().toLowerCase(),
        userRole,
    };
}

// Validates and normalizes one CSV row before any inserts or uniqueness checks run.
function prepareOrganizationImportRow(rowData, baseResult, reservedEmails, reservedUsernames) {
    const { firstName, lastName, email } = baseResult;

    if (!firstName || !lastName || !email) {
        throw createHttpError(
            400,
            'firstName, lastName, and email are required',
            { result: baseResult }
        );
    }

    if (!isLikelyEmail(email)) {
        throw createHttpError(400, 'Email address is not valid', { result: baseResult });
    }

    if (reservedEmails.has(email)) {
        throw createHttpError(
            400,
            'This email appears more than once in the CSV',
            { result: baseResult }
        );
    }

    const rawPhoneNumber = String(rowData.phoneNumber || '').trim();
    const formattedPhoneNumber = rawPhoneNumber ? formatPhoneNumber(rawPhoneNumber) : null;
    if (rawPhoneNumber && !formattedPhoneNumber) {
        throw createHttpError(
            400,
            'Phone number must contain exactly 10 digits',
            { result: baseResult }
        );
    }

    const providedPassword = String(rowData.password || '').trim();
    const needsOnboarding = !providedPassword;
    const passwordToStore = providedPassword || generateTemporaryPassword();
    if (providedPassword && !isPasswordComplex(passwordToStore)) {
        throw createHttpError(
            400,
            'Password must meet the app complexity rules',
            { result: baseResult }
        );
    }

    const providedUsername = sanitizeUsername(rowData.username);
    if (rowData.username && providedUsername.length < 3) {
        throw createHttpError(
            400,
            'Username must be at least 3 characters after normalization',
            { result: baseResult }
        );
    }

    if (providedUsername && reservedUsernames.has(providedUsername.toLowerCase())) {
        throw createHttpError(
            400,
            'This username appears more than once in the CSV',
            { result: baseResult }
        );
    }

    return {
        baseResult,
        firstName,
        lastName,
        email,
        formattedPhoneNumber,
        needsOnboarding,
        passwordToStore,
        providedUsername,
        usernameSeed: rowData.email?.split('@')[0] || `${firstName}_${lastName}`,
    };
}

// Reuses a provided username when valid, otherwise generates the next available username.
async function resolveImportedUsername(connection, preparedRow, reservedUsernames) {
    if (preparedRow.providedUsername) {
        const [existingUsernameRows] = await connection.query(
            'SELECT user_id FROM users WHERE username = ? LIMIT 1',
            [preparedRow.providedUsername]
        );

        if (existingUsernameRows.length > 0) {
            throw createHttpError(
                400,
                'A user with this username already exists',
                { result: preparedRow.baseResult }
            );
        }

        return preparedRow.providedUsername;
    }

    return findAvailableUsername(connection, preparedRow.usernameSeed, reservedUsernames);
}

// Inserts the new user into the role-specific organization table after the base user record is created.
async function insertOrganizationMembership(connection, userId, sponsorOrgId, userRole, requestingUserId) {
    if (userRole === 'driver') {
        await connection.query('INSERT IGNORE INTO driver_user (user_id) VALUES (?)', [userId]);
        return connection.query(
            `INSERT INTO driver_sponsor (driver_user_id, sponsor_org_id, driver_status, affilated_at)
             VALUES (?, ?, 'active', NOW())
             ON DUPLICATE KEY UPDATE driver_status = 'active', affilated_at = NOW(), dropped_at = NULL, drop_reason = NULL, is_archived = 0`,
            [userId, sponsorOrgId]
        );
    }

    return connection.query(
        'INSERT INTO sponsor_user (user_id, sponsor_org_id, created_by_user_id) VALUES (?, ?, ?)',
        [userId, sponsorOrgId, requestingUserId]
    );
}

// Builds the frontend password setup link that imported users can follow to finish onboarding.
function createOnboardingPath(token) {
    return `/password-reset?token=${encodeURIComponent(token)}&mode=onboarding`;
}

// Creates onboarding details only for imports where the CSV did not provide a password.
async function createOnboardingDetails(connection, userId, needsOnboarding) {
    if (!needsOnboarding) {
        return {
            onboardingToken: null,
            onboardingPath: null,
        };
    }

    const { token } = await createPasswordResetToken(userId, connection);
    return {
        onboardingToken: token,
        onboardingPath: createOnboardingPath(token),
    };
}

// Imports one row inside its own transaction so a single bad record does not cancel the whole file.
async function importOrganizationUserRow({
    connection,
    preparedRow,
    sponsorOrgId,
    userRole,
    requestingUserId,
    reservedUsernames,
}) {
    await connection.beginTransaction();

    try {
        const [existingEmailRows] = await connection.query(
            'SELECT user_id FROM users WHERE email = ? LIMIT 1',
            [preparedRow.email]
        );

        if (existingEmailRows.length > 0) {
            throw createHttpError(
                400,
                'A user with this email already exists',
                { result: preparedRow.baseResult }
            );
        }

        const username = await resolveImportedUsername(
            connection,
            preparedRow,
            reservedUsernames
        );
        const passwordHash = hashPassword(preparedRow.passwordToStore);
        const [userInsertResult] = await connection.query(
            `INSERT INTO users
                (first_name, last_name, phone_number, email, username, password_hash, user_type)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                preparedRow.firstName,
                preparedRow.lastName,
                preparedRow.formattedPhoneNumber,
                preparedRow.email,
                username,
                passwordHash,
                userRole,
            ]
        );

        await insertOrganizationMembership(
            connection,
            userInsertResult.insertId,
            sponsorOrgId,
            userRole,
            requestingUserId
        );

        const { onboardingToken, onboardingPath } = await createOnboardingDetails(
            connection,
            userInsertResult.insertId,
            preparedRow.needsOnboarding
        );

        await connection.commit();

        return {
            ...preparedRow.baseResult,
            status: 'imported',
            user_id: userInsertResult.insertId,
            username,
            onboardingToken,
            onboardingPath,
        };
    } catch (error) {
        try {
            await connection.rollback();
        } catch (rollbackError) {
            console.error('Failed rolling back organization import row:', rollbackError);
        }

        if (!error.result) {
            error.result = preparedRow.baseResult;
        }

        throw error;
    }
}

// Converts row-level exceptions into the simpler messages shown in the import results table.
function formatImportRowError(error) {
    if (error?.status && error?.message) {
        return error.message;
    }

    if (error?.message?.includes('Duplicate entry')) {
        return 'A user with this email or username already exists';
    }

    return 'Failed to import this user row';
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

app.get('/api/organization/:orgId/drivers', async (req, res) => {
    const { orgId } = req.params;
    const { dateRange, driverId } = req.query;
    try {
        let query = `SELECT du.user_id, du.created_at, u.username,
                            ds.sponsor_org_id, ds.driver_status, ds.current_points_balance,
                            ds.affilated_at, ds.dropped_at, ds.drop_reason
                     FROM driver_user du
                     JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
                     JOIN users u ON du.user_id = u.user_id`
        const params = []
        const conditions = ['ds.is_archived = 0'];

        if (orgId && orgId !== 'undefined' && orgId !== 'null' && orgId !== "All") {
            conditions.push("ds.sponsor_org_id = ?");
            params.push(orgId);
        }

        if (driverId && driverId !== 'undefined' && driverId !== 'null' && driverId !== "All") {
                conditions.push("du.user_id = ?");
                params.push(driverId);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);

            if (fromDate && toDate) {
                conditions.push('du.created_at >= ? AND du.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            }
            else if (fromDate) {
                conditions.push('du.created_at >= ? AND du.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            }
            else if (toDate) {
                conditions.push('du.created_at >= ? AND du.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

            if (conditions.length > 0) {
                query += " WHERE " + conditions.join(' AND ');
            }

            const [drivers] = await pool.query(query, params);
            res.json({ drivers })
    } catch (error) {
        console.log("failed");
        console.error('Error fetching org drivers:', error);
        res.status(500).json({ error: 'Failed to fetch org drivers' });
    }
});

//-- Driver Application Route ---
app.get('/api/application/organization/:org_id', async (req, res) => {
    const { org_id } = req.params;
    const { dateRange, status } = req.query;
    try {
        let query = 'SELECT * FROM driver_applications';
        const params = [];
        const conditions = [];

        if (org_id && org_id !== 'undefined' && org_id !== 'null' && org_id !== 'All') {
            conditions.push("sponsor_org_id = ?");
            params.push(org_id);
        }

        if (status && status !== 'undefined') {
            conditions.push("status = ?");
            params.push(status);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);

            if (fromDate && toDate) {
                conditions.push('applied_at >= ? AND applied_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } 
            else if (fromDate) {
                conditions.push('applied_at >= ? AND applied_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } 
            else if (toDate) {
                conditions.push('applied_at >= ? AND applied_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
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
                const [reviewerRows] = await pool.query('SELECT first_name, last_name FROM users WHERE user_id = ?', [user_id]);
                const reviewerName = reviewerRows.length > 0
                    ? `${reviewerRows[0].first_name} ${reviewerRows[0].last_name}`
                    : 'a sponsor';
                let msg;
                if (status === 'approved') {
                    msg = `Your application to join ${orgName} was approved by ${reviewerName}.`;
                    await pool.query(
                        `INSERT INTO driver_sponsor (driver_user_id, sponsor_org_id, driver_status, affilated_at)
                         VALUES (?, ?, 'active', NOW())
                         ON DUPLICATE KEY UPDATE driver_status = 'active', affilated_at = NOW(), dropped_at = NULL, drop_reason = NULL, is_archived = 0`,
                        [driver_user_id, sponsor_org_id]
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

// Allows a driver to withdraw a pending application before it has been reviewed
app.delete('/api/application/:application_id', async (req, res) => {
    const { application_id } = req.params;
    try {
        // Only withdraw if still pending — prevents canceling already-reviewed applications
        const [result] = await pool.query(
            'UPDATE driver_applications SET status = "withdrawn" WHERE application_id = ? AND status = "pending"',
            [application_id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ message: 'Application not found or already reviewed' });
        }
        res.json({ message: 'Application withdrawn successfully' });
    } catch (error) {
        console.error('Error withdrawing application:', error);
        res.status(500).json({ error: 'Failed to withdraw application' });
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
        const [[{ driverCount }]] = await pool.query(
            'SELECT COUNT(*) AS driverCount FROM driver_sponsor WHERE sponsor_org_id = ? AND driver_status = "active"',
            [sponsor_org_id]
        );
        const [[{ sponsorCount }]] = await pool.query(
            'SELECT COUNT(*) AS sponsorCount FROM sponsor_user WHERE sponsor_org_id = ?',
            [sponsor_org_id]
        );
        const count = Number(driverCount) + Number(sponsorCount);
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
            `SELECT u.*, ds.current_points_balance AS points
             FROM users u
             JOIN driver_user du ON u.user_id = du.user_id
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id AND ds.sponsor_org_id = ? AND ds.driver_status = 'active' AND ds.is_archived = 0
             UNION
             SELECT u.*, NULL AS points
             FROM users u
             JOIN sponsor_user su ON u.user_id = su.user_id AND su.sponsor_org_id = ?`,
            [sponsor_org_id, sponsor_org_id]
        );
        res.json({ message: 'Organization users retrieved successfully', users });
    } catch (error) {
        console.error('Error fetching organization users:', error);
        res.status(500).json({ error: 'Failed to fetch organization users' });
    }
});

// Imports driver or sponsor accounts into an organization from a CSV upload.
const importOrganizationUsersFromCsv = async (req, res) => {
    const { sponsor_org_id } = req.params;
    const { requestingUserId, userRole = 'driver', csvText } = req.body;
    const normalizedUserRole = String(userRole || '').trim().toLowerCase();

    if (!requestingUserId) {
        return res.status(400).json({ error: 'requestingUserId is required' });
    }

    if (!['driver', 'sponsor'].includes(normalizedUserRole)) {
        return res.status(400).json({ error: 'userRole must be "driver" or "sponsor"' });
    }

    if (!csvText || !String(csvText).trim()) {
        return res.status(400).json({ error: 'csvText is required' });
    }

    try {
        // Load the organization once, then reuse the parsed CSV metadata for every row.
        const organization = await authorizeOrganizationImport(requestingUserId, sponsor_org_id);
        const { headers, dataRows } = parseOrganizationImportCsv(csvText);

        const results = [];
        const reservedEmails = new Set();
        const reservedUsernames = new Set();
        let importedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        const connection = await pool.getConnection();

        try {
            for (let rowIndex = 0; rowIndex < dataRows.length; rowIndex += 1) {
                const row = dataRows[rowIndex];
                const rowNumber = rowIndex + 2;

                if (!isNonEmptyCsvRow(row)) {
                    skippedCount += 1;
                    continue;
                }

                const rowData = mapOrganizationImportRow(headers, row);
                const baseResult = createImportBaseResult(
                    rowData,
                    rowNumber,
                    normalizedUserRole
                );

                try {
                    // Validate the row first, then let the transaction helper handle DB writes.
                    const preparedRow = prepareOrganizationImportRow(
                        rowData,
                        baseResult,
                        reservedEmails,
                        reservedUsernames
                    );
                    const importedResult = await importOrganizationUserRow({
                        connection,
                        preparedRow,
                        sponsorOrgId: sponsor_org_id,
                        userRole: normalizedUserRole,
                        requestingUserId,
                        reservedUsernames,
                    });

                    reservedEmails.add(importedResult.email);
                    reservedUsernames.add(importedResult.username.toLowerCase());
                    importedCount += 1;
                    results.push(importedResult);
                } catch (rowError) {
                    failedCount += 1;
                    results.push(
                        buildFailedImportResult(
                            rowError.result || baseResult,
                            formatImportRowError(rowError)
                        )
                    );
                }
            }
        } finally {
            connection.release();
        }

        res.json({
            message: `Imported ${importedCount} ${normalizedUserRole} user(s)`,
            organization_name: organization.name,
            importedRole: normalizedUserRole,
            importedCount,
            failedCount,
            skippedCount,
            results,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }

        console.error('Error importing organization users from CSV:', error);
        res.status(500).json({ error: 'Failed to import users' });
    }
};

app.post('/api/organization/:sponsor_org_id/users/import', importOrganizationUsersFromCsv);
app.post('/api/organization/:sponsor_org_id/drivers/import', importOrganizationUsersFromCsv);

// --- Pipe-delimited Bulk Upload ---

// Parses pipe-delimited file text into structured line objects.
function parsePipeDelimitedLines(fileText) {
    const rawLines = String(fileText).replace(/^\uFEFF/, '').split(/\r?\n/);
    const parsed = [];

    for (let i = 0; i < rawLines.length; i++) {
        const trimmed = rawLines[i].trim();
        if (!trimmed) continue;

        const fields = trimmed.split('|');
        parsed.push({
            lineNumber: i + 1,
            type: (fields[0] || '').trim().toUpperCase(),
            orgName: (fields[1] || '').trim(),
            firstName: (fields[2] || '').trim(),
            lastName: (fields[3] || '').trim(),
            email: (fields[4] || '').trim().toLowerCase(),
            points: (fields[5] || '').trim(),
            reason: (fields[6] || '').trim(),
        });
    }

    return parsed;
}

// Validates a single parsed pipe-delimited line and returns errors/warnings.
function validateBulkLine(line, requesterType) {
    const warnings = [];

    if (!['O', 'D', 'S'].includes(line.type)) {
        return { valid: false, error: `Invalid type "${line.type}". Must be O, D, or S.` };
    }

    if (line.type === 'O') {
        if (requesterType === 'sponsor') {
            return { valid: false, error: 'Sponsors cannot use the "O" (Organization) type.' };
        }
        if (!line.orgName) {
            return { valid: false, error: 'Organization name is required for "O" type lines.' };
        }
        return { valid: true, warnings };
    }

    // D or S type
    if (!line.firstName || !line.lastName || !line.email) {
        return { valid: false, error: 'First name, last name, and email are required for D/S lines.' };
    }

    if (!isLikelyEmail(line.email)) {
        return { valid: false, error: 'Email address is not valid.' };
    }

    if (requesterType === 'sponsor' && line.orgName) {
        warnings.push('Organization name ignored for sponsor upload.');
    }

    if (line.type === 'S' && line.points) {
        warnings.push('Points cannot be assigned to sponsor users; ignoring points.');
    }

    if (line.points) {
        const pointsNum = Number(line.points);
        if (!Number.isInteger(pointsNum) || pointsNum <= 0) {
            return { valid: false, error: 'Points must be a positive integer.' };
        }
        if (!line.reason) {
            return { valid: false, error: 'Reason is required when points are provided.' };
        }
    }

    return { valid: true, warnings };
}

// Pass 1: Process all O (Organization) lines - create or resolve orgs.
async function processBulkOrgLines(connection, oLines, results) {
    const orgMap = new Map(); // orgName (lowercase) → { sponsor_org_id, name }
    let orgsCreated = 0;

    for (const line of oLines) {
        const nameLower = line.orgName.toLowerCase();

        // Check if already resolved in this batch
        if (orgMap.has(nameLower)) {
            results.push({
                lineNumber: line.lineNumber,
                status: 'imported',
                type: 'O',
                orgName: line.orgName,
                message: 'Organization already resolved in this file.',
                warnings: [],
            });
            continue;
        }

        try {
            // Check DB for existing org
            const [existingRows] = await connection.query(
                'SELECT sponsor_org_id, name FROM sponsor_organization WHERE LOWER(name) = ?',
                [nameLower]
            );

            if (existingRows.length > 0) {
                orgMap.set(nameLower, existingRows[0]);
                results.push({
                    lineNumber: line.lineNumber,
                    status: 'imported',
                    type: 'O',
                    orgName: existingRows[0].name,
                    message: 'Organization already exists.',
                    warnings: [],
                });
            } else {
                const [insertResult] = await connection.query(
                    'INSERT INTO sponsor_organization (name, point_value) VALUES (?, 1)',
                    [line.orgName]
                );
                const newOrg = { sponsor_org_id: insertResult.insertId, name: line.orgName };
                orgMap.set(nameLower, newOrg);
                orgsCreated += 1;
                results.push({
                    lineNumber: line.lineNumber,
                    status: 'imported',
                    type: 'O',
                    orgName: line.orgName,
                    message: 'Organization created.',
                    warnings: [],
                });
            }
        } catch (err) {
            results.push({
                lineNumber: line.lineNumber,
                status: 'failed',
                type: 'O',
                orgName: line.orgName,
                error: err.message || 'Failed to process organization line.',
                warnings: [],
            });
        }
    }

    return { orgMap, orgsCreated };
}

// Pass 2: Process a single D or S line inside its own transaction.
async function processBulkUserLine({
    connection,
    line,
    orgMap,
    callerOrgId,
    requesterType,
    requestingUserId,
    reservedEmails,
    reservedUsernames,
    warnings,
}) {
    await connection.beginTransaction();

    try {
        // Resolve target organization
        let targetOrgId;
        let targetOrgName;

        if (requesterType === 'sponsor') {
            targetOrgId = callerOrgId;
            // Org name is ignored for sponsors (warning already added in validation)
            const [orgRows] = await connection.query(
                'SELECT name FROM sponsor_organization WHERE sponsor_org_id = ?',
                [callerOrgId]
            );
            targetOrgName = orgRows.length > 0 ? orgRows[0].name : '';
        } else {
            // Admin: resolve org by name
            if (!line.orgName) {
                throw createHttpError(400, 'Organization name is required for admin bulk upload.');
            }
            const nameLower = line.orgName.toLowerCase();
            const fromMap = orgMap.get(nameLower);
            if (fromMap) {
                targetOrgId = fromMap.sponsor_org_id;
                targetOrgName = fromMap.name;
            } else {
                // Check DB
                const [orgRows] = await connection.query(
                    'SELECT sponsor_org_id, name FROM sponsor_organization WHERE LOWER(name) = ?',
                    [nameLower]
                );
                if (orgRows.length === 0) {
                    throw createHttpError(400, `Organization "${line.orgName}" not found. Create it with an "O" line first.`);
                }
                targetOrgId = orgRows[0].sponsor_org_id;
                targetOrgName = orgRows[0].name;
            }
        }

        // Check for duplicate email in this batch
        if (reservedEmails.has(line.email)) {
            throw createHttpError(400, 'This email appears more than once in the file.');
        }

        // Check if user already exists
        const [existingUsers] = await connection.query(
            'SELECT user_id, user_type FROM users WHERE email = ? LIMIT 1',
            [line.email]
        );

        let userId;
        let username = null;
        let onboardingPath = null;
        let isNewUser = false;
        let pointsAdded = null;

        if (existingUsers.length > 0) {
            // User already exists
            userId = existingUsers[0].user_id;
            const existingType = existingUsers[0].user_type;

            if (line.type === 'S') {
                // Sponsor already exists so skip creation
                await connection.commit();
                return {
                    lineNumber: line.lineNumber,
                    status: 'imported',
                    type: 'S',
                    orgName: targetOrgName,
                    firstName: line.firstName,
                    lastName: line.lastName,
                    email: line.email,
                    username: null,
                    pointsAdded: null,
                    onboardingPath: null,
                    message: 'Sponsor user already exists.',
                    warnings,
                };
            }

            // D type: existing user
            if (existingType === 'driver') {
                // Check if already in this org
                const [driverRows] = await connection.query(
                    'SELECT driver_user_id FROM driver_sponsor WHERE driver_user_id = ? AND sponsor_org_id = ? AND driver_status = ?',
                    [userId, targetOrgId, 'active']
                );

                if (driverRows.length === 0) {
                    // Not in this org yet so add membership (auto-accept)
                    await connection.query('INSERT IGNORE INTO driver_user (user_id) VALUES (?)', [userId]);
                    await connection.query(
                        `INSERT INTO driver_sponsor (driver_user_id, sponsor_org_id, driver_status, affilated_at)
                         VALUES (?, ?, 'active', NOW())
                         ON DUPLICATE KEY UPDATE driver_status = 'active', affilated_at = NOW(), dropped_at = NULL, drop_reason = NULL, is_archived = 0`,
                        [userId, targetOrgId]
                    );
                }

                // Add points if provided
                if (line.points && line.type !== 'S') {
                    const pointsNum = Number(line.points);
                    await connection.query(
                        'INSERT INTO point_transactions (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
                        [userId, targetOrgId, pointsNum, line.reason, 'bulk_upload', requestingUserId]
                    );
                    pointsAdded = pointsNum;
                }

                await connection.commit();
                return {
                    lineNumber: line.lineNumber,
                    status: 'imported',
                    type: 'D',
                    orgName: targetOrgName,
                    firstName: line.firstName,
                    lastName: line.lastName,
                    email: line.email,
                    username: null,
                    pointsAdded,
                    onboardingPath: null,
                    message: 'Existing driver updated.',
                    warnings,
                };
            }

            // Existing user is not a driver so error
            throw createHttpError(400, `User with this email already exists as "${existingType}" and cannot be added as a driver.`);
        }

        // New user: create them
        isNewUser = true;
        const userType = line.type === 'S' ? 'sponsor' : 'driver';
        const tempPassword = generateTemporaryPassword();
        const passwordHash = hashPassword(tempPassword);
        const usernameSeed = line.email.split('@')[0] || `${line.firstName}_${line.lastName}`;
        username = await findAvailableUsername(connection, usernameSeed, reservedUsernames);

        const [userInsert] = await connection.query(
            `INSERT INTO users (first_name, last_name, email, username, password_hash, user_type) VALUES (?, ?, ?, ?, ?, ?)`,
            [line.firstName, line.lastName, line.email, username, passwordHash, userType]
        );
        userId = userInsert.insertId;

        // Insert membership
        await insertOrganizationMembership(connection, userId, targetOrgId, userType, requestingUserId);

        // Create onboarding token
        const { token } = await createPasswordResetToken(userId, connection);
        onboardingPath = createOnboardingPath(token);

        // Add points for drivers if provided (and not sponsor type)
        if (line.points && line.type === 'D') {
            const pointsNum = Number(line.points);
            await connection.query(
                'INSERT INTO point_transactions (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, targetOrgId, pointsNum, line.reason, 'bulk_upload', requestingUserId]
            );
            pointsAdded = pointsNum;
        }

        await connection.commit();

        return {
            lineNumber: line.lineNumber,
            status: 'imported',
            type: line.type,
            orgName: targetOrgName,
            firstName: line.firstName,
            lastName: line.lastName,
            email: line.email,
            username,
            pointsAdded,
            onboardingPath,
            message: isNewUser ? 'User created.' : 'User updated.',
            warnings,
        };
    } catch (err) {
        try { await connection.rollback(); } catch (rbErr) {
            console.error('Failed rolling back bulk upload row:', rbErr);
        }
        throw err;
    }
}

// Main handler for pipe-delimited bulk upload.
const importUsersFromPipeFile = async (req, res) => {
    const { sponsor_org_id } = req.params;
    const { requestingUserId, fileText } = req.body;

    if (!requestingUserId) {
        return res.status(400).json({ error: 'requestingUserId is required' });
    }
    if (!fileText || !String(fileText).trim()) {
        return res.status(400).json({ error: 'fileText is required' });
    }

    try {
        // Determine requester type
        const [requesterRows] = await pool.query(
            'SELECT user_type FROM users WHERE user_id = ?',
            [requestingUserId]
        );
        if (requesterRows.length === 0) {
            return res.status(404).json({ error: 'Requesting user not found' });
        }
        const requesterType = requesterRows[0].user_type;

        if (!['admin', 'sponsor'].includes(requesterType)) {
            return res.status(403).json({ error: 'Only sponsors and admins can bulk upload users' });
        }

        // Sponsors must target their own org; admins specify orgs in the file
        if (requesterType === 'sponsor') {
            await authorizeOrganizationImport(requestingUserId, sponsor_org_id);
        }

        // Parse
        const lines = parsePipeDelimitedLines(fileText);
        if (lines.length === 0) {
            return res.status(400).json({ error: 'File contains no data lines.' });
        }

        const results = [];
        let importedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

        // Validate all lines first
        const validatedLines = [];
        for (const line of lines) {
            const validation = validateBulkLine(line, requesterType);
            if (!validation.valid) {
                failedCount += 1;
                results.push({
                    lineNumber: line.lineNumber,
                    status: 'failed',
                    type: line.type || '?',
                    orgName: line.orgName,
                    firstName: line.firstName,
                    lastName: line.lastName,
                    email: line.email,
                    error: validation.error,
                    warnings: [],
                });
            } else {
                validatedLines.push({ line, warnings: validation.warnings });
            }
        }

        // Separate O lines from D/S lines
        const oEntries = validatedLines.filter(e => e.line.type === 'O');
        const userEntries = validatedLines.filter(e => e.line.type !== 'O');

        const connection = await pool.getConnection();

        try {
            // Pass 1: Process organizations
            const { orgMap } = await processBulkOrgLines(
                connection,
                oEntries.map(e => e.line),
                results
            );
            // Count O results (only those added by processBulkOrgLines, not validation failures)
            const validationFailCount = failedCount;
            for (let i = validationFailCount; i < results.length; i++) {
                if (results[i].type === 'O' && results[i].status === 'imported') importedCount += 1;
                else if (results[i].type === 'O' && results[i].status === 'failed') failedCount += 1;
            }

            // Pass 2: Process D/S lines
            const reservedEmails = new Set();
            const reservedUsernames = new Set();

            for (const entry of userEntries) {
                try {
                    const result = await processBulkUserLine({
                        connection,
                        line: entry.line,
                        orgMap,
                        callerOrgId: sponsor_org_id,
                        requesterType,
                        requestingUserId,
                        reservedEmails,
                        reservedUsernames,
                        warnings: entry.warnings,
                    });

                    if (result.email) reservedEmails.add(result.email);
                    if (result.username) reservedUsernames.add(result.username.toLowerCase());
                    importedCount += 1;
                    results.push(result);
                } catch (rowErr) {
                    failedCount += 1;
                    results.push({
                        lineNumber: entry.line.lineNumber,
                        status: 'failed',
                        type: entry.line.type,
                        orgName: entry.line.orgName,
                        firstName: entry.line.firstName,
                        lastName: entry.line.lastName,
                        email: entry.line.email,
                        error: rowErr.message || 'Failed to process this line.',
                        warnings: entry.warnings,
                    });
                }
            }
        } finally {
            connection.release();
        }

        // Sort results by line number
        results.sort((a, b) => a.lineNumber - b.lineNumber);

        res.json({
            message: `Processed ${importedCount} line(s) successfully.`,
            importedCount,
            failedCount,
            skippedCount,
            results,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ error: error.message });
        }
        console.error('Error in bulk upload:', error);
        res.status(500).json({ error: 'Failed to process bulk upload.' });
    }
};

app.post('/api/organization/:sponsor_org_id/users/bulk-import', importUsersFromPipeFile);
app.post('/api/admin/users/bulk-import', importUsersFromPipeFile);

// GET /api/organization/:sponsor_org_id/monthly-redeemed-points — total points redeemed via catalog orders this month
app.get('/api/organization/:sponsor_org_id/monthly-redeemed-points', async (req, res) => {
    const { sponsor_org_id } = req.params;
    try {
        // first day of the current month at midnight
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);
        // sum negative order transactions this month, excluding any that have an approved contest
        // (approved contests indicate the points were reversed and should not count as redeemed)
        const [[{ total_redeemed }]] = await pool.query(
            `SELECT COALESCE(SUM(point_amount), 0) AS total_redeemed
             FROM point_transactions
             WHERE sponsor_org_id = ?
               AND source = 'order'
               AND point_amount < 0
               AND created_at >= ?
               AND transaction_id NOT IN (
                   SELECT transaction_id FROM point_contests WHERE status = 'approved'
               )`,
            [sponsor_org_id, monthStart]
        );
        res.json({ total_redeemed: Math.abs(Number(total_redeemed)) });
    } catch (error) {
        console.error('Error fetching monthly redeemed points:', error);
        res.status(500).json({ error: 'Failed to fetch monthly redeemed points' });
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
            let failureReason = 'incorrect password';
            if(shouldLock) {
                failureReason = 'account is locked';
            }
            await pool.query('INSERT INTO login_logs (username, login_date, result, user_id, failure_reason) VALUES (?, NOW(), ?, ?, ?)', [user.username, 'failure', user.user_id, failureReason]);
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
        await pool.query('INSERT INTO login_logs (username, login_date, result, user_id) VALUES (?, NOW(), ?, ?)', [user.username, 'success', user.user_id]);
        
        const sponsor_org_id = await getSponsorOrgId(user.user_id, user.user_type);
        return res.json({ message: 'Login successful', user: { ...userNoPassword, sponsor_org_id } });

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

        const { token } = await createPasswordResetToken(users[0].user_id);

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

        const [user] = await pool.query('SELECT username FROM users WHERE user_id = ?', [tokens[0].user_id]); 
        await pool.query('INSERT INTO password_change_log (user_id, change_type, username) VALUES (?, "reset", ?)', [tokens[0].user_id, user[0].username]);

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
        const [users] = await pool.query('SELECT user_id, email, username, user_type FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(401).json({ loggedIn: false });
        }
        const realUser = users[0];
        const realSponsorOrgId = await getSponsorOrgId(realUser.user_id, realUser.user_type);

        // Check for active impersonation
        const impersonatingId = req.cookies.impersonating;
        if (impersonatingId) {
            const [targetUsers] = await pool.query('SELECT user_id, email, username, user_type FROM users WHERE user_id = ?', [impersonatingId]);
            if (targetUsers.length > 0) {
                const targetUser = targetUsers[0];

                // Re-validate impersonation permissions
                let permitted = false;
                if (realUser.user_type === 'admin' && targetUser.user_type !== 'admin') {
                    permitted = true;
                } else if (realUser.user_type === 'sponsor' && targetUser.user_type === 'driver') {
                    const actorOrgId = await getSponsorOrgId(realUser.user_id, 'sponsor');
                    const targetOrgId = await getSponsorOrgId(targetUser.user_id, 'driver');
                    permitted = actorOrgId && targetOrgId && actorOrgId === targetOrgId;
                }

                if (permitted) {
                    const targetSponsorOrgId = await getSponsorOrgId(targetUser.user_id, targetUser.user_type);
                    return res.json({
                        loggedIn: true,
                        isImpersonating: true,
                        user: { ...targetUser, sponsor_org_id: targetSponsorOrgId },
                        originalUser: { ...realUser, sponsor_org_id: realSponsorOrgId },
                    });
                }
            }
            // Target user gone or permissions revoked — end impersonation
            res.clearCookie('impersonating');
        }

        res.json({ loggedIn: true, user: { ...realUser, sponsor_org_id: realSponsorOrgId } });
    } catch (error) {
        res.status(500).json({ error: 'Session check failed' });
    }
});

// --- Signup Route ---
app.post('/api/signup', async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, email, username, password, userRole, orgId, createdByUserId } = req.body;
        if (!isPasswordComplex(password)) {
            return res.status(400).json({ message: 'Password does not meet complexity requirements.' });
        }
        const passwordHash = hashPassword(password);
        const [result] = await pool.query(
            "INSERT INTO users (first_name, last_name, phone_number, email, username, password_hash, user_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [firstName, lastName, phoneNumber, email, username, passwordHash, userRole],
        );
        const newUserId = result.insertId;

        if (userRole === 'driver') {
            await pool.query('INSERT INTO driver_user (user_id) VALUES (?)', [newUserId]);
            if (orgId) {
                await pool.query(
                    `INSERT INTO driver_sponsor (driver_user_id, sponsor_org_id, driver_status, affilated_at)
                     VALUES (?, ?, 'active', NOW())`,
                    [newUserId, orgId]
                );
            }
        } else if (userRole === 'sponsor') {
            await pool.query(
                'INSERT INTO sponsor_user (user_id, sponsor_org_id, created_by_user_id) VALUES (?, ?, ?)',
                [newUserId, orgId || null, createdByUserId || null]
            );
        }

        res.json({ message: 'Signup successful' });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Server error during signup' });
    }
});

// --- Logout Route ---
app.post('/api/logout', (req, res) => {
    res.clearCookie('remember_me');
    res.clearCookie('impersonating');
    res.json({ message: 'Logged out successfully' });
});

// --- Impersonation Routes ---
// Start impersonation: admin can assume driver/sponsor, sponsor can assume driver in same org
app.post('/api/impersonate', async (req, res) => {
    const realUserId = req.cookies.remember_me || req.body.actorUserId;
    if (!realUserId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { targetUserId } = req.body;
    if (!targetUserId) {
        return res.status(400).json({ error: 'targetUserId is required' });
    }

    try {
        // Get the real (acting) user
        const [actors] = await pool.query('SELECT user_id, username, user_type FROM users WHERE user_id = ?', [realUserId]);
        if (actors.length === 0) {
            return res.status(401).json({ error: 'Actor user not found' });
        }
        const actor = actors[0];

        if (!['admin', 'sponsor'].includes(actor.user_type)) {
            return res.status(403).json({ error: 'Only admins and sponsors can assume identities' });
        }

        // Get the target user
        const [targets] = await pool.query('SELECT user_id, email, username, user_type FROM users WHERE user_id = ?', [targetUserId]);
        if (targets.length === 0) {
            return res.status(404).json({ error: 'Target user not found' });
        }
        const target = targets[0];

        if (target.user_id === actor.user_id) {
            return res.status(400).json({ error: 'Cannot assume your own identity' });
        }

        // Permission checks
        if (actor.user_type === 'admin') {
            if (target.user_type === 'admin') {
                return res.status(403).json({ error: 'Cannot assume identity of another admin' });
            }
        } else if (actor.user_type === 'sponsor') {
            if (target.user_type !== 'driver') {
                return res.status(403).json({ error: 'Sponsors can only assume identity of drivers' });
            }
            // Verify same organization
            const sponsorOrgId = await getSponsorOrgId(actor.user_id, 'sponsor');
            const driverOrgId = await getSponsorOrgId(target.user_id, 'driver');
            if (!sponsorOrgId || !driverOrgId || sponsorOrgId !== driverOrgId) {
                return res.status(403).json({ error: 'Can only assume identity of drivers in your organization' });
            }
        }

        // Set impersonation cookie (4 hour expiry)
        res.cookie('impersonating', target.user_id, {
            maxAge: 4 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
        });

        // Audit log
        await pool.query(
            `INSERT INTO impersonation_log (actor_user_id, actor_username, actor_user_type, target_user_id, target_username, target_user_type, action)
             VALUES (?, ?, ?, ?, ?, ?, 'start')`,
            [actor.user_id, actor.username, actor.user_type, target.user_id, target.username, target.user_type]
        );

        const targetSponsorOrgId = await getSponsorOrgId(target.user_id, target.user_type);
        res.json({ user: { ...target, sponsor_org_id: targetSponsorOrgId } });
    } catch (error) {
        console.error('Impersonation start error:', error);
        res.status(500).json({ error: 'Server error during impersonation' });
    }
});

// Exit impersonation: restore original identity
app.post('/api/impersonate/exit', async (req, res) => {
    const realUserId = req.cookies.remember_me || req.body.actorUserId;
    if (!realUserId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const impersonatedId = req.cookies.impersonating;

    try {
        // Audit log the exit
        if (impersonatedId) {
            const [actors] = await pool.query('SELECT user_id, username, user_type FROM users WHERE user_id = ?', [realUserId]);
            const [targets] = await pool.query('SELECT user_id, username, user_type FROM users WHERE user_id = ?', [impersonatedId]);
            if (actors.length > 0 && targets.length > 0) {
                await pool.query(
                    `INSERT INTO impersonation_log (actor_user_id, actor_username, actor_user_type, target_user_id, target_username, target_user_type, action)
                     VALUES (?, ?, ?, ?, ?, ?, 'exit')`,
                    [actors[0].user_id, actors[0].username, actors[0].user_type, targets[0].user_id, targets[0].username, targets[0].user_type]
                );
            }
        }

        res.clearCookie('impersonating');

        // Return the real user's data
        const [users] = await pool.query('SELECT user_id, email, username, user_type FROM users WHERE user_id = ?', [realUserId]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        const user = users[0];
        const sponsorOrgId = await getSponsorOrgId(user.user_id, user.user_type);
        res.json({ user: { ...user, sponsor_org_id: sponsorOrgId } });
    } catch (error) {
        console.error('Impersonation exit error:', error);
        res.status(500).json({ error: 'Server error during impersonation exit' });
    }
});

// Returns fresh user data for a given user_id, including current sponsor_org_id from the role table
app.get('/api/user/:user_id', async (req, res) => {
    const { user_id } = req.params;
    try {
        const [users] = await pool.query(
            'SELECT user_id, email, username, user_type FROM users WHERE user_id = ?',
            [user_id]
        );
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        const user = users[0];
        const sponsor_org_id = await getSponsorOrgId(user.user_id, user.user_type);
        res.json({ user: { ...user, sponsor_org_id } });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// --- Update User Route ---
app.put('/api/user', async (req, res) => {
    const {user_id, field, value } = req.body;

    if (field === 'sponsor_org_id') {
        return res.status(400).json({ error: 'Use dedicated org membership endpoints to manage organization membership.' });
    }

    try {
        await pool.query(`UPDATE users SET ${field} = ? WHERE user_id = ?`, [value, user_id]);
        res.json({ message: 'User field updated successfully' });
    } catch (error) {
        console.error('Error updating user field:', error);
        res.status(500).json({ error: 'Failed to update user information' });
    }
});

// --- Sponsor Logs Route ---
app.get('/api/logs/password-change-logs/:org_id', async (req, res) => {
    const { org_id } = req.params;
    const { dateRange } = req.query;

    try {
        let query = 'SELECT * FROM password_change_log';
        let params = [];
        let conditions = [];

        if (org_id && org_id !== 'undefined' && org_id !== 'null' && org_id !== 'All') {
            conditions.push("user_id IN (SELECT user_id FROM driver_user WHERE sponsor_org_id = ?)");
            params.push(org_id);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);

            if (fromDate && toDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } 
            else if (fromDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } 
            else if (toDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const [logs] = await pool.query(query, params);

        res.json({ message: "Logs retrieved successfully", logs });
    } catch (error) {
        console.error('Error fetching password change logs:', error);
        res.status(500).json({ error: 'Failed to fetch password change logs' });
    }
});

app.get('/api/logs/login-attempt-logs/:org_id', async (req, res) => {
    const { org_id } = req.params;
    const { dateRange } = req.query;

    try {
        let query = 'SELECT * FROM login_logs';
        let params = [];
        let conditions = [];

        if (org_id && org_id !== 'undefined' && org_id !== 'null' && org_id !== 'All') {
            conditions.push("user_id IN (SELECT user_id FROM driver_user WHERE sponsor_org_id = ?)");
            params.push(org_id);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);

            if (fromDate && toDate) {
                conditions.push('login_date >= ? AND login_date < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } 
            else if (fromDate) {
                conditions.push('login_date >= ? AND login_date < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } 
            else if (toDate) {
                conditions.push('login_date >= ? AND login_date < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const [logs] = await pool.query(query, params);

        res.json({ message: "Logs retrieved successfully", logs });
    } catch (error) {
        console.error('Error fetching login attempt logs:', error);
        res.status(500).json({ error: 'Failed to fetch login attempt logs' });
    }
});

// --- Driver Activity Report ---
app.get('/api/admin/driver-activity', async (req, res) => {
    const { orgId, dateRange } = req.query;

    try {
        let fromDate = null;
        let toDate = null;

        if (dateRange) {
            const parsed = JSON.parse(dateRange);
            fromDate = parsed.fromDate || null;
            toDate = parsed.toDate || fromDate;
        }

        const orgFilterParsed = parseInt(orgId);
        const orgFilter = isNaN(orgFilterParsed) ? null : orgFilterParsed;

        const query = `
            SELECT
                u.user_id, u.username, u.first_name, u.last_name, u.last_login, u.is_active,
                GROUP_CONCAT(DISTINCT so.name SEPARATOR ', ') AS sponsor_names,
                COUNT(DISTINCT CASE WHEN ll.result = 'success' AND (? IS NULL OR (ll.login_date >= ? AND ll.login_date < DATE_ADD(?, INTERVAL 1 DAY))) THEN ll.log_id END) AS successful_logins,
                COUNT(DISTINCT CASE WHEN ll.result = 'failure' AND (? IS NULL OR (ll.login_date >= ? AND ll.login_date < DATE_ADD(?, INTERVAL 1 DAY))) THEN ll.log_id END) AS failed_logins,
                COALESCE(SUM(CASE WHEN (? IS NULL OR (pt.created_at >= ? AND pt.created_at < DATE_ADD(?, INTERVAL 1 DAY))) THEN pt.point_amount END), 0) AS points_in_period,
                COUNT(DISTINCT CASE WHEN (? IS NULL OR (o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY))) THEN o.order_id END) AS orders_in_period
            FROM users u
            JOIN driver_user du ON du.user_id = u.user_id
            LEFT JOIN driver_sponsor ds ON ds.driver_user_id = u.user_id AND (? IS NULL OR ds.sponsor_org_id = ?)
            LEFT JOIN sponsor_organization so ON so.sponsor_org_id = ds.sponsor_org_id
            LEFT JOIN login_logs ll ON ll.user_id = u.user_id
            LEFT JOIN point_transactions pt ON pt.driver_user_id = u.user_id AND (? IS NULL OR pt.sponsor_org_id = ?)
            LEFT JOIN orders o ON o.driver_user_id = u.user_id AND (? IS NULL OR o.sponsor_org_id = ?)
            WHERE (? IS NULL OR ds.sponsor_org_id = ?)
            GROUP BY u.user_id, u.username, u.first_name, u.last_name, u.last_login, u.is_active
            ORDER BY u.last_login DESC
        `;

        const params = [
            fromDate, fromDate, toDate,   // successful_logins date filter
            fromDate, fromDate, toDate,   // failed_logins date filter
            fromDate, fromDate, toDate,   // points_in_period date filter
            fromDate, fromDate, toDate,   // orders_in_period date filter
            orgFilter, orgFilter,         // driver_sponsor join filter
            orgFilter, orgFilter,         // point_transactions join filter
            orgFilter, orgFilter,         // orders join filter
            orgFilter, orgFilter          // WHERE clause filter
        ];

        const [drivers] = await pool.query(query, params);
        res.json({ message: "Driver activity retrieved successfully", drivers });
    } catch (error) {
        console.error('Error fetching driver activity:', error);
        res.status(500).json({ error: 'Failed to fetch driver activity' });
    }
});

// --- Sponsor Activity Report ---
app.get('/api/admin/sponsor-activity', async (req, res) => {
    const { dateRange } = req.query;

    try {
        let fromDate = null;
        let toDate = null;

        if (dateRange) {
            const parsed = JSON.parse(dateRange);
            fromDate = parsed.fromDate || null;
            toDate = parsed.toDate || fromDate;
        }

        const query = `
            SELECT
                so.sponsor_org_id, so.name,
                COUNT(DISTINCT CASE WHEN ds.driver_status = 'active' THEN ds.driver_user_id END) AS active_drivers,
                COALESCE(SUM(CASE WHEN (? IS NULL OR (pt.created_at >= ? AND pt.created_at < DATE_ADD(?, INTERVAL 1 DAY))) THEN pt.point_amount END), 0) AS points_awarded_in_period,
                COUNT(DISTINCT CASE WHEN (? IS NULL OR (o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY))) THEN o.order_id END) AS orders_in_period,
                MAX(u.last_login) AS most_recent_sponsor_login
            FROM sponsor_organization so
            LEFT JOIN driver_sponsor ds ON ds.sponsor_org_id = so.sponsor_org_id
            LEFT JOIN point_transactions pt ON pt.sponsor_org_id = so.sponsor_org_id
            LEFT JOIN orders o ON o.sponsor_org_id = so.sponsor_org_id
            LEFT JOIN sponsor_user su ON su.sponsor_org_id = so.sponsor_org_id
            LEFT JOIN users u ON u.user_id = su.user_id
            GROUP BY so.sponsor_org_id, so.name
            ORDER BY points_awarded_in_period DESC
        `;

        const params = [
            fromDate, fromDate, toDate,   // points_awarded_in_period date filter
            fromDate, fromDate, toDate    // orders_in_period date filter
        ];

        const [orgs] = await pool.query(query, params);
        res.json({ message: "Sponsor activity retrieved successfully", orgs });
    } catch (error) {
        console.error('Error fetching sponsor activity:', error);
        res.status(500).json({ error: 'Failed to fetch sponsor activity' });
    }
});

// --- Leave Organization Route ---
app.post('/api/user/leave-organization', async (req, res) => {
    const { user_id, user_type } = req.body;
    if (!user_id || !user_type) {
        return res.status(400).json({ error: 'user_id and user_type are required' });
    }
    try {
        if (user_type === 'driver') {
            const [rows] = await pool.query(
                'SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = "active"',
                [user_id]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'No active organization found for this driver' });
            }
            const { sponsor_org_id } = rows[0];
            await pool.query(
                'UPDATE driver_sponsor SET driver_status = "dropped", dropped_at = NOW() WHERE driver_user_id = ? AND sponsor_org_id = ?',
                [user_id, sponsor_org_id]
            );
            await pool.query(
                'UPDATE driver_applications SET status = "withdrawn", reviewed_at = NOW() WHERE driver_user_id = ? AND sponsor_org_id = ? AND status = "approved"',
                [user_id, sponsor_org_id]
            );
        } else if (user_type === 'sponsor') {
            const [rows] = await pool.query(
                'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
                [user_id]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'No organization found for this sponsor' });
            }
            await pool.query(
                'DELETE FROM sponsor_user WHERE user_id = ?',
                [user_id]
            );
        } else {
            return res.status(400).json({ error: 'Invalid user_type' });
        }
        res.json({ message: 'Successfully left organization' });
    } catch (error) {
        console.error('Error leaving organization:', error);
        res.status(500).json({ error: 'Failed to leave organization' });
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
            `SELECT ds.driver_status, ds.sponsor_org_id, so.name AS sponsor_name
             FROM driver_user du
             LEFT JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             LEFT JOIN sponsor_organization so ON ds.sponsor_org_id = so.sponsor_org_id
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
            'SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = ?',
            [driverUserId, 'active']
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: 'No active sponsor found for this driver' });
        }
        const { sponsor_org_id } = rows[0];

        await pool.query(
            'UPDATE driver_sponsor SET driver_status = ?, dropped_at = NOW() WHERE driver_user_id = ? AND sponsor_org_id = ?',
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
                ds.driver_status,
                ds.current_points_balance AS total_points
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN users u ON du.user_id = u.user_id
             WHERE ds.sponsor_org_id = ?
               AND ds.driver_status = 'active'
               AND u.user_type = 'driver'`,
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
                `SELECT driver_user_id AS user_id, current_points_balance
                 FROM driver_sponsor
                 WHERE driver_user_id IN (${placeholders}) AND sponsor_org_id = ?`,
                [...driverIds, sponsor_org_id]
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
        await pool.query('INSERT INTO login_logs (username, login_date, result, user_id) VALUES (?, NOW(), ?, ?)', [user.username, `success`, user.user_id]);

        const sponsor_org_id = await getSponsorOrgId(user.user_id, user.user_type);
        return res.json({ message: 'Login successful', user: { ...userNoPassword, sponsor_org_id } });
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
                'UPDATE driver_sponsor SET driver_status = "dropped", dropped_at = NOW() WHERE driver_user_id = ? AND driver_status = "active"',
                [userId]
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
        //get users active org id so we can get org name to show who dropped them
        const [orgIdArray] = await pool.query(
            'SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = "active"',
            [driverId]
        );

        if(orgIdArray.length === 0) {
            return res.status(400).json({error: 'Driver is not currently in an organization'});
        }

        const sponsor_org_id = orgIdArray[0].sponsor_org_id;

        const [orgRows] = await pool.query('SELECT name FROM sponsor_organization WHERE sponsor_org_id = ?', [sponsor_org_id]);

        const orgName = orgRows[0].name;

        await pool.query(
            'UPDATE driver_sponsor SET driver_status = "dropped", dropped_at = NOW(), drop_reason = ? WHERE driver_user_id = ? AND sponsor_org_id = ?',
            [drop_reason || null, driverId, sponsor_org_id]
        );

        let msg;
        if(drop_reason) {
            msg = `You have been removed from ${orgName}. Reason: ${drop_reason}`;
        } else {
            msg = `You have been removed from ${orgName}.`;
        }

        const [user] = await pool.query('SELECT * FROM users WHERE user_id = ?', [driverId]);
        await pool.query('INSERT INTO org_drop_logs (user_id, username, user_type, reason, sponsor_org_id) VALUES (?, ?, ?, ?, ?)',
            [driverId, user[0].username, user[0].user_type, drop_reason || "None", sponsor_org_id]
        );

        await createNotification(driverId, 'dropped', msg);

        res.json({message: 'Driver removed from organization'});
    } catch (error) {
        console.error('Error dropping driver:', error);
        res.status(500).json({error: 'Failed to remove driver from organization'});
    }
});

app.put('/api/driver/:driverId/archive', async (req, res) => {
    const { driverId } = req.params;
    const { orgId } = req.body;

    if (!orgId) {
        return res.status(400).json({ error: 'orgId is required' });
    }

    try {
        const [[row]] = await pool.query(
            'SELECT driver_sponsor_id FROM driver_sponsor WHERE driver_user_id = ? AND sponsor_org_id = ?',
            [driverId, orgId]
        );
        if (!row) {
            return res.status(404).json({ error: 'Driver-sponsor relationship not found.' });
        }

        await pool.query(
            'UPDATE driver_sponsor SET is_archived = 1 WHERE driver_user_id = ? AND sponsor_org_id = ?',
            [driverId, orgId]
        );

        res.json({ message: 'Driver archived successfully.' });
    } catch (error) {
        console.error('Error archiving driver:', error);
        res.status(500).json({ error: 'Failed to archive driver.' });
    }
});

app.get('/api/organization/:orgId/archived-drivers', async (req, res) => {
    const { orgId } = req.params;
    try {
        const [drivers] = await pool.query(
            `SELECT du.user_id, u.username,
                    ds.sponsor_org_id, ds.driver_status, ds.current_points_balance,
                    ds.affilated_at, ds.dropped_at, ds.drop_reason
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN users u ON du.user_id = u.user_id
             WHERE ds.sponsor_org_id = ? AND ds.is_archived = 1`,
            [orgId]
        );
        res.json({ drivers });
    } catch (error) {
        console.error('Error fetching archived drivers:', error);
        res.status(500).json({ error: 'Failed to fetch archived drivers.' });
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

// Get for org drops
app.get('/api/organization/:org_id/drop-logs', async (req, res) => {
    const { org_id } = req.params;
    try {
        const [drops] = await pool.query('SELECT * FROM org_drop_logs WHERE sponsor_org_id = ? ORDER BY created_at DESC', [org_id]);
        res.json({ message: "Successfully retrieved drop logs", drops });
    } catch (error) {
        console.error('Error fetching org drops:', error);
        res.status(500).json({ error: 'Failed to fetch org drops' });
    }
});

app.get('/api/organization/:org_id/point-changes', async (req, res) => {
    const { org_id } = req.params;
    const { dateRange } = req.query;
    try {
        let query = 'SELECT * FROM point_transactions';
        let params = [];
        let conditions = [];
        
        if ( org_id && org_id != "undefined" && org_id != "null" && org_id != "All") {
            conditions.push('sponsor_org_id = ?');
            params.push(org_id);
        }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);

            if (fromDate && toDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } 
            else if (fromDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } 
            else if (toDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        const [changes] = await pool.query(query, params);
        
        res.json({ message: "Successfully retrieved point changes", changes });
    } catch (error) {
        console.error('Error fetching org point changes:', error);
        res.status(500).json({ error: 'Failed to fetch org point changes' });
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

// POST /api/catalog/org/:sponsorOrgId/items — sponsor adds eBay item to catalog
app.post('/api/catalog/org/:sponsorOrgId/items', async (req, res) => {
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

// DELETE /api/catalog/items/:itemId — sponsor soft-removes item (is_active = 0)
app.delete('/api/catalog/items/:itemId', async (req, res) => {
    const { itemId } = req.params;
    try {
        const [[item]] = await pool.query(
            'SELECT title, sponsor_org_id FROM catalog_items WHERE item_id = ? AND is_active = 1',
            [itemId]
        );
        await pool.query(
            'UPDATE catalog_items SET is_active = 0, updated_at = NOW() WHERE item_id = ?',
            [itemId]
        );
        if(item) {
            const [drivers] = await pool.query(
                'SELECT driver_user_id AS user_id FROM driver_sponsor WHERE sponsor_org_id = ? AND driver_status = "active"',
                [item.sponsor_org_id]
            );
            for (const driver of drivers) {
                await createNotification(driver.user_id, 'catalog_item_removed', `"${item.title}" has been removed from your organization's catalog and is no longer available.`);
            }
        }
        res.json({ message: 'Item removed from catalog' });
    } catch (error) {
        console.error('Error removing catalog item:', error);
        res.status(500).json({ error: 'Failed to remove item' });
    }
});

// PUT /api/catalog/items/:itemId/featured — sponsor toggles featured flag (#6249)
app.put('/api/catalog/items/:itemId/featured', async (req, res) => {
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

// PUT /api/catalog/items/:itemId/sale-price — sponsor sets/clears a sale price (#6224)
app.put('/api/catalog/items/:itemId/sale-price', async (req, res) => {
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
        if(isNewSale) {
            const [favoriteDrivers] = await pool.query(
                `SELECT df.driver_user_id
                 FROM driver_favorites df
                 JOIN driver_sponsor ds ON df.driver_user_id = ds.driver_user_id
                 JOIN catalog_items ci ON df.item_id = ci.item_id
                 WHERE df.item_id = ?
                 AND ds.sponsor_org_id = ci.sponsor_org_id
                 AND ds.driver_status = 'active'`,
                [itemId]
            );
            if(favoriteDrivers.length > 0) {
                let from_price = parseFloat(currentItem.last_price_value);
                if(currentItem.sale_price !== null) {
                    from_price = parseFloat(currentItem.sale_price);
                }
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

// PUT /api/catalog/items/:itemId/customize — sponsor customizes a catalog item
app.put('/api/catalog/items/:itemId/customize', async (req, res) => {
    const { itemId } = req.params;
    const {
        custom_title, custom_description, custom_image_url, custom_points_price,
        hide_price, hide_web_url, misc_info, estimated_delivery_days,
    } = req.body;
    try {
        await pool.query(
            `UPDATE catalog_items SET
                custom_title = ?,
                custom_description = ?,
                custom_image_url = ?,
                custom_points_price = ?,
                hide_price = ?,
                hide_web_url = ?,
                misc_info = ?,
                estimated_delivery_days = ?,
                updated_at = NOW()
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

// ─── Recently Viewed Routes ───────────────────────────────────────────────────

// POST /api/catalog/viewed — record that a driver viewed an item
app.post('/api/catalog/viewed', async (req, res) => {
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

// GET /api/catalog/viewed/:driverUserId — get recently viewed items for a driver
app.get('/api/catalog/viewed/:driverUserId', async (req, res) => {
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
             ORDER BY rv.viewed_at DESC
             LIMIT 8`,
            [driverUserId, sponsorOrgId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching recently viewed:', error);
        res.status(500).json({ error: 'Failed to fetch recently viewed' });
    }
});

// ─── Favorites Routes ─────────────────────────────────────────────────────────

// POST /api/favorites — add item to driver's favorites
app.post('/api/favorites', async (req, res) => {
    const { driverUserId, itemId } = req.body;
    if (!driverUserId || !itemId) return res.status(400).json({ error: 'driverUserId and itemId are required' });
    try {
        await pool.query(
            'INSERT IGNORE INTO driver_favorites (driver_user_id, item_id) VALUES (?, ?)',
            [driverUserId, itemId]
        );
        res.json({ message: 'Added to favorites' });
    } catch (error) {
        console.error('Error adding favorite:', error);
        res.status(500).json({ error: 'Failed to add favorite' });
    }
});

// DELETE /api/favorites/:driverUserId/:itemId — remove item from favorites
app.delete('/api/favorites/:driverUserId/:itemId', async (req, res) => {
    const { driverUserId, itemId } = req.params;
    try {
        await pool.query(
            'DELETE FROM driver_favorites WHERE driver_user_id = ? AND item_id = ?',
            [driverUserId, itemId]
        );
        res.json({ message: 'Removed from favorites' });
    } catch (error) {
        console.error('Error removing favorite:', error);
        res.status(500).json({ error: 'Failed to remove favorite' });
    }
});

// GET /api/favorites/:driverUserId — get all favorited items for a driver
app.get('/api/favorites/:driverUserId', async (req, res) => {
    const { driverUserId } = req.params;
    const { sponsorOrgId } = req.query;
    if (!sponsorOrgId) return res.status(400).json({ error: 'sponsorOrgId query param required' });
    try {
        const [rows] = await pool.query(
            `SELECT ci.item_id, ci.title, ci.image_url, ci.item_web_url, ci.last_price_value,
                    ci.points_price, ci.availability_status
             FROM driver_favorites df
             JOIN catalog_items ci ON df.item_id = ci.item_id
             WHERE df.driver_user_id = ? AND ci.sponsor_org_id = ? AND ci.is_active = 1
             ORDER BY df.created_at DESC`,
            [driverUserId, sponsorOrgId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching favorites:', error);
        res.status(500).json({ error: 'Failed to fetch favorites' });
    }
});

// ─── Cart Routes ──────────────────────────────────────────────────────────────

// POST /api/cart — get-or-create active cart for driver+org
app.post('/api/cart', async (req, res) => {
    const { driverUserId, sponsorOrgId, createdByUserId } = req.body;
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
            [driverUserId, sponsorOrgId, createdByUserId || driverUserId]
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
    const { driverUserId, sponsorOrgId, cartId, placedByUserId } = req.body;
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
            'SELECT current_points_balance FROM driver_sponsor WHERE driver_user_id = ? AND sponsor_org_id = ?',
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
            [driverUserId, sponsorOrgId, placedByUserId || driverUserId, cartId]
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

        // 8. Deduct points — DB trigger auto-updates driver_sponsor.current_points_balance
        await conn.query(
            `INSERT INTO point_transactions
               (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id)
             VALUES (?, ?, ?, ?, 'order', ?)`,
            [driverUserId, sponsorOrgId, -totalPoints, `Order #${orderId}`, placedByUserId || driverUserId]
        );

        // 9. Mark cart as checked out
        await conn.query(
            'UPDATE carts SET status = "checked_out", updated_at = NOW() WHERE cart_id = ?',
            [cartId]
        );

        await conn.commit();
        await createNotification(driverUserId, 'order_placed', `Your order #${orderId} was placed successfully for ${totalPoints.toLocaleString()} points.`, {related_order_id: orderId});

        // Fetch full order details for the summary
        const [orderItems] = await pool.query(
            `SELECT oi.item_id, oi.quantity, oi.points_price_at_purchase, oi.price_usd_at_purchase,
                    ci.title, ci.image_url
             FROM order_items oi
             JOIN catalog_items ci ON oi.item_id = ci.item_id
             WHERE oi.order_id = ?`,
            [orderId]
        );

        const totalUsd = orderItems.reduce((sum, i) => sum + (i.price_usd_at_purchase * i.quantity), 0);
        const remainingBalance = driverRow.current_points_balance - totalPoints;

        res.json({
            message: 'Order placed successfully',
            order_id: orderId,
            points_spent: totalPoints,
            total_usd: totalUsd,
            remaining_balance: remainingBalance,
            items: orderItems,
        });
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
                    o.delivery_name, o.delivery_address, o.delivery_city, o.delivery_state, o.delivery_zip,
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

// returns a list of all items a driver has purchased across all orders, used for the complaint item picker
app.get('/api/support-tickets/purchased-items/:driverId', async (req, res) => {
    try {
        const [rows] = await pool.query(
            `SELECT oi.order_item_id, oi.order_id, ci.item_id, ci.title, ci.image_url,
                    oi.quantity, oi.points_price_at_purchase, o.created_at AS order_date
             FROM order_items oi
             JOIN orders o ON oi.order_id = o.order_id
             JOIN catalog_items ci ON oi.item_id = ci.item_id
             WHERE o.driver_user_id = ?
             ORDER BY o.created_at DESC, ci.title ASC`,
            [req.params.driverId]
        );
        res.json({ items: rows });
    } catch (error) {
        console.error('Error fetching purchased items:', error);
        res.status(500).json({ error: 'Failed to fetch purchased items.' });
    }
});

// creates new support ticket, called when a driver or sponsor submits the form
// sponsorOrgId can be null if the user isn't affiliated with an org
app.post('/api/support-tickets', async (req, res) => {
    const { userId, sponsorOrgId, title, description, category, subjectDriverId, relatedOrderItemId } = req.body;
    // make sure both fields are filled in before inserting
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required.' });
    }
    if (!description || !description.trim()) {
        return res.status(400).json({ error: 'Description is required.' });
    }
    // validate category if provided, default to general
    const validCategories = ['general', 'security', 'catalog_order'];
    const ticketCategory = category || 'general';
    if (!validCategories.includes(ticketCategory)) {
        return res.status(400).json({ error: 'Invalid category. Must be general, security, or catalog_order.' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO support_tickets (user_id, sponsor_org_id, title, description, category, subject_driver_id, related_order_item_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, sponsorOrgId || null, title.trim(), description.trim(), ticketCategory, subjectDriverId || null, relatedOrderItemId || null]
        );

        if(ticketCategory === 'security') {
            const [admins] = await pool.query(`SELECT user_id FROM users WHERE user_type = 'admin' AND is_active = 1`);
            if(admins.length > 0) {
                const notifValues = admins.map(a => [
                    a.user_id,
                    'ticket_updated',
                    `Security alert: A user has submitted a security support ticket "${title}"`,
                    new Date(),
                ]);
                await pool.query(`INSERT INTO notifications (user_id, category, message, created_at) VALUES ?`,
                    [notifValues]
                );    
            }
        }
        res.json({ message: 'Ticket created successfully', ticket_id: result.insertId });
    } catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({ error: 'Failed to create support ticket.' });
    }
});

// returns all non-archived tickets submitted by a specific user, used in driver/sponsor view
app.get('/api/support-tickets/user/:userId', async (req, res) => {
    try {
        const [tickets] = await pool.query(
            `SELECT st.*,
                    su_subj.first_name AS subject_first_name, su_subj.last_name AS subject_last_name,
                    u_submitter.first_name AS submitter_first_name, u_submitter.last_name AS submitter_last_name
             FROM support_tickets st
             LEFT JOIN driver_user du_subj ON st.subject_driver_id = du_subj.user_id
             LEFT JOIN users su_subj ON du_subj.user_id = su_subj.user_id
             LEFT JOIN users u_submitter ON st.user_id = u_submitter.user_id
             WHERE ((st.user_id = ? AND st.subject_driver_id IS NULL) OR st.subject_driver_id = ?)
             AND st.is_archived = 0
             ORDER BY st.created_at DESC`,
            [req.params.userId, req.params.userId]
        );
        res.json({ tickets });
    } catch (error) {
        console.error('Error fetching user support tickets:', error);
        res.status(500).json({ error: 'Failed to fetch support tickets.' });
    }
});

// updates the status of a ticket
// admins can set any valid status; sponsors can only mark as resolved (their own or org driver tickets)
app.put('/api/support-tickets/:ticketId/status', async (req, res) => {
    const { status, userId, userType, note } = req.body;
    const validStatuses = ['open', 'in_progress', 'resolved'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be open, in_progress, or resolved.' });
    }
    try {
        // sponsor path: sponsors can only resolve tickets they own or tickets belonging to their orgs drivers
        if (userType === 'sponsor') {
            if (status !== 'resolved') {
                return res.status(403).json({ error: 'Sponsors can only mark tickets as resolved.' });
            }
            const [[sponsorUser]] = await pool.query(
                'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
                [userId]
            );
            if (!sponsorUser) {
                return res.status(403).json({ error: 'Sponsor not found.' });
            }
            const [[ticket]] = await pool.query(
                'SELECT ticket_id, user_id, sponsor_org_id FROM support_tickets WHERE ticket_id = ?',
                [req.params.ticketId]
            );
            if (!ticket) {
                return res.status(404).json({ error: 'Ticket not found.' });
            }
            if (ticket.user_id !== parseInt(userId) && ticket.sponsor_org_id !== sponsorUser.sponsor_org_id) {
                return res.status(403).json({ error: 'You can only resolve your own tickets or tickets from your organization.' });
            }
            await pool.query(
                'UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE ticket_id = ?',
                [status, req.params.ticketId]
            );
            // if a resolution note was provided, insert it as a comment
            if (note && note.trim()) {
                await pool.query(
                    'INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)',
                    [req.params.ticketId, userId, note.trim()]
                );
            }
            return res.json({ message: 'Ticket updated successfully' });
        }

        // admin path: existing behavior, any valid status, no ownership check
        const [result] = await pool.query(
            'UPDATE support_tickets SET status = ? WHERE ticket_id = ?',
            [status, req.params.ticketId]
        );
        // if no rows were affected the ticket id doesn't exist
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }
        if(status === 'in_progress' || status === 'resolved') {
            const [[ticket]] = await pool.query('SELECT user_id FROM support_tickets WHERE ticket_id = ?', [req.params.ticketId]);
            if(ticket) {
                let statusLabel = 'Resolved';
                if(status === 'in_progress') {
                    statusLabel = 'In Progress';
                }
                await createNotification(ticket.user_id, 'ticket_updated', `Your support ticket #${req.params.ticketId} has been marked as ${statusLabel}.`);
            }
        }
        res.json({ message: 'Ticket updated successfully' });
    } catch (error) {
        console.error('Error updating support ticket status:', error);
        res.status(500).json({ error: 'Failed to update ticket status.' });
    }
});

// returns all tickets in the system for the admin view
// JOINs on users and sponsor_organization so the admin can see who submitted each ticket and what org they're in
// also JOINs on driver_user/users for the subject driver if one is attached to the ticket
app.get('/api/support-tickets', async (_req, res) => {
    try {
        const [tickets] = await pool.query(
            `SELECT st.*, u.first_name, u.last_name, u.email, u.user_type,
                    so.name AS org_name,
                    su_subj.first_name AS subject_first_name,
                    su_subj.last_name AS subject_last_name
             FROM support_tickets st
             JOIN users u ON st.user_id = u.user_id
             LEFT JOIN sponsor_organization so ON st.sponsor_org_id = so.sponsor_org_id
             LEFT JOIN driver_user du_subj ON st.subject_driver_id = du_subj.user_id
             LEFT JOIN users su_subj ON du_subj.user_id = su_subj.user_id
             ORDER BY st.created_at DESC`
        );
        res.json({ tickets });
    } catch (error) {
        console.error('Error fetching all support tickets:', error);
        res.status(500).json({ error: 'Failed to fetch support tickets.' });
    }
});

// returns all nonarchived tickets for a sponsor org, used in sponsor "driver tickets"
// filters by sponsor_org_id so the sponsor only sees tickets filed under their org
app.get('/api/support-tickets/org/:sponsorOrgId', async (req, res) => {
    try {
        const [tickets] = await pool.query(
            `SELECT st.*, u.first_name, u.last_name, u.email,
                    su_subj.first_name AS subject_first_name,
                    su_subj.last_name AS subject_last_name
             FROM support_tickets st
             JOIN users u ON st.user_id = u.user_id
             LEFT JOIN driver_user du_subj ON st.subject_driver_id = du_subj.user_id
             LEFT JOIN users su_subj ON du_subj.user_id = su_subj.user_id
             WHERE st.sponsor_org_id = ? AND st.is_archived = 0
             ORDER BY st.created_at DESC`,
            [req.params.sponsorOrgId]
        );
        res.json({ tickets });
    } catch (error) {
        console.error('Error fetching org support tickets:', error);
        res.status(500).json({ error: 'Failed to fetch org support tickets.' });
    }
});

// returns all active drivers in a sponsors org, used for the "ticket about a driver" dropdown
app.get('/api/support-tickets/drivers/:sponsorUserId', async (req, res) => {
    try {
        const [[sponsorUser]] = await pool.query(
            'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
            [req.params.sponsorUserId]
        );
        if (!sponsorUser) {
            return res.status(404).json({ error: 'Sponsor not found.' });
        }
        const [drivers] = await pool.query(
            `SELECT u.user_id, u.first_name, u.last_name
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN users u ON du.user_id = u.user_id
             WHERE ds.sponsor_org_id = ? AND ds.driver_status = 'active'
             ORDER BY u.last_name, u.first_name`,
            [sponsorUser.sponsor_org_id]
        );
        res.json({ drivers });
    } catch (error) {
        console.error('Error fetching org drivers for ticket:', error);
        res.status(500).json({ error: 'Failed to fetch drivers.' });
    }
});

// updates the description of a ticket (only allowed when status is open and ticket is not archived)
// userId must match the ticket owner so users can only edit their own tickets
app.put('/api/support-tickets/:ticketId', async (req, res) => {
    const { description, userId } = req.body;
    if (!description || !description.trim()) {
        return res.status(400).json({ error: 'Description is required.' });
    }
    try {
        const [[ticket]] = await pool.query(
            'SELECT ticket_id, user_id, status, is_archived FROM support_tickets WHERE ticket_id = ?',
            [req.params.ticketId]
        );
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }
        if (ticket.user_id !== parseInt(userId)) {
            return res.status(403).json({ error: 'You can only edit your own tickets.' });
        }
        if (ticket.status !== 'open') {
            return res.status(400).json({ error: 'Only open tickets can be edited.' });
        }
        if (ticket.is_archived) {
            return res.status(400).json({ error: 'Archived tickets cannot be edited.' });
        }
        await pool.query(
            'UPDATE support_tickets SET description = ?, updated_at = NOW() WHERE ticket_id = ?',
            [description.trim(), req.params.ticketId]
        );
        res.json({ message: 'Ticket updated successfully.' });
    } catch (error) {
        console.error('Error updating support ticket:', error);
        res.status(500).json({ error: 'Failed to update support ticket.' });
    }
});

// archives a ticket instead of deleting it (archived tickets hidden from driver/sponsor views)
// admins can archive any ticket; sponsors can archive their own or any ticket in their org; drivers can only archive their own
app.put('/api/support-tickets/:ticketId/archive', async (req, res) => {
    const { userId, userType } = req.body;
    try {
        const [[ticket]] = await pool.query(
            'SELECT ticket_id, user_id, sponsor_org_id FROM support_tickets WHERE ticket_id = ?',
            [req.params.ticketId]
        );
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }
        if (userType !== 'admin' && ticket.user_id !== parseInt(userId)) {
            if (userType === 'sponsor') {
                const [[sponsorUser]] = await pool.query(
                    'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
                    [userId]
                );
                if (!sponsorUser || ticket.sponsor_org_id !== sponsorUser.sponsor_org_id) {
                    return res.status(403).json({ error: 'You can only archive tickets in your organization.' });
                }
            } else {
                return res.status(403).json({ error: 'You can only archive your own tickets.' });
            }
        }
        await pool.query(
            'UPDATE support_tickets SET is_archived = 1, updated_at = NOW() WHERE ticket_id = ?',
            [req.params.ticketId]
        );
        res.json({ message: 'Ticket archived successfully.' });
    } catch (error) {
        console.error('Error archiving support ticket:', error);
        res.status(500).json({ error: 'Failed to archive support ticket.' });
    }
});

// reopens a ticket that was previously resolved, available to the ticket owner or a sponsor in same org
app.put('/api/support-tickets/:ticketId/reopen', async (req, res) => {
    const { userId, userType } = req.body;
    try {
        const [[ticket]] = await pool.query(
            'SELECT ticket_id, user_id, sponsor_org_id, subject_driver_id, status FROM support_tickets WHERE ticket_id = ?',
            [req.params.ticketId]
        );
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }
        if (ticket.status !== 'resolved') {
            return res.status(400).json({ error: 'Only resolved tickets can be reopened.' });
        }
        // check that the caller is the ticket owner, the subject driver, or a sponsor whose org owns the ticket
        const isOwner = ticket.user_id === parseInt(userId);
        const isSubjectDriver = ticket.subject_driver_id === parseInt(userId);
        if (!isOwner && !isSubjectDriver) {
            if (userType === 'sponsor') {
                const [[sponsorUser]] = await pool.query(
                    'SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?',
                    [userId]
                );
                if (!sponsorUser || ticket.sponsor_org_id !== sponsorUser.sponsor_org_id) {
                    return res.status(403).json({ error: 'You can only reopen tickets you submitted or tickets in your organization.' });
                }
            } else {
                return res.status(403).json({ error: 'You can only reopen your own tickets.' });
            }
        }
        await pool.query(
            'UPDATE support_tickets SET status = ?, updated_at = NOW() WHERE ticket_id = ?',
            ['open', req.params.ticketId]
        );
        res.json({ message: 'Ticket reopened successfully.' });
    } catch (error) {
        console.error('Error reopening support ticket:', error);
        res.status(500).json({ error: 'Failed to reopen ticket.' });
    }
});

// --- Ticket Comments Routes ---

// GET /api/ticket-comments/:ticketId - returns all comments for a ticket,
// ordered oldest first so the UI shows them  chronologically
app.get('/api/ticket-comments/:ticketId', async (req, res) => {
    const { ticketId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT tc.comment_id, tc.user_id, tc.body, tc.created_at,
                    u.username, u.first_name, u.last_name, u.user_type
             FROM ticket_comments tc
             JOIN users u ON tc.user_id = u.user_id
             WHERE tc.ticket_id = ?
             ORDER BY tc.created_at ASC`,
            [ticketId]
        );
        res.json({ comments: rows });
    } catch (error) {
        console.error('Error fetching ticket comments:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// POST /api/ticket-comments - inserts a new comment and returns it with full user info
app.post('/api/ticket-comments', async (req, res) => {
    const { ticket_id, user_id, body } = req.body;
    if (!ticket_id || !user_id || !body?.trim()) {
        return res.status(400).json({ error: 'ticket_id, user_id, and body are required' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)',
            [ticket_id, user_id, body.trim()]
        );
        // refetch inserted row so can return enriched user fields in one response
        const [[comment]] = await pool.query(
            `SELECT tc.comment_id, tc.user_id, tc.body, tc.created_at,
                    u.username, u.first_name, u.last_name, u.user_type
             FROM ticket_comments tc
             JOIN users u ON tc.user_id = u.user_id
             WHERE tc.comment_id = ?`,
            [result.insertId]
        );
        res.status(201).json({ comment });
    } catch (error) {
        console.error('Error adding ticket comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// ─── Delivery Details Routes ──────────────────────────────────────────────────

// PUT /api/orders/:orderId/delivery — driver updates delivery details for an order
app.put('/api/orders/:orderId/delivery', async (req, res) => {
    const { orderId } = req.params;
    const { driverUserId, delivery_name, delivery_address, delivery_city, delivery_state, delivery_zip } = req.body;
    if (!driverUserId) return res.status(400).json({ error: 'driverUserId is required' });
    try {
        const [[order]] = await pool.query(
            'SELECT order_id FROM orders WHERE order_id = ? AND driver_user_id = ?',
            [orderId, driverUserId]
        );
        if (!order) return res.status(404).json({ error: 'Order not found' });
        await pool.query(
            `UPDATE orders SET delivery_name = ?, delivery_address = ?, delivery_city = ?,
             delivery_state = ?, delivery_zip = ? WHERE order_id = ?`,
            [delivery_name || null, delivery_address || null, delivery_city || null,
             delivery_state || null, delivery_zip || null, orderId]
        );
        res.json({ message: 'Delivery details updated' });
    } catch (error) {
        console.error('Error updating delivery details:', error);
        res.status(500).json({ error: 'Failed to update delivery details' });
    }
});

// PUT /api/orders/:orderId/cancel — driver cancels a placed order and gets their points refunded
app.put('/api/orders/:orderId/cancel', async (req, res) => {
    const { orderId } = req.params;
    const { driverUserId, cancel_reason } = req.body;
    if (!driverUserId) return res.status(400).json({ error: 'driverUserId is required' });
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();

        const [[order]] = await conn.query(
            'SELECT order_id, status, sponsor_org_id FROM orders WHERE order_id = ? AND driver_user_id = ?',
            [orderId, driverUserId]
        );
        if (!order) {
            await conn.rollback();
            return res.status(404).json({ error: 'Order not found' });
        }
        if (order.status !== 'placed') {
            await conn.rollback();
            return res.status(400).json({ error: 'Only placed orders can be cancelled' });
        }

        // Find the original point deduction for this order
        const [[tx]] = await conn.query(
            'SELECT transaction_id, point_amount FROM point_transactions WHERE driver_user_id = ? AND sponsor_org_id = ? AND source = "order" AND reason = ? AND point_amount < 0',
            [driverUserId, order.sponsor_org_id, `Order #${orderId}`]
        );

        // Cancel the order
        await conn.query(
            'UPDATE orders SET status = ?, cancel_reason = ?, cancelled_at = NOW() WHERE order_id = ?',
            ['cancelled', cancel_reason || null, orderId]
        );

        // Refund points if a matching deduction was found
        if (tx) {
            const refundAmount = Math.abs(tx.point_amount);
            await conn.query(
                `INSERT INTO point_transactions
                   (driver_user_id, sponsor_org_id, point_amount, reason, source, created_by_user_id)
                 VALUES (?, ?, ?, ?, 'order', ?)`,
                [driverUserId, order.sponsor_org_id, refundAmount, `Refund for cancelled Order #${orderId}`, driverUserId]
            );
        }

        await conn.commit();

        const refundMsg = tx
            ? ` ${Math.abs(tx.point_amount).toLocaleString()} point(s) have been refunded to your account.`
            : '';
        await createNotification(driverUserId, 'order_placed', `Your order #${orderId} has been cancelled.${refundMsg}`, { related_order_id: Number(orderId) });

        res.json({ message: 'Order cancelled', points_refunded: tx ? Math.abs(tx.point_amount) : 0 });
    } catch (error) {
        await conn.rollback();
        console.error('Error cancelling order:', error);
        res.status(500).json({ error: 'Failed to cancel order' });
    } finally {
        conn.release();
    }
});

// PATCH /api/orders/:orderId/status — update order status (ship or deliver)
// placed → shipped (by sponsor), shipped → delivered (by driver)
app.patch('/api/orders/:orderId/status', async (req, res) => {
    const { orderId } = req.params;
    const { status, userId } = req.body;
    if (!status || !userId) return res.status(400).json({ error: 'status and userId are required' });
    try {
        const [[order]] = await pool.query(
            'SELECT order_id, status, driver_user_id, sponsor_org_id FROM orders WHERE order_id = ?',
            [orderId]
        );
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (status === 'shipped') {
            if (order.status !== 'placed') {
                return res.status(400).json({ error: 'Only placed orders can be marked as shipped' });
            }
        } else if (status === 'delivered') {
            if (order.status !== 'shipped') {
                return res.status(400).json({ error: 'Only shipped orders can be confirmed as delivered' });
            }
            if (order.driver_user_id !== parseInt(userId)) {
                return res.status(403).json({ error: 'Only the ordering driver can confirm delivery' });
            }
        } else {
            return res.status(400).json({ error: 'Invalid status. Use "shipped" or "delivered"' });
        }

        await pool.query(
            'UPDATE orders SET status = ?, updated_at = NOW() WHERE order_id = ?',
            [status, orderId]
        );
        res.json({ message: `Order marked as ${status}` });
    } catch (error) {
        console.error('Error updating order status:', error);
        res.status(500).json({ error: 'Failed to update order status' });
    }
});

// --- Transaction Comments Routes -----------------------------------------------------

// GET /api/transaction-comments/:transactionId - returns all comments for a transaction,
// ordered oldest first so the UI shows them as a chronological thread
app.get('/api/transaction-comments/:transactionId', async (req, res) => {
    const { transactionId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT tc.comment_id, tc.user_id, tc.body, tc.created_at,
                    u.username, u.first_name, u.last_name, u.user_type
             FROM transaction_comments tc
             JOIN users u ON tc.user_id = u.user_id
             WHERE tc.transaction_id = ?
             ORDER BY tc.created_at ASC`,
            [transactionId]
        );
        res.json({ comments: rows });
    } catch (error) {
        console.error('Error fetching transaction comments:', error);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// POST /api/transaction-comments - inserts a new comment and returns it with full user info
app.post('/api/transaction-comments', async (req, res) => {
    const { transaction_id, user_id, body } = req.body;
    if (!transaction_id || !user_id || !body?.trim()) {
        return res.status(400).json({ error: 'transaction_id, user_id, and body are required' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO transaction_comments (transaction_id, user_id, body) VALUES (?, ?, ?)',
            [transaction_id, user_id, body.trim()]
        );
        // Re-fetch the inserted row so we can return enriched user fields in one response
        const [[comment]] = await pool.query(
            `SELECT tc.comment_id, tc.user_id, tc.body, tc.created_at,
                    u.username, u.first_name, u.last_name, u.user_type
             FROM transaction_comments tc
             JOIN users u ON tc.user_id = u.user_id
             WHERE tc.comment_id = ?`,
            [result.insertId]
        );
        res.status(201).json({ comment });
    } catch (error) {
        console.error('Error adding transaction comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// GET /api/sponsor/transaction-comments/:sponsorOrgId - returns transactions that have at least
// one comment
app.get('/api/sponsor/transaction-comments/:sponsorOrgId', async (req, res) => {
    const { sponsorOrgId } = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT pt.transaction_id, pt.driver_user_id, pt.point_amount, pt.reason,
                    pt.source, pt.created_at,
                    u.username, u.first_name, u.last_name,
                    COUNT(tc.comment_id) AS comment_count,
                    MAX(tc.created_at) AS last_comment_at
             FROM point_transactions pt
             JOIN transaction_comments tc ON pt.transaction_id = tc.transaction_id
             JOIN users u ON pt.driver_user_id = u.user_id
             WHERE pt.sponsor_org_id = ?
             GROUP BY pt.transaction_id
             ORDER BY last_comment_at DESC`,
            [sponsorOrgId]
        );
        res.json({ transactions: rows });
    } catch (error) {
        console.error('Error fetching sponsor transaction comments:', error);
        res.status(500).json({ error: 'Failed to fetch transaction comments' });
    }
});
// --- Catalog Reviews ---
const REVIEW_CHAR_LIMIT = 600;
 
// GET /api/catalog/reviews/:itemId returns all active reviews and average rating for one catalog item.
app.get('/api/catalog/reviews/:itemId', async (req, res) => {
    const {itemId} = req.params;
    try {
        // double join because you need to join on driver user id and reply user id (and left join cause a reply may not have a user id to match to)
        const [reviews] = await pool.query(
            `SELECT cr.review_id, cr.item_id, cr.driver_user_id,
                u.username AS driver_username,
                cr.rating, cr.review_text, cr.sponsor_reply, cr.reply_at, cr.reply_by_user_id,
                ru.username AS reply_username,
                cr.created_at, cr.updated_at
             FROM catalog_reviews cr
             JOIN users u ON cr.driver_user_id = u.user_id
             LEFT JOIN users ru ON cr.reply_by_user_id = ru.user_id
             WHERE cr.item_id = ?
             ORDER BY cr.created_at DESC`,
            [itemId]
        );
        

        // averaging all reviews
        let avgRating = null;
        if(reviews.length > 0) {
            const total = reviews.reduce((sum, curr) => sum + curr.rating, 0);
            
            avgRating = total / reviews.length;
        }
 
        res.json({ reviews, avgRating, totalReviews: reviews.length });
    } catch(error) {
        console.error('Error fetching catalog reviews:', error);
        res.status(500).json({error: 'Failed to fetch reviews'});
    }
});
 
// POST /api/catalog/reviews/:reviewId/reply lets sponsors and admins respond to driver reviews
app.post('/api/catalog/reviews/:reviewId/reply', async (req, res) => {
    const {reviewId} = req.params;
    const {sponsorUserId, replyText} = req.body;
 
    if(!sponsorUserId || !replyText) {
        return res.status(400).json({ error: 'sponsorUserId and replyText are required' });
    }
 
    try {
        const [[review]] = await pool.query(
            `SELECT cr.review_id, ci.sponsor_org_id
             FROM catalog_reviews cr
             JOIN catalog_items ci ON cr.item_id = ci.item_id
             WHERE cr.review_id = ?`,
            [reviewId]
        );
        if(!review) {
            return res.status(404).json({ error: 'Review not found' });
        }
 
        const [[sponsorRow]] = await pool.query(
            `SELECT user_id FROM users WHERE user_id = ? AND user_type IN ('sponsor', 'admin')`,
            [sponsorUserId]
        );
        if(!sponsorRow) {
            return res.status(403).json({ error: 'Only sponsors or admins can reply to reviews' });
        }
 
        await pool.query(
            `UPDATE catalog_reviews
             SET sponsor_reply = ?,
                 reply_at = NOW(),
                 reply_by_user_id = ?
             WHERE review_id = ?`,
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
 
        res.json({review: updated});
    } catch(error) {
        console.error('Error saving sponsor reply:', error);
        res.status(500).json({error: 'Failed to save reply'});
    }
});


// POST /api/catalog/reviews for driver creating or updating a review
app.post('/api/catalog/reviews', async (req, res) => {
    const {itemId, driverUserId, rating, reviewText} = req.body;
 
    if(!itemId || !driverUserId || !rating || !reviewText) {
        return res.status(400).json({ error: 'itemId, driverUserId, rating, and reviewText are required' });
    }
    if(rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    if(reviewText.length > REVIEW_CHAR_LIMIT) {
        return res.status(400).json({ error: `Review must be ${REVIEW_CHAR_LIMIT} characters or fewer` });
    }
 
    try {
        // make sure item part of that driver's org 
        const [itemRows] = await pool.query(
            `SELECT ci.item_id
             FROM catalog_items ci
             JOIN driver_sponsor ds ON ci.sponsor_org_id = ds.sponsor_org_id
             WHERE ci.item_id = ? AND ds.driver_user_id = ? AND ds.driver_status = 'active' AND ci.is_active = 1`,
            [itemId, driverUserId]
        );
        if(itemRows.length === 0) {
            return res.status(403).json({ error: 'Item not found in organization catalog' });
        }
 
        // make new review unless it already exists in table, then it is an update
        await pool.query(
            `INSERT INTO catalog_reviews (item_id, driver_user_id, rating, review_text)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                rating = VALUES(rating),
                review_text = VALUES(review_text),
                updated_at = NOW()`,
            [itemId, driverUserId, rating, reviewText]
        );
 
        const [[saved]] = await pool.query(
            `SELECT cr.*, u.username AS driver_username
             FROM catalog_reviews cr
             JOIN users u ON cr.driver_user_id = u.user_id
             WHERE cr.item_id = ? AND cr.driver_user_id = ?`,
            [itemId, driverUserId]
        );
 
        res.status(201).json({review: saved});
    } catch (error) {
        console.error('Error saving review:', error);
        res.status(500).json({error: 'Failed to save review'});
    }
});
 
 
// DELETE /api/catalog/reviews/:reviewId for if someone deletes review
app.delete('/api/catalog/reviews/:reviewId', async (req, res) => {
    const {reviewId} = req.params;
    const {driverUserId} = req.body;
 
    if(!driverUserId) {
        return res.status(400).json({ error: 'driverUserId is required' });
    }
 
    try {
        const [[review]] = await pool.query(
            'SELECT review_id, driver_user_id FROM catalog_reviews WHERE review_id = ?',
            [reviewId]
        );
        if(!review) {
            return res.status(404).json({error: 'Review not found'});
        }
        
        if(review.driver_user_id !== Number(driverUserId)) {
            return res.status(403).json({error: 'You can only delete your own review' });
        }
 
        await pool.query('DELETE FROM catalog_reviews WHERE review_id = ?', [reviewId]);
        res.json({message: 'Review deleted'});
    } catch(error) {
        console.error('Error deleting review:', error);
        res.status(500).json({error: 'Failed to delete review'});
    }
});

if (process.env.NODE_ENV !== 'test') {
    // Run migration to add delivery columns if they don't exist
    (async () => {
        try {
            const deliveryCols = [
                { name: 'delivery_name', type: 'VARCHAR(200) NULL' },
                { name: 'delivery_address', type: 'VARCHAR(500) NULL' },
                { name: 'delivery_city', type: 'VARCHAR(100) NULL' },
                { name: 'delivery_state', type: 'VARCHAR(50) NULL' },
                { name: 'delivery_zip', type: 'VARCHAR(20) NULL' },
            ];
            for (const col of deliveryCols) {
                const [rows] = await pool.query(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?`,
                    [col.name]
                );
                if (rows.length === 0) {
                    await pool.query(`ALTER TABLE orders ADD COLUMN ${col.name} ${col.type}`);
                    console.log(`Added column orders.${col.name}`);
                }
            }
        } catch (e) {
            console.warn('Delivery columns migration failed:', e.message);
        }

        // Create recently_viewed table
        try {
            await pool.query(`CREATE TABLE IF NOT EXISTS recently_viewed (
                id INT PRIMARY KEY AUTO_INCREMENT,
                driver_user_id INT NOT NULL,
                item_id INT NOT NULL,
                viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uq_rv (driver_user_id, item_id)
            )`);
        } catch (e) {
            console.warn('recently_viewed migration failed:', e.message);
        }

        // Add catalog item customization columns
        try {
            const catalogCols = [
                { name: 'custom_title',            type: 'VARCHAR(500) NULL' },
                { name: 'custom_description',      type: 'TEXT NULL' },
                { name: 'custom_image_url',        type: 'VARCHAR(1000) NULL' },
                { name: 'custom_points_price',     type: 'INT NULL' },
                { name: 'hide_price',              type: 'TINYINT(1) NOT NULL DEFAULT 0' },
                { name: 'hide_web_url',            type: 'TINYINT(1) NOT NULL DEFAULT 0' },
                { name: 'misc_info',               type: 'TEXT NULL' },
                { name: 'estimated_delivery_days', type: 'INT NULL' },
            ];
            for (const col of catalogCols) {
                const [rows] = await pool.query(
                    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
                     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'catalog_items' AND COLUMN_NAME = ?`,
                    [col.name]
                );
                if (rows.length === 0) {
                    await pool.query(`ALTER TABLE catalog_items ADD COLUMN ${col.name} ${col.type}`);
                    console.log(`Added column catalog_items.${col.name}`);
                }
            }
        } catch (e) {
            console.warn('Catalog customization columns migration failed:', e.message);
        }

        // Create driver_favorites table
        try {
            await pool.query(`CREATE TABLE IF NOT EXISTS driver_favorites (
                favorite_id INT PRIMARY KEY AUTO_INCREMENT,
                driver_user_id INT NOT NULL,
                item_id INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uq_fav (driver_user_id, item_id)
            )`);
        } catch (e) {
            console.warn('driver_favorites migration failed:', e.message);
        }
    })();

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// ---- Message Routes ----
// send messages (any type)
app.post('/api/messages', async (req, res) => {
    const {sender_id, recipient_id, sponsor_org_id, message_type, message_subject, body} = req.body;

    if(!sender_id || !message_type) {
        return res.status(400).json({error: 'sender_id and message_type cannot be null'});
    }
    const validTypes = ['direct', 'org_announcement', 'global_announcement', 'org_chat'];
    if(!validTypes.includes(message_type)) {
        return res.status(400).json({error: 'message type is not valid'});
    }
    if(message_type === 'direct' && !recipient_id) {
        return res.status(400).json({error: 'recipient id is required for dms'});
    }
    if((message_type === 'org_announcement' || message_type === 'org_chat') && !sponsor_org_id) {
        return res.status(400).json({error: 'sponsor_org_id is required for org messages'});
    }

    try {
        const [result] = await pool.query(`INSERT INTO messages (sender_id, recipient_id, sponsor_org_id, message_type, message_subject, body, created_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW())`,[sender_id, recipient_id || null, sponsor_org_id || null, message_type, message_subject || null, body]);
        res.status(201).json({message: 'Message sent successfully', message_id: result.insertId});
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({error: 'Failed to send message'});
    }
});

// global announcements for everyone and org announcements for a user's org(s)
app.get('/api/messages/announcements/:userId', async (req, res) => {
    const {userId} = req.params;
    try {
        const [userRows] = await pool.query('SELECT user_type FROM users WHERE user_id = ?', [userId]);
        if(userRows.length === 0) return res.status(404).json({error: 'User not found'});
        const userType = userRows[0].user_type;
        let orgIds = [];
        if (userType === 'driver') {
            const [rows] = await pool.query('SELECT sponsor_org_id FROM driver_sponsor WHERE driver_user_id = ? AND driver_status = "active"', [userId]);
            orgIds = rows.map(row => row.sponsor_org_id);
        } 
        else if (userType === 'sponsor') {
            const [rows] = await pool.query('SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ? AND sponsor_org_id IS NOT NULL', [userId]);
            orgIds = rows.map(row => row.sponsor_org_id);
        }

        let query;
        let params;

        if (orgIds.length > 0) {
            // mapping each orgId to ?, we need to know orgs for org annoubncements. We need to do a join to get names and a conditional cause we dont know if user
            //has an org or not but we can't do IN for something that doesn't exist
            const placeholders = orgIds.map(() => '?').join(', ');
            query = `SELECT m.*, u.username AS sender_username, u.first_name, u.last_name FROM messages m JOIN users u ON m.sender_id = u.user_id
                WHERE m.message_type = 'global_announcement'
                   OR (m.message_type = 'org_announcement' AND m.sponsor_org_id IN (${placeholders}))
                ORDER BY m.created_at DESC`;
            params = orgIds;
        } else {
            query = `SELECT m.*, u.username AS sender_username, u.first_name, u.last_name FROM messages m
                JOIN users u ON m.sender_id = u.user_id WHERE m.message_type = 'global_announcement' ORDER BY m.created_at DESC`;
            params = [];
        }

        const [messages] = await pool.query(query, params);
        res.json({messages});
    } catch (error) {
        console.error('Error getting announcements:', error);
        res.status(500).json({error: 'Failed to fetch announcements'});
    }
});

// direct message thread between two users route
app.get('/api/messages/thread/:userId/:otherUserId', async (req, res) => {
    const {userId, otherUserId} = req.params;
    try {
        const [messages] = await pool.query(`SELECT m.*, u.username AS sender_username FROM messages m JOIN users u ON m.sender_id = u.user_id
             WHERE m.message_type = 'direct' AND ((m.sender_id = ? AND m.recipient_id = ?) OR (m.sender_id = ? AND m.recipient_id = ?)) ORDER BY m.created_at ASC`,
            [userId, otherUserId, otherUserId, userId]);
        
        res.json({messages});
    } catch (error) {
        console.error('Error get message thread:', error);
        res.status(500).json({error: 'Failed to get message thread'});
    }
});

// sponsor org chat messages (sponsors and admin onyl)
app.get('/api/messages/org/chat/:sponsorOrgId', async (req, res) => {
    const {sponsorOrgId} = req.params;
    try {
        const [messages] = await pool.query(`SELECT m.*, u.username AS sender_username, u.user_type AS sender_type FROM messages m JOIN users u ON m.sender_id = u.user_id
             WHERE m.message_type = 'org_chat' AND m.sponsor_org_id = ? ORDER BY m.created_at ASC`, [sponsorOrgId]);
        res.json({ messages });
    } catch (error) {
        console.error('Error fetching org chat:', error);
        res.status(500).json({ error: 'Failed to fetch org chat' });
    }
});

// drivers in the sponsor's org
app.get('/api/messages/org/drivers/:sponsorUserId', async (req, res) => {
    const {sponsorUserId} = req.params;
    try {
        const [sponsorRows] = await pool.query('SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?', [sponsorUserId]);
        if(sponsorRows.length === 0) return res.status(404).json({error: 'no sponsor'});
        const {sponsor_org_id} = sponsorRows[0];

        const [drivers] = await pool.query(
            `SELECT u.user_id, u.username, u.first_name, u.last_name
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN users u ON du.user_id = u.user_id
             WHERE ds.sponsor_org_id = ? AND ds.driver_status = 'active'
             ORDER BY u.username ASC`,
            [sponsor_org_id]
        );
        res.json({drivers, sponsor_org_id});
    } catch (error) {
        console.error('Error fetching org drivers:', error);
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});


// get sponsor users in the driver's org(s)
app.get('/api/messages/sponsor/:driverUserId', async (req, res) => {
    const {driverUserId} = req.params;
    try {
        const [rows] = await pool.query(
            `SELECT u.user_id, u.username, u.first_name, u.last_name, ds.sponsor_org_id, so.name AS org_name
             FROM driver_user du
             JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
             JOIN sponsor_user su ON ds.sponsor_org_id = su.sponsor_org_id
             JOIN users u ON su.user_id = u.user_id
             JOIN sponsor_organization so ON ds.sponsor_org_id = so.sponsor_org_id
             WHERE du.user_id = ? AND ds.driver_status = 'active'
             ORDER BY so.name ASC, u.username ASC`,
            [driverUserId]
        );
        res.json({sponsors: rows});
    } catch (error) {
        console.error('Error fetching sponsor users:', error);
        res.status(500).json({error: 'Failed to fetch sponsors'});
    }
});

//mark messages as read
app.put('/api/messages/:messageId/read', async (req, res) => {
    const {messageId } = req.params;
    try {
        await pool.query('UPDATE messages SET read_at = NOW() WHERE message_id = ? AND read_at IS NULL', [messageId]);
        res.json({message: 'Marked as read'});
    } catch (error) {
        console.error('Error marking message as read:', error);
        res.status(500).json({error: 'Failed to mark message as read'});
    }
});

// --- Download Personal Data Route ---
app.get('/api/user/:userId/download-data', async (req, res) => {
    const { userId } = req.params;
    const requestingUserId = req.query.requestingUserId;

    // Authorization: user can only download their own data
    if (!requestingUserId || String(requestingUserId) !== String(userId)) {
        return res.status(403).json({ error: 'You can only download your own data.' });
    }

    try {
        // Fetch core user profile (exclude sensitive fields)
        const [users] = await pool.query(
            `SELECT user_id, first_name, last_name, phone_number, email, username,
                    user_type, two_fa_enabled, created_at
             FROM users WHERE user_id = ?`,
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = users[0];
        const data = { profile: user };

        // Role-specific data
        if (user.user_type === 'driver') {
            const [driverInfo] = await pool.query(
                `SELECT ds.sponsor_org_id, ds.driver_status, ds.current_points_balance,
                        ds.affilated_at, ds.dropped_at, ds.drop_reason,
                        so.name AS sponsor_org_name
                 FROM driver_user du
                 LEFT JOIN driver_sponsor ds ON du.user_id = ds.driver_user_id
                 LEFT JOIN sponsor_organization so ON ds.sponsor_org_id = so.sponsor_org_id
                 WHERE du.user_id = ?`,
                [userId]
            );
            data.driverInfo = driverInfo[0] || null;

            const [pointTransactions] = await pool.query(
                `SELECT transaction_id, sponsor_org_id, point_amount, reason, source, created_at
                 FROM point_transactions WHERE driver_user_id = ? ORDER BY created_at DESC`,
                [userId]
            );
            data.pointTransactions = pointTransactions;

            const [orders] = await pool.query(
                `SELECT order_id, sponsor_org_id, status, created_at,
                        delivery_name, delivery_address, delivery_city, delivery_state, delivery_zip,
                        cancel_reason, cancelled_at
                 FROM orders WHERE driver_user_id = ? ORDER BY created_at DESC`,
                [userId]
            );
            data.orders = orders;

            const [applications] = await pool.query(
                `SELECT application_id, sponsor_org_id, status, decision_reason, applied_at, reviewed_at
                 FROM driver_applications WHERE driver_user_id = ? ORDER BY applied_at DESC`,
                [userId]
            );
            data.applications = applications;

            const [pointContests] = await pool.query(
                `SELECT contest_id, transaction_id, sponsor_org_id, reason, status, created_at
                 FROM point_contests WHERE driver_user_id = ? ORDER BY created_at DESC`,
                [userId]
            );
            data.pointContests = pointContests;
        }

        if (user.user_type === 'sponsor') {
            const [sponsorInfo] = await pool.query(
                `SELECT su.sponsor_org_id, so.name AS sponsor_org_name, so.point_value
                 FROM sponsor_user su
                 LEFT JOIN sponsor_organization so ON su.sponsor_org_id = so.sponsor_org_id
                 WHERE su.user_id = ?`,
                [userId]
            );
            data.sponsorInfo = sponsorInfo[0] || null;
        }

        // Login history (all roles)
        const [loginHistory] = await pool.query(
            `SELECT log_id, login_date, result, failure_reason
             FROM login_logs WHERE user_id = ? ORDER BY login_date DESC`,
            [userId]
        );
        data.loginHistory = loginHistory;

        // Password change logs (all roles)
        const [passwordChangeLogs] = await pool.query(
            `SELECT log_id, change_type, created_at
             FROM password_change_log WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.passwordChangeLogs = passwordChangeLogs;

        // Notifications (all roles)
        const [notifications] = await pool.query(
            `SELECT notification_id, category, message, read_at, created_at
             FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.notifications = notifications;

        // Notification preferences (all roles)
        const [notifPrefs] = await pool.query(
            `SELECT points_changed_enabled, order_placed_enabled
             FROM notification_preferences WHERE user_id = ?`,
            [userId]
        );
        data.notificationPreferences = notifPrefs[0] || null;

        // Support tickets (all roles)
        const [supportTickets] = await pool.query(
            `SELECT ticket_id, sponsor_org_id, title, description, category, status, created_at, updated_at
             FROM support_tickets WHERE user_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.supportTickets = supportTickets;

        // Messages sent by user (all roles)
        const [sentMessages] = await pool.query(
            `SELECT message_id, recipient_id, sponsor_org_id, message_type, message_subject, body, created_at
             FROM messages WHERE sender_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.sentMessages = sentMessages;

        // Messages received by user (all roles)
        const [receivedMessages] = await pool.query(
            `SELECT message_id, sender_id, sponsor_org_id, message_type, message_subject, body, read_at, created_at
             FROM messages WHERE recipient_id = ? ORDER BY created_at DESC`,
            [userId]
        );
        data.receivedMessages = receivedMessages;

        data.exportedAt = new Date().toISOString();

        // Send as downloadable JSON file
        const filename = `personal-data-${userId}-${Date.now()}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify(data, null, 2));

    } catch (error) {
        console.error('Error downloading personal data:', error);
        res.status(500).json({ error: 'Failed to download personal data' });
    }
});

app.get('/api/sales', async(req, res) => {
    const { orgId, driverId, dateRange } = req.query;
    try {
        let query = 'SELECT orders.*, order_items.price_usd_at_purchase FROM orders JOIN order_items ON orders.order_id = order_items.order_id';
        const params = []
        const conditions = [];

        if (orgId && orgId !== 'undefined' && orgId !== 'null' && orgId !== "All") {
            conditions.push("sponsor_org_id = ?");
            params.push(orgId);
        }

        if (driverId && driverId !== 'undefined' && driverId !== 'null' && driverId !== "All") {
                conditions.push("driver_user_id = ?");
                params.push(driverId);
            }

        if (dateRange) {
            const { fromDate, toDate } = JSON.parse(dateRange);

            if (fromDate && toDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, toDate);
            } 
            else if (fromDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(fromDate, fromDate);
            } 
            else if (toDate) {
                conditions.push('created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)');
                params.push(toDate, toDate);
            }
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(' AND ');
        }
        
        const [sales] = await pool.query(query, params);
        res.json({ sales });
    } catch (error) {
        console.error('Error fetching sales data:', error);
        res.status(500).json({ error: 'Failed to fetch sales data' });
    }
});

app.get('/api/sales/:orderId/items', async(req, res) => {
    const { orderId } = req.params;
    try {
        const [items] = await pool.query(
            'SELECT * FROM order_items WHERE order_id = ?',
            [orderId]
        );
        res.json({ items });
    } catch (error) {
        console.error('Error fetching order items:', error);
        res.status(500).json({ error: 'Failed to fetch order items' });
    }
});

export { app };
