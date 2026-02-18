import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const DriverDashboard = ({ user }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const SOURCE_LABELS = {
        recurring: 'Recurring',
        manual: 'Manual',
        order: 'Order',
    };

    useEffect(() => {
        fetch(`/api/driver/points/${user.user_id}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to load points');
                return res.json();
            })
            .then(d => { setData(d); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    }, [user.user_id]);

    if (loading) return <div>Loading dashboard...</div>;
    if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

    const breakdown = data.transactions.reduce((acc, tx) => {
        const label = SOURCE_LABELS[tx.source] || tx.source;
        acc[label] = (acc[label] || 0) + tx.point_amount;
        return acc;
    }, {});

    return (
        <>
            <h1>Driver Dashboard</h1>

            <div style={{
                background: '#f0f7ff',
                border: '1px solid #b3d4ff',
                borderRadius: '8px',
                padding: '20px 28px',
                marginBottom: '28px',
                display: 'inline-block',
            }}>
                <div style={{ fontSize: '14px', color: '#555' }}>Total Points</div>
                <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#1a1a1a' }}>{data.total_points}</div>
            </div>

            <h2 style={{ marginBottom: '12px' }}>Breakdown by Source</h2>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '32px' }}>
                {Object.entries(breakdown).map(([label, points]) => (
                    <div key={label} style={{
                        background: '#fff',
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        padding: '16px 24px',
                        minWidth: '160px',
                        textAlign: 'center'
                    }}>
                        <div style={{ fontSize: '13px', color: '#666', marginBottom: '6px' }}>{label}</div>
                        <div style={{
                            fontSize: '24px',
                            fontWeight: 'bold',
                            color: points >= 0 ? '#2e7d32' : '#c62828'
                        }}>
                            {points >= 0 ? '+' : ''}{points}
                        </div>
                    </div>
                ))}
                {Object.keys(breakdown).length === 0 && (
                    <div style={{ color: '#888' }}>No transactions yet.</div>
                )}
            </div>

            <h2 style={{ marginBottom: '12px' }}>Points History</h2>
            {data.transactions.length === 0 ? (
                <div style={{ color: '#888' }}>No transactions found.</div>
            ) : (
                <div style={{ textAlign: 'left' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f5f5f5' }}>
                                <th style={th}>Date</th>
                                <th style={th}>Sponsor</th>
                                <th style={th}>Source</th>
                                <th style={th}>Reason</th>
                                <th style={{ ...th, textAlign: 'right' }}>Points</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.transactions.map(tx => (
                                <tr key={tx.transaction_id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={td}>{new Date(tx.created_at).toLocaleDateString()}</td>
                                    <td style={td}>{tx.sponsor_name || '—'}</td>
                                    <td style={td}>{SOURCE_LABELS[tx.source] || tx.source}</td>
                                    <td style={td}>{tx.reason}</td>
                                    <td style={{ ...td, textAlign: 'right', fontWeight: 'bold', color: tx.point_amount >= 0 ? '#2e7d32' : '#c62828' }}>
                                        {tx.point_amount >= 0 ? '+' : ''}{tx.point_amount}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </>
    );
};

const SponsorDashboard = ({ user }) => {
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalDriverIds, setModalDriverIds] = useState([]);
    const [pointAmount, setPointAmount] = useState('');
    const [reason, setReason] = useState('');
    const [source, setSource] = useState('manual');
    const [submitting, setSubmitting] = useState(false);
    const [submitMsg, setSubmitMsg] = useState(null);

    // Batch selection
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [activeTab, setActiveTab] = useState('individual');

    const fetchDrivers = () => {
        setLoading(true);
        fetch(`/api/sponsor/drivers/${user.user_id}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to load drivers');
                return res.json();
            })
            .then(d => { setDrivers(d.drivers); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    };

    useEffect(() => { fetchDrivers(); }, [user.user_id]);

    const openModal = (driverIds) => {
        setModalDriverIds(driverIds);
        setPointAmount('');
        setReason('');
        setSource('manual');
        setSubmitMsg(null);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setSubmitMsg(null);
    };

    const handleSubmit = async () => {
        const parsed = parseInt(pointAmount, 10);
        if (isNaN(parsed) || parsed === 0) {
            setSubmitMsg({ type: 'error', text: 'Point amount must be a non-zero integer.' });
            return;
        }
        if (!reason.trim()) {
            setSubmitMsg({ type: 'error', text: 'A reason is required.' });
            return;
        }
        setSubmitting(true);
        try {
            const res = await fetch('/api/sponsor/points', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sponsorUserId: user.user_id,
                    driverIds: modalDriverIds,
                    pointAmount: parsed,
                    reason: reason.trim(),
                    source,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to apply points');
            setSubmitMsg({ type: 'success', text: data.message });
            setSelectedIds(new Set());
            fetchDrivers();
        } catch (err) {
            setSubmitMsg({ type: 'error', text: err.message });
        } finally {
            setSubmitting(false);
        }
    };

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        setSelectedIds(
            selectedIds.size === drivers.length
                ? new Set()
                : new Set(drivers.map(d => d.user_id))
        );
    };

    const driverName = (d) =>
        (d.first_name || d.last_name)
            ? `${d.first_name || ''} ${d.last_name || ''}`.trim()
            : d.username;

    if (loading) return <div>Loading sponsor dashboard...</div>;
    if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

    const tabBtn = (tab, label) => (
        <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
                padding: '8px 22px',
                borderRadius: '4px 4px 0 0',
                border: '1px solid #ddd',
                borderBottom: activeTab === tab ? '2px solid #fff' : '1px solid #ddd',
                background: activeTab === tab ? '#fff' : '#f5f5f5',
                fontWeight: activeTab === tab ? '600' : 'normal',
                cursor: 'pointer',
                marginRight: '4px',
                color: '#1a1a1a',
            }}
        >
            {label}
        </button>
    );

    return (
        <>
            <h1>Sponsor Dashboard</h1>

            <div style={{ marginBottom: '-1px', textAlign: 'left' }}>
                {tabBtn('individual', 'Individual Points')}
                {tabBtn('batch', 'Batch Award')}
            </div>

            <div style={{
                border: '1px solid #ddd',
                borderRadius: '0 4px 4px 4px',
                padding: '24px',
                background: '#fff',
                textAlign: 'left',
            }}>

                {/* ── Individual Tab ── */}
                {activeTab === 'individual' && (
                    <>
                        <p style={{ color: '#555', marginTop: 0 }}>
                            Award or deduct points for a single driver. A reason is required for every transaction.
                            Use <strong>Recurring</strong> as the source for scheduled, ongoing awards.
                        </p>
                        {drivers.length === 0 ? (
                            <div style={{ color: '#888' }}>No active drivers found in your organization.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: '#f5f5f5' }}>
                                        <th style={th}>Driver</th>
                                        <th style={th}>Email</th>
                                        <th style={{ ...th, textAlign: 'right' }}>Current Points</th>
                                        <th style={{ ...th, textAlign: 'center' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {drivers.map(d => (
                                        <tr key={d.user_id} style={{ borderBottom: '1px solid #eee' }}>
                                            <td style={td}>{driverName(d)}</td>
                                            <td style={td}>{d.email}</td>
                                            <td style={{
                                                ...td,
                                                textAlign: 'right',
                                                fontWeight: 'bold',
                                                color: d.total_points >= 0 ? '#2e7d32' : '#c62828',
                                            }}>
                                                {d.total_points}
                                            </td>
                                            <td style={{ ...td, textAlign: 'center' }}>
                                                <button
                                                    onClick={() => openModal([d.user_id])}
                                                    style={{
                                                        padding: '5px 16px',
                                                        borderRadius: '4px',
                                                        border: '1px solid #1976d2',
                                                        background: '#1976d2',
                                                        color: '#fff',
                                                        cursor: 'pointer',
                                                        fontSize: '13px',
                                                    }}
                                                >
                                                    Adjust Points
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </>
                )}

                {/* ── Batch Tab ── */}
                {activeTab === 'batch' && (
                    <>
                        <p style={{ color: '#555', marginTop: 0 }}>
                            Select multiple drivers and apply the same point adjustment to all of them at once.
                            Use <strong>Recurring</strong> as the source for scheduled, ongoing awards.
                        </p>
                        {drivers.length === 0 ? (
                            <div style={{ color: '#888' }}>No active drivers found in your organization.</div>
                        ) : (
                            <>
                                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                                    <thead>
                                        <tr style={{ background: '#f5f5f5' }}>
                                            <th style={{ ...th, width: '40px' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.size === drivers.length && drivers.length > 0}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            <th style={th}>Driver</th>
                                            <th style={th}>Email</th>
                                            <th style={{ ...th, textAlign: 'right' }}>Current Points</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {drivers.map(d => (
                                            <tr
                                                key={d.user_id}
                                                style={{
                                                    borderBottom: '1px solid #eee',
                                                    background: selectedIds.has(d.user_id) ? '#f0f7ff' : 'transparent',
                                                    cursor: 'pointer',
                                                }}
                                                onClick={() => toggleSelect(d.user_id)}
                                            >
                                                <td style={{ ...td, textAlign: 'center' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(d.user_id)}
                                                        onChange={() => toggleSelect(d.user_id)}
                                                        onClick={e => e.stopPropagation()}
                                                    />
                                                </td>
                                                <td style={td}>{driverName(d)}</td>
                                                <td style={td}>{d.email}</td>
                                                <td style={{
                                                    ...td,
                                                    textAlign: 'right',
                                                    fontWeight: 'bold',
                                                    color: d.total_points >= 0 ? '#2e7d32' : '#c62828',
                                                }}>
                                                    {d.total_points}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                <button
                                    disabled={selectedIds.size === 0}
                                    onClick={() => openModal([...selectedIds])}
                                    style={{
                                        padding: '8px 24px',
                                        borderRadius: '4px',
                                        border: 'none',
                                        background: selectedIds.size === 0 ? '#ccc' : '#1976d2',
                                        color: '#fff',
                                        cursor: selectedIds.size === 0 ? 'not-allowed' : 'pointer',
                                        fontWeight: '600',
                                    }}
                                >
                                    Apply to {selectedIds.size} Selected Driver{selectedIds.size !== 1 ? 's' : ''}
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* ── Points Modal ── */}
            {modalOpen && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.45)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000,
                }}>
                    <div style={{
                        background: '#fff',
                        borderRadius: '8px',
                        padding: '32px',
                        width: '420px',
                        maxWidth: '95vw',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
                    }}>
                        <h2 style={{ marginTop: 0 }}>
                            {modalDriverIds.length === 1
                                ? 'Adjust Driver Points'
                                : `Adjust Points — ${modalDriverIds.length} Drivers`}
                        </h2>

                        <label style={labelStyle}>
                            Point Amount
                            <span style={{ color: '#888', fontSize: '12px', marginLeft: '6px' }}>
                                (use a negative value to deduct)
                            </span>
                        </label>
                        <input
                            type="number"
                            value={pointAmount}
                            onChange={e => setPointAmount(e.target.value)}
                            placeholder="e.g. 50 or -20"
                            style={inputStyle}
                        />

                        <label style={labelStyle}>
                            Reason <span style={{ color: '#c62828' }}>*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder="Describe why you are awarding or deducting points..."
                            rows={3}
                            style={{ ...inputStyle, resize: 'vertical' }}
                        />

                        <label style={labelStyle}>Source</label>
                        <select
                            value={source}
                            onChange={e => setSource(e.target.value)}
                            style={inputStyle}
                        >
                            <option value="manual">Manual</option>
                            <option value="recurring">Recurring</option>
                        </select>

                        {submitMsg && (
                            <div style={{
                                marginTop: '12px',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                background: submitMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                                color: submitMsg.type === 'success' ? '#2e7d32' : '#c62828',
                                fontSize: '14px',
                            }}>
                                {submitMsg.text}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={closeModal}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    background: '#f5f5f5',
                                    cursor: 'pointer',
                                }}
                            >
                                {submitMsg?.type === 'success' ? 'Close' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || submitMsg?.type === 'success'}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: submitting || submitMsg?.type === 'success' ? '#90caf9' : '#1976d2',
                                    color: '#fff',
                                    cursor: submitting || submitMsg?.type === 'success' ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                }}
                            >
                                {submitting ? 'Applying...' : 'Apply Points'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const AdminDashboard = ({ user }) => {
    return (
        <>
            <h1>Admin Dashboard</h1>
            <p style={{ color: '#666' }}>Admin dashboard coming soon.</p>
        </>
    );
};

const DASHBOARDS = {
    driver:  DriverDashboard,
    sponsor: SponsorDashboard,
    admin:   AdminDashboard,
};

const Dashboard = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');

    useEffect(() => {
        if (!user) navigate('/');
    }, []);

    if (!user) return null;

    const RoleDashboard = DASHBOARDS[user.user_type];

    if (!RoleDashboard) {
        return <div style={{ padding: '24px' }}>No dashboard available for role: {user.user_type}</div>;
    }

    return (
        <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
            <RoleDashboard user={user} />
        </div>
    );
};

const th = { padding: '10px 12px', textAlign: 'left', borderBottom: '2px solid #ddd', fontSize: '13px', fontWeight: '600', color: '#444' };
const td = { padding: '10px 12px', fontSize: '14px', color: '#1a1a1a' };
const labelStyle = { display: 'block', fontWeight: '600', fontSize: '13px', marginBottom: '4px', marginTop: '14px', color: '#333' };
const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box' };

export default Dashboard;