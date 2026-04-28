import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import SortableTable from '../components/SortableTable';
import TabGroup from '../components/TabGroup';
import DropdownField from '../components/DropdownField';
import DatePicker from '../components/DatePicker';
import { fetchOrganizations } from '../api/OrganizationApi';
import {
    createTicket,
    fetchTicketsForUser,
    fetchAllTickets,
    updateTicketStatus,
    reopenTicket,
    fetchOrgTickets,
    fetchOrgDrivers,
    updateTicketDescription,
    archiveTicket,
    fetchTicketComments,
    addTicketComment,
    fetchPurchasedItems,
} from '../api/SupportTicketApi';
import { PageHeader, Badge, Button, Alert, Card, EmptyState } from '../components/ui';

const STATUS_TONE = {
    open: 'warning', in_progress: 'info', resolved: 'success', archived: 'neutral',
};
const STATUS_LABEL = {
    open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', archived: 'Archived',
};

const SECURITY_ISSUE_TYPES = {
    unauthorized_access: 'Unauthorized Access',
    account_compromise: 'Account Compromise',
    data_breach: 'Data Breach',
    suspicious_activity: 'Suspicious Activity',
    brute_force: 'Brute Force / Failed Logins',
    other: 'Other',
};

const StatusBadge = ({ status }) => (
    <Badge tone={STATUS_TONE[status] || 'neutral'}>
        {STATUS_LABEL[status] || status}
    </Badge>
);

// displaying user role next to a comment author's name
const USER_TYPE_LABEL = { driver: 'Driver', sponsor: 'Sponsor', admin: 'Admin' };

