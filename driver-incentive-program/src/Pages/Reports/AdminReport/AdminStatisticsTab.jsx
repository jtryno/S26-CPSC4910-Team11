import { useEffect, useState } from 'react';

const statCardStyle = {
    background: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '8px',
    padding: '20px 24px',
    minWidth: '160px',
    flex: '1 1 160px',
};

const StatCard = ({ label, value, color = '#1a1a1a' }) => (
    <div style={statCardStyle}>
        <div style={{ fontSize: '13px', color: '#888', marginBottom: '6px' }}>{label}</div>
        <div style={{ fontSize: '28px', fontWeight: '700', color }}>{value ?? '—'}</div>
    </div>
);

const SectionHeader = ({ children }) => (
    <h3 style={{ margin: '28px 0 12px', fontSize: '16px', color: '#444', borderBottom: '1px solid #eee', paddingBottom: '6px' }}>
        {children}
    </h3>
);

const AdminStatisticsTab = () => {
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/statistics');
            if (!res.ok) throw new Error('Failed to load statistics');
            setStats(await res.json());
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    if (loading) return <div style={{ padding: '24px', color: '#666' }}>Loading statistics...</div>;
    if (error)   return <div style={{ padding: '24px', color: '#c62828' }}>Error: {error}</div>;
    if (!stats)  return null;

    const { users, organizations, orders, catalog, tickets, generated_at } = stats;

    return (
        <div style={{ padding: '24px', maxWidth: '900px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h2 style={{ margin: 0, fontSize: '20px' }}>System Statistics</h2>
                <button
                    onClick={load}
                    style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer', fontSize: '13px' }}
                >
                    Refresh
                </button>
            </div>
            <div style={{ fontSize: '12px', color: '#aaa', marginBottom: '20px' }}>
                Last updated: {new Date(generated_at).toLocaleString()}
            </div>

            <SectionHeader>Users</SectionHeader>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <StatCard label="Total Users"     value={users.total_users} />
                <StatCard label="Drivers"         value={users.total_drivers} />
                <StatCard label="Sponsors"        value={users.total_sponsors} />
                <StatCard label="Admins"          value={users.total_admins} />
                <StatCard label="Active"          value={users.active_users}   color="#2e7d32" />
                <StatCard label="Inactive"        value={users.inactive_users} color="#b71c1c" />
            </div>

            <SectionHeader>Organizations</SectionHeader>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <StatCard label="Total Orgs" value={organizations.total_orgs} />
            </div>

            <SectionHeader>Orders</SectionHeader>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <StatCard label="Total Orders"    value={orders.total_orders} />
                <StatCard label="Placed"          value={orders.placed_orders} />
                <StatCard label="Shipped"         value={orders.shipped_orders} />
                <StatCard label="Delivered"       value={orders.delivered_orders} color="#2e7d32" />
                <StatCard label="Canceled"        value={orders.canceled_orders}  color="#b71c1c" />
                <StatCard label="Points Spent"    value={Number(orders.total_points_spent).toLocaleString()} />
            </div>

            <SectionHeader>Catalog &amp; Support</SectionHeader>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                <StatCard label="Active Catalog Items" value={catalog.total_catalog_items} />
                <StatCard label="Total Tickets"        value={tickets.total_tickets} />
                <StatCard label="Open Tickets"         value={tickets.open_tickets}     color="#e65100" />
                <StatCard label="Resolved Tickets"     value={tickets.resolved_tickets} color="#2e7d32" />
            </div>
        </div>
    );
};

export default AdminStatisticsTab;
