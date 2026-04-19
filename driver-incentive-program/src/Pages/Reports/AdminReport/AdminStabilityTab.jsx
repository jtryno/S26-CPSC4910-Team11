import React, { useEffect, useState } from 'react';

const PAGE_SIZE = 25;

const severityColor = (code) => {
    if (code >= 500) return '#b71c1c';
    if (code >= 400) return '#e65100';
    return '#555';
};

const AdminStabilityTab = () => {
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState(null);
    const [offset, setOffset]     = useState(0);
    const [expanded, setExpanded] = useState(null);

    const load = async (off = 0) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/errors?limit=${PAGE_SIZE}&offset=${off}`);
            if (!res.ok) throw new Error('Failed to load error log');
            const json = await res.json();
            setData(json);
            setOffset(off);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(0); }, []);

    if (loading) return <div style={{ color: '#666' }}>Loading error log...</div>;

    const totalPages  = data ? Math.ceil(data.total / PAGE_SIZE) : 0;
    const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

    return (
        <div style={{ padding: '24px', maxWidth: '1000px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h2 style={{ margin: 0, fontSize: '20px' }}>System Stability / Error Log</h2>
                <button
                    onClick={() => load(0)}
                    style={{ padding: '6px 16px', borderRadius: '4px', border: '1px solid #ccc', background: '#f5f5f5', cursor: 'pointer', fontSize: '13px' }}
                >
                    Refresh
                </button>
            </div>

            {error && (
                <div style={{ padding: '12px', background: '#ffebee', color: '#b71c1c', borderRadius: '4px', marginBottom: '16px' }}>
                    {error}
                </div>
            )}

            {!error && data && (
                <>
                    <div style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
                        {data.total === 0
                            ? 'No errors recorded. The system is currently stable.'
                            : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, data.total)} of ${data.total} errors`}
                    </div>

                    {data.errors.length > 0 && (
                        <div style={{ border: '1px solid #e0e0e0', borderRadius: '8px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead>
                                    <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
                                        <th style={{ padding: '10px 12px', fontWeight: '600' }}>Time</th>
                                        <th style={{ padding: '10px 12px', fontWeight: '600' }}>Method</th>
                                        <th style={{ padding: '10px 12px', fontWeight: '600' }}>Route</th>
                                        <th style={{ padding: '10px 12px', fontWeight: '600' }}>Status</th>
                                        <th style={{ padding: '10px 12px', fontWeight: '600' }}>Message</th>
                                        <th style={{ padding: '10px 12px', fontWeight: '600' }}>Stack</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.errors.map((e, i) => (
                                        <React.Fragment key={e.error_id}>
                                            <tr style={{ borderTop: '1px solid #eee', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                                <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: '#555' }}>
                                                    {new Date(e.occurred_at).toLocaleString()}
                                                </td>
                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>
                                                    {e.method}
                                                </td>
                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {e.route}
                                                </td>
                                                <td style={{ padding: '8px 12px', fontWeight: '600', color: severityColor(e.status_code) }}>
                                                    {e.status_code}
                                                </td>
                                                <td style={{ padding: '8px 12px', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {e.message}
                                                </td>
                                                <td style={{ padding: '8px 12px' }}>
                                                    {e.stack_trace && (
                                                        <button
                                                            onClick={() => setExpanded(expanded === e.error_id ? null : e.error_id)}
                                                            style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', padding: '2px 8px' }}
                                                        >
                                                            {expanded === e.error_id ? 'Hide' : 'View'}
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {expanded === e.error_id && (
                                                <tr key={`stack-${e.error_id}`} style={{ background: '#1a1a1a' }}>
                                                    <td colSpan={6} style={{ padding: '12px 16px' }}>
                                                        <pre style={{ margin: 0, color: '#e0e0e0', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                                            {e.stack_trace}
                                                        </pre>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {totalPages > 1 && (
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
                            <button
                                disabled={offset === 0}
                                onClick={() => load(offset - PAGE_SIZE)}
                                style={{ padding: '6px 14px', borderRadius: '4px', border: '1px solid #ccc', cursor: offset === 0 ? 'not-allowed' : 'pointer', background: '#f5f5f5' }}
                            >
                                Previous
                            </button>
                            <span style={{ fontSize: '13px', color: '#555' }}>Page {currentPage} of {totalPages}</span>
                            <button
                                disabled={offset + PAGE_SIZE >= data.total}
                                onClick={() => load(offset + PAGE_SIZE)}
                                style={{ padding: '6px 14px', borderRadius: '4px', border: '1px solid #ccc', cursor: offset + PAGE_SIZE >= data.total ? 'not-allowed' : 'pointer', background: '#f5f5f5' }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AdminStabilityTab;