// shared comments section (fetches and displays comments for ticket)
// and lets the current user post new ones
const CommentsSection = ({ ticketId, userId }) => {
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [commentBody, setCommentBody] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState(null);

    useEffect(() => {
        fetchTicketComments(ticketId)
            .then(data => { setComments(data || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, [ticketId]);

    const handleSubmit = async () => {
        if (!commentBody.trim()) return;
        setSubmitting(true);
        setMsg(null);
        try {
            const result = await addTicketComment(ticketId, userId, commentBody.trim());
            if (result.comment) {
                setComments(prev => [...prev, result.comment]);
                setCommentBody('');
            } else {
                setMsg(result.error || 'Failed to add comment.');
            }
        } catch {
            setMsg('Network error. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{ marginTop: '16px', borderTop: '1px solid #e0e0e0', paddingTop: '12px' }}>
            <strong style={{ color: '#1a1a1a', fontSize: '0.95em' }}>Comments</strong>
            {loading && <p style={{ color: '#888', fontSize: '0.85em', margin: '8px 0' }}>Loading comments...</p>}
            {!loading && comments.length === 0 && (
                <p style={{ color: '#aaa', fontSize: '0.85em', margin: '8px 0' }}>No comments yet.</p>
            )}
            {comments.map(c => (
                <div key={c.comment_id} style={{
                    margin: '8px 0',
                    padding: '8px 12px',
                    background: '#ffffff',
                    border: '1px solid #e8e8e8',
                    borderRadius: '6px',
                }}>
                    <div style={{ fontSize: '0.8em', color: '#888', marginBottom: '4px' }}>
                        <strong style={{ color: '#333' }}>{c.first_name} {c.last_name}</strong>
                        {' · '}{USER_TYPE_LABEL[c.user_type] || c.user_type}
                        {' · '}{new Date(c.created_at).toLocaleString()}
                    </div>
                    <p style={{ margin: 0, color: '#333', whiteSpace: 'pre-wrap', fontSize: '0.9em' }}>{c.body}</p>
                </div>
            ))}
            <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <textarea
                    value={commentBody}
                    onChange={e => setCommentBody(e.target.value)}
                    placeholder="Add a comment..."
                    rows={2}
                    style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px', resize: 'vertical', fontSize: '0.9em', boxSizing: 'border-box' }}
                />
                <button
                    onClick={handleSubmit}
                    disabled={submitting || !commentBody.trim()}
                    style={{
                        backgroundColor: '#1976d2',
                        color: 'white',
                        border: 'none',
                        padding: '8px 14px',
                        borderRadius: '4px',
                        cursor: submitting || !commentBody.trim() ? 'default' : 'pointer',
                        opacity: submitting || !commentBody.trim() ? 0.7 : 1,
                    }}
                >
                    {submitting ? 'Posting...' : 'Post'}
                </button>
            </div>
            {msg && (
                <div style={{ background: '#ffebee', color: '#c62828', padding: '6px 10px', borderRadius: '4px', marginTop: '6px', fontSize: '0.85em' }}>
                    {msg}
                </div>
            )}
        </div>
    );
};

// drivers (& sponsor "my tickets" tab) create, view, edit (open only), archive, and comment
const DriverView = ({ user }) => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [expandedIds, setExpandedIds] = useState(new Set());
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [ticketTitle, setTicketTitle] = useState('');
    const [ticketDesc, setTicketDesc] = useState('');
    const [submitMsg, setSubmitMsg] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // category and driver subject (for sponsors) on create form
    const [ticketCategory, setTicketCategory] = useState('general');
    const [securityIssueType, setSecurityIssueType] = useState('');
    const [driverPickerEnabled, setDriverPickerEnabled] = useState(false);
    const [subjectDriverId, setSubjectDriverId] = useState('');
    const [orgDrivers, setOrgDrivers] = useState([]);

    // catalog order complaint purchased item picker
    const [purchasedItems, setPurchasedItems] = useState([]);
    const [selectedOrderItemId, setSelectedOrderItemId] = useState('');

    // edit state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingTicket, setEditingTicket] = useState(null);
    const [editDesc, setEditDesc] = useState('');
    const [editMsg, setEditMsg] = useState(null);
    const [editSaving, setEditSaving] = useState(false);

    // reopen state,tracks which tickets are mid-req
    const [reopening, setReopening] = useState({});

    // fetches the users tickets from the backend and updates list
    const loadTickets = () => {
        setLoading(true);
        fetchTicketsForUser(user.user_id)
            .then(data => { setTickets(data || []); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    };

    // load tickets when the page first renders
    useEffect(() => { loadTickets(); }, [user.user_id]);

    // if a sponsor, load their org's active drivers for the ticket subject picker
    useEffect(() => {
        if (user.user_type !== 'sponsor') return;
        fetchOrgDrivers(user.user_id)
            .then(data => setOrgDrivers(data || []))
            .catch(() => setOrgDrivers([]));
    }, [user.user_id, user.user_type]);

    // toggles the expanded detail card for a ticket row
    const toggleExpand = (ticketId) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(ticketId) ? next.delete(ticketId) : next.add(ticketId);
            return next;
        });
    };

    // resets form fields and opens the create ticket modal
    const handleOpenModal = () => {
        setTicketTitle('');
        setTicketDesc('');
        setTicketCategory('general');
        setSecurityIssueType('');
        setDriverPickerEnabled(false);
        setSubjectDriverId('');
        setSelectedOrderItemId('');
        setPurchasedItems([]);
        setSubmitMsg(null);
        setCreateModalOpen(true);
    };

    // validates and submits the new ticket form
    const handleSubmit = async () => {
        if (!ticketTitle.trim()) {
            setSubmitMsg({ type: 'error', text: 'Please enter a title.' });
            return;
        }
        if (!ticketDesc.trim()) {
            setSubmitMsg({ type: 'error', text: 'Please enter a description.' });
            return;
        }
        if (ticketCategory === 'catalog_order' && !selectedOrderItemId) {
            setSubmitMsg({ type: 'error', text: 'Please select the item you are complaining about.' });
            return;
        }
        if (ticketCategory === 'security' && !securityIssueType) {
            setSubmitMsg({ type: 'error', text: 'Please select a security issue type.' });
            return;
        }
        setSubmitting(true);
        try {
            const result = await createTicket(
                user.user_id,
                user.sponsor_org_id || null,
                ticketTitle.trim(),
                ticketDesc.trim(),
                ticketCategory,
                ticketCategory === 'security' ? securityIssueType : null,
                driverPickerEnabled && subjectDriverId ? parseInt(subjectDriverId) : null,
                ticketCategory === 'catalog_order' && selectedOrderItemId ? parseInt(selectedOrderItemId) : null
            );
            if (result.ticket_id) {
                setCreateModalOpen(false);
                loadTickets();
            } else {
                setSubmitMsg({ type: 'error', text: result.error || 'Failed to submit ticket.' });
            }
        } catch {
            setSubmitMsg({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setSubmitting(false);
        }
    };

    // opens the edit filled with the tickets curr description
    const handleOpenEdit = (ticket) => {
        setEditingTicket(ticket);
        setEditDesc(ticket.description);
        setEditMsg(null);
        setEditModalOpen(true);
    };

    // saves the edited description (only open tickets are editable so the button wont show otherwise)
    const handleSaveEdit = async () => {
        if (!editDesc.trim()) {
            setEditMsg({ type: 'error', text: 'Description cannot be empty.' });
            return;
        }
        setEditSaving(true);
        try {
            const result = await updateTicketDescription(editingTicket.ticket_id, editDesc.trim(), user.user_id);
            if (result.message) {
                setEditModalOpen(false);
                loadTickets();
            } else {
                setEditMsg({ type: 'error', text: result.error || 'Failed to save changes.' });
            }
        } catch {
            setEditMsg({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setEditSaving(false);
        }
    };

    // reopens resolved ticket back to open
    const handleReopen = async (ticket) => {
        setReopening(prev => ({ ...prev, [ticket.ticket_id]: true }));
        try {
            const result = await reopenTicket(ticket.ticket_id, user.user_id, user.user_type);
            if (result.message) {
                loadTickets();
            } else {
                console.error('Failed to reopen ticket:', result.error);
            }
        } catch {
            console.error('Failed to reopen ticket.');
        } finally {
            setReopening(prev => ({ ...prev, [ticket.ticket_id]: false }));
        }
    };

    // archives the ticket after the user confirms (removes it from this view)
    const handleArchive = async (ticket) => {
        if (!window.confirm(`Archive ticket #${ticket.ticket_id}? It will no longer appear in your ticket list.`)) return;
        try {
            await archiveTicket(ticket.ticket_id, user.user_id, user.user_type);
            loadTickets();
        } catch {
            console.error('Failed to archive ticket.');
        }
    };

    // column definitions for the ticket table
    const columns = [
        { key: 'ticket_id', label: 'Ticket #', sortable: true },
        { key: 'title', label: 'Title', sortable: true },
        {
            key: 'category',
            label: 'Category',
            sortable: true,
            render: (val) => {
                if (val === 'security') return <span style={{ background: '#fce4ec', color: '#880e4f', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>Security</span>;
                if (val === 'catalog_order') return <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>Catalog Order</span>;
                return <span style={{ background: '#f5f5f5', color: '#616161', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>General</span>;
            },
        },
        {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (val) => <StatusBadge status={val} />,
        },
        {
            key: 'created_at',
            label: 'Submitted',
            sortable: true,
            render: (val) => new Date(val).toLocaleDateString(),
        },
    ];

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '30px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, color: '#1a1a1a' }}>My Support Tickets</h2>
                <button
                    onClick={handleOpenModal}
                    style={{ backgroundColor: '#1976d2', color: 'white', padding: '8px 20px', borderRadius: '4px', border: 'none', cursor: 'pointer' }}
                >
                    Open New Ticket
                </button>
            </div>

            {loading && <p style={{ color: '#666' }}>Loading tickets...</p>}
            {error && <p style={{ color: '#c62828' }}>{error}</p>}

            {!loading && !error && (
                tickets.length === 0
                    ? <p style={{ color: '#666' }}>You have no support tickets yet.</p>
                    : (
                        <div>
                            {/* ticket table with a View button to expand each row's details */}
                            <SortableTable
                                columns={columns}
                                data={tickets}
                                actions={[{
                                    label: 'Details',
                                    render: (row) => (
                                        <button
                                            onClick={() => toggleExpand(row.ticket_id)}
                                            style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            {expandedIds.has(row.ticket_id) ? 'Hide' : 'View'}
                                        </button>
                                    ),
                                }]}
                            />
                            {/* expanded detail cards rendered below the table for any open rows */}
                            {tickets
                                .filter(t => expandedIds.has(t.ticket_id))
                                .map(t => (
                                    <div key={t.ticket_id} style={{
                                        margin: '12px 0',
                                        padding: '16px',
                                        background: '#f9f9f9',
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '8px',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <strong style={{ color: '#1a1a1a' }}>Ticket #{t.ticket_id} — {t.title}</strong>
                                            <StatusBadge status={t.status} />
                                        </div>
                                        <p style={{ margin: '0 0 8px', color: '#333', whiteSpace: 'pre-wrap' }}>{t.description}</p>
                                        <p style={{ margin: '0 0 4px', color: '#888', fontSize: '0.85em' }}>
                                            Submitted {new Date(t.created_at).toLocaleString()}
                                        </p>
                                        {t.subject_driver_id === user.user_id && t.submitter_first_name && (
                                            <p style={{ margin: '0 0 10px', color: '#555', fontSize: '0.85em' }}>
                                                Filed by sponsor: <strong>{t.submitter_first_name} {t.submitter_last_name}</strong>
                                            </p>
                                        )}
                                        {/* edit, reopen, and archive action buttons */}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {t.status === 'open' && (
                                                <button
                                                    onClick={() => handleOpenEdit(t)}
                                                    style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            {t.status === 'resolved' && (
                                                <button
                                                    onClick={() => handleReopen(t)}
                                                    disabled={reopening[t.ticket_id]}
                                                    style={{
                                                        backgroundColor: reopening[t.ticket_id] ? '#e0e0e0' : '#f57c00',
                                                        color: reopening[t.ticket_id] ? '#888' : 'white',
                                                        border: 'none',
                                                        padding: '6px 14px',
                                                        borderRadius: '4px',
                                                        cursor: reopening[t.ticket_id] ? 'default' : 'pointer',
                                                    }}
                                                >
                                                    {reopening[t.ticket_id] ? 'Reopening...' : 'Reopen Ticket'}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleArchive(t)}
                                                style={{ background: '#fff', color: '#c62828', border: '1px solid #c62828', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer' }}
                                            >
                                                Archive
                                            </button>
                                        </div>
                                        {/* comments thread for this ticket */}
                                        <CommentsSection ticketId={t.ticket_id} userId={user.user_id} />
                                    </div>
                                ))
                            }
                        </div>
                    )
            )}

            {/* modal form for creating a new support ticket */}
            <Modal
                isOpen={createModalOpen}
                onClose={() => setCreateModalOpen(false)}
                onSave={handleSubmit}
                title="Open New Support Ticket"
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#1a1a1a' }}>Title</label>
                        <input
                            type="text"
                            value={ticketTitle}
                            onChange={e => setTicketTitle(e.target.value)}
                            placeholder="Brief summary of your issue"
                            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#1a1a1a' }}>Category</label>
                        <select
                            value={ticketCategory}
                            onChange={e => {
                                const newCat = e.target.value;
                                setTicketCategory(newCat);
                                setSelectedOrderItemId('');
                                if (newCat === 'catalog_order') {
                                    fetchPurchasedItems(user.user_id)
                                        .then(items => setPurchasedItems(items || []))
                                        .catch(() => setPurchasedItems([]));
                                }
                            }}
                            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                        >
                            <option value="general">General</option>
                            <option value="security">Security Issue</option>
                            <option value="catalog_order">Catalog Order Complaint</option>
                        </select>
                    </div>
                    {/* security issue type: only shown when category is security */}
                    {ticketCategory === 'security' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#1a1a1a' }}>Security Issue Type</label>
                            <select
                                value={securityIssueType}
                                onChange={e => setSecurityIssueType(e.target.value)}
                                style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                            >
                                <option value="">— Select a type —</option>
                                {Object.entries(SECURITY_ISSUE_TYPES).map(([val, label]) => (
                                    <option key={val} value={val}>{label}</option>
                                ))}
                            </select>
                        </div>
                    )}
                    {/* catalog order complaint: item picker populated from the driver's purchase history */}
                    {ticketCategory === 'catalog_order' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#1a1a1a' }}>Which item is this complaint about?</label>
                            {purchasedItems.length === 0
                                ? <p style={{ color: '#888', fontSize: '0.9em', margin: '4px 0 0' }}>No purchased items found.</p>
                                : (
                                    <select
                                        value={selectedOrderItemId}
                                        onChange={e => {
                                            setSelectedOrderItemId(e.target.value);
                                            const item = purchasedItems.find(i => String(i.order_item_id) === e.target.value);
                                            if (item) setTicketTitle(`Complaint: ${item.title} (Order #${item.order_id})`);
                                        }}
                                        style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box' }}
                                    >
                                        <option value="">— Select an item —</option>
                                        {purchasedItems.map(i => (
                                            <option key={i.order_item_id} value={i.order_item_id}>
                                                {i.title} (Order #{i.order_id})
                                            </option>
                                        ))}
                                    </select>
                                )
                            }
                        </div>
                    )}
                    {/* sponsors can optionally link the ticket to one of their orgs drivers */}
                    {user.user_type === 'sponsor' && orgDrivers.length > 0 && (
                        <div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, color: '#1a1a1a', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={driverPickerEnabled}
                                    onChange={e => { setDriverPickerEnabled(e.target.checked); setSubjectDriverId(''); }}
                                />
                                Regarding a driver in my organization
                            </label>
                            {driverPickerEnabled && (
                                <select
                                    value={subjectDriverId}
                                    onChange={e => setSubjectDriverId(e.target.value)}
                                    style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', marginTop: '6px' }}
                                >
                                    <option value="">— Select a driver —</option>
                                    {orgDrivers.map(d => (
                                        <option key={d.user_id} value={d.user_id}>
                                            {d.first_name} {d.last_name}
                                        </option>
                                    ))}
                                </select>
                            )}
                        </div>
                    )}
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#1a1a1a' }}>Description</label>
                        <textarea
                            value={ticketDesc}
                            onChange={e => setTicketDesc(e.target.value)}
                            placeholder="Describe your issue in detail..."
                            rows={5}
                            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                    </div>
                    {submitMsg && (
                        <div style={{
                            background: submitMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                            color: submitMsg.type === 'success' ? '#2e7d32' : '#c62828',
                            padding: '10px',
                            borderRadius: '4px',
                        }}>
                            {submitMsg.text}
                        </div>
                    )}
                    {submitting && <p style={{ color: '#666', margin: 0 }}>Submitting...</p>}
                </div>
            </Modal>

            {/* modal form for editing a ticket description */}
            <Modal
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                onSave={handleSaveEdit}
                title={`Edit Ticket #${editingTicket?.ticket_id}`}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#1a1a1a' }}>Description</label>
                        <textarea
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                            rows={6}
                            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                    </div>
                    {editMsg && (
                        <div style={{
                            background: editMsg.type === 'error' ? '#ffebee' : '#e8f5e9',
                            color: editMsg.type === 'error' ? '#c62828' : '#2e7d32',
                            padding: '10px',
                            borderRadius: '4px',
                        }}>
                            {editMsg.text}
                        </div>
                    )}
                    {editSaving && <p style={{ color: '#666', margin: 0 }}>Saving...</p>}
                </div>
            </Modal>
        </div>
    );
};

// shows the open driver tickets for the sponsors org (sponsors can view, comment, and resolve)
const OrgTicketsTab = ({ user }) => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedIds, setExpandedIds] = useState(new Set());

    // resolve with note state
    const [resolveModalOpen, setResolveModalOpen] = useState(false);
    const [resolvingTicket, setResolvingTicket] = useState(null);
    const [resolveNote, setResolveNote] = useState('');
    const [resolveMsg, setResolveMsg] = useState(null);
    const [resolveSaving, setResolveSaving] = useState(false);

    // reopen state
    const [reopening, setReopening] = useState({});

    // edit state (sponsors can edit open tickets they created)
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingTicket, setEditingTicket] = useState(null);
    const [editDesc, setEditDesc] = useState('');
    const [editMsg, setEditMsg] = useState(null);
    const [editSaving, setEditSaving] = useState(false);

    const loadTickets = () => {
        if (!user.sponsor_org_id) { setLoading(false); return; }
        fetchOrgTickets(user.sponsor_org_id)
            .then(data => { setTickets(data || []); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    };

    useEffect(() => { loadTickets(); }, [user.sponsor_org_id]);

    const toggleExpand = (ticketId) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(ticketId) ? next.delete(ticketId) : next.add(ticketId);
            return next;
        });
    };

    const handleOpenEdit = (ticket) => {
        setEditingTicket(ticket);
        setEditDesc(ticket.description);
        setEditMsg(null);
        setEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        if (!editDesc.trim()) {
            setEditMsg({ type: 'error', text: 'Description cannot be empty.' });
            return;
        }
        setEditSaving(true);
        try {
            const result = await updateTicketDescription(editingTicket.ticket_id, editDesc.trim(), user.user_id);
            if (result.message) {
                setEditModalOpen(false);
                loadTickets();
            } else {
                setEditMsg({ type: 'error', text: result.error || 'Failed to save changes.' });
            }
        } catch {
            setEditMsg({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setEditSaving(false);
        }
    };

    const handleReopen = async (ticket) => {
        setReopening(prev => ({ ...prev, [ticket.ticket_id]: true }));
        try {
            const result = await reopenTicket(ticket.ticket_id, user.user_id, user.user_type);
            if (result.message) {
                loadTickets();
            } else {
                console.error('Failed to reopen ticket:', result.error);
            }
        } catch {
            console.error('Failed to reopen ticket.');
        } finally {
            setReopening(prev => ({ ...prev, [ticket.ticket_id]: false }));
        }
    };

    const handleOpenResolve = (ticket) => {
        setResolvingTicket(ticket);
        setResolveNote('');
        setResolveMsg(null);
        setResolveModalOpen(true);
    };

    const handleArchiveOrgTicket = async (ticket) => {
        if (!window.confirm(`Archive ticket #${ticket.ticket_id}? It will no longer appear in the driver tickets list.`)) return;
        try {
            await archiveTicket(ticket.ticket_id, user.user_id, user.user_type);
            loadTickets();
        } catch {
            console.error('Failed to archive ticket.');
        }
    };

    const handleResolveWithNote = async () => {
        setResolveSaving(true);
        setResolveMsg(null);
        try {
            const result = await updateTicketStatus(resolvingTicket.ticket_id, 'resolved', user.user_id, 'sponsor', resolveNote.trim());
            if (result.message) {
                setResolveModalOpen(false);
                loadTickets();
            } else {
                setResolveMsg(result.error || 'Failed to resolve ticket.');
            }
        } catch {
            setResolveMsg('Network error. Please try again.');
        } finally {
            setResolveSaving(false);
        }
    };

    const columns = [
        { key: 'ticket_id', label: 'Ticket #', sortable: true },
        { key: 'title', label: 'Title', sortable: true },
        {
            key: 'category',
            label: 'Category',
            sortable: true,
            render: (val) => {
                if (val === 'security') return <span style={{ background: '#fce4ec', color: '#880e4f', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>Security</span>;
                if (val === 'catalog_order') return <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>Catalog Order</span>;
                return <span style={{ background: '#f5f5f5', color: '#616161', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>General</span>;
            },
        },
        {
            key: 'first_name',
            label: 'Submitted By',
            sortable: true,
            render: (val, row) => `${val} ${row.last_name}`,
        },
        {
            key: 'status',
            label: 'Status',
            sortable: true,
            render: (val) => <StatusBadge status={val} />,
        },
        {
            key: 'created_at',
            label: 'Submitted',
            sortable: true,
            render: (val) => new Date(val).toLocaleDateString(),
        },
    ];

    if (!user.sponsor_org_id) {
        return <p style={{ color: '#666' }}>Your account is not associated with an organization.</p>;
    }

    return (
        <div>
            {loading && <p style={{ color: '#666' }}>Loading tickets...</p>}
            {error && <p style={{ color: '#c62828' }}>{error}</p>}
            {!loading && !error && (
                tickets.length === 0
                    ? <p style={{ color: '#666' }}>No driver tickets for your organization.</p>
                    : (
                        <div>
                            <SortableTable
                                columns={columns}
                                data={tickets}
                                actions={[{
                                    label: 'Details',
                                    render: (row) => (
                                        <button
                                            onClick={() => toggleExpand(row.ticket_id)}
                                            style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}
                                        >
                                            {expandedIds.has(row.ticket_id) ? 'Hide' : 'View'}
                                        </button>
                                    ),
                                }]}
                            />
                            {tickets
                                .filter(t => expandedIds.has(t.ticket_id))
                                .map(t => (
                                    <div key={t.ticket_id} style={{
                                        margin: '12px 0',
                                        padding: '16px',
                                        background: '#f9f9f9',
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '8px',
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <strong style={{ color: '#1a1a1a' }}>Ticket #{t.ticket_id} — {t.title}</strong>
                                            <StatusBadge status={t.status} />
                                        </div>
                                        <p style={{ margin: '0 0 8px', color: '#333', whiteSpace: 'pre-wrap' }}>{t.description}</p>
                                        <p style={{ margin: '0 0 4px', color: '#888', fontSize: '0.85em' }}>
                                            Submitted by {t.first_name} {t.last_name} · {new Date(t.created_at).toLocaleString()}
                                        </p>
                                        {t.subject_first_name && (
                                            <p style={{ margin: '0 0 8px', color: '#555', fontSize: '0.85em' }}>
                                                Regarding driver: <strong>{t.subject_first_name} {t.subject_last_name}</strong>
                                            </p>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                            {t.status === 'open' && t.user_id === user.user_id && (
                                                <button
                                                    onClick={() => handleOpenEdit(t)}
                                                    style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            {t.status !== 'resolved' && (
                                                <button
                                                    onClick={() => handleOpenResolve(t)}
                                                    style={{ backgroundColor: '#2e7d32', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer' }}
                                                >
                                                    Mark Resolved with Note
                                                </button>
                                            )}
                                            {t.status === 'resolved' && (
                                                <button
                                                    onClick={() => handleReopen(t)}
                                                    disabled={reopening[t.ticket_id]}
                                                    style={{
                                                        backgroundColor: reopening[t.ticket_id] ? '#e0e0e0' : '#f57c00',
                                                        color: reopening[t.ticket_id] ? '#888' : 'white',
                                                        border: 'none',
                                                        padding: '6px 14px',
                                                        borderRadius: '4px',
                                                        cursor: reopening[t.ticket_id] ? 'default' : 'pointer',
                                                    }}
                                                >
                                                    {reopening[t.ticket_id] ? 'Reopening...' : 'Reopen Ticket'}
                                                </button>
                                            )}
                                            <button
                                                onClick={() => handleArchiveOrgTicket(t)}
                                                style={{ background: '#fff', color: '#c62828', border: '1px solid #c62828', padding: '6px 14px', borderRadius: '4px', cursor: 'pointer' }}
                                            >
                                                Archive
                                            </button>
                                        </div>
                                        <CommentsSection ticketId={t.ticket_id} userId={user.user_id} />
                                    </div>
                                ))
                            }
                        </div>
                    )
            )}

            {/* editing a driver ticket description (sponsor only, open tickets they created) */}
            <Modal
                isOpen={editModalOpen}
                onClose={() => setEditModalOpen(false)}
                onSave={handleSaveEdit}
                title={`Edit Ticket #${editingTicket?.ticket_id}`}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#1a1a1a' }}>Description</label>
                        <textarea
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                            rows={6}
                            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                    </div>
                    {editMsg && (
                        <div style={{
                            background: editMsg.type === 'error' ? '#ffebee' : '#e8f5e9',
                            color: editMsg.type === 'error' ? '#c62828' : '#2e7d32',
                            padding: '10px',
                            borderRadius: '4px',
                        }}>
                            {editMsg.text}
                        </div>
                    )}
                    {editSaving && <p style={{ color: '#666', margin: 0 }}>Saving...</p>}
                </div>
            </Modal>

            {/* resolving a driver ticket with an optional note */}
            <Modal
                isOpen={resolveModalOpen}
                onClose={() => setResolveModalOpen(false)}
                onSave={handleResolveWithNote}
                title={`Resolve Ticket #${resolvingTicket?.ticket_id}`}
            >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <p style={{ margin: 0, color: '#555', fontSize: '0.9em' }}>
                        Optionally add a resolution note. It will be saved as a comment on the ticket.
                    </p>
                    <div>
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#1a1a1a' }}>Resolution Note (optional)</label>
                        <textarea
                            value={resolveNote}
                            onChange={e => setResolveNote(e.target.value)}
                            placeholder="Describe how this was resolved..."
                            rows={4}
                            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                    </div>
                    {resolveMsg && (
                        <div style={{ background: '#ffebee', color: '#c62828', padding: '10px', borderRadius: '4px' }}>
                            {resolveMsg}
                        </div>
                    )}
                    {resolveSaving && <p style={{ color: '#666', margin: 0 }}>Saving...</p>}
                </div>
            </Modal>
        </div>
    );
};

// sponsors see two tabs which r their own tickets (with edit/archive/comment) and all of their orgs driver tickets
const SponsorView = ({ user }) => {
    return (
        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '30px 20px' }}>
            <h2 style={{ margin: '0 0 20px', color: '#1a1a1a' }}>Support Tickets</h2>
            <TabGroup tabs={[
                {
                    label: 'My Tickets',
                    content: <DriverView user={user} />,
                },
                {
                    label: 'Driver Tickets',
                    content: <OrgTicketsTab user={user} />,
                },
            ]} />
        </div>
    );
};

// shown only to admins, can see all tickets (including archived) and manage status, view account info, and comment
const AdminView = ({ user }) => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // tracks which ticket detail cards are expanded
    const [expandedIds, setExpandedIds] = useState(new Set());
    // stores fetched user account info keyed by ticket_id so each card loads independently
    const [userDetails, setUserDetails] = useState({});
    const [userDetailsLoading, setUserDetailsLoading] = useState({});
    // tracks which tickets are currently being updated so we can disable buttons
    const [statusUpdating, setStatusUpdating] = useState({});
    // category filter: null = all tickets, 'general' | 'security' | 'catalog_order' = that category only
    const [categoryFilter, setCategoryFilter] = useState(null);
    // security issue type sub-filter: null = all security tickets, one of the SECURITY_ISSUE_TYPES keys = that type only
    const [securityIssueTypeFilter, setSecurityIssueTypeFilter] = useState(null);
    // sponsor/driver/date filters: null = show all
    const [selectedSponsor, setSelectedSponsor] = useState(null);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [dateRange, setDateRange] = useState(false);
    const [organizations, setOrganizations] = useState([]);

    // load all tickets and organizations when admin first visits the page
    useEffect(() => {
        fetchAllTickets()
            .then(data => { setTickets(data || []); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
        fetchOrganizations()
            .then(data => setOrganizations(data || []))
            .catch(err => console.error('Failed to load organizations:', err));
    }, []);

    // toggles the expanded detail card for a ticket row
    const toggleExpand = (ticketId) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            next.has(ticketId) ? next.delete(ticketId) : next.add(ticketId);
            return next;
        });
    };

    // sends a PUT request to update the ticket status, then updates the local state
    // so the badge in the table refreshes without needing a full page reload
    const handleStatusUpdate = async (ticket, newStatus) => {
        setStatusUpdating(prev => ({ ...prev, [ticket.ticket_id]: true }));
        try {
            const result = await updateTicketStatus(ticket.ticket_id, newStatus);
            if (result.message) {
                setTickets(prev => prev.map(t =>
                    t.ticket_id === ticket.ticket_id ? { ...t, status: newStatus } : t
                ));
            }
        } catch (err) {
            console.error('Failed to update ticket status:', err);
        } finally {
            setStatusUpdating(prev => ({ ...prev, [ticket.ticket_id]: false }));
        }
    };

    // fetches the full account info for the user who submitted a ticket
    // uses the existing admin user lookup endpoint with the ticket email
    const handleViewAccount = async (ticket) => {
        if (userDetails[ticket.ticket_id]) return; // already loaded dont refetch
        setUserDetailsLoading(prev => ({ ...prev, [ticket.ticket_id]: true }));
        try {
            const res = await fetch(`/api/admin/user?email=${encodeURIComponent(ticket.email)}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (res.ok && data.user) {
                setUserDetails(prev => ({ ...prev, [ticket.ticket_id]: data.user }));
            }
        } catch (err) {
            console.error('Failed to fetch user account:', err);
        } finally {
            setUserDetailsLoading(prev => ({ ...prev, [ticket.ticket_id]: false }));
        }
    };

    // list from loaded tickets
    // includes drivers who submitted tickets and drivers who are the subject of a ticket from sponsors
    const allDrivers = (() => {
        const map = new Map();
        tickets.forEach(t => {
            if (t.user_type === 'driver') {
                map.set(t.user_id, { user_id: t.user_id, first_name: t.first_name, last_name: t.last_name });
            }
            if (t.subject_driver_id) {
                map.set(t.subject_driver_id, { user_id: t.subject_driver_id, first_name: t.subject_first_name, last_name: t.subject_last_name });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.last_name.localeCompare(b.last_name));
    })();

    // always calls onChange with string
    const sponsorId = (() => { const n = parseInt(selectedSponsor, 10); return isNaN(n) ? null : n; })();
    const driverId = (() => { const n = parseInt(selectedDriver, 10); return isNaN(n) ? null : n; })();

    // apply all active filters category, security issue type sub-filter, sponsor, driver, and date range
    const displayedTickets = tickets.filter(t => {
        if (categoryFilter && t.category !== categoryFilter) return false;
        if (categoryFilter === 'security' && securityIssueTypeFilter && t.security_issue_type !== securityIssueTypeFilter) return false;
        if (sponsorId !== null && t.sponsor_org_id !== sponsorId) return false;
        if (driverId !== null) {
            const isSubmitter = t.user_type === 'driver' && t.user_id === driverId;
            const isSubject = t.subject_driver_id === driverId;
            if (!isSubmitter && !isSubject) return false;
        }
        if (fromDate) {
            if (new Date(t.created_at) < new Date(fromDate)) return false;
        }
        if (toDate) {
            const end = new Date(toDate);
            end.setHours(23, 59, 59, 999);
            if (new Date(t.created_at) > end) return false;
        }
        return true;
    });

    // column definitions for the admin ticket table
    const columns = [
        { key: 'ticket_id', label: 'Ticket #', sortable: true },
        { key: 'title', label: 'Title', sortable: true },
        {
            key: 'category',
            label: 'Category',
            sortable: true,
            render: (val) => {
                if (val === 'security') return <span style={{ background: '#fce4ec', color: '#880e4f', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>Security</span>;
                if (val === 'catalog_order') return <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>Catalog Order</span>;
                return <span style={{ background: '#f5f5f5', color: '#616161', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>General</span>;
            },
        },
        ...(categoryFilter === 'security' ? [{
            key: 'security_issue_type',
            label: 'Issue Type',
            sortable: true,
            render: (val) => val
                ? <span style={{ background: '#fce4ec', color: '#880e4f', padding: '2px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 600 }}>{SECURITY_ISSUE_TYPES[val] || val}</span>
                : <span style={{ color: '#aaa' }}>—</span>,
        }] : []),
        {
            key: 'first_name',
            label: 'Submitted By',
            sortable: true,
            // shows full name on top and email below it
            render: (_val, row) => (
                <span>
                    {row.first_name} {row.last_name}
                    <br />
                    <span style={{ color: '#666', fontSize: '0.85em' }}>{row.email}</span>
                </span>
            ),
        },
        {
            key: 'org_name',
            label: 'Organization',
            sortable: true,
            // show a dash if the user isn't affiliated with an org
            render: (val) => val || <span style={{ color: '#aaa' }}>—</span>,
        },
        {
            key: 'status',
            label: 'Status',
            sortable: true,
            // show Archived when is_archived is set, regardless of the status field value
            render: (val, row) => <StatusBadge status={row.is_archived ? 'archived' : val} />,
        },
        {
            key: 'created_at',
            label: 'Submitted',
            sortable: true,
            render: (val) => new Date(val).toLocaleDateString(),
        },
    ];

    // View/Hide button in the table that toggles the detail card below
    const actions = [
        {
            label: 'Details',
            render: (row) => (
                <button
                    onClick={() => toggleExpand(row.ticket_id)}
                    style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}
                >
                    {expandedIds.has(row.ticket_id) ? 'Hide' : 'View'}
                </button>
            ),
        },
    ];

    // badge colors for each user role
    const USER_TYPE_STYLES = {
        driver: { background: '#e3f2fd', color: '#1565c0' },
        sponsor: { background: '#f3e5f5', color: '#6a1b9a' },
        admin: { background: '#fce4ec', color: '#880e4f' },
    };

    return (
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '30px 20px' }}>
            <h2 style={{ margin: '0 0 20px', color: '#1a1a1a' }}>All Support Tickets</h2>

            {loading && <p style={{ color: '#666' }}>Loading tickets...</p>}
            {error && <p style={{ color: '#c62828' }}>{error}</p>}

            {!loading && !error && (
                tickets.length === 0
                    ? <p style={{ color: '#666' }}>No support tickets have been submitted yet.</p>
                    : (
                        <div>
                            {/* sponsor, driver, and date filters */}
                            <h3 style={{ margin: '0 0 10px', color: '#1a1a1a' }}>Filters</h3>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '20px',
                                padding: '15px',
                                border: '1px solid #ddd',
                                borderRadius: '8px',
                                background: '#f9f9f9',
                                marginBottom: '14px',
                            }}>
                                <DropdownField
                                    label="Sponsor"
                                    options={[
                                        { label: 'All', value: null },
                                        ...organizations.map(org => ({ label: org.name, value: org.sponsor_org_id })),
                                    ]}
                                    value={selectedSponsor}
                                    onChange={setSelectedSponsor}
                                />
                                <DropdownField
                                    label="Driver"
                                    options={[
                                        { label: 'All', value: null },
                                        ...allDrivers.map(d => ({ label: `${d.first_name} ${d.last_name}`, value: d.user_id })),
                                    ]}
                                    value={selectedDriver}
                                    onChange={setSelectedDriver}
                                />
                                <div style={{ gridColumn: '1 / span 2' }}>
                                    <button
                                        style={{ width: '75px', height: '20px', marginRight: '10px', justifyContent: 'center', alignItems: 'center', display: 'flex', fontSize: '12px' }}
                                        onClick={() => { setDateRange(!dateRange); setToDate(''); }}
                                    >
                                        {!dateRange ? 'Single' : 'Range'}
                                    </button>
                                    <DatePicker
                                        label={dateRange ? 'From' : 'Date'}
                                        value={fromDate}
                                        onChange={setFromDate}
                                    />
                                    {dateRange && (
                                        <DatePicker
                                            label="To"
                                            value={toDate}
                                            onChange={setToDate}
                                        />
                                    )}
                                </div>
                            </div>
                            {/* filter toggles: all tickets, or filter by category */}
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <button
                                    onClick={() => { setCategoryFilter(null); setSecurityIssueTypeFilter(null); }}
                                    style={{
                                        padding: '6px 16px',
                                        borderRadius: '4px',
                                        border: '1px solid #ccc',
                                        backgroundColor: categoryFilter === null ? '#1976d2' : '#fff',
                                        color: categoryFilter === null ? 'white' : '#333',
                                        cursor: 'pointer',
                                        fontWeight: categoryFilter === null ? 600 : 400,
                                    }}
                                >
                                    All Tickets
                                </button>
                                <button
                                    onClick={() => { setCategoryFilter('security'); setSecurityIssueTypeFilter(null); }}
                                    style={{
                                        padding: '6px 16px',
                                        borderRadius: '4px',
                                        border: '1px solid #ccc',
                                        backgroundColor: categoryFilter === 'security' ? '#880e4f' : '#fff',
                                        color: categoryFilter === 'security' ? 'white' : '#333',
                                        cursor: 'pointer',
                                        fontWeight: categoryFilter === 'security' ? 600 : 400,
                                    }}
                                >
                                    Security Issues Only
                                </button>
                                <button
                                    onClick={() => { setCategoryFilter('catalog_order'); setSecurityIssueTypeFilter(null); }}
                                    style={{
                                        padding: '6px 16px',
                                        borderRadius: '4px',
                                        border: '1px solid #ccc',
                                        backgroundColor: categoryFilter === 'catalog_order' ? '#2e7d32' : '#fff',
                                        color: categoryFilter === 'catalog_order' ? 'white' : '#333',
                                        cursor: 'pointer',
                                        fontWeight: categoryFilter === 'catalog_order' ? 600 : 400,
                                    }}
                                >
                                    Catalog Orders Only
                                </button>
                            </div>
                            {/* security issue type sub-filter: only shown when security category is active */}
                            {categoryFilter === 'security' && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    padding: '10px 14px',
                                    marginBottom: '14px',
                                    background: '#fce4ec',
                                    border: '1px solid #f8bbd0',
                                    borderRadius: '6px',
                                }}>
                                    <span style={{ fontSize: '0.9em', fontWeight: 600, color: '#880e4f', whiteSpace: 'nowrap' }}>Issue Type:</span>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        <button
                                            onClick={() => setSecurityIssueTypeFilter(null)}
                                            style={{
                                                padding: '4px 12px',
                                                borderRadius: '4px',
                                                border: '1px solid #f48fb1',
                                                backgroundColor: securityIssueTypeFilter === null ? '#880e4f' : '#fff',
                                                color: securityIssueTypeFilter === null ? 'white' : '#880e4f',
                                                cursor: 'pointer',
                                                fontSize: '0.85em',
                                                fontWeight: securityIssueTypeFilter === null ? 600 : 400,
                                            }}
                                        >
                                            All Types
                                        </button>
                                        {Object.entries(SECURITY_ISSUE_TYPES).map(([val, label]) => (
                                            <button
                                                key={val}
                                                onClick={() => setSecurityIssueTypeFilter(val)}
                                                style={{
                                                    padding: '4px 12px',
                                                    borderRadius: '4px',
                                                    border: '1px solid #f48fb1',
                                                    backgroundColor: securityIssueTypeFilter === val ? '#880e4f' : '#fff',
                                                    color: securityIssueTypeFilter === val ? 'white' : '#880e4f',
                                                    cursor: 'pointer',
                                                    fontSize: '0.85em',
                                                    fontWeight: securityIssueTypeFilter === val ? 600 : 400,
                                                }}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {displayedTickets.length === 0 && (
                                <p style={{ color: '#666' }}>No tickets found for this filter.</p>
                            )}
                            <SortableTable columns={columns} data={displayedTickets} actions={actions} />
                            {/* expanded detail cards for each ticket the admin has opened */}
                            {displayedTickets
                                .filter(t => expandedIds.has(t.ticket_id))
                                .map(t => (
                                    <div key={t.ticket_id} style={{
                                        margin: '12px 0',
                                        padding: '16px',
                                        background: '#f9f9f9',
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '8px',
                                    }}>
                                        {/* ticket title and current status badge */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <strong style={{ color: '#1a1a1a' }}>Ticket #{t.ticket_id} — {t.title}</strong>
                                            <StatusBadge status={t.is_archived ? 'archived' : t.status} />
                                        </div>

                                        {/* the description the user wrote when submitting */}
                                        <p style={{ margin: '0 0 12px', color: '#333', whiteSpace: 'pre-wrap' }}>{t.description}</p>

                                        {/* security issue type badge — only shown for security tickets */}
                                        {t.category === 'security' && (
                                            <p style={{ margin: '0 0 10px', fontSize: '0.85em' }}>
                                                <strong style={{ color: '#1a1a1a' }}>Issue Type: </strong>
                                                {t.security_issue_type
                                                    ? <span style={{ background: '#fce4ec', color: '#880e4f', padding: '2px 10px', borderRadius: '12px', fontWeight: 600 }}>{SECURITY_ISSUE_TYPES[t.security_issue_type] || t.security_issue_type}</span>
                                                    : <span style={{ color: '#aaa' }}>Not categorized</span>
                                                }
                                            </p>
                                        )}

                                        {/* submitter info line */}
                                        <p style={{ margin: '0 0 8px', color: '#666', fontSize: '0.85em' }}>
                                            Submitted by {t.first_name} {t.last_name} ({t.email})
                                            {t.org_name ? ` · ${t.org_name}` : ''}
                                            {' · '}{new Date(t.created_at).toLocaleString()}
                                        </p>
                                        {/* subject driver line, only shown when ticket was filed about a specific driver */}
                                        {t.subject_first_name && (
                                            <p style={{ margin: '0 0 14px', color: '#555', fontSize: '0.85em' }}>
                                                Regarding driver: <strong>{t.subject_first_name} {t.subject_last_name}</strong>
                                            </p>
                                        )}

                                        {/* status action buttons - disabled when ticket is already at that status */}
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                            <button
                                                onClick={() => handleStatusUpdate(t, 'in_progress')}
                                                disabled={t.status === 'in_progress' || statusUpdating[t.ticket_id]}
                                                style={{
                                                    backgroundColor: t.status === 'in_progress' ? '#e0e0e0' : '#1976d2',
                                                    color: t.status === 'in_progress' ? '#888' : 'white',
                                                    border: 'none',
                                                    padding: '6px 14px',
                                                    borderRadius: '4px',
                                                    cursor: t.status === 'in_progress' ? 'default' : 'pointer',
                                                }}
                                            >
                                                Mark In Progress
                                            </button>
                                            <button
                                                onClick={() => handleStatusUpdate(t, 'resolved')}
                                                disabled={t.status === 'resolved' || statusUpdating[t.ticket_id]}
                                                style={{
                                                    backgroundColor: t.status === 'resolved' ? '#e0e0e0' : '#2e7d32',
                                                    color: t.status === 'resolved' ? '#888' : 'white',
                                                    border: 'none',
                                                    padding: '6px 14px',
                                                    borderRadius: '4px',
                                                    cursor: t.status === 'resolved' ? 'default' : 'pointer',
                                                }}
                                            >
                                                Mark Resolved
                                            </button>
                                            {/* hide the button once account info is already loaded */}
                                            {!userDetails[t.ticket_id] && (
                                                <button
                                                    onClick={() => handleViewAccount(t)}
                                                    disabled={userDetailsLoading[t.ticket_id]}
                                                    style={{
                                                        background: '#fff',
                                                        color: '#1976d2',
                                                        border: '1px solid #1976d2',
                                                        padding: '6px 14px',
                                                        borderRadius: '4px',
                                                        cursor: 'pointer',
                                                        fontWeight: '600',
                                                        fontSize: '14px',
                                                    }}
                                                >
                                                    {userDetailsLoading[t.ticket_id] ? 'Loading...' : 'View Account'}
                                                </button>
                                            )}
                                        </div>

                                        {/* user account info card - only shows after View Account is clicked */}
                                        {userDetails[t.ticket_id] && (() => {
                                            const u = userDetails[t.ticket_id];
                                            const typeStyle = USER_TYPE_STYLES[u.user_type] || {};
                                            return (
                                                <div style={{
                                                    padding: '12px',
                                                    background: '#ffffff',
                                                    border: '1px solid #e0e0e0',
                                                    borderRadius: '6px',
                                                }}>
                                                    <strong style={{ color: '#1a1a1a', display: 'block', marginBottom: '8px' }}>User Account</strong>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.9em', color: '#333' }}>
                                                        <span><strong>Username:</strong> {u.username}</span>
                                                        <span>
                                                            <strong>Role:</strong>{' '}
                                                            <span style={{ ...typeStyle, padding: '1px 8px', borderRadius: '10px', fontWeight: 600 }}>
                                                                {u.user_type}
                                                            </span>
                                                        </span>
                                                        <span><strong>Email:</strong> {u.email}</span>
                                                        <span><strong>Phone:</strong> {u.phone_number || '—'}</span>
                                                        <span><strong>Name:</strong> {u.first_name} {u.last_name}</span>
                                                        <span><strong>Joined:</strong> {new Date(u.created_at).toLocaleDateString()}</span>
                                                        <span>
                                                            <strong>Status:</strong>{' '}
                                                            <span style={{ color: u.is_active ? '#2e7d32' : '#c62828' }}>
                                                                {u.is_active ? 'Active' : 'Inactive'}
                                                            </span>
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        {/* comments thread — admins can read and add comments on any ticket */}
                                        <CommentsSection ticketId={t.ticket_id} userId={user.user_id} />
                                    </div>
                                ))
                            }
                        </div>
                    )
            )}
        </div>
    );
};

// main, decides which view to show based on user role
const SupportTickets = ({ userData }) => {
    if (!userData) {
        return <div style={{ padding: 'var(--space-8)', color: 'var(--color-text-muted)' }}>Please log in to view support tickets.</div>;
    }

    if (userData.user_type === 'admin') {
        return <AdminView user={userData} />;
    }

    if (userData.user_type === 'sponsor') {
        return <SponsorView user={userData} />;
    }

    return <DriverView user={userData} />;
};

export default SupportTickets;
