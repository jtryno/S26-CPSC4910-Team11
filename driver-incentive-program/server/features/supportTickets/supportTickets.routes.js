import { Router } from 'express';
import pool from '../../db.js';
import { createNotification } from '../../services/notification.service.js';

const router = Router();

// Static sub-paths must come before dynamic /:ticketId
router.get('/support-tickets/purchased-items/:driverId', async (req, res) => {
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

router.get('/support-tickets/user/:userId', async (req, res) => {
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

router.get('/support-tickets/org/:sponsorOrgId', async (req, res) => {
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

router.get('/support-tickets/drivers/:sponsorUserId', async (req, res) => {
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

router.get('/support-tickets', async (_req, res) => {
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

router.post('/support-tickets', async (req, res) => {
    const { userId, sponsorOrgId, title, description, category, securityIssueType, subjectDriverId, relatedOrderItemId } = req.body;
    if (!title || !title.trim()) {
        return res.status(400).json({ error: 'Title is required.' });
    }
    if (!description || !description.trim()) {
        return res.status(400).json({ error: 'Description is required.' });
    }
    const validCategories = ['general', 'security', 'catalog_order'];
    const ticketCategory = category || 'general';
    if (!validCategories.includes(ticketCategory)) {
        return res.status(400).json({ error: 'Invalid category. Must be general, security, or catalog_order.' });
    }
    const validSecurityIssueTypes = ['unauthorized_access', 'account_compromise', 'data_breach', 'suspicious_activity', 'brute_force', 'other'];
    let securityIssueTypeValue = null;
    if (ticketCategory === 'security') {
        if (!securityIssueType || !validSecurityIssueTypes.includes(securityIssueType)) {
            return res.status(400).json({ error: 'A security issue type is required for security tickets.' });
        }
        securityIssueTypeValue = securityIssueType;
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO support_tickets (user_id, sponsor_org_id, title, description, category, security_issue_type, subject_driver_id, related_order_item_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, sponsorOrgId || null, title.trim(), description.trim(), ticketCategory, securityIssueTypeValue, subjectDriverId || null, relatedOrderItemId || null]
        );

        if (ticketCategory === 'security') {
            const [admins] = await pool.query(`SELECT user_id FROM users WHERE user_type = 'admin' AND is_active = 1`);
            if (admins.length > 0) {
                const notifValues = admins.map(a => [
                    a.user_id,
                    'ticket_updated',
                    `Security alert: A user has submitted a security support ticket "${title}"`,
                    new Date(),
                ]);
                await pool.query(`INSERT INTO notifications (user_id, category, message, created_at) VALUES ?`, [notifValues]);
            }
        }
        res.json({ message: 'Ticket created successfully', ticket_id: result.insertId });
    } catch (error) {
        console.error('Error creating support ticket:', error);
        res.status(500).json({ error: 'Failed to create support ticket.' });
    }
});

// Dynamic :ticketId routes — specific sub-paths before generic
router.put('/support-tickets/:ticketId/status', async (req, res) => {
    const { status, userId, userType, note } = req.body;
    const validStatuses = ['open', 'in_progress', 'resolved'];
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be open, in_progress, or resolved.' });
    }
    try {
        if (userType === 'sponsor') {
            if (status !== 'resolved') {
                return res.status(403).json({ error: 'Sponsors can only mark tickets as resolved.' });
            }
            const [[sponsorUser]] = await pool.query('SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?', [userId]);
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
            if (note && note.trim()) {
                await pool.query(
                    'INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)',
                    [req.params.ticketId, userId, note.trim()]
                );
            }
            return res.json({ message: 'Ticket updated successfully' });
        }

        const [result] = await pool.query(
            'UPDATE support_tickets SET status = ? WHERE ticket_id = ?',
            [status, req.params.ticketId]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Ticket not found.' });
        }
        if (status === 'in_progress' || status === 'resolved') {
            const [[ticket]] = await pool.query('SELECT user_id FROM support_tickets WHERE ticket_id = ?', [req.params.ticketId]);
            if (ticket) {
                const statusLabel = status === 'in_progress' ? 'In Progress' : 'Resolved';
                await createNotification(ticket.user_id, 'ticket_updated', `Your support ticket #${req.params.ticketId} has been marked as ${statusLabel}.`);
            }
        }
        res.json({ message: 'Ticket updated successfully' });
    } catch (error) {
        console.error('Error updating support ticket status:', error);
        res.status(500).json({ error: 'Failed to update ticket status.' });
    }
});

router.put('/support-tickets/:ticketId/archive', async (req, res) => {
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
                const [[sponsorUser]] = await pool.query('SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?', [userId]);
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

router.put('/support-tickets/:ticketId/reopen', async (req, res) => {
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
        const isOwner = ticket.user_id === parseInt(userId);
        const isSubjectDriver = ticket.subject_driver_id === parseInt(userId);
        if (!isOwner && !isSubjectDriver) {
            if (userType === 'sponsor') {
                const [[sponsorUser]] = await pool.query('SELECT sponsor_org_id FROM sponsor_user WHERE user_id = ?', [userId]);
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

router.put('/support-tickets/:ticketId', async (req, res) => {
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

router.get('/ticket-comments/:ticketId', async (req, res) => {
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

router.post('/ticket-comments', async (req, res) => {
    const { ticket_id, user_id, body } = req.body;
    if (!ticket_id || !user_id || !body?.trim()) {
        return res.status(400).json({ error: 'ticket_id, user_id, and body are required' });
    }
    try {
        const [result] = await pool.query(
            'INSERT INTO ticket_comments (ticket_id, user_id, body) VALUES (?, ?, ?)',
            [ticket_id, user_id, body.trim()]
        );
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

export default router;
