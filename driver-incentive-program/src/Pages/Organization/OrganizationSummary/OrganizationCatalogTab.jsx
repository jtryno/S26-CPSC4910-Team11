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
                        { key: 'title', label: 'Title', sortable: true },
                        {
                            key: 'last_price_value',
                            label: 'USD Price',
                            sortable: true,
                            render: (val) => `$${parseFloat(val).toFixed(2)}`,
                        },
                        {
                            key: 'points_price',
                            label: 'Points Price',
                            sortable: true,
                            render: (val) => `${Number(val).toLocaleString()} pts`,
                        },
                        { key: 'availability_status', label: 'Availability', sortable: true },
                    ]}
                    actions={[
                        { label: 'Remove', onClick: handleRemove },
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
        </div>
    );
};

export default OrganizationCatalogTab;
