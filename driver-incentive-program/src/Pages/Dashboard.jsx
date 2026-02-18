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

            {/* Lifetime Points Card */}
            <div style={{
                background: '#f0f7ff',
                border: '1px solid #b3d4ff',
                borderRadius: '8px',
                padding: '20px 28px',
                marginBottom: '28px',
                display: 'inline-block',
            }}>
                <div style={{ fontSize: '14px', color: '#555' }}>Lifetime Points</div>
                <div style={{ fontSize: '36px', fontWeight: 'bold', color: '#1a1a1a' }}>{data.total_points}</div>
            </div>

            {/* Breakdown by Source */}
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

            {/* Points History */}
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
    // Add sponsor specific things here
    return (
        <>
            <h1>Sponsor Dashboard</h1>
            <p style={{ color: '#666' }}>Sponsor dashboard coming soon.</p>
        </>
    );
};

const AdminDashboard = ({ user }) => {
    // Add admin specific things here
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

// Shell for the dashboard
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

export default Dashboard;