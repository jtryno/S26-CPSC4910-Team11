import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EditableField from '../components/EditableField';

const DriverDashboard = ({ user }) => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [leaveModalOpen, setLeaveModalOpen] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const [leaveMsg, setLeaveMsg] = useState(null);

    const SOURCE_LABELS = {
        recurring: 'Recurring',
        manual: 'Manual',
        order: 'Order',
    };

    const fetchData = () => {
        fetch(`/api/driver/points/${user.user_id}`)
            .then(res => {
                if (!res.ok) throw new Error('Failed to load points');
                return res.json();
            })
            .then(d => { setData(d); setLoading(false); })
            .catch(err => { setError(err.message); setLoading(false); });
    };

    useEffect(() => { fetchData(); }, [user.user_id]);

    const handleLeave = async () => {
        setLeaving(true);
        try {
            const res = await fetch('/api/driver/leave-sponsor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driverUserId: user.user_id }),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Failed to leave sponsor');
            setLeaveMsg({ type: 'success', text: result.message });
            fetchData();
        } catch (err) {
            setLeaveMsg({ type: 'error', text: err.message });
        } finally {
            setLeaving(false);
        }
    };

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
                marginBottom: '16px',
                display: 'inline-block',
            }}>
                <div style={{ fontSize: '14px', color: '#555' }}>Total Points</div>
                <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#1a1a1a' }}>{data.total_points}</div>
            </div>

            {data.driver_status === 'active' && (
                <div style={{ marginBottom: '28px' }}>
                    <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                        Sponsor: <strong>{data.sponsor_name}</strong>
                    </div>
                    <button
                        onClick={() => { setLeaveMsg(null); setLeaveModalOpen(true); }}
                        style={{
                            padding: '6px 18px',
                            borderRadius: '4px',
                            border: '1px solid #c62828',
                            background: '#fff',
                            color: '#c62828',
                            cursor: 'pointer',
                            fontSize: '13px',
                        }}
                    >
                        Leave Sponsor
                    </button>
                </div>
            )}

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

            {/* ── Leave Sponsor Confirm Modal ── */}
            {leaveModalOpen && (
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
                        <h2 style={{ marginTop: 0 }}>Leave Sponsor?</h2>
                        <p style={{ color: '#444', lineHeight: '1.5' }}>
                            Are you sure you want to leave <strong>{data.sponsor_name}</strong>?
                            Your points history will be preserved, but you will no longer be active in this organization.
                        </p>

                        {leaveMsg && (
                            <div style={{
                                marginTop: '12px',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                background: leaveMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                                color: leaveMsg.type === 'success' ? '#2e7d32' : '#c62828',
                                fontSize: '14px',
                            }}>
                                {leaveMsg.text}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setLeaveModalOpen(false)}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    background: '#f5f5f5',
                                    color: '#1a1a1a',
                                    cursor: 'pointer',
                                }}
                            >
                                {leaveMsg?.type === 'success' ? 'Close' : 'Cancel'}
                            </button>
                            <button
                                onClick={handleLeave}
                                disabled={leaving || leaveMsg?.type === 'success'}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: leaving || leaveMsg?.type === 'success' ? '#ef9a9a' : '#c62828',
                                    color: '#fff',
                                    cursor: leaving || leaveMsg?.type === 'success' ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                }}
                            >
                                {leaving ? 'Leaving...' : 'Confirm Leave'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

const SponsorDashboard = ({ user }) => {
    const [drivers, setDrivers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [monthlyAwarded, setMonthlyAwarded] = useState(null);
    const [monthlyDeducted, setMonthlyDeducted] = useState(null);
    const [monthlyLimit, setMonthlyLimit] = useState(null);

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

    // settings tab state
    const [settings, setSettings] = useState({ point_upper_limit: '', point_lower_limit: '', monthly_point_limit: '' });
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState(null);

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

    const fetchMonthlyPoints = () => {
        fetch(`/api/sponsor/monthly-points/${user.user_id}`)
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(d => {
                setMonthlyAwarded(d.month_awarded);
                setMonthlyDeducted(d.month_deducted);
            })
            .catch(() => {});
    };

    useEffect(() => { fetchDrivers(); fetchMonthlyPoints(); }, [user.user_id]);

    useEffect(() => {
        fetch(`/api/sponsor/settings/${user.user_id}`)
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(d => {
                setSettings({
                    point_upper_limit: d.point_upper_limit ?? '',
                    point_lower_limit: d.point_lower_limit ?? '',
                    monthly_point_limit: d.monthly_point_limit ?? '',
                });
                setMonthlyLimit(d.monthly_point_limit ?? null);
            })
            .catch(() => {});
    }, [user.user_id]);

    const handleSaveSettings = async () => {
        setSettingsSaving(true);
        setSettingsMsg(null);
        try {
            const res = await fetch('/api/sponsor/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sponsorUserId: user.user_id, ...settings }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to save settings');
            setSettingsMsg({ type: 'success', text: data.message });
        } catch (err) {
            setSettingsMsg({ type: 'error', text: err.message });
        } finally {
            setSettingsSaving(false);
        }
    };

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
            fetchMonthlyPoints();
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

    const MonthlyPointsSummary = () => (
        monthlyAwarded !== null && monthlyDeducted !== null && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '16px' }}>

                {/* Points Awarded Card */}
                <div style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: '#f0fff0',
                    border: '1px solid #a5d6a7',
                    borderRadius: '8px',
                    padding: '12px 32px',
                }}>
                    <div style={{ fontSize: '13px', color: '#555', whiteSpace: 'nowrap' }}>
                        Points Awarded This Month
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#2e7d32' }}>
                        {monthlyAwarded}
                        {monthlyLimit !== null && (
                            <span style={{ fontSize: '16px', color: '#666', fontWeight: 'normal' }}>
                                {' '}/ {monthlyLimit} limit
                            </span>
                        )}
                    </div>
                    {monthlyLimit !== null && (
                        <div style={{ width: '100%', marginTop: '8px' }}>
                            <div style={{ height: '8px', borderRadius: '4px', background: '#ddd', overflow: 'hidden' }}>
                                <div style={{
                                    height: '100%',
                                    borderRadius: '4px',
                                    width: `${Math.min((monthlyAwarded / monthlyLimit) * 100, 100)}%`,
                                    background: (monthlyAwarded / monthlyLimit) >= 0.9 ? '#c62828' :
                                                (monthlyAwarded / monthlyLimit) >= 0.7 ? '#f57c00' : '#1976d2',
                                    transition: 'width 0.3s ease',
                                }} />
                            </div>
                            <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', textAlign: 'right' }}>
                                {`${Math.round((monthlyAwarded / monthlyLimit) * 100)}%`}
                            </div>
                        </div>
                    )}
                </div>

                {/* Points Deducted Card */}
                <div style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    background: '#fff5f5',
                    border: '1px solid #ffb3b3',
                    borderRadius: '8px',
                    padding: '12px 32px',
                }}>
                    <div style={{ fontSize: '13px', color: '#555', whiteSpace: 'nowrap' }}>
                        Points Deducted This Month
                    </div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#c62828' }}>
                        {monthlyDeducted}
                    </div>
                </div>

            </div>
        )
    );

    return (
        <>
            <h1>Sponsor Dashboard</h1>

            <MonthlyPointsSummary  />

            <div style={{ marginBottom: '-1px', textAlign: 'left' }}>
                {tabBtn('individual', 'Individual Points')}
                {tabBtn('batch', 'Batch Award')}
                {tabBtn('settings', 'Settings')}
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

                {/* ── Settings Tab ── */}
                {activeTab === 'settings' && (
                    <>
                        <p style={{ color: '#555', marginTop: 0 }}>
                            Set point limits for your organization. Leave a field blank to apply no limit.
                        </p>

                        <div style={{ maxWidth: '380px' }}>
                            <label style={labelStyle}>
                                Upper Point Limit
                                <span style={{ color: '#888', fontSize: '12px', marginLeft: '6px' }}>
                                    (max points a driver can hold)
                                </span>
                            </label>
                            <input
                                type="number"
                                value={settings.point_upper_limit}
                                onChange={e => { setSettings(s => ({ ...s, point_upper_limit: e.target.value })); setSettingsMsg(null); }}
                                placeholder="No limit"
                                style={inputStyle}
                            />

                            <label style={labelStyle}>
                                Lower Point Limit
                                <span style={{ color: '#888', fontSize: '12px', marginLeft: '6px' }}>
                                    (min points a driver can hold, example: 0 prevents negative)
                                </span>
                            </label>
                            <input
                                type="number"
                                value={settings.point_lower_limit}
                                onChange={e => { setSettings(s => ({ ...s, point_lower_limit: e.target.value })); setSettingsMsg(null); }}
                                placeholder="No limit"
                                style={inputStyle}
                            />

                            <label style={labelStyle}>
                                Monthly Point Limit
                                <span style={{ color: '#888', fontSize: '12px', marginLeft: '6px' }}>
                                    (total points org can award per month)
                                </span>
                            </label>
                            <input
                                type="number"
                                value={settings.monthly_point_limit}
                                onChange={e => { setSettings(s => ({ ...s, monthly_point_limit: e.target.value })); setSettingsMsg(null); }}
                                placeholder="No limit"
                                style={inputStyle}
                            />

                            {settingsMsg && (
                                <div style={{
                                    marginTop: '12px',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    background: settingsMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                                    color: settingsMsg.type === 'success' ? '#2e7d32' : '#c62828',
                                    fontSize: '14px',
                                }}>
                                    {settingsMsg.text}
                                </div>
                            )}

                            <button
                                onClick={handleSaveSettings}
                                disabled={settingsSaving}
                                style={{
                                    marginTop: '20px',
                                    padding: '8px 24px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: settingsSaving ? '#90caf9' : '#1976d2',
                                    color: '#fff',
                                    cursor: settingsSaving ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                }}
                            >
                                {settingsSaving ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
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
                                    color: '#1a1a1a',
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
    const [searchEmail, setSearchEmail] = useState('');
    const [searchedUser, setSearchedUser] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Delete modal state
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteMsg, setDeleteMsg] = useState(null);

    const handleSearch = async () => {
        setLoading(true);
        setError('');
        setSuccessMsg('');
        setSearchedUser(null);

        try {
            const res = await fetch(`/api/admin/user?email=${encodeURIComponent(searchEmail)}`);
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'user does not exist');
            } else {
                setSearchedUser(data.user);
            }
        } catch (err) {
            setError('error');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveField = async (field, value) => {
        try {
            const res = await fetch('/api/user', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: searchedUser.email, field, value }),
            });
            if (res.ok) {
                setSearchedUser(prev => ({ ...prev, [field]: value }));
                setSuccessMsg(`${field} updated successfully!`);
                setTimeout(() => setSuccessMsg(''), 3000);
            } else {
                setError('Failed to update field');
            }
        } catch (err) {
            setError('Failed to update field');
        }
    };

    const handleDeleteConfirm = async () => {
        setDeleting(true);
        setDeleteMsg(null);
        try {
            const res = await fetch(`/api/admin/user/${searchedUser.user_id}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to delete user');
            setDeleteMsg({ type: 'success', text: data.message });
            setSearchedUser(null);
            setSearchEmail('');
        } catch (err) {
            setDeleteMsg({ type: 'error', text: err.message });
        } finally {
            setDeleting(false);
        }
    };

    return (
        <>
            <h1>Admin Dashboard</h1>
            <p style={{ color: '#666', marginBottom: '24px' }}>Search for any user by email to view and edit their information.</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '24px' }}>
                <input
                    type="email"
                    placeholder="Enter user email..."
                    value={searchEmail}
                    onChange={(e) => setSearchEmail(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    style={{
                        padding: '10px 14px',
                        fontSize: '14px',
                        border: '1px solid #ccc',
                        borderRadius: '6px',
                        width: '300px',
                    }}
                />
                <button
                    onClick={handleSearch}
                    disabled={loading}
                    style={{
                        padding: '10px 20px',
                        fontSize: '14px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#1976d2',
                        color: 'white',
                        cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                >
                    {loading ? 'Searching...' : 'Search'}
                </button>
            </div>

            {error && <div style={{ color: '#c62828', marginBottom: '16px' }}>{error}</div>}
            {successMsg && <div style={{ color: '#2e7d32', marginBottom: '16px' }}>{successMsg}</div>}

            {searchedUser && (
                <div style={{
                    background: '#f9f9f9',
                    border: '1px solid #e0e0e0',
                    borderRadius: '8px',
                    padding: '24px',
                    textAlign: 'left',
                    maxWidth: '500px',
                    margin: '0 auto',
                }}>
                    <h2 style={{ marginTop: 0, marginBottom: '20px' }}>
                        Editing: {searchedUser.username}
                        <span style={{ fontSize: '14px', color: '#666', marginLeft: '10px' }}>
                            ({searchedUser.user_type})
                        </span>
                    </h2>

                    <div style={{ display: 'grid', gap: '16px' }}>
                        <EditableField
                            label="Username"
                            value={searchedUser.username || ''}
                            onSave={(val) => handleSaveField('username', val)}
                        />
                        <EditableField
                            label="Email"
                            value={searchedUser.email || ''}
                            onSave={(val) => handleSaveField('email', val)}
                        />
                        <EditableField
                            label="First Name"
                            value={searchedUser.first_name || ''}
                            onSave={(val) => handleSaveField('first_name', val)}
                        />
                        <EditableField
                            label="Last Name"
                            value={searchedUser.last_name || ''}
                            onSave={(val) => handleSaveField('last_name', val)}
                        />
                        <EditableField
                            label="Phone Number"
                            value={searchedUser.phone_number || ''}
                            onSave={(val) => handleSaveField('phone_number', val)}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <b>Role:</b> <span>{searchedUser.user_type}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <b>User ID:</b> <span>{searchedUser.user_id}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <b>Account Created:</b>
                            <span>
                                {searchedUser.created_at
                                    ? new Date(searchedUser.created_at).toLocaleString('en-US', {
                                        year: 'numeric', month: '2-digit', day: '2-digit',
                                        hour: '2-digit', minute: '2-digit', hour12: true,
                                    })
                                    : 'N/A'}
                            </span>
                        </div>
                    </div>

                    {/* Delete User Button */}
                    <div style={{ marginTop: '28px', borderTop: '1px solid #e0e0e0', paddingTop: '20px' }}>
                        <button
                            onClick={() => { setDeleteMsg(null); setDeleteModalOpen(true); }}
                            style={{
                                padding: '8px 20px',
                                borderRadius: '6px',
                                border: '1px solid #c62828',
                                background: '#fff',
                                color: '#c62828',
                                cursor: 'pointer',
                                fontSize: '14px',
                                fontWeight: '600',
                            }}
                        >
                            Delete User
                        </button>
                    </div>
                </div>
            )}

            {/* Delete Confirm Modal */}
            {deleteModalOpen && (
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
                        <h2 style={{ marginTop: 0 }}>Delete User?</h2>
                        <p style={{ color: '#444', lineHeight: '1.5' }}>
                            Are you sure you want to delete <strong>{searchedUser?.username}</strong> ({searchedUser?.user_type})?
                            This will deactivate their account and cannot be undone from this interface.
                        </p>

                        {deleteMsg && (
                            <div style={{
                                marginTop: '12px',
                                padding: '8px 12px',
                                borderRadius: '4px',
                                background: deleteMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                                color: deleteMsg.type === 'success' ? '#2e7d32' : '#c62828',
                                fontSize: '14px',
                            }}>
                                {deleteMsg.text}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', marginTop: '20px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setDeleteModalOpen(false)}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '4px',
                                    border: '1px solid #ccc',
                                    background: '#f5f5f5',
                                    color: '#1a1a1a',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                disabled={deleting}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: deleting ? '#ef9a9a' : '#c62828',
                                    color: '#fff',
                                    cursor: deleting ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                }}
                            >
                                {deleting ? 'Deleting...' : 'Confirm Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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