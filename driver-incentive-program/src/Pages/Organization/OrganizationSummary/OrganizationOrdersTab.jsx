import React, { useEffect, useState } from 'react';
import SortableTable from '../../../components/SortableTable';
import Modal from '../../../components/Modal';
import Field from '../../../components/Field';

const OrganizationOrdersTab = ({ orgId, userData }) => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterDriver, setFilterDriver] = useState('');
    const [selectedOrderItems, setSelectedOrderItems] = useState([]);
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [shippingIds, setShippingIds] = useState(new Set());
    // null = still loading, number = net points redeemed via orders this month
    const [monthlyRedeemed, setMonthlyRedeemed] = useState(null);

    useEffect(() => {
        if (!orgId) return;
        fetch(`/api/orders/org/${orgId}`)
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(data => setOrders(data.orders || []))
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
        // fetch net points redeemed this month, not including approved point contest
        fetch(`/api/organization/${orgId}/monthly-redeemed-points`)
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(data => setMonthlyRedeemed(data.total_redeemed))
            .catch(() => setMonthlyRedeemed(0));
    }, [orgId]);

    const handleViewItems = async (row) => {
        setSelectedOrderId(row.order_id);
        setItemsLoading(true);
        setDetailOpen(true);
        try {
            const res = await fetch(`/api/orders/${row.order_id}/items`);
            const data = await res.json();
            setSelectedOrderItems(data.items || []);
        } catch {
            setSelectedOrderItems([]);
        } finally {
            setItemsLoading(false);
        }
    };

    const handleMarkShipped = async (row) => {
        if (shippingIds.has(row.order_id)) return;
        setShippingIds(prev => new Set([...prev, row.order_id]));
        try {
            const res = await fetch(`/api/orders/${row.order_id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: 'shipped', userId: userData?.user_id }),
            });
            if (res.ok) {
                setOrders(prev => prev.map(o => o.order_id === row.order_id ? { ...o, status: 'shipped' } : o));
            }
        } catch { /* non-critical */ }
        finally {
            setShippingIds(prev => { const next = new Set(prev); next.delete(row.order_id); return next; });
        }
    };

    const handleClose = () => {
        setDetailOpen(false);
        setSelectedOrderId(null);
        setSelectedOrderItems([]);
    };

    const filteredOrders = orders.filter(o =>
        !filterDriver || (o.driver_username || '').toLowerCase().includes(filterDriver.toLowerCase())
    );

    // formatted label for the stat banner, e.g. "March 2026"
    const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

    return (
        <div>
            <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '10px',
                background: '#f0f4ff',
                border: '1px solid #c7d7f9',
                borderRadius: '8px',
                padding: '10px 16px',
                marginBottom: '16px',
            }}>
                <span style={{ fontSize: '13px', color: '#555' }}>Points redeemed via catalog ({currentMonth}):</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: '#1565c0' }}>
                    {monthlyRedeemed === null ? '—' : Number(monthlyRedeemed).toLocaleString()} pts
                </span>
            </div>

            <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <label style={{ fontSize: '14px', color: '#555' }}>Filter by driver:</label>
                <input
                    type="text"
                    placeholder="Driver username..."
                    value={filterDriver}
                    onChange={(e) => setFilterDriver(e.target.value)}
                    style={{
                        padding: '6px 10px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        fontSize: '14px',
                        width: '220px',
                    }}
                />
            </div>

            {loading ? (
                <p>Loading orders...</p>
            ) : (
                <SortableTable
                    columns={[
                        { key: 'order_id', label: 'Order ID', sortable: true },
                        { key: 'driver_username', label: 'Driver', sortable: true },
                        {
                            key: 'created_at',
                            label: 'Date',
                            sortable: true,
                            render: (val) => new Date(val).toLocaleDateString(),
                        },
                        {
                            key: 'status',
                            label: 'Status',
                            sortable: true,
                            render: (val) => {
                                const badge = {
                                    placed:    { bg: '#e3f2fd', color: '#1565c0' },
                                    shipped:   { bg: '#fff3e0', color: '#e65100' },
                                    delivered: { bg: '#e8f5e9', color: '#2e7d32' },
                                    cancelled:  { bg: '#f5f5f5', color: '#757575' },
                                }[val] || { bg: '#f5f5f5', color: '#444' };
                                return (
                                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600', background: badge.bg, color: badge.color }}>
                                        {val}
                                    </span>
                                );
                            },
                        },
                        { key: 'item_count', label: 'Items', sortable: true },
                        {
                            key: 'total_points',
                            label: 'Points Spent',
                            sortable: true,
                            render: (val) => Number(val).toLocaleString(),
                        },
                        {
                            key: 'total_usd',
                            label: 'USD Value',
                            sortable: true,
                            render: (val) => `$${parseFloat(val).toFixed(2)}`,
                        },
                    ]}
                    actions={[
                        { label: 'View Items', onClick: handleViewItems },
                        {
                            label: 'Mark Shipped',
                            render: (row) => row.status === 'placed' ? (
                                <button
                                    onClick={() => handleMarkShipped(row)}
                                    disabled={shippingIds.has(row.order_id)}
                                    style={{ background: shippingIds.has(row.order_id) ? '#e0e0e0' : '#1976d2', color: shippingIds.has(row.order_id) ? '#999' : '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: shippingIds.has(row.order_id) ? 'not-allowed' : 'pointer', fontSize: '13px' }}
                                >
                                    {shippingIds.has(row.order_id) ? 'Shipping...' : 'Mark Shipped'}
                                </button>
                            ) : null,
                        },
                    ]}
                    data={filteredOrders}
                />
            )}

            {!loading && filteredOrders.length === 0 && (
                <p style={{ color: '#888' }}>No orders found.</p>
            )}

            <Modal
                isOpen={detailOpen}
                onClose={handleClose}
                title={`Order #${selectedOrderId} — Items`}
            >
                {itemsLoading ? (
                    <p>Loading items...</p>
                ) : selectedOrderItems.length === 0 ? (
                    <p style={{ color: '#888' }}>No items found for this order.</p>
                ) : (
                    <div style={{ display: 'grid', gap: '16px' }}>
                        {selectedOrderItems.map((item) => (
                            <div key={item.order_item_id} style={{
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'flex-start',
                                borderBottom: '1px solid #f0f0f0',
                                paddingBottom: '12px',
                            }}>
                                <img
                                    src={item.image_url ? `/api/proxy-image?url=${encodeURIComponent(item.image_url)}` : 'https://via.placeholder.com/60?text=?'}
                                    alt={item.title}
                                    style={{ width: '60px', height: '60px', objectFit: 'contain', flexShrink: 0 }}
                                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/60?text=?'; }}
                                />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: '600', fontSize: '14px', marginBottom: '4px' }}>{item.title}</div>
                                    <div style={{ fontSize: '13px', color: '#555' }}>Qty: {item.quantity}</div>
                                    <div style={{ fontSize: '13px', color: '#555' }}>
                                        {Number(item.points_price_at_purchase).toLocaleString()} pts &nbsp;·&nbsp; ${parseFloat(item.price_usd_at_purchase).toFixed(2)}
                                    </div>
                                    {item.item_web_url && (
                                        <a
                                            href={item.item_web_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            style={{ fontSize: '12px', color: '#1976d2' }}
                                        >
                                            View on eBay ↗
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default OrganizationOrdersTab;
