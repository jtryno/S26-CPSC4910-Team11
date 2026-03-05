import { useEffect, useState, useCallback } from 'react';

const Catalog = () => {
    const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');

    const [catalogItems, setCatalogItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [balance, setBalance] = useState(0);
    const [cartId, setCartId] = useState(null);
    const [cartItems, setCartItems] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);

    const [checkoutMsg, setCheckoutMsg] = useState(null);
    const [checkingOut, setCheckingOut] = useState(false);
    const [addingIds, setAddingIds] = useState(new Set());
    const [reviewOpen, setReviewOpen] = useState(false);

    const sponsorOrgId = user?.sponsor_org_id;
    const driverUserId = user?.user_id;

    const fetchBalance = useCallback(async () => {
        if (!driverUserId) return;
        try {
            const res = await fetch(`/api/driver/points/${driverUserId}`);
            if (res.ok) {
                const d = await res.json();
                setBalance(d.total_points ?? 0);
            }
        } catch { /* non-critical */ }
    }, [driverUserId]);

    const fetchCart = useCallback(async (id) => {
        try {
            const res = await fetch(`/api/cart/${id}`);
            if (res.ok) {
                const d = await res.json();
                setCartItems(d.items || []);
            }
        } catch { /* non-critical */ }
    }, []);

    useEffect(() => {
        if (!sponsorOrgId || !driverUserId) {
            setLoading(false);
            return;
        }

        const init = async () => {
            try {
                // Fetch catalog items, balance, and cart in parallel
                const [catalogRes, cartRes] = await Promise.all([
                    fetch(`/api/catalog/org/${sponsorOrgId}`),
                    fetch('/api/cart', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ driverUserId, sponsorOrgId }),
                    }),
                ]);

                if (!catalogRes.ok) throw new Error('Failed to load catalog');
                const catalogData = await catalogRes.json();
                setCatalogItems(catalogData.items || []);

                if (cartRes.ok) {
                    const cartData = await cartRes.json();
                    setCartId(cartData.cart_id);
                    await fetchCart(cartData.cart_id);
                } else {
                    console.error('Failed to initialize cart:', await cartRes.text());
                }

                await fetchBalance();
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [sponsorOrgId, driverUserId, fetchBalance, fetchCart]);

    const handleAddToCart = async (item) => {
        if (!cartId) return;
        setAddingIds(prev => new Set([...prev, item.item_id]));
        try {
            const res = await fetch(`/api/cart/${cartId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: item.item_id, quantity: 1 }),
            });
            if (res.ok) {
                await fetchCart(cartId);
            }
        } catch { /* non-critical */ }
        setAddingIds(prev => { const next = new Set(prev); next.delete(item.item_id); return next; });
    };

    const handleRemoveFromCart = async (itemId) => {
        if (!cartId) return;
        try {
            const res = await fetch(`/api/cart/${cartId}/items/${itemId}`, { method: 'DELETE' });
            if (res.ok) await fetchCart(cartId);
        } catch { /* non-critical */ }
    };

    const cartTotal = cartItems.reduce((sum, ci) => sum + ci.points_price_at_add * ci.quantity, 0);
    const canCheckout = cartItems.length > 0 && cartTotal <= balance;

    const handleCheckout = async () => {
        if (!canCheckout) return false;
        setCheckingOut(true);
        setCheckoutMsg(null);
        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ driverUserId, sponsorOrgId, cartId }),
            });
            const json = await res.json();
            if (res.ok) {
                setCheckoutMsg({ type: 'success', text: `Order placed! ${json.points_spent.toLocaleString()} pts spent.` });
                setCartItems([]);
                setCartId(null);
                await fetchBalance();
                const newCartRes = await fetch('/api/cart', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ driverUserId, sponsorOrgId }),
                });
                if (newCartRes.ok) {
                    const nc = await newCartRes.json();
                    setCartId(nc.cart_id);
                }
                return true;
            } else {
                setCheckoutMsg({ type: 'error', text: json.error || 'Checkout failed.' });
                return false;
            }
        } catch {
            setCheckoutMsg({ type: 'error', text: 'Network error. Please try again.' });
            return false;
        } finally {
            setCheckingOut(false);
        }
    };

    if (!user || !sponsorOrgId) {
        return (
            <div className="catalog-page">
                <h1>Catalog</h1>
                <p style={{ color: '#888' }}>Join an organization to access the catalog.</p>
            </div>
        );
    }

    if (loading) return <div className="catalog-page"><h1>Catalog</h1><p>Loading...</p></div>;
    if (error) return <div className="catalog-page"><h1>Catalog</h1><p>Error: {error}</p></div>;

    return (
        <div className="catalog-page" style={{ position: 'relative' }}>
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ margin: 0 }}>Catalog</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontSize: '14px', color: '#555' }}>
                        Balance: <strong style={{ color: '#2e7d32' }}>{balance.toLocaleString()} pts</strong>
                    </span>
                    <button
                        onClick={() => { setCartOpen(o => !o); setCheckoutMsg(null); }}
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
                </div>
            </div>

            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                {/* Product grid */}
                <div style={{ flex: 1 }}>
                    {catalogItems.length === 0 ? (
                        <p style={{ color: '#888' }}>No items in the catalog yet.</p>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                            {catalogItems.map((item) => (
                                <li key={item.item_id} style={{
                                    border: '1px solid #e0e0e0',
                                    borderRadius: '8px',
                                    padding: '16px',
                                    background: '#fff',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '8px',
                                }}>
                                    <img
                                        src={item.image_url ? `/api/proxy-image?url=${encodeURIComponent(item.image_url)}` : 'https://via.placeholder.com/150?text=No+Image'}
                                        alt={item.title}
                                        style={{ width: '100%', height: '150px', objectFit: 'contain' }}
                                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/150?text=No+Image'; }}
                                    />
                                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{item.title}</div>
                                    <div style={{ fontSize: '13px', color: '#666' }}>{item.description}</div>
                                    <div style={{ fontSize: '14px', color: '#1a1a1a' }}>
                                        ${parseFloat(item.last_price_value).toFixed(2)}&nbsp;/&nbsp;
                                        <strong style={{ color: '#1565c0' }}>{Number(item.points_price).toLocaleString()} pts</strong>
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
                                    <button
                                        onClick={() => handleAddToCart(item)}
                                        disabled={!cartId || addingIds.has(item.item_id) || item.availability_status === 'out_of_stock'}
                                        title={!cartId ? 'Cart unavailable — please refresh' : undefined}
                                        style={{
                                            marginTop: 'auto',
                                            padding: '8px',
                                            borderRadius: '4px',
                                            border: 'none',
                                            background: item.availability_status === 'out_of_stock' ? '#e0e0e0'
                                                : !cartId ? '#e0e0e0'
                                                : addingIds.has(item.item_id) ? '#90caf9' : '#1976d2',
                                            color: item.availability_status === 'out_of_stock' || !cartId ? '#999' : '#fff',
                                            cursor: !cartId || item.availability_status === 'out_of_stock' || addingIds.has(item.item_id) ? 'not-allowed' : 'pointer',
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
                        width: '300px',
                        flexShrink: 0,
                        border: '1px solid #e0e0e0',
                        borderRadius: '8px',
                        background: '#fff',
                        padding: '16px',
                        position: 'sticky',
                        top: '16px',
                    }}>
                        <h2 style={{ marginTop: 0, fontSize: '18px' }}>Your Cart</h2>
                        <div style={{ fontSize: '13px', color: '#555', marginBottom: '12px' }}>
                            Available: <strong style={{ color: '#2e7d32' }}>{balance.toLocaleString()} pts</strong>
                        </div>

                        {cartItems.length === 0 ? (
                            <p style={{ color: '#888', fontSize: '14px' }}>Cart is empty.</p>
                        ) : (
                            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {cartItems.map((ci) => (
                                    <li key={ci.item_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '13px', fontWeight: '600' }}>{ci.title}</div>
                                            <div style={{ fontSize: '12px', color: '#666' }}>
                                                Qty {ci.quantity} · {(ci.points_price_at_add * ci.quantity).toLocaleString()} pts
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveFromCart(ci.item_id)}
                                            title="Remove"
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: '#c62828',
                                                cursor: 'pointer',
                                                fontSize: '18px',
                                                lineHeight: 1,
                                                padding: 0,
                                                flexShrink: 0,
                                            }}
                                        >
                                            ×
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}

                        <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '12px', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '600' }}>
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
                                marginBottom: '12px',
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
                            onClick={() => { setCheckoutMsg(null); setReviewOpen(true); }}
                            disabled={!canCheckout}
                            style={{
                                width: '100%',
                                padding: '10px',
                                borderRadius: '4px',
                                border: 'none',
                                background: !canCheckout ? '#e0e0e0' : '#2e7d32',
                                color: !canCheckout ? '#999' : '#fff',
                                cursor: !canCheckout ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '14px',
                            }}
                        >
                            {cartTotal > balance ? 'Insufficient Points'
                                : cartItems.length === 0 ? 'Cart is Empty'
                                : 'Checkout'}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Order Review Modal ── */}
            {reviewOpen && (
                <div style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1000,
                }}>
                    <div style={{
                        background: '#fff',
                        borderRadius: '8px',
                        padding: '32px',
                        width: '480px',
                        maxWidth: '95vw',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
                    }}>
                        <h2 style={{ marginTop: 0 }}>Review Your Order</h2>
                        <p style={{ color: '#555', fontSize: '14px', margin: '0 0 16px' }}>
                            Please confirm the items below before placing your order.
                        </p>

                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {cartItems.map((ci) => (
                                <li key={ci.item_id} style={{
                                    display: 'flex', gap: '12px', alignItems: 'center',
                                    borderBottom: '1px solid #f0f0f0', paddingBottom: '12px',
                                }}>
                                    <img
                                        src={ci.image_url ? `/api/proxy-image?url=${encodeURIComponent(ci.image_url)}` : 'https://via.placeholder.com/50?text=?'}
                                        alt={ci.title}
                                        style={{ width: '50px', height: '50px', objectFit: 'contain', flexShrink: 0 }}
                                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/50?text=?'; }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{ci.title}</div>
                                        <div style={{ fontSize: '13px', color: '#666' }}>
                                            Qty {ci.quantity} · {(ci.points_price_at_add * ci.quantity).toLocaleString()} pts
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '12px', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '600' }}>
                                <span>Total</span>
                                <span style={{ color: '#1565c0' }}>{cartTotal.toLocaleString()} pts</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: '#555', marginTop: '4px' }}>
                                <span>Remaining balance after order</span>
                                <span style={{ color: '#2e7d32' }}>{(balance - cartTotal).toLocaleString()} pts</span>
                            </div>
                        </div>

                        {checkoutMsg && (
                            <div style={{
                                marginBottom: '12px', padding: '8px 12px', borderRadius: '4px',
                                background: checkoutMsg.type === 'success' ? '#e8f5e9' : '#ffebee',
                                color: checkoutMsg.type === 'success' ? '#2e7d32' : '#c62828',
                                fontSize: '13px',
                            }}>
                                {checkoutMsg.text}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setReviewOpen(false)}
                                disabled={checkingOut}
                                style={{
                                    padding: '8px 20px', borderRadius: '4px',
                                    border: '1px solid #ccc', background: '#f5f5f5',
                                    cursor: checkingOut ? 'not-allowed' : 'pointer',
                                }}
                            >
                                Back
                            </button>
                            <button
                                onClick={async () => {
                                    const success = await handleCheckout();
                                    if (success) setReviewOpen(false);
                                }}
                                disabled={checkingOut}
                                style={{
                                    padding: '8px 20px', borderRadius: '4px', border: 'none',
                                    background: checkingOut ? '#e0e0e0' : '#2e7d32',
                                    color: checkingOut ? '#999' : '#fff',
                                    cursor: checkingOut ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                }}
                            >
                                {checkingOut ? 'Placing Order...' : 'Confirm Order'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Catalog;
