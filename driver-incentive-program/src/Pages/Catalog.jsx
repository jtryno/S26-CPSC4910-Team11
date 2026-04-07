import { useEffect, useState, useCallback } from 'react';
import ReviewsSection from '../components/ReviewsSection';

const statusBadgeStyle = (status) => ({
    display: 'inline-block',
    fontSize: '11px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '12px',
    background: status === 'in_stock' ? '#e8f5e9' : '#ffebee',
    color: status === 'in_stock' ? '#2e7d32' : '#c62828',
});

const Catalog = () => {
    const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');

    const [catalogItems, setCatalogItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const [balance, setBalance] = useState(0);
    const [cartId, setCartId] = useState(null);
    const [cartItems, setCartItems] = useState([]);
    const [cartOpen, setCartOpen] = useState(false);
    const [cartRestored, setCartRestored] = useState(false);

    const [checkoutMsg, setCheckoutMsg] = useState(null);
    const [checkingOut, setCheckingOut] = useState(false);
    const [addingIds, setAddingIds] = useState(new Set());
    const [reviewOpen, setReviewOpen] = useState(false);
    const [detailItem, setDetailItem] = useState(null);
    const [orderSummary, setOrderSummary] = useState(null);

    // Favorites (#768)
    const [favoriteIds, setFavoriteIds] = useState(new Set());
    const [togglingFavorites, setTogglingFavorites] = useState(new Set());
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

    // Recently viewed (#750)
    const [recentlyViewed, setRecentlyViewed] = useState([]);

    // Sort & filter (#6221, #6224, #6282)
    const [sortBy, setSortBy] = useState('featured');
    const [showOnSaleOnly, setShowOnSaleOnly] = useState(false);
    const [selectedCategories, setSelectedCategories] = useState(new Set());

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
                const items = d.items || [];
                setCartItems(items);
                // Show "cart restored" banner if items were already saved (#6247)
                if (items.length > 0) setCartRestored(true);
            }
        } catch { /* non-critical */ }
    }, []);

    const fetchFavorites = useCallback(async () => {
        if (!driverUserId || !sponsorOrgId) return;
        try {
            const res = await fetch(`/api/favorites/${driverUserId}?sponsorOrgId=${sponsorOrgId}`);
            if (res.ok) {
                const d = await res.json();
                setFavoriteIds(new Set((d.items || []).map(i => i.item_id)));
            }
        } catch { /* non-critical */ }
    }, [driverUserId, sponsorOrgId]);

    const fetchRecentlyViewed = useCallback(async () => {
        if (!driverUserId || !sponsorOrgId) return;
        try {
            const res = await fetch(`/api/catalog/viewed/${driverUserId}?sponsorOrgId=${sponsorOrgId}`);
            if (res.ok) {
                const d = await res.json();
                setRecentlyViewed(d.items || []);
            }
        } catch { /* non-critical */ }
    }, [driverUserId, sponsorOrgId]);

    useEffect(() => {
        if (!sponsorOrgId || !driverUserId) {
            setLoading(false);
            return;
        }

        const init = async () => {
            try {
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

                await Promise.all([fetchBalance(), fetchFavorites(), fetchRecentlyViewed()]);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        init();
    }, [sponsorOrgId, driverUserId, fetchBalance, fetchCart, fetchFavorites, fetchRecentlyViewed]);

    // Auto-dismiss cart restored banner after 4s
    useEffect(() => {
        if (!cartRestored) return;
        const t = setTimeout(() => setCartRestored(false), 4000);
        return () => clearTimeout(t);
    }, [cartRestored]);

    // Fire-and-forget: record that the driver viewed this item
    const recordView = useCallback((itemId) => {
        if (!driverUserId || !itemId) return;
        fetch('/api/catalog/viewed', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ driverUserId, itemId }),
        })
            .then(() => fetchRecentlyViewed())
            .catch(() => { /* non-critical */ });
    }, [driverUserId, fetchRecentlyViewed]);

    const handleToggleFavorite = async (item) => {
        if (togglingFavorites.has(item.item_id)) return;
        setTogglingFavorites(prev => new Set([...prev, item.item_id]));
        const isFav = favoriteIds.has(item.item_id);
        setFavoriteIds(prev => {
            const next = new Set(prev);
            if (isFav) next.delete(item.item_id); else next.add(item.item_id);
            return next;
        });
        try {
            if (isFav) {
                await fetch(`/api/favorites/${driverUserId}/${item.item_id}`, { method: 'DELETE' });
            } else {
                await fetch('/api/favorites', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ driverUserId, itemId: item.item_id }),
                });
            }
        } catch {
            setFavoriteIds(prev => {
                const next = new Set(prev);
                if (isFav) next.add(item.item_id); else next.delete(item.item_id);
                return next;
            });
        } finally {
            setTogglingFavorites(prev => { const next = new Set(prev); next.delete(item.item_id); return next; });
        }
    };

    const handleAddToCart = async (item) => {
        if (!cartId) return;
        recordView(item.item_id);
        setAddingIds(prev => new Set([...prev, item.item_id]));
        try {
            const res = await fetch(`/api/cart/${cartId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ itemId: item.item_id, quantity: 1 }),
            });
            if (res.ok) await fetchCart(cartId);
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
    // Total quantity across all cart items (#6226)
    const cartTotalQty = cartItems.reduce((sum, ci) => sum + ci.quantity, 0);
    const canCheckout = cartItems.length > 0 && cartTotal <= balance;

    const currentPriceForCartItem = (ci) => {
        const catalogItem = catalogItems.find(item => item.item_id === ci.item_id);
        if (catalogItem) { return Number(catalogItem.points_price); }
        return null;
    };
    const hasPriceIncreased = (ci) => {
        const current = currentPriceForCartItem(ci);
        return current !== null && current > ci.points_price_at_add;
    };
    const anyPriceIncreased = cartItems.some(hasPriceIncreased);
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
                setReviewOpen(false);
                setOrderSummary(json);
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

    // ── Filtering & sorting (#6221, #6224, #6282) ──────────────────────────────

    // Unique non-null categories from catalog for the filter UI
    const availableCategories = [...new Set(
        catalogItems.map(i => i.category).filter(Boolean)
    )].sort();

    const toggleCategory = (cat) => {
        setSelectedCategories(prev => {
            const next = new Set(prev);
            if (next.has(cat)) next.delete(cat); else next.add(cat);
            return next;
        });
    };

    const isOnSale = (item) =>
        item.sale_price !== null && item.sale_price !== undefined &&
        parseFloat(item.sale_price) < parseFloat(item.last_price_value);

    let displayedItems = catalogItems;
    if (showFavoritesOnly) displayedItems = displayedItems.filter(i => favoriteIds.has(i.item_id));
    if (showOnSaleOnly) displayedItems = displayedItems.filter(isOnSale);
    if (selectedCategories.size > 0) displayedItems = displayedItems.filter(i => selectedCategories.has(i.category));

    displayedItems = [...displayedItems].sort((a, b) => {
        // Featured items always float to top (#6249)
        const featuredDiff = (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
        if (featuredDiff !== 0) return featuredDiff;

        switch (sortBy) {
            case 'oldest':
                return new Date(a.created_at) - new Date(b.created_at);
            case 'price_asc':
                return parseFloat(a.points_price) - parseFloat(b.points_price);
            case 'price_desc':
                return parseFloat(b.points_price) - parseFloat(a.points_price);
            case 'name_asc':
                return a.title.localeCompare(b.title);
            case 'on_sale': {
                const aSale = isOnSale(a) ? 1 : 0;
                const bSale = isOnSale(b) ? 1 : 0;
                if (bSale !== aSale) return bSale - aSale;
                return new Date(b.created_at) - new Date(a.created_at);
            }
            default: // newest
                return new Date(b.created_at) - new Date(a.created_at);
        }
    });

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
            {/* Cart restored banner (#6247) */}
            {cartRestored && (
                <div style={{
                    marginBottom: '12px',
                    padding: '8px 14px',
                    borderRadius: '4px',
                    background: '#e3f2fd',
                    color: '#1565c0',
                    fontSize: '13px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <span>Your cart was restored with {cartTotalQty} item{cartTotalQty !== 1 ? 's' : ''}.</span>
                    <button onClick={() => setCartRestored(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'inherit' }}>×</button>
                </div>
            )}

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h1 style={{ margin: 0 }}>Catalog</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '14px', color: '#555' }}>
                        Balance: <strong style={{ color: '#2e7d32' }}>{balance.toLocaleString()} pts</strong>
                    </span>

                    {/* Favorites filter toggle */}
                    <button
                        onClick={() => setShowFavoritesOnly(v => !v)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '4px',
                            border: `1px solid ${showFavoritesOnly ? '#c62828' : '#ccc'}`,
                            background: showFavoritesOnly ? '#ffebee' : '#fff',
                            color: showFavoritesOnly ? '#c62828' : '#555',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '14px',
                        }}
                    >
                        {showFavoritesOnly ? '♥ Favorites' : '♡ Favorites'}{favoriteIds.size > 0 ? ` (${favoriteIds.size})` : ''}
                    </button>

                    {/* On Sale filter toggle (#6224) */}
                    <button
                        onClick={() => setShowOnSaleOnly(v => !v)}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '4px',
                            border: `1px solid ${showOnSaleOnly ? '#e65100' : '#ccc'}`,
                            background: showOnSaleOnly ? '#fff3e0' : '#fff',
                            color: showOnSaleOnly ? '#e65100' : '#555',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '14px',
                        }}
                    >
                        On Sale{catalogItems.filter(isOnSale).length > 0 ? ` (${catalogItems.filter(isOnSale).length})` : ''}
                    </button>

                    {/* Cart toggle with total quantity badge (#6226) */}
                    <button
                        onClick={() => { setCartOpen(o => !o); setCheckoutMsg(null); }}
                        style={{
                            position: 'relative',
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
                        Cart
                        {cartTotalQty > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: '-8px',
                                right: '-8px',
                                background: '#c62828',
                                color: '#fff',
                                borderRadius: '50%',
                                minWidth: '20px',
                                height: '20px',
                                fontSize: '11px',
                                fontWeight: '700',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 4px',
                                lineHeight: 1,
                            }}>
                                {cartTotalQty}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {/* Sort & Category filter bar (#6221, #6282) */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {/* Sort dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <label style={{ fontSize: '13px', color: '#555', whiteSpace: 'nowrap' }}>Sort by:</label>
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        style={{
                            padding: '6px 10px',
                            borderRadius: '4px',
                            border: '1px solid #ccc',
                            fontSize: '13px',
                            background: '#fff',
                            cursor: 'pointer',
                        }}
                    >
                        <option value="featured">Featured First</option>
                        <option value="newest">Newest</option>
                        <option value="oldest">Oldest</option>
                        <option value="price_asc">Price: Low to High</option>
                        <option value="price_desc">Price: High to Low</option>
                        <option value="name_asc">Name: A–Z</option>
                        <option value="on_sale">On Sale First</option>
                    </select>
                </div>

                {/* Multi-category filter (#6282) */}
                {availableCategories.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '13px', color: '#555', whiteSpace: 'nowrap' }}>Categories:</span>
                        {availableCategories.map(cat => (
                            <label
                                key={cat}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '4px 10px',
                                    borderRadius: '12px',
                                    border: `1px solid ${selectedCategories.has(cat) ? '#1976d2' : '#ccc'}`,
                                    background: selectedCategories.has(cat) ? '#e3f2fd' : '#fff',
                                    color: selectedCategories.has(cat) ? '#1976d2' : '#555',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    userSelect: 'none',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    checked={selectedCategories.has(cat)}
                                    onChange={() => toggleCategory(cat)}
                                    style={{ display: 'none' }}
                                />
                                {cat}
                            </label>
                        ))}
                        {selectedCategories.size > 0 && (
                            <button
                                onClick={() => setSelectedCategories(new Set())}
                                style={{ fontSize: '12px', color: '#999', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
                {/* Product grid */}
                <div style={{ flex: 1 }}>
                    {displayedItems.length === 0 ? (
                        <p style={{ color: '#888' }}>
                            {showFavoritesOnly ? 'No favorited items yet. Click ♡ on any product to save it.'
                                : showOnSaleOnly ? 'No sale items right now.'
                                : selectedCategories.size > 0 ? 'No items match the selected categories.'
                                : 'No items in the catalog yet.'}
                        </p>
                    ) : (
                        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px' }}>
                            {displayedItems.map((item) => {
                                const onSale = isOnSale(item);
                                const displayTitle = item.custom_title || item.title;
                                const displayDescription = item.custom_description || item.description;
                                const displayImage = item.custom_image_url || item.image_url;
                                const displayPoints = item.custom_points_price || item.points_price;
                                const salePts = onSale
                                    ? Math.ceil(parseFloat(item.sale_price) / parseFloat(item.last_price_value) * parseFloat(displayPoints))
                                    : null;

                                return (
                                    <li key={item.item_id} style={{
                                        border: item.is_featured ? '2px solid #fbc02d' : '1px solid #e0e0e0',
                                        borderRadius: '8px',
                                        padding: '16px',
                                        background: '#fff',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px',
                                        position: 'relative',
                                    }}>
                                        {/* Featured badge (#6249) */}
                                        {item.is_featured ? (
                                            <span style={{
                                                position: 'absolute',
                                                top: '8px',
                                                left: '8px',
                                                background: '#fbc02d',
                                                color: '#fff',
                                                fontSize: '10px',
                                                fontWeight: '700',
                                                padding: '2px 6px',
                                                borderRadius: '10px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                            }}>
                                                Featured
                                            </span>
                                        ) : null}


                                        {/* Sale badge (#6224) */}
                                        {onSale && (
                                            <span style={{
                                                position: 'absolute',
                                                top: item.is_featured ? '28px' : '8px',
                                                left: '8px',
                                                background: '#e65100',
                                                color: '#fff',
                                                fontSize: '10px',
                                                fontWeight: '700',
                                                padding: '2px 6px',
                                                borderRadius: '10px',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                            }}>
                                                Sale
                                            </span>
                                        )}

                                        {/* Favorite heart */}
                                        <button
                                            onClick={() => handleToggleFavorite(item)}
                                            disabled={togglingFavorites.has(item.item_id)}
                                            title={favoriteIds.has(item.item_id) ? 'Remove from favorites' : 'Add to favorites'}
                                            style={{
                                                position: 'absolute',
                                                top: '10px',
                                                right: '10px',
                                                background: 'none',
                                                border: 'none',
                                                cursor: togglingFavorites.has(item.item_id) ? 'default' : 'pointer',
                                                fontSize: '20px',
                                                lineHeight: 1,
                                                color: favoriteIds.has(item.item_id) ? '#c62828' : '#ccc',
                                                padding: 0,
                                            }}
                                        >
                                            {favoriteIds.has(item.item_id) ? '♥' : '♡'}
                                        </button>

                                        {/* Stock badge */}
                                        <span style={{ ...statusBadgeStyle(item.availability_status), marginTop: '4px' }}>
                                            {item.availability_status === 'in_stock' ? 'In Stock' : 'Out of Stock'}
                                        </span>

                                        <img
                                            src={displayImage ? `/api/proxy-image?url=${encodeURIComponent(displayImage)}` : 'https://via.placeholder.com/150?text=No+Image'}
                                            alt={displayTitle}
                                            style={{ width: '100%', height: '150px', objectFit: 'contain' }}
                                            onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/150?text=No+Image'; }}
                                        />
                                        <div style={{ fontWeight: '600', fontSize: '14px', paddingRight: '24px' }}>{displayTitle}</div>
                                        <div style={{ fontSize: '13px', color: '#666' }}>{displayDescription}</div>

                                        {/* Price — strikethrough original if on sale; hidden if sponsor set hide_price */}
                                        {!item.hide_price && (
                                            <div style={{ fontSize: '14px', color: '#1a1a1a' }}>
                                                {onSale ? (
                                                    <>
                                                        <span style={{ textDecoration: 'line-through', color: '#999', marginRight: '6px' }}>
                                                            ${parseFloat(item.last_price_value).toFixed(2)}
                                                        </span>
                                                        <span style={{ color: '#e65100', fontWeight: '700' }}>
                                                            ${parseFloat(item.sale_price).toFixed(2)}
                                                        </span>
                                                        &nbsp;/&nbsp;
                                                        <strong style={{ color: '#e65100' }}>{Number(salePts).toLocaleString()} pts</strong>
                                                    </>
                                                ) : (
                                                    <>
                                                        ${parseFloat(item.last_price_value).toFixed(2)}&nbsp;/&nbsp;
                                                        <strong style={{ color: '#1565c0' }}>{Number(displayPoints).toLocaleString()} pts</strong>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                        {item.hide_price && (
                                            <div style={{ fontSize: '14px' }}>
                                                <strong style={{ color: onSale ? '#e65100' : '#1565c0' }}>
                                                    {Number(onSale ? salePts : displayPoints).toLocaleString()} pts
                                                </strong>
                                            </div>
                                        )}

                                        {/* Driver purchase count (#6222) */}
                                        {item.driver_purchase_count > 0 && (
                                            <div style={{ fontSize: '11px', color: '#888' }}>
                                                {item.driver_purchase_count} driver{item.driver_purchase_count !== 1 ? 's' : ''} bought this
                                            </div>
                                        )}

                                        {/* Misc info */}
                                        {item.misc_info && (
                                            <div style={{ fontSize: '12px', color: '#555', fontStyle: 'italic' }}>{item.misc_info}</div>
                                        )}

                                        {/* Estimated delivery */}
                                        {item.estimated_delivery_days && (
                                            <div style={{ fontSize: '12px', color: '#2e7d32' }}>
                                                Est. delivery: {item.estimated_delivery_days} days
                                            </div>
                                        )}

                                        <ReviewsSection
                                            itemId={item.item_id}
                                            currentUser={user}
                                        />

                                        {/* Details button (#779) */}
                                        <button
                                            onClick={() => { setDetailItem(item); recordView(item.item_id); }}
                                            style={{ fontSize: '12px', color: '#1976d2', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                                        >
                                            View Details →
                                        </button>

                                        {!item.hide_web_url && item.item_web_url && (
                                            <a
                                                href={item.item_web_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={() => recordView(item.item_id)}
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
                                );
                            })}
                        </ul>
                    )}

                    {/* Recently Viewed section (#750) */}
                    {recentlyViewed.length > 0 && (
                        <div style={{ marginTop: '40px' }}>
                            <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px', color: '#444' }}>Recently Viewed</h2>
                            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
                                {recentlyViewed.map((item) => (
                                    <div key={item.item_id} style={{
                                        flexShrink: 0,
                                        width: '140px',
                                        border: '1px solid #e0e0e0',
                                        borderRadius: '8px',
                                        padding: '10px',
                                        background: '#fafafa',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '6px',
                                    }}>
                                        <img
                                            src={item.image_url ? `/api/proxy-image?url=${encodeURIComponent(item.image_url)}` : 'https://via.placeholder.com/100?text=?'}
                                            alt={item.title}
                                            style={{ width: '100%', height: '80px', objectFit: 'contain' }}
                                            onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/100?text=?'; }}
                                        />
                                        <div style={{ fontSize: '12px', fontWeight: '600', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                            {item.title}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#1565c0', fontWeight: '600' }}>
                                            {Number(item.points_price).toLocaleString()} pts
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
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
                                                {hasPriceIncreased(ci) && (
                                                    <div style={{ color: '#e65100', fontSize: '11px', marginTop: '2px' }}>
                                                        ⚠ Price increased to {currentPriceForCartItem(ci).toLocaleString()} pts
                                                    </div>
                                                )}
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
                            {anyPriceIncreased && (
                                <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '4px', padding: '8px 10px', marginBottom: '8px', color: '#e65100', fontSize: '12px' }}>
                                    ⚠ Some item prices have increased since you added them to your cart.
                                </div>
                            )}
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

            {/* ── Order Summary Modal ── */}
            {orderSummary && (
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
                        width: '520px',
                        maxWidth: '95vw',
                        maxHeight: '80vh',
                        overflowY: 'auto',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.2)',
                    }}>
                        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                            <div style={{ fontSize: '40px', marginBottom: '8px' }}>&#10003;</div>
                            <h2 style={{ margin: 0, color: '#2e7d32' }}>Order Confirmed!</h2>
                            <p style={{ color: '#555', fontSize: '14px', margin: '6px 0 0' }}>
                                Order #{orderSummary.order_id}
                            </p>
                        </div>

                        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {(orderSummary.items || []).map((item) => (
                                <li key={item.item_id} style={{
                                    display: 'flex', gap: '12px', alignItems: 'center',
                                    borderBottom: '1px solid #f0f0f0', paddingBottom: '12px',
                                }}>
                                    <img
                                        src={item.image_url ? `/api/proxy-image?url=${encodeURIComponent(item.image_url)}` : 'https://via.placeholder.com/50?text=?'}
                                        alt={item.title}
                                        style={{ width: '50px', height: '50px', objectFit: 'contain', flexShrink: 0 }}
                                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/50?text=?'; }}
                                    />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: '600', fontSize: '14px' }}>{item.title}</div>
                                        <div style={{ fontSize: '13px', color: '#666' }}>
                                            Qty {item.quantity} &middot; {(item.points_price_at_purchase * item.quantity).toLocaleString()} pts
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <div style={{ fontSize: '13px', color: '#1565c0', fontWeight: '600' }}>
                                            ${(item.price_usd_at_purchase * item.quantity).toFixed(2)}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        <div style={{ borderTop: '1px solid #e0e0e0', paddingTop: '12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '15px', fontWeight: '600' }}>
                                <span>Points Spent</span>
                                <span style={{ color: '#c62828' }}>{orderSummary.points_spent.toLocaleString()} pts</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#555' }}>
                                <span>USD Value</span>
                                <span>${orderSummary.total_usd.toFixed(2)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#555' }}>
                                <span>Remaining Balance</span>
                                <span style={{ color: '#2e7d32', fontWeight: '600' }}>{orderSummary.remaining_balance.toLocaleString()} pts</span>
                            </div>
                        </div>

                        <p style={{ fontSize: '13px', color: '#777', margin: '0 0 16px', textAlign: 'center' }}>
                            You can enter your delivery address from the Dashboard.
                        </p>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button
                                onClick={() => setOrderSummary(null)}
                                style={{
                                    padding: '10px 24px', borderRadius: '4px', border: 'none',
                                    background: '#1976d2', color: '#fff',
                                    cursor: 'pointer', fontWeight: '600', fontSize: '14px',
                                }}
                            >
                                Continue Shopping
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Product Detail Modal (#779, #930) ── */}
            {detailItem && (() => {
                const item = detailItem;
                const onSale = isOnSale(item);
                const displayTitle = item.custom_title || item.title;
                const displayDescription = item.custom_description || item.description;
                const displayImage = item.custom_image_url || item.image_url;
                const displayPoints = item.custom_points_price || item.points_price;
                const salePts = onSale
                    ? Math.ceil(parseFloat(item.sale_price) / parseFloat(item.last_price_value) * parseFloat(displayPoints))
                    : null;
                const similarItems = catalogItems.filter(
                    c => c.item_id !== item.item_id && c.category && c.category === item.category
                ).slice(0, 4);

                return (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                        <div style={{ background: '#fff', borderRadius: '8px', padding: '32px', width: '540px', maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                <h2 style={{ margin: 0, fontSize: '18px', flex: 1, paddingRight: '16px' }}>{displayTitle}</h2>
                                <button onClick={() => setDetailItem(null)} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: '#888', lineHeight: 1 }}>×</button>
                            </div>

                            <img
                                src={displayImage ? `/api/proxy-image?url=${encodeURIComponent(displayImage)}` : 'https://via.placeholder.com/200?text=No+Image'}
                                alt={displayTitle}
                                style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', marginBottom: '16px' }}
                                onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/200?text=No+Image'; }}
                            />

                            {displayDescription && (
                                <p style={{ fontSize: '14px', color: '#444', marginBottom: '12px' }}>{displayDescription}</p>
                            )}

                            {!item.hide_price && (
                                <div style={{ fontSize: '16px', marginBottom: '8px' }}>
                                    {onSale ? (
                                        <>
                                            <span style={{ textDecoration: 'line-through', color: '#999', marginRight: '6px' }}>${parseFloat(item.last_price_value).toFixed(2)}</span>
                                            <span style={{ color: '#e65100', fontWeight: '700' }}>${parseFloat(item.sale_price).toFixed(2)}</span>
                                            &nbsp;/&nbsp;<strong style={{ color: '#e65100' }}>{Number(salePts).toLocaleString()} pts</strong>
                                        </>
                                    ) : (
                                        <><strong style={{ color: '#1565c0' }}>{Number(displayPoints).toLocaleString()} pts</strong>&nbsp;/ ${parseFloat(item.last_price_value).toFixed(2)}</>
                                    )}
                                </div>
                            )}
                            {item.hide_price && (
                                <div style={{ fontSize: '16px', marginBottom: '8px' }}>
                                    <strong style={{ color: onSale ? '#e65100' : '#1565c0' }}>{Number(onSale ? salePts : displayPoints).toLocaleString()} pts</strong>
                                </div>
                            )}

                            {item.estimated_delivery_days && (
                                <div style={{ fontSize: '13px', color: '#2e7d32', marginBottom: '8px' }}>
                                    Estimated delivery: {item.estimated_delivery_days} business days
                                </div>
                            )}

                            {item.misc_info && (
                                <div style={{ fontSize: '13px', color: '#555', background: '#f9f9f9', padding: '10px 12px', borderRadius: '4px', marginBottom: '12px' }}>
                                    {item.misc_info}
                                </div>
                            )}

                            {!item.hide_web_url && item.item_web_url && (
                                <a href={item.item_web_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '13px', color: '#1976d2', display: 'block', marginBottom: '16px' }}>
                                    View on eBay ↗
                                </a>
                            )}

                            <button
                                onClick={() => { handleAddToCart(item); setDetailItem(null); }}
                                disabled={!cartId || addingIds.has(item.item_id) || item.availability_status === 'out_of_stock'}
                                style={{ width: '100%', padding: '10px', borderRadius: '4px', border: 'none', fontWeight: '600', fontSize: '14px', marginBottom: '24px', background: item.availability_status === 'out_of_stock' ? '#e0e0e0' : '#1976d2', color: item.availability_status === 'out_of_stock' ? '#999' : '#fff', cursor: item.availability_status === 'out_of_stock' ? 'not-allowed' : 'pointer' }}
                            >
                                {item.availability_status === 'out_of_stock' ? 'Out of Stock' : 'Add to Cart'}
                            </button>

                            {/* Similar products (#779) */}
                            {similarItems.length > 0 && (
                                <>
                                    <h3 style={{ fontSize: '15px', margin: '0 0 12px' }}>Similar Items</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '10px' }}>
                                        {similarItems.map(si => (
                                            <div
                                                key={si.item_id}
                                                onClick={() => setDetailItem(si)}
                                                style={{ border: '1px solid #e0e0e0', borderRadius: '6px', padding: '10px', cursor: 'pointer', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: '6px' }}
                                            >
                                                <img
                                                    src={(si.custom_image_url || si.image_url) ? `/api/proxy-image?url=${encodeURIComponent(si.custom_image_url || si.image_url)}` : 'https://via.placeholder.com/80?text=?'}
                                                    alt={si.custom_title || si.title}
                                                    style={{ width: '100%', height: '70px', objectFit: 'contain' }}
                                                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/80?text=?'; }}
                                                />
                                                <div style={{ fontSize: '11px', fontWeight: '600', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{si.custom_title || si.title}</div>
                                                <div style={{ fontSize: '11px', color: '#1565c0', fontWeight: '600' }}>{Number(si.custom_points_price || si.points_price).toLocaleString()} pts</div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}

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
                            {anyPriceIncreased && (
                                <div style={{ background: '#fff3e0', border: '1px solid #ffcc80', borderRadius: '4px', padding: '8px 10px', marginBottom: '8px', color: '#e65100', fontSize: '12px' }}>
                                    ⚠ Some item prices have increased since you added them to your cart.
                                </div>
                            )}
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
                                    color: '#333',
                                    cursor: checkingOut ? 'not-allowed' : 'pointer',
                                }}
                            >
                                Back
                            </button>
                            <button
                                onClick={() => handleCheckout()}
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
