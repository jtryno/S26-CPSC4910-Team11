import React, { useState, useMemo } from 'react';

const SortableTable = ({ columns, data, actions }) => {
    const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

    const sortedData = useMemo(() => {
        if (!sortConfig.key) return data;

        return [...data].sort((a, b) => {
            const aValue = a[sortConfig.key];
            const bValue = b[sortConfig.key];

            if (typeof aValue === 'string') {
                return sortConfig.direction === 'asc'
                    ? aValue.localeCompare(bValue)
                    : bValue.localeCompare(aValue);
            }

            if (aValue < bValue) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (aValue > bValue) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });
    }, [data, sortConfig]);

    return (
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
                <tr style={{ background: '#f0f0f0',padding: '2px', borderBottom: '1px solid gray' }}>
                    {columns.map((column) => (
                        <th
                            style={{ textAlign: 'left', padding: '2px', cursor: column.sortable ? 'pointer' : 'default' }}
                            key={column.key}
                            onClick={column.sortable ?
                                () => setSortConfig({
                                    key: column.key,
                                    direction:
                                        sortConfig.key === column.key && sortConfig.direction === "asc"
                                            ? "desc"
                                            : "asc"
                                }) : undefined}
                        >
                            {column.label} {sortConfig.key === column.key && (
                                <span style={{ marginLeft: '5px' }}>
                                    {sortConfig.direction === 'asc' ? '↑' : '↓'}
                                </span>
                            )}
                        </th>
                    ))}
                    {actions && actions.map((action, actionIndex) => (
                        <th key={actionIndex} style={{ textAlign: 'left', padding: '2px' }}>{action.label}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {sortedData?.map((row, index) => (
                    <tr key={index} style={{ borderBottom: '1px solid #e0e0e0' }}>
                        {columns.map((column) => (
                            <td
                                style={{ padding: '2px' }}
                                key={column.key}
                            >
                                {row[column.key]}
                            </td>
                        ))}
                        {actions &&
                            actions.map((action, actionIndex) => (
                                <td key={actionIndex} style={{ padding: '2px' }}>
                                    <button style={{ backgroundColor: action.color || '#007bff', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px' }} onClick={() => action.onClick(row)}>
                                        {action.label}
                                    </button>
                                </td>
                            ))
                        }
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

export default SortableTable;