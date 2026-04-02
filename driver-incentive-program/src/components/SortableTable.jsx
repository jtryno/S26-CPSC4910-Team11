import React, { useState, useMemo } from 'react';

const SortableTable = ({ columns, data, actions, rowsPerPage = 10 }) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data || [];

    return [...data].sort((a, b) => {
  const sortKey = columns.find(c => c.key === sortConfig.key)?.sortKey || sortConfig.key;
  const aValue = a[sortKey];
  const bValue = b[sortKey];

  if (aValue == null && bValue == null) return 0;
  if (aValue == null) return 1;
  if (bValue == null) return -1;

  const aNum = Number(aValue);
  const bNum = Number(bValue);
  const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);

  if (bothNumeric) {
    return sortConfig.direction === 'asc'
      ? aNum - bNum
      : bNum - aNum;
  }

  return sortConfig.direction === 'asc'
    ? String(aValue).localeCompare(String(bValue))
    : String(bValue).localeCompare(String(aValue));
});
  }, [data, sortConfig, columns]);

  const totalPages = Math.ceil(sortedData.length / rowsPerPage);
  const paginatedData = sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const goToPage = (page) => {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    setCurrentPage(page);
  };

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr style={{ background: '#f0f0f0', borderBottom: '1px solid gray' }}>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{ textAlign: 'left', padding: '4px', cursor: column.sortable ? 'pointer' : 'default' }}
                onClick={column.sortable
                  ? () =>
                      setSortConfig({
                        key: column.key,
                        direction:
                          sortConfig.key === column.key && sortConfig.direction === 'asc' ? 'desc' : 'asc',
                      })
                  : undefined}
              >
                {column.label}{' '}
                {sortConfig.key === column.key && (
                  <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
            {actions &&
              actions.map((action, i) => (
                <th key={i} style={{ textAlign: 'left', padding: '4px' }}>
                  {typeof action.label === 'function' ? action.headerLabel || '' : action.label}
                </th>
              ))}
          </tr>
        </thead>
        <tbody>
          {paginatedData.map((row, index) => (
            <tr key={index} style={{ borderBottom: '1px solid #e0e0e0' }}>
              {columns.map((column) => (
                <td key={column.key} style={{ padding: '4px' }}>
                  {column.render ? column.render(row[column.key], row) : `${column.prefix || ''}${row[column.key]}`}
                </td>
              ))}
              {actions &&
                actions.map((action, i) => (
                  <td key={i} style={{ padding: '4px' }}>
                    {action.render ? (
                      action.render(row)
                    ) : (
                      <button
                        style={{
                          backgroundColor: action.color || '#007bff',
                          color: 'white',
                          border: 'none',
                          padding: '4px 8px',
                          borderRadius: '4px',
                        }}
                        onClick={() => action.onClick(row)}
                      >
                        {typeof action.label === 'function' ? action.label(row) : action.label}
                      </button>
                    )}
                  </td>
                ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: '8px', display: 'flex', gap: '4px', alignItems: 'center' }}>
        <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>
          Previous
        </button>
        <span>
          Page {currentPage} of {totalPages || 1}
        </span>
        <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages || totalPages === 0}>
          Next
        </button>
      </div>
    </div>
  );
};

export default SortableTable;