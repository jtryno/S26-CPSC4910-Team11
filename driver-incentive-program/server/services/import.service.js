import pool from '../db.js';
import { hashPassword, isPasswordComplex } from '../utils/password.js';
import {
    DRIVER_IMPORT_HEADER_ALIASES,
    DRIVER_IMPORT_REQUIRED_HEADERS,
    DRIVER_IMPORT_MAX_ROWS,
    normalizeCsvHeader,
    parseCsvText,
    isLikelyEmail,
    formatPhoneNumber,
    sanitizeUsername,
    generateTemporaryPassword,
    isNonEmptyCsvRow,
    buildFailedImportResult,
    createImportBaseResult,
    parsePipeDelimitedLines,
    validateBulkLine,
} from '../utils/csv.js';
import { createHttpError } from '../utils/httpError.js';
import { createPasswordResetToken, createOnboardingPath } from './auth.service.js';

// ─── Username resolution ──────────────────────────────────────────────────────

export async function findAvailableUsername(connection, desiredBase, reservedUsernames = new Set()) {
    let base = sanitizeUsername(desiredBase);
    if (!base || base.length < 3) {
        const { randomInt } = await import('crypto');
        base = `driver_${randomInt(1000, 10000)}`;
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

// ─── Organization membership ──────────────────────────────────────────────────

export async function insertOrganizationMembership(connection, userId, sponsorOrgId, userRole, requestingUserId) {
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

// ─── Authorization ────────────────────────────────────────────────────────────

export async function authorizeOrganizationImport(requestingUserId, sponsorOrgId) {
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

// ─── CSV import helpers ───────────────────────────────────────────────────────

export function parseOrganizationImportCsv(csvText) {
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

export function mapOrganizationImportRow(headers, row) {
    const rowData = {};
    headers.forEach((header, index) => {
        if (header) {
            rowData[header] = String(row[index] || '').trim();
        }
    });
    return rowData;
}

export function prepareOrganizationImportRow(rowData, baseResult, reservedEmails, reservedUsernames) {
    const { firstName, lastName, email } = baseResult;

    if (!firstName || !lastName || !email) {
        throw createHttpError(400, 'firstName, lastName, and email are required', { result: baseResult });
    }

    if (!isLikelyEmail(email)) {
        throw createHttpError(400, 'Email address is not valid', { result: baseResult });
    }

    if (reservedEmails.has(email)) {
        throw createHttpError(400, 'This email appears more than once in the CSV', { result: baseResult });
    }

    const rawPhoneNumber = String(rowData.phoneNumber || '').trim();
    const formattedPhoneNumber = rawPhoneNumber ? formatPhoneNumber(rawPhoneNumber) : null;
    if (rawPhoneNumber && !formattedPhoneNumber) {
        throw createHttpError(400, 'Phone number must contain exactly 10 digits', { result: baseResult });
    }

    const providedPassword = String(rowData.password || '').trim();
    const needsOnboarding = !providedPassword;
    const passwordToStore = providedPassword || generateTemporaryPassword();
    if (providedPassword && !isPasswordComplex(passwordToStore)) {
        throw createHttpError(400, 'Password must meet the app complexity rules', { result: baseResult });
    }

    const providedUsername = sanitizeUsername(rowData.username);
    if (rowData.username && providedUsername.length < 3) {
        throw createHttpError(400, 'Username must be at least 3 characters after normalization', { result: baseResult });
    }

    if (providedUsername && reservedUsernames.has(providedUsername.toLowerCase())) {
        throw createHttpError(400, 'This username appears more than once in the CSV', { result: baseResult });
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

export async function resolveImportedUsername(connection, preparedRow, reservedUsernames) {
    if (preparedRow.providedUsername) {
        const [existingUsernameRows] = await connection.query(
            'SELECT user_id FROM users WHERE username = ? LIMIT 1',
            [preparedRow.providedUsername]
        );

        if (existingUsernameRows.length > 0) {
            throw createHttpError(400, 'A user with this username already exists', { result: preparedRow.baseResult });
        }

        return preparedRow.providedUsername;
    }

    return findAvailableUsername(connection, preparedRow.usernameSeed, reservedUsernames);
}

async function createOnboardingDetails(connection, userId, needsOnboarding) {
    if (!needsOnboarding) {
        return { onboardingToken: null, onboardingPath: null };
    }

    const { token } = await createPasswordResetToken(userId, connection);
    return {
        onboardingToken: token,
        onboardingPath: createOnboardingPath(token),
    };
}

export async function importOrganizationUserRow({
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
            throw createHttpError(400, 'A user with this email already exists', { result: preparedRow.baseResult });
        }

        const username = await resolveImportedUsername(connection, preparedRow, reservedUsernames);
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

        await insertOrganizationMembership(connection, userInsertResult.insertId, sponsorOrgId, userRole, requestingUserId);

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

export function formatImportRowError(error) {
    if (error?.status && error?.message) {
        return error.message;
    }

    if (error?.message?.includes('Duplicate entry')) {
        return 'A user with this email or username already exists';
    }

    return 'Failed to import this user row';
}

// ─── Pipe-delimited bulk upload helpers ──────────────────────────────────────

export async function processBulkOrgLines(connection, oLines, results) {
    const orgMap = new Map();
    let orgsCreated = 0;

    for (const line of oLines) {
        const nameLower = line.orgName.toLowerCase();

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

export async function processBulkUserLine({
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
        let targetOrgId;
        let targetOrgName;

        if (requesterType === 'sponsor') {
            targetOrgId = callerOrgId;
            const [orgRows] = await connection.query(
                'SELECT name FROM sponsor_organization WHERE sponsor_org_id = ?',
                [callerOrgId]
            );
            targetOrgName = orgRows.length > 0 ? orgRows[0].name : '';
        } else {
            if (!line.orgName) {
                throw createHttpError(400, 'Organization name is required for admin bulk upload.');
            }
            const nameLower = line.orgName.toLowerCase();
            const fromMap = orgMap.get(nameLower);
            if (fromMap) {
                targetOrgId = fromMap.sponsor_org_id;
                targetOrgName = fromMap.name;
            } else {
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

        if (reservedEmails.has(line.email)) {
            throw createHttpError(400, 'This email appears more than once in the file.');
        }

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
            userId = existingUsers[0].user_id;
            const existingType = existingUsers[0].user_type;

            if (line.type === 'S') {
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

            if (existingType === 'driver') {
                const [driverRows] = await connection.query(
                    'SELECT driver_user_id FROM driver_sponsor WHERE driver_user_id = ? AND sponsor_org_id = ? AND driver_status = ?',
                    [userId, targetOrgId, 'active']
                );

                if (driverRows.length === 0) {
                    await connection.query('INSERT IGNORE INTO driver_user (user_id) VALUES (?)', [userId]);
                    await connection.query(
                        `INSERT INTO driver_sponsor (driver_user_id, sponsor_org_id, driver_status, affilated_at)
                         VALUES (?, ?, 'active', NOW())
                         ON DUPLICATE KEY UPDATE driver_status = 'active', affilated_at = NOW(), dropped_at = NULL, drop_reason = NULL, is_archived = 0`,
                        [userId, targetOrgId]
                    );
                }

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

            throw createHttpError(400, `User with this email already exists as "${existingType}" and cannot be added as a driver.`);
        }

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

        await insertOrganizationMembership(connection, userId, targetOrgId, userType, requestingUserId);

        const { token } = await createPasswordResetToken(userId, connection);
        onboardingPath = createOnboardingPath(token);

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

// ─── Shared route handlers ────────────────────────────────────────────────────

export const importOrganizationUsersFromCsv = async (req, res) => {
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
                const baseResult = createImportBaseResult(rowData, rowNumber, normalizedUserRole);

                try {
                    const preparedRow = prepareOrganizationImportRow(rowData, baseResult, reservedEmails, reservedUsernames);
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
                        buildFailedImportResult(rowError.result || baseResult, formatImportRowError(rowError))
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

export const importUsersFromPipeFile = async (req, res) => {
    const { sponsor_org_id } = req.params;
    const { requestingUserId, fileText } = req.body;

    if (!requestingUserId) {
        return res.status(400).json({ error: 'requestingUserId is required' });
    }
    if (!fileText || !String(fileText).trim()) {
        return res.status(400).json({ error: 'fileText is required' });
    }

    try {
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

        if (requesterType === 'sponsor') {
            await authorizeOrganizationImport(requestingUserId, sponsor_org_id);
        }

        const lines = parsePipeDelimitedLines(fileText);
        if (lines.length === 0) {
            return res.status(400).json({ error: 'File contains no data lines.' });
        }

        const results = [];
        let importedCount = 0;
        let failedCount = 0;
        let skippedCount = 0;

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

        const oEntries = validatedLines.filter(e => e.line.type === 'O');
        const userEntries = validatedLines.filter(e => e.line.type !== 'O');

        const connection = await pool.getConnection();

        try {
            const { orgMap } = await processBulkOrgLines(
                connection,
                oEntries.map(e => e.line),
                results
            );
            const validationFailCount = failedCount;
            for (let i = validationFailCount; i < results.length; i++) {
                if (results[i].type === 'O' && results[i].status === 'imported') importedCount += 1;
                else if (results[i].type === 'O' && results[i].status === 'failed') failedCount += 1;
            }

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
