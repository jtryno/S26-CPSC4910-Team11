import React, { useState, useMemo } from 'react';
import './ui.css';

const DataTable = ({
  columns,
  data,
  actions,
  rowsPerPage = 10,
  loading = false,
  emptyMessage = 'No data to display.',
  className = '',
}) => {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [currentPage, setCurrentPage] = useState(1);

  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data || [];
    return [...data].sort((a, b) => {
      const sortKey = columns.find(c => c.key === sortConfig.key)?.sortKey || sortConfig.key;
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const aNum = Number(aVal);
      const bNum = Number(bVal);
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum))
        return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
      return sortConfig.direction === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [data, sortConfig, columns]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / rowsPerPage));
  const paginated = sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  const toggleSort = (col) => {
    if (!col.sortable) return;
    setSortConfig(prev =>
      prev.key === col.key
        ? { key: col.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { key: col.key, direction: 'asc' }
    );
    setCurrentPage(1);
  };

  if (loading) {
    return (
      <div className={`ui-datatable ${className}`}>
        <div className="ui-datatable__loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className={`ui-datatable ${className}`}>
      <div className="ui-datatable__scroll">
        <table className="ui-datatable__table">
          <thead>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`ui-datatable__th ${col.sortable ? 'ui-datatable__th--sortable' : ''}`}
                  onClick={() => toggleSort(col)}
                >
                  {col.label}
                  {col.sortable && sortConfig.key === col.key && (
                    <span className="ui-datatable__sort-arrow">
                      {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                    </span>
                  )}
                </th>
              ))}
              {actions?.map((action, i) => (
                <th key={i} className="ui-datatable__th">
                  {typeof action.label === 'function' ? action.headerLabel || '' : action.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (actions?.length || 0)}
                  className="ui-datatable__empty"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row, rowIdx) => (
                <tr key={rowIdx} className="ui-datatable__row">
                  {columns.map(col => (
                    <td key={col.key} className="ui-datatable__td">
                      {col.render
                        ? col.render(row[col.key], row)
                        : `${col.prefix || ''}${row[col.key] ?? ''}`}
                    </td>
                  ))}
                  {actions?.map((action, i) => (
                    <td key={i} className="ui-datatable__td">
                      {action.render ? (
                        action.render(row)
                      ) : (
                        <button
                          className="ui-datatable__action-btn"
                          style={{ backgroundColor: action.color || 'var(--color-primary)' }}
                          onClick={() => action.onClick(row)}
                        >
                          {typeof action.label === 'function' ? action.label(row) : action.label}
                        </button>
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="ui-datatable__pagination">
          <button
            className="ui-datatable__page-btn"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>
          <span className="ui-datatable__page-info">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="ui-datatable__page-btn"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
};

export default DataTable;
