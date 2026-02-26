import React, { useEffect, useState } from 'react';
import SortableTable from '../../../components/SortableTable';
import Modal from '../../../components/Modal';
import Field from '../../../components/Field';

const OrganizationOrdersTab = ({ orgId }) => {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterDriver, setFilterDriver] = useState('');
    const [selectedOrderItems, setSelectedOrderItems] = useState([]);
    const [detailOpen, setDetailOpen] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState(null);
    const [itemsLoading, setItemsLoading] = useState(false);

    useEffect(() => {
        if (!orgId) return;
        fetch(`/api/orders/org/${orgId}`)
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(data => setOrders(data.orders || []))
            .catch(() => setOrders([]))
            .finally(() => setLoading(false));
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

    const handleClose = () => {
        setDetailOpen(false);
        setSelectedOrderId(null);
        setSelectedOrderItems([]);
    };

    const filteredOrders = orders.filter(o =>
        !filterDriver || (o.driver_username || '').toLowerCase().includes(filterDriver.toLowerCase())
    );

    return (
        <div>
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
                            render: (val) => (
                                <span style={{
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    background: val === 'placed' ? '#e3f2fd' : '#f5f5f5',
                                    color: val === 'placed' ? '#1565c0' : '#444',
                                }}>
                                    {val}
                                </span>
                            ),
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
