import { useEffect, useState } from 'react';

const AdminSettings = () => {
    const user = JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user') || 'null');

    const [catalogDisabled, setCatalogDisabled] = useState(false);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState(null);

    useEffect(() => {
        fetch('/api/admin/catalog-status')
            .then(res => res.ok ? res.json() : Promise.reject())
            .then(data => setCatalogDisabled(data.catalog_disabled))
            .catch(() => { /* non-critical */ });
    }, []);

    const handleToggle = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch('/api/admin/catalog-status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ disabled: !catalogDisabled, userId: user?.user_id }),
            });
            if (res.ok) {
                const data = await res.json();
                setCatalogDisabled(data.catalog_disabled);
                setMsg({ type: 'success', text: data.catalog_disabled ? 'Catalog is now in maintenance mode.' : 'Catalog is back online.' });
            } else {
                const json = await res.json();
                setMsg({ type: 'error', text: json.error || 'Failed to update.' });
            }
        } catch {
            setMsg({ type: 'error', text: 'Network error. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '24px' }}>
            <h1 style={{ marginBottom: '24px' }}>Admin Settings</h1>

            <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', padding: '24px', background: '#fff' }}>
                <h2 style={{ marginTop: 0, fontSize: '18px' }}>Catalog Maintenance Mode</h2>
                <p style={{ fontSize: '14px', color: '#555', margin: '0 0 20px' }}>
                    When enabled, drivers will see a maintenance banner instead of the catalog. Sponsors and admins are unaffected.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: catalogDisabled ? '#fff3e0' : '#e8f5e9',
                        border: `1px solid ${catalogDisabled ? '#ffcc80' : '#a5d6a7'}`,
                        fontSize: '14px',
                        fontWeight: '600',
                        color: catalogDisabled ? '#e65100' : '#2e7d32',
                    }}>
                        {catalogDisabled ? 'Maintenance Mode: ON' : 'Catalog: Online'}
                    </div>

                    <button
                        onClick={handleToggle}
                        disabled={saving}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '4px',
                            border: 'none',
                            background: saving ? '#e0e0e0' : catalogDisabled ? '#2e7d32' : '#e65100',
                            color: saving ? '#999' : '#fff',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            fontWeight: '600',
                            fontSize: '14px',
                        }}
                    >
                        {saving ? 'Saving...' : catalogDisabled ? 'Bring Catalog Online' : 'Enable Maintenance Mode'}
                    </button>
                </div>

                {msg && (
                    <div style={{
                        padding: '8px 14px',
                        borderRadius: '4px',
                        background: msg.type === 'success' ? '#e8f5e9' : '#ffebee',
                        color: msg.type === 'success' ? '#2e7d32' : '#c62828',
                        fontSize: '13px',
                    }}>
                        {msg.text}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminSettings;
