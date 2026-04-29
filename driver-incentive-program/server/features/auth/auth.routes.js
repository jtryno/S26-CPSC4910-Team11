import crypto from 'crypto';
import { Router } from 'express';
import pool from '../../db.js';
import { sendPasswordResetEmail, sendTwoFaCodeEmail } from '../../email.js';
import { createSession, resolveSession, deleteSession } from '../../services/session.service.js';
import { createPasswordResetToken, getAppBaseUrl, createPasswordResetUrl } from '../../services/auth.service.js';
import { createNotification } from '../../services/notification.service.js';
import { buildUserPayload, getSponsorOrgId } from '../../services/org.service.js';
import {
    hashPassword,
    isPasswordComplex,
    isScryptHash,
    verifyScryptPassword,
    MAX_LOGIN_ATTEMPTS,
    LOCKOUT_DURATION_MINUTES,
    hashSecret,
} from '../../utils/password.js';

const router = Router();

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = users[0];

        if (user.lockout_until && new Date() < new Date(user.lockout_until)) {
            const remainingMinutes = Math.ceil((new Date(user.lockout_until) - new Date()) / 60000);
            return res.status(403).json({
                message: `Account locked due to too many failed login attempts. Please try again in ${remainingMinutes} minute(s).`
            });
        }

        if (user.lockout_until && new Date() >= new Date(user.lockout_until)) {
            await pool.query(
                'UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, last_failed_login = NULL WHERE user_id = ?',
                [user.user_id]
            );
        }

        if (!isPasswordComplex(password)) {
            return res.status(400).json({ message: 'Security update required: Password does not meet complexity standards.' });
        }

        const stored = user.password_hash;
        let ok = false;

        if (isScryptHash(stored)) {
            ok = verifyScryptPassword(password, stored);
        } else {
            ok = password === stored;
        }

        if (!ok) {
            const newFails = user.failed_login_attempts + 1;
            const shouldLock = newFails >= 5;

            await pool.query('UPDATE users SET failed_login_attempts = ?, is_locked = ? WHERE user_id = ?', [newFails, shouldLock, user.user_id]);
            let failureReason = 'incorrect password';
            if (shouldLock) {
                failureReason = 'account is locked';
            }
            await pool.query('INSERT INTO login_logs (username, login_date, result, user_id, failure_reason) VALUES (?, NOW(), ?, ?, ?)', [user.username, 'failure', user.user_id, failureReason]);
            const newAttempts = (user.failed_login_attempts || 0) + 1;

            if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
                const lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000);
                await pool.query(
                    'UPDATE users SET failed_login_attempts = ?, lockout_until = ?, last_failed_login = NOW() WHERE user_id = ?',
                    [newAttempts, lockUntil, user.user_id]
                );
                return res.status(403).json({
                    message: `Account locked due to too many failed login attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`
                });
            } else {
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

        if (!isScryptHash(stored)) {
            const upgraded = hashPassword(password);
            await pool.query('UPDATE users SET password_hash = ? WHERE user_id = ?', [upgraded, user.user_id]);
        }

        if (user.failed_login_attempts > 0 || user.lockout_until) {
            await pool.query(
                'UPDATE users SET failed_login_attempts = 0, lockout_until = NULL, last_failed_login = NULL WHERE user_id = ?',
                [user.user_id]
            );
        }

        if (user.two_fa_enabled) {
            const code = crypto.randomInt(100000, 1000000).toString();
            const codeHash = hashSecret(code);
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            const [codeInsertResult] = await pool.query(
                'INSERT INTO two_fa_codes (user_id, code_hash, expires_at) VALUES (?, ?, ?)',
                [user.user_id, codeHash, expiresAt]
            );

            try {
                await sendTwoFaCodeEmail({ to: user.email, code });
            } catch (emailError) {
                console.error('2FA email send error:', emailError);
                if (codeInsertResult.insertId) {
                    await pool.query('UPDATE two_fa_codes SET used_at = NOW() WHERE code_id = ?', [codeInsertResult.insertId]);
                }
                return res.status(502).json({
                    error: 'Unable to send 2FA code email. Please try again later.'
                });
            }

            return res.json({
                requiresTwoFa: true,
                userId: user.user_id,
                message: '2FA code sent to your email.'
            });
        }

        const { password_hash: _, ...userNoPassword } = user;
        if (req.body.rememberMe) {
            const maxAge = 10 * 24 * 60 * 60 * 1000;
            const sessionToken = await createSession(user.user_id, maxAge);
            res.cookie('remember_me', sessionToken, {
                maxAge,
                httpOnly: true,
                sameSite: 'lax'
            });
        }

        await pool.query('UPDATE users SET failed_login_attempts = 0, last_login = NOW() WHERE user_id = ?', [user.user_id]);
        await pool.query('INSERT INTO login_logs (username, login_date, result, user_id) VALUES (?, NOW(), ?, ?)', [user.username, 'success', user.user_id]);

        const userPayload = await buildUserPayload(userNoPassword);
        return res.json({ message: 'Login successful', user: userPayload });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

router.post('/password-reset/request', async (req, res) => {
    const { email } = req.body;
    const resetRequestMessage = 'If an account exists for that email, a reset link has been sent.';
    try {
        const [users] = await pool.query('SELECT user_id, email FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.json({ message: resetRequestMessage });

        const appBaseUrl = getAppBaseUrl();
        const { token, tokenId } = await createPasswordResetToken(users[0].user_id);
        const resetUrl = createPasswordResetUrl(token, appBaseUrl);

        try {
            await sendPasswordResetEmail({ to: users[0].email, resetUrl });
        } catch (emailError) {
            console.error('Password reset email send error:', emailError);
            if (tokenId) {
                await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE token_id = ?', [tokenId]);
            }
            return res.status(502).json({
                error: 'Unable to send password reset email. Please try again later.'
            });
        }

        res.json({ message: resetRequestMessage });
    } catch (error) {
        console.error('Password reset request error:', error);
        res.status(500).json({ error: 'Failed to generate reset link' });
    }
});

router.post('/password-reset/confirm', async (req, res) => {
    const { token, newPassword } = req.body;

    if (typeof token !== 'string' || token.trim() === '') {
        return res.status(400).json({ message: 'Reset token is required.' });
    }

    if (!isPasswordComplex(newPassword)) {
        return res.status(400).json({ message: 'Password does not meet complexity requirements.' });
    }

    try {
        const tokenHash = hashSecret(token);
        const [tokens] = await pool.query(
            'SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL',
            [tokenHash]
        );

        if (tokens.length === 0) return res.status(400).json({ message: 'Invalid or used token' });

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
        await pool.query('INSERT INTO password_change_log (user_id, change_type, username) VALUES (?, ?, ?)', [tokens[0].user_id, 'reset', user[0].username]);

        res.json({ message: 'Password reset successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Server error during password reset' });
    }
});

router.get('/session', async (req, res) => {
    const userId = await resolveSession(req.cookies.remember_me);

    if (!userId) {
        return res.status(401).json({ loggedIn: false });
    }

    try {
        const [users] = await pool.query('SELECT user_id, email, username, user_type FROM users WHERE user_id = ?', [userId]);
        if (users.length === 0) {
            return res.status(401).json({ loggedIn: false });
        }
        const realUser = users[0];
        const realUserPayload = await buildUserPayload(realUser);

        const impersonatingId = req.cookies.impersonating;
        if (impersonatingId) {
            const [targetUsers] = await pool.query('SELECT user_id, email, username, user_type FROM users WHERE user_id = ?', [impersonatingId]);
            if (targetUsers.length > 0) {
                const targetUser = targetUsers[0];

                let permitted = false;
                if (realUser.user_type === 'admin' && targetUser.user_type !== 'admin') {
                    permitted = true;
                } else if (realUser.user_type === 'sponsor' && targetUser.user_type === 'driver') {
                    const actorOrgId = await getSponsorOrgId(realUser.user_id, 'sponsor');
                    const targetOrgId = await getSponsorOrgId(targetUser.user_id, 'driver');
                    permitted = actorOrgId && targetOrgId && actorOrgId === targetOrgId;
                }

                if (permitted) {
                    const targetUserPayload = await buildUserPayload(targetUser);
                    return res.json({
                        loggedIn: true,
                        isImpersonating: true,
                        user: targetUserPayload,
                        originalUser: realUserPayload,
                    });
                }
            }
            res.clearCookie('impersonating');
        }

        res.json({ loggedIn: true, user: realUserPayload });
    } catch (error) {
        res.status(500).json({ error: 'Session check failed' });
    }
});

router.post('/signup', async (req, res) => {
    try {
        const { firstName, lastName, phoneNumber, email, username, password, userRole, orgId, createdByUserId } = req.body;
        if (!isPasswordComplex(password)) {
            return res.status(400).json({ message: 'Password does not meet complexity requirements.' });
        }
        const passwordHash = hashPassword(password);
        const [result] = await pool.query(
            'INSERT INTO users (first_name, last_name, phone_number, email, username, password_hash, user_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
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

router.post('/logout', async (req, res) => {
    await deleteSession(req.cookies.remember_me);
    res.clearCookie('remember_me');
    res.clearCookie('impersonating');
    res.json({ message: 'Logged out successfully' });
});

router.post('/impersonate', async (req, res) => {
    const realUserId = await resolveSession(req.cookies.remember_me) || req.body.actorUserId;
    if (!realUserId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const { targetUserId } = req.body;
    if (!targetUserId) {
        return res.status(400).json({ error: 'targetUserId is required' });
    }

    try {
        const [actors] = await pool.query('SELECT user_id, username, user_type FROM users WHERE user_id = ?', [realUserId]);
        if (actors.length === 0) {
            return res.status(401).json({ error: 'Actor user not found' });
        }
        const actor = actors[0];

        if (!['admin', 'sponsor'].includes(actor.user_type)) {
            return res.status(403).json({ error: 'Only admins and sponsors can assume identities' });
        }

        const [targets] = await pool.query('SELECT user_id, email, username, user_type FROM users WHERE user_id = ?', [targetUserId]);
        if (targets.length === 0) {
            return res.status(404).json({ error: 'Target user not found' });
        }
        const target = targets[0];

        if (target.user_id === actor.user_id) {
            return res.status(400).json({ error: 'Cannot assume your own identity' });
        }

        if (actor.user_type === 'admin') {
            if (target.user_type === 'admin') {
                return res.status(403).json({ error: 'Cannot assume identity of another admin' });
            }
        } else if (actor.user_type === 'sponsor') {
            if (target.user_type !== 'driver') {
                return res.status(403).json({ error: 'Sponsors can only assume identity of drivers' });
            }
            const sponsorOrgId = await getSponsorOrgId(actor.user_id, 'sponsor');
            const driverOrgId = await getSponsorOrgId(target.user_id, 'driver');
            if (!sponsorOrgId || !driverOrgId || sponsorOrgId !== driverOrgId) {
                return res.status(403).json({ error: 'Can only assume identity of drivers in your organization' });
            }
        }

        res.cookie('impersonating', target.user_id, {
            maxAge: 4 * 60 * 60 * 1000,
            httpOnly: true,
            sameSite: 'lax',
        });

        await pool.query(
            `INSERT INTO impersonation_log (actor_user_id, actor_username, actor_user_type, target_user_id, target_username, target_user_type, action)
             VALUES (?, ?, ?, ?, ?, ?, 'start')`,
            [actor.user_id, actor.username, actor.user_type, target.user_id, target.username, target.user_type]
        );

        const targetUserPayload = await buildUserPayload(target);
        res.json({ user: targetUserPayload });
    } catch (error) {
        console.error('Impersonation start error:', error);
        res.status(500).json({ error: 'Server error during impersonation' });
    }
});

router.post('/impersonate/exit', async (req, res) => {
    const realUserId = await resolveSession(req.cookies.remember_me) || req.body.actorUserId;
    if (!realUserId) {
        return res.status(401).json({ error: 'Not authenticated' });
    }

    const impersonatedId = req.cookies.impersonating;

    try {
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

        const [users] = await pool.query('SELECT user_id, email, username, user_type FROM users WHERE user_id = ?', [realUserId]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'User not found' });
        }
        const user = users[0];
        const userPayload = await buildUserPayload(user);
        res.json({ user: userPayload });
    } catch (error) {
        console.error('Impersonation exit error:', error);
        res.status(500).json({ error: 'Server error during impersonation exit' });
    }
});

router.post('/2fa/verify', async (req, res) => {
    const { userId, code, rememberMe } = req.body;

    if (typeof code !== 'string' || code.trim() === '') {
        return res.status(400).json({ message: '2FA code is required.' });
    }

    try {
        const codeHash = hashSecret(code);

        const [rows] = await pool.query(
            'SELECT * FROM two_fa_codes WHERE user_id = ? AND code_hash = ? AND used_at IS NULL',
            [userId, codeHash]
        );

        if (rows.length === 0) {
            return res.status(401).json({ message: 'Invalid or already used 2FA code' });
        }

        if (new Date() > new Date(rows[0].expires_at)) {
            return res.status(400).json({ message: '2FA code has expired. Please log in again.' });
        }

        await pool.query('UPDATE two_fa_codes SET used_at = NOW() WHERE code_id = ?', [rows[0].code_id]);

        const [users] = await pool.query('SELECT * FROM users WHERE user_id = ?', [userId]);
        const user = users[0];
        const { password_hash: _, ...userNoPassword } = user;

        if (rememberMe) {
            const maxAge = 10 * 24 * 60 * 60 * 1000;
            const sessionToken = await createSession(user.user_id, maxAge);
            res.cookie('remember_me', sessionToken, {
                maxAge,
                httpOnly: true,
                sameSite: 'lax'
            });
        }

        await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = ?', [user.user_id]);
        await pool.query('INSERT INTO login_logs (username, login_date, result, user_id) VALUES (?, NOW(), ?, ?)', [user.username, 'success', user.user_id]);

        const userPayload = await buildUserPayload(userNoPassword);
        return res.json({ message: 'Login successful', user: userPayload });
    } catch (error) {
        console.error('2FA verify error:', error);
        res.status(500).json({ error: 'Server error during 2FA verification' });
    }
});

router.put('/2fa/toggle', async (req, res) => {
    const { email, enabled } = req.body;

    try {
        const [users] = await pool.query('SELECT user_id FROM users WHERE email = ?', [email]);
        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        await pool.query('UPDATE users SET two_fa_enabled = ? WHERE user_id = ?', [enabled ? 1 : 0, users[0].user_id]);

        res.json({ message: `2FA ${enabled ? 'enabled' : 'disabled'} successfully` });
    } catch (error) {
        console.error('Error toggling 2FA:', error);
        res.status(500).json({ error: 'Failed to update 2FA setting' });
    }
});

export default router;
