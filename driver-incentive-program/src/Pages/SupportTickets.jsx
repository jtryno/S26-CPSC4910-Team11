import { useEffect, useState } from 'react';
import Modal from '../components/Modal';
import SortableTable from '../components/SortableTable';
import { createTicket, fetchTicketsForUser, fetchAllTickets, updateTicketStatus } from '../api/SupportTicketApi';

const STATUS_STYLES = {
    open: { background: '#fff3e0', color: '#e65100', label: 'Open' },
    in_progress: { background: '#e3f2fd', color: '#1565c0', label: 'In Progress' },
    resolved: { background: '#e8f5e9', color: '#2e7d32', label: 'Resolved' },
};

// current status of a ticket
const StatusBadge = ({ status }) => {
    const style = STATUS_STYLES[status] || STATUS_STYLES.open;
    return (
        <span style={{
            background: style.background,
            color: style.color,
            padding: '2px 10px',
            borderRadius: '12px',
            fontSize: '0.85em',
            fontWeight: 600,
        }}>
            {style.label}
        </span>
    );
};

// drivers & sponsors, can create tickets and see their own
const DriverSponsorView = ({ user }) => {
    const [tickets, setTickets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [expandedIds, setExpandedIds] = useState(new Set());
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [ticketTitle, setTicketTitle] = useState('');
    const [ticketDesc, setTicketDesc] = useState('');
    const [submitMsg, setSubmitMsg] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // fetches the users tickets from the backend and updates
    const loadTickets = () => {
        setLoading(true);
        fetchTicketsForUser(user.user_id)
            .then(data => { setTickets(data || []); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    };

    // load tickets when the page first renders
    useEffect(() => { loadTickets(); }, [user.user_id]);

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
        setSubmitMsg(null);
        setCreateModalOpen(true);
    };

    // validates and submits the new ticket form
    const handleSubmit = async () => {
        // make sure both fields are filled in before submitting
        if (!ticketTitle.trim()) {
            setSubmitMsg({ type: 'error', text: 'Please enter a title.' });
            return;
        }
        if (!ticketDesc.trim()) {
            setSubmitMsg({ type: 'error', text: 'Please enter a description.' });
            return;
        }

        setSubmitting(true);
        try {
            const result = await createTicket(
                user.user_id,
                user.sponsor_org_id || null, // pass null if user has no org
                ticketTitle.trim(),
                ticketDesc.trim()
            );
            if (result.ticket_id) {
                setSubmitMsg({ type: 'success', text: 'Ticket submitted successfully!' });
                loadTickets(); // refresh table after submitting
            } else {
                setSubmitMsg({ type: 'error', text: result.error || 'Failed to submit ticket.' });
            }
        } catch (err) {
            setSubmitMsg({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setSubmitting(false);
        }
    };

    // column definitions for the ticket table
    const columns = [
        { key: 'ticket_id', label: 'Ticket #', sortable: true },
        { key: 'title', label: 'Title', sortable: true },
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
                            {/* ticket table with a View button to expand each rows details */}
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
                                        <p style={{ margin: 0, color: '#888', fontSize: '0.85em' }}>
                                            Submitted {new Date(t.created_at).toLocaleString()}
                                        </p>
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
                        <label style={{ display: 'block', marginBottom: '4px', fontWeight: 600, color: '#1a1a1a' }}>Description</label>
                        <textarea
                            value={ticketDesc}
                            onChange={e => setTicketDesc(e.target.value)}
                            placeholder="Describe your issue in detail..."
                            rows={5}
                            style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                    </div>
                    {/* show success or error message after submitting */}
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
        </div>
    );
};

// shown only to admins, can see all tickets and manage their status and see the ticket submitter acc info
const AdminView = () => {
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

    // load all tickets when admin first visits the page
    useEffect(() => {
        fetchAllTickets()
            .then(data => { setTickets(data || []); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
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

    // column definitions for the admin ticket table
    const columns = [
        { key: 'ticket_id', label: 'Ticket #', sortable: true },
        { key: 'title', label: 'Title', sortable: true },
        {
            key: 'first_name',
            label: 'Submitted By',
            sortable: true,
            // shows full name on top and email below it
            render: (val, row) => (
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
            render: (val) => <StatusBadge status={val} />,
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
                            <SortableTable columns={columns} data={tickets} actions={actions} />
                            {/* expanded detail cards for each ticket the admin has opened */}
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
                                        {/* ticket title and current status badge */}
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                            <strong style={{ color: '#1a1a1a' }}>Ticket #{t.ticket_id} — {t.title}</strong>
                                            <StatusBadge status={t.status} />
                                        </div>

                                        {/* the description the user wrote when submitting */}
                                        <p style={{ margin: '0 0 12px', color: '#333', whiteSpace: 'pre-wrap' }}>{t.description}</p>

                                        {/* submitter info line */}
                                        <p style={{ margin: '0 0 14px', color: '#666', fontSize: '0.85em' }}>
                                            Submitted by {t.first_name} {t.last_name} ({t.email})
                                            {t.org_name ? ` · ${t.org_name}` : ''}
                                            {' · '}{new Date(t.created_at).toLocaleString()}
                                        </p>

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
        return <p style={{ padding: '30px', color: '#666' }}>Please log in to view support tickets.</p>;
    }

    if (userData.user_type === 'admin') {
        return <AdminView />;
    }

    return <DriverSponsorView user={userData} />;
};

export default SupportTickets;
