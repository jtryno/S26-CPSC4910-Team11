import { Resend } from 'resend';
import process from 'process';

const DEFAULT_FROM = 'Good Driver <onboarding@resend.dev>';

let resendClient = null;
let resendClientKey = null;

function getResendClient() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        throw new Error('RESEND_API_KEY is not configured');
    }

    if (!resendClient || resendClientKey !== apiKey) {
        resendClient = new Resend(apiKey);
        resendClientKey = apiKey;
    }

    return resendClient;
}

async function sendEmail({ to, subject, html, text }) {
    if (!to) {
        throw new Error('Email recipient is required');
    }

    const from = process.env.RESEND_FROM || DEFAULT_FROM;
    const replyTo = process.env.RESEND_REPLY_TO;
    const payload = {
        from,
        to,
        subject,
        html,
        text,
    };

    if (replyTo) {
        payload.replyTo = replyTo;
    }

    const { data, error } = await getResendClient().emails.send(payload);
    if (error) {
        const message = error.message || 'Resend failed to send email';
        const sendError = new Error(message);
        sendError.details = error;
        throw sendError;
    }

    return data;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function normalizeHttpUrl(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Email URLs must use http or https');
    }

    return url.toString();
}

export async function sendTwoFaCodeEmail({ to, code }) {
    return sendEmail({
        to,
        subject: 'Your Good Driver sign-in code',
        text: `Your Good Driver sign-in code is ${code}. This code expires in 10 minutes. If you did not try to sign in, you can ignore this email.`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1a1a1a;">
                <h2>Your Good Driver sign-in code</h2>
                <p>Use this code to complete sign in:</p>
                <p style="font-size: 28px; font-weight: 700; letter-spacing: 6px; margin: 24px 0;">${code}</p>
                <p>This code expires in 10 minutes.</p>
                <p>If you did not try to sign in, you can ignore this email.</p>
            </div>
        `,
    });
}

export async function sendPasswordResetEmail({ to, resetUrl }) {
    const normalizedResetUrl = normalizeHttpUrl(resetUrl);
    const safeResetUrl = escapeHtml(normalizedResetUrl);

    return sendEmail({
        to,
        subject: 'Reset your Good Driver password',
        text: `Use this link to reset your Good Driver password: ${normalizedResetUrl}\n\nThis link expires in 24 hours. If you did not request a password reset, you can ignore this email.`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1a1a1a;">
                <h2>Reset your Good Driver password</h2>
                <p>Use the link below to choose a new password. This link expires in 24 hours.</p>
                <p><a href="${safeResetUrl}" style="display: inline-block; background: #0066cc; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none;">Reset password</a></p>
                <p>If the button does not work, copy and paste this URL into your browser:</p>
                <p style="word-break: break-all;"><a href="${safeResetUrl}">${safeResetUrl}</a></p>
                <p>If you did not request a password reset, you can ignore this email.</p>
            </div>
        `,
    });
}
