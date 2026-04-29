import crypto from 'crypto';

export const DRIVER_IMPORT_HEADER_ALIASES = {
    firstname: 'firstName',
    lastname: 'lastName',
    email: 'email',
    username: 'username',
    password: 'password',
    phonenumber: 'phoneNumber',
    phone: 'phoneNumber',
    mobile: 'phoneNumber',
};

export const DRIVER_IMPORT_REQUIRED_HEADERS = ['firstName', 'lastName', 'email'];
export const DRIVER_IMPORT_MAX_ROWS = 250;

export function normalizeCsvHeader(header) {
    return String(header || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

export function parseCsvText(text) {
    const input = String(text || '').replace(/^﻿/, '');
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

export function isLikelyEmail(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) return false;
    const parts = trimmed.split('@');
    if (parts.length !== 2) return false;
    return parts[0].length > 0 &&
        parts[1].includes('.') &&
        !parts[1].startsWith('.') &&
        !parts[1].endsWith('.');
}

export function formatPhoneNumber(value) {
    const digitsOnly = String(value || '').replace(/\D/g, '');
    if (!digitsOnly) return null;
    if (digitsOnly.length !== 10) return null;
    return `(${digitsOnly.slice(0, 3)}) ${digitsOnly.slice(3, 6)}-${digitsOnly.slice(6, 10)}`;
}

export function sanitizeUsername(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
}

export function generateTemporaryPassword() {
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

export function isNonEmptyCsvRow(row) {
    return row.some(cell => String(cell || '').trim() !== '');
}

export function buildFailedImportResult(baseResult, errorMessage) {
    return {
        ...baseResult,
        status: 'failed',
        error: errorMessage,
    };
}

export function createImportBaseResult(rowData, rowNumber, userRole) {
    return {
        rowNumber,
        firstName: String(rowData.firstName || '').trim(),
        lastName: String(rowData.lastName || '').trim(),
        email: String(rowData.email || '').trim().toLowerCase(),
        userRole,
    };
}

// Pipe-delimited format parsing

export function parsePipeDelimitedLines(fileText) {
    const rawLines = String(fileText).replace(/^﻿/, '').split(/\r?\n/);
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

export function validateBulkLine(line, requesterType) {
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
