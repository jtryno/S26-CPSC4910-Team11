import React, { useEffect, useState } from 'react';
import SortableTable from '../../../components/SortableTable';

const OrganizationCatalogTab = ({ orgId }) => {
    const [catalogItems, setCatalogItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [addingIds, setAddingIds] = useState(new Set());
    const [message, setMessage] = useState(null);

    // Sale price editing state (#6224)
    const [salePriceEditing, setSalePriceEditing] = useState(null); // item_id being edited
    const [salePriceInput, setSalePriceInput] = useState('');
    const [savingSale, setSavingSale] = useState(false);

    // Featured toggling state (#6249)
    const [togglingFeatured, setTogglingFeatured] = useState(new Set());

    // Edit item customization state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [editForm, setEditForm] = useState({});
    const [editSaving, setEditSaving] = useState(false);
    const [editMsg, setEditMsg] = useState(null);

    const fetchCatalog = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/catalog/org/${orgId}`);
            const data = await res.json();
            setCatalogItems(data.items || []);
        } catch {
            setCatalogItems([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (orgId) fetchCatalog();
    }, [orgId]);

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setSearching(true);
        setSearchResults([]);
        try {
            const res = await fetch(`/api/catalog?q=${encodeURIComponent(searchQuery.trim())}`);
            const data = await res.json();
            setSearchResults(Array.isArray(data) ? data : []);
        } catch {
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    };

    const handleAdd = async (ebayItem) => {
        const key = ebayItem.itemId;
        setAddingIds(prev => new Set([...prev, key]));
        try {
            const res = await fetch(`/api/catalog/org/${orgId}/items`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ebay_item_id: ebayItem.itemId,
                    title: ebayItem.title,
                    item_web_url: ebayItem.itemWebUrl || '',
                    image_url: ebayItem.rawImageUrl || '',
                    description: ebayItem.description || '',
                    last_price_value: parseFloat(ebayItem.price) || 0,
                    category: ebayItem.category || null,
                }),
            });
            if (res.ok) {
                setMessage({ type: 'success', text: `"${ebayItem.title}" added to catalog.` });
                await fetchCatalog();
            } else {
                const json = await res.json();
                setMessage({ type: 'error', text: json.error || 'Failed to add item.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setAddingIds(prev => { const next = new Set(prev); next.delete(key); return next; });
        }
    };

    const handleRemove = async (item) => {
        if (!window.confirm(`Remove "${item.title}" from the catalog?`)) return;
        try {
            const res = await fetch(`/api/catalog/items/${item.item_id}`, { method: 'DELETE' });
            if (res.ok) {
                await fetchCatalog();
            } else {
                alert('Failed to remove item.');
            }
        } catch {
            alert('Network error.');
        }
    };

    // Toggle featured for a catalog item (#6249)
    const handleToggleFeatured = async (item) => {
        if (togglingFeatured.has(item.item_id)) return;
        setTogglingFeatured(prev => new Set([...prev, item.item_id]));
        try {
            const res = await fetch(`/api/catalog/items/${item.item_id}/featured`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_featured: !item.is_featured }),
            });
            if (res.ok) {
                await fetchCatalog();
            } else {
                setMessage({ type: 'error', text: 'Failed to update featured status.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network error.' });
        } finally {
            setTogglingFeatured(prev => { const next = new Set(prev); next.delete(item.item_id); return next; });
        }
    };

    const openEditModal = (item) => {
        setEditItem(item);
        setEditForm({
            custom_title: item.custom_title || '',
            custom_description: item.custom_description || '',
            custom_image_url: item.custom_image_url || '',
            custom_points_price: item.custom_points_price || '',
            hide_price: !!item.hide_price,
            hide_web_url: !!item.hide_web_url,
            misc_info: item.misc_info || '',
            estimated_delivery_days: item.estimated_delivery_days || '',
        });
        setEditMsg(null);
        setEditModalOpen(true);
    };

    const handleSaveEdit = async () => {
        setEditSaving(true);
        setEditMsg(null);
        try {
            const res = await fetch(`/api/catalog/items/${editItem.item_id}/customize`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editForm),
            });
            if (res.ok) {
                setEditMsg({ type: 'success', text: 'Item updated.' });
                await fetchCatalog();
            } else {
                const json = await res.json();
                setEditMsg({ type: 'error', text: json.error || 'Failed to update item.' });
            }
        } catch {
            setEditMsg({ type: 'error', text: 'Network error.' });
        } finally {
            setEditSaving(false);
        }
    };

    // Save sale price for a catalog item (#6224)
    const handleSaveSalePrice = async (item) => {
        setSavingSale(true);
        const val = salePriceInput.trim();
        const price = val === '' ? null : parseFloat(val);
        if (val !== '' && (isNaN(price) || price < 0)) {
            setMessage({ type: 'error', text: 'Enter a valid price or leave blank to remove the sale.' });
            setSavingSale(false);
            return;
        }
        if (price !== null && price >= parseFloat(item.last_price_value)) {
            setMessage({ type: 'error', text: 'Sale price must be lower than the original price.' });
            setSavingSale(false);
            return;
        }
        try {
            const res = await fetch(`/api/catalog/items/${item.item_id}/sale-price`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sale_price: price }),
            });
            if (res.ok) {
                setSalePriceEditing(null);
                setSalePriceInput('');
                await fetchCatalog();
                setMessage({ type: 'success', text: price === null ? 'Sale removed.' : `Sale price set to $${price.toFixed(2)}.` });
            } else {
                setMessage({ type: 'error', text: 'Failed to update sale price.' });
            }
        } catch {
            setMessage({ type: 'error', text: 'Network error.' });
        } finally {
            setSavingSale(false);
        }
    };

    return (
        <div>
            {message && (
                <div style={{
                    margin: '0 0 16px',
                    padding: '8px 14px',
                    borderRadius: '4px',
                    background: message.type === 'success' ? '#e8f5e9' : '#ffebee',
                    color: message.type === 'success' ? '#2e7d32' : '#c62828',
                    fontSize: '14px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <span>{message.text}</span>
                    <button
                        onClick={() => setMessage(null)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px', color: 'inherit', lineHeight: 1 }}
                    >
                        ×
                    </button>
                </div>
            )}

            <h3 style={{ marginTop: 0 }}>Current Catalog</h3>
            {loading ? (
                <p>Loading catalog...</p>
            ) : catalogItems.length === 0 ? (
                <p style={{ color: '#888' }}>No items yet. Search eBay below to add some.</p>
            ) : (
                <SortableTable
                    columns={[
                        {
                            key: 'image_url',
                            label: '',
                            sortable: false,
                            render: (val) => (
                                <img
                                    src={val ? `/api/proxy-image?url=${encodeURIComponent(val)}` : 'https://via.placeholder.com/50?text=?'}
                                    alt=""
                                    style={{ width: '50px', height: '50px', objectFit: 'contain' }}
                                    onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/50?text=?'; }}
                                />
                            ),
                        },
                        {
                            key: 'title',
                            label: 'Title',
                            sortable: true,
                            render: (val, row) => (
                                <span>
                                    {row.is_featured ? <span style={{ background: '#fbc02d', color: '#fff', fontSize: '10px', fontWeight: '700', padding: '1px 5px', borderRadius: '8px', marginRight: '6px' }}>Featured</span> : null}
                                    {val}
                                </span>
                            ),
                        },
                        {
                            key: 'last_price_value',
                            label: 'USD Price',
                            sortable: true,
                            render: (val, row) => {
                                const onSale = row.sale_price !== null && row.sale_price !== undefined &&
                                    parseFloat(row.sale_price) < parseFloat(val);
                                if (salePriceEditing === row.item_id) {
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span style={{ color: '#999', textDecoration: 'line-through', fontSize: '12px' }}>${parseFloat(val).toFixed(2)}</span>
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.01"
                                                placeholder="sale $"
                                                value={salePriceInput}
                                                onChange={(e) => setSalePriceInput(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveSalePrice(row); if (e.key === 'Escape') { setSalePriceEditing(null); setSalePriceInput(''); } }}
                                                autoFocus
                                                style={{ width: '72px', padding: '3px 6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #1976d2' }}
                                            />
                                            <button
                                                onClick={() => handleSaveSalePrice(row)}
                                                disabled={savingSale}
                                                style={{ padding: '3px 8px', fontSize: '12px', borderRadius: '4px', border: 'none', background: '#2e7d32', color: '#fff', cursor: 'pointer' }}
                                            >
                                                {savingSale ? '...' : 'Save'}
                                            </button>
                                            <button
                                                onClick={() => { setSalePriceEditing(null); setSalePriceInput(''); }}
                                                style={{ padding: '3px 6px', fontSize: '12px', borderRadius: '4px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    );
                                }
                                return (
                                    <span>
                                        {onSale ? (
                                            <>
                                                <span style={{ textDecoration: 'line-through', color: '#999', marginRight: '4px', fontSize: '12px' }}>${parseFloat(val).toFixed(2)}</span>
                                                <span style={{ color: '#e65100', fontWeight: '600' }}>${parseFloat(row.sale_price).toFixed(2)}</span>
                                            </>
                                        ) : (
                                            `$${parseFloat(val).toFixed(2)}`
                                        )}
                                    </span>
                                );
                            },
                        },
                        {
                            key: 'points_price',
                            label: 'Points Price',
                            sortable: true,
                            render: (val) => `${Number(val).toLocaleString()} pts`,
                        },
                        { key: 'availability_status', label: 'Availability', sortable: true },
                        { key: 'category', label: 'Category', sortable: true, render: (val) => val || '—' },
                    ]}
                    actions={[
                        {
                            headerLabel: 'Featured',
                            label: (item) => togglingFeatured.has(item.item_id) ? '...' : item.is_featured ? 'Unfeature' : 'Feature',
                            onClick: handleToggleFeatured,
                        },
                        {
                            headerLabel: 'Sale Price',
                            label: (item) => salePriceEditing === item.item_id ? 'Cancel' : item.sale_price !== null ? 'Edit Sale' : 'Set Sale',
                            onClick: (item) => {
                                if (salePriceEditing === item.item_id) {
                                    setSalePriceEditing(null);
                                    setSalePriceInput('');
                                } else {
                                    setSalePriceEditing(item.item_id);
                                    setSalePriceInput(item.sale_price !== null ? String(item.sale_price) : '');
                                }
                            },
                        },
                        {
                            label: 'Edit',
                            onClick: openEditModal,
                        },
                        {
                            label: 'Remove',
                            onClick: handleRemove,
                        },
                    ]}
                    data={catalogItems}
                />
            )}

            <h3 style={{ marginTop: '32px' }}>Add from eBay</h3>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                    type="text"
                    placeholder="Search eBay (e.g. headphones, gift cards...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    style={{
                        flex: 1,
                        padding: '8px 12px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                        fontSize: '14px',
                    }}
                />
                <button
                    onClick={handleSearch}
                    disabled={searching}
                    style={{
                        padding: '8px 18px',
                        borderRadius: '4px',
                        border: 'none',
                        background: searching ? '#90caf9' : '#1976d2',
                        color: '#fff',
                        cursor: searching ? 'not-allowed' : 'pointer',
                        fontWeight: '600',
                    }}
                >
                    {searching ? 'Searching...' : 'Search'}
                </button>
            </div>

            {searching && <p>Searching eBay...</p>}

            {searchResults.length > 0 && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                    gap: '16px',
                }}>
                    {searchResults.map((item) => (
                        <div key={item.itemId} style={{
                            border: '1px solid #e0e0e0',
                            borderRadius: '8px',
                            padding: '12px',
                            background: '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                        }}>
                            <img
                                src={item.image}
                                alt={item.title}
                                style={{ width: '100%', height: '120px', objectFit: 'contain' }}
                                onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/120?text=No+Image'; }}
                            />
                            <div style={{ fontSize: '13px', fontWeight: '600', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {item.title}
                            </div>
                            <div style={{ fontSize: '13px', color: '#555' }}>${parseFloat(item.price).toFixed(2)}</div>
                            {item.category && (
                                <div style={{ fontSize: '11px', color: '#888' }}>{item.category}</div>
                            )}
                            <button
                                onClick={() => handleAdd(item)}
                                disabled={addingIds.has(item.itemId)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '4px',
                                    border: 'none',
                                    background: addingIds.has(item.itemId) ? '#a5d6a7' : '#2e7d32',
                                    color: '#fff',
                                    cursor: addingIds.has(item.itemId) ? 'not-allowed' : 'pointer',
                                    fontWeight: '600',
                                    fontSize: '13px',
                                    marginTop: 'auto',
                                }}
                            >
                                {addingIds.has(item.itemId) ? 'Adding...' : 'Add to Catalog'}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {!searching && searchResults.length === 0 && searchQuery && (
                <p style={{ color: '#888' }}>No results. Try a different search term.</p>
            )}

            {/* ── Edit Item Modal ── */}
            {editModalOpen && editItem && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#fff', borderRadius: '8px', padding: '32px', width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.18)' }}>
                        <h2 style={{ marginTop: 0 }}>Edit Item</h2>
                        <p style={{ color: '#555', fontSize: '13px', margin: '0 0 20px' }}>
                            Override eBay defaults. Leave blank to use the original value.
                        </p>
                        <div style={{ display: 'grid', gap: '14px' }}>
                            {[
                                { field: 'custom_title', label: 'Custom Name', placeholder: editItem.title },
                                { field: 'custom_image_url', label: 'Custom Image URL', placeholder: editItem.image_url || 'https://...' },
                                { field: 'custom_points_price', label: 'Custom Points Price', placeholder: String(editItem.points_price), type: 'number' },
                                { field: 'estimated_delivery_days', label: 'Estimated Delivery (days)', placeholder: 'e.g. 7', type: 'number' },
                            ].map(({ field, label, placeholder, type }) => (
                                <div key={field}>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#444', marginBottom: '4px' }}>{label}</label>
                                    <input
                                        type={type || 'text'}
                                        value={editForm[field]}
                                        onChange={(e) => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                                        placeholder={placeholder}
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box' }}
                                    />
                                </div>
                            ))}
                            {[
                                { field: 'custom_description', label: 'Custom Description', placeholder: editItem.description || '' },
                                { field: 'misc_info', label: 'Additional Info (misc)', placeholder: 'Any extra details for drivers...' },
                            ].map(({ field, label, placeholder }) => (
                                <div key={field}>
                                    <label style={{ display: 'block', fontSize: '13px', color: '#444', marginBottom: '4px' }}>{label}</label>
                                    <textarea
                                        rows={3}
                                        value={editForm[field]}
                                        onChange={(e) => setEditForm(f => ({ ...f, [field]: e.target.value }))}
                                        placeholder={placeholder}
                                        style={{ width: '100%', padding: '7px 10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', boxSizing: 'border-box', resize: 'vertical' }}
                                    />
                                </div>
                            ))}
                            <div style={{ display: 'flex', gap: '24px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={editForm.hide_price} onChange={(e) => setEditForm(f => ({ ...f, hide_price: e.target.checked }))} />
                                    Hide price from drivers
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={editForm.hide_web_url} onChange={(e) => setEditForm(f => ({ ...f, hide_web_url: e.target.checked }))} />
                                    Hide eBay link from drivers
                                </label>
                            </div>
                        </div>
                        {editMsg && (
                            <div style={{ marginTop: '14px', padding: '8px 12px', borderRadius: '4px', background: editMsg.type === 'success' ? '#e8f5e9' : '#ffebee', color: editMsg.type === 'success' ? '#2e7d32' : '#c62828', fontSize: '13px' }}>
                                {editMsg.text}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                            <button onClick={() => { setEditModalOpen(false); setEditItem(null); }} disabled={editSaving} style={{ padding: '8px 20px', borderRadius: '4px', border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer' }}>
                                Cancel
                            </button>
                            <button onClick={handleSaveEdit} disabled={editSaving} style={{ padding: '8px 20px', borderRadius: '4px', border: 'none', background: editSaving ? '#e0e0e0' : '#1976d2', color: editSaving ? '#999' : '#fff', cursor: editSaving ? 'not-allowed' : 'pointer', fontWeight: '600' }}>
                                {editSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrganizationCatalogTab;
