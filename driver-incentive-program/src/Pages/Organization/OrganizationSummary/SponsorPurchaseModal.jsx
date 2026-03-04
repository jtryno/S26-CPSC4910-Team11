import { useEffect, useState, useCallback } from 'react';

const SponsorPurchaseModal = ({ isOpen, onClose, driver, orgId, sponsorUserId }) => {
    const [catalogItems, setCatalogItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [balance, setBalance] = useState(0);
    const [cartId, setCartId] = useState(null);
    const [cartItems, setCartItems] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [addingIds, setAddingIds] = useState(new Set());
    const [checkoutMsg, setCheckoutMsg] = useState(null);
    const [checkingOut, setCheckingOut] = useState(false);

    const fetchBalance = useCallback(async () => {
        if (!driver?.user_id) return;
        try {
            const res = await fetch(`/api/driver/points/${driver.user_id}`);
            if (res.ok) {
                const d = await res.json();
                setBalance(d.total_points ?? 0);
            }
        } catch { }
    }, [driver?.user_id]);

    const fetchCart = useCallback(async (id) => {
        try {
            const res = await fetch(`/api/cart/${id}`);
            if (res.ok) {
                const d = await res.json();
                setCartItems(d.items || []);
            }
        } catch { }
    }, []);

    useEffect(() => {
        if (!isOpen || !driver?.user_id || !orgId) return;
        setLoading(true);
        setCheckoutMsg(null);
        setCartOpen(false);
        setCartItems([]);
        setCartId(null);

        const init = async () => {
            try {
                const [catalogRes, cartRes] = await Promise.all([
                    fetch(`/api/catalog/org/${orgId}`),
                    fetch('/api/cart', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ driverUserId: driver.user_id, sponsorOrgId: orgId, createdByUserId: sponsorUserId }),
                    }),
                ]);
                if (catalogRes.ok) {
                    const d = await catalogRes.json();
                    setCatalogItems(d.items || []);
                }
                if (cartRes.ok) {
                    const d = await cartRes.json();
                    setCartId(d.cart_id);
                    await fetchCart(d.cart_id);
                }
                await fetchBalance();
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [isOpen, driver?.user_id, orgId, sponsorUserId, fetchBalance, fetchCart]);

    const handleAddToCart = async (item) => {
        if (!cartId) return;
        setAddingIds(prev => new Set([...prev, item.item_id]));
        try {
            const res = await fetch(`/api/cart/${cartId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: item.item_id, quantity: 1 }),
            });
            if (res.ok) await fetchCart(cartId);
        } catch { }
        setAddingIds(prev => { const next = new Set(prev); next.delete(item.item_id); return next; });
    };

    const handleRemoveFromCart = async (itemId) => {
        if (!cartId) return;
        try {
            const res = await fetch(`/api/cart/${cartId}/items/${itemId}`, { method: 'DELETE' });
            if (res.ok) await fetchCart(cartId);
        } catch { }
    };

    const cartTotal = cartItems.reduce((sum, ci) => sum + ci.points_price_at_add * ci.quantity, 0);
    const canCheckout = cartItems.length > 0 && cartTotal <= balance;

    const handleCheckout = async () => {
        if (!canCheckout) return;
        setCheckingOut(true);
        setCheckoutMsg(null);
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    driverUserId: driver.user_id,
                    sponsorOrgId: orgId,
                    cartId,
                    placedByUserId: sponsorUserId,
                }),
            });
            const json = await res.json();
            if (res.ok) {
                setCheckoutMsg({ type: 'success', text: `Order placed for ${driver.username}! ${json.points_spent.toLocaleString()} pts spent.` });
                setCartItems([]);
                setCartId(null);
                await fetchBalance();
                const newCartRes = await fetch('/api/cart', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ driverUserId: driver.user_id, sponsorOrgId: orgId, createdByUserId: sponsorUserId }),
                });
                if (newCartRes.ok) {
                    const nc = await newCartRes.json();
                    setCartId(nc.cart_id);
                }
            } else {
                setCheckoutMsg({ type: 'error', text: json.error || 'Checkout failed.' });
            }
        } catch {
            setCheckoutMsg({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setCheckingOut(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000,
        }}>
            <div style={{
                background: '#fff',
                borderRadius: '8px',
                width: '90vw',
                maxWidth: '1000px',
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: '1px solid #e0e0e0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0,
                }}>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '18px' }}>Purchase for {driver?.username}</h2>
                        <div style={{ fontSize: '13px', color: '#555', marginTop: '4px' }}>
                            Balance: <strong style={{ color: '#2e7d32' }}>{balance.toLocaleString()} pts</strong>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                        <button
                            onClick={() => setCartOpen(o => !o)}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '4px',
                                border: '1px solid #1976d2',
                                background: cartOpen ? '#1976d2' : '#fff',
                                color: cartOpen ? '#fff' : '#1976d2',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '14px',
                            }}
                        >
                            Cart {cartItems.length > 0 ? `(${cartItems.length})` : ''}
                        </button>
                        <button
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#666', lineHeight: 1, padding: '0 4px' }}
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                    {/* Catalog grid */}
                    <div style={{ flex: 1 }}>
                        {loading ? (
                            <p>Loading catalog...</p>
                        ) : catalogItems.length === 0 ? (
                            <p style={{ color: '#888' }}>No items in the catalog.</p>
                        ) : (
                            <ul style={{
                                listStyle: 'none', padding: 0, margin: 0,
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                                gap: '16px',
                            }}>
                                {catalogItems.map((item) => (
                                    <li key={item.item_id} style={{
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        background: '#fafafa',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                    }}>
                                        <img
                                            src={item.image_url ? `/api/proxy-image?url=${encodeURIComponent(item.image_url)}` : 'https://via.placeholder.com/150?text=No+Image'}
                                            alt={item.title}
                                            style={{ width: '100%', height: '130px', objectFit: 'contain' }}
                                            onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/150?text=No+Image'; }}
                                        />
                                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{item.title}</div>
                                        <div style={{ fontSize: '14px', color: '#1a1a1a' }}>
                                            ${parseFloat(item.last_price_value).toFixed(2)}&nbsp;/&nbsp;
                                            <strong style={{ color: '#1565c0' }}>{Number(item.points_price).toLocaleString()} pts</strong>
                                        </div>
                                        <button
                                            onClick={() => handleAddToCart(item)}
                                            disabled={!cartId || addingIds.has(item.item_id) || item.availability_status === 'out_of_stock'}
                                            style={{
                                                marginTop: 'auto',
                                                padding: '8px',
                                                borderRadius: '4px',
                                                border: 'none',
                                                background: item.availability_status === 'out_of_stock' ? '#e0e0e0'
                                                    : addingIds.has(item.item_id) ? '#90caf9' : '#1976d2',
                                                color: item.availability_status === 'out_of_stock' ? '#999' : '#fff',
                                                cursor: item.availability_status === 'out_of_stock' || addingIds.has(item.item_id) ? 'not-allowed' : 'pointer',
                                                fontWeight: '600',
                                                fontSize: '13px',
                                            }}
                                        >
                                            {item.availability_status === 'out_of_stock' ? 'Out of Stock'
                                                : addingIds.has(item.item_id) ? 'Adding...' : 'Add to Cart'}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {/* Cart sidebar */}
                    {cartOpen && (
                        <div style={{
                            width: '280px',
                            flexShrink: 0,
                            border: '1px solid #e0e0e0',
                            borderRadius: '8px',
                            padding: '16px',
                            position: 'sticky',
                            top: 0,
                            background: '#fff',
                        }}>
                            <h3 style={{ marginTop: 0, fontSize: '16px' }}>Cart for {driver?.username}</h3>
                            <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
                                Available: <strong style={{ color: '#2e7d32' }}>{balance.toLocaleString()} pts</strong>
                            </div>
                            {cartItems.length === 0 ? (
                                <p style={{ color: '#888', fontSize: '14px' }}>Cart is empty.</p>
                            ) : (
                                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {cartItems.map((ci) => (
                                        <li key={ci.item_id} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '13px', fontWeight: '600' }}>{ci.title}</div>
                                                <div style={{ fontSize: '12px', color: '#666' }}>
                                                    Qty {ci.quantity} · {(ci.points_price_at_add * ci.quantity).toLocaleString()} pts
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveFromCart(ci.item_id)}
                                                style={{ background: 'none', border: 'none', color: '#c62828', cursor: 'pointer', fontSize: '18px', lineHeight: 1, padding: 0 }}
                                            >×</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '10px', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '600', fontSize: '14px' }}>
                                    <span>Total</span>
                                    <span style={{ color: cartTotal > balance ? '#c62828' : '#1a1a1a' }}>
                                        {cartTotal.toLocaleString()} pts
                                    </span>
                                </div>
                                {cartTotal > balance && (
                                    <div style={{ fontSize: '12px', color: '#c62828', marginTop: '4px' }}>
                                        Insufficient points ({(cartTotal - balance).toLocaleString()} pts short)
                                    </div>
                                )}
                            </div>
                            {checkoutMsg && (
                                <div style={{
                                    marginBottom: '10px',
                                    padding: '8px 12px',
                                    borderRadius: '4px',
                                    background: checkoutMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                                    color: checkoutMsg.type === 'success' ? '#2e7d32' : '#c62828',
                                    fontSize: '13px',
                                }}>
                                    {checkoutMsg.text}
                                </div>
                            )}
                            <button
                                onClick={handleCheckout}
                                disabled={!canCheckout || checkingOut}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: !canCheckout || checkingOut ? '#e0e0e0' : '#2e7d32',
                                    color: !canCheckout || checkingOut ? '#999' : '#fff',
                                    cursor: !canCheckout || checkingOut ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '14px',
                                }}
                            >
                                {checkingOut ? 'Placing Order...'
                                    : cartTotal > balance ? 'Insufficient Points'
                                    : cartItems.length === 0 ? 'Cart is Empty'
                                    : 'Place Order'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SponsorPurchaseModal;
