import React from 'react';
import DataTable from './ui/DataTable';

// Thin wrapper — keeps the old prop API intact while delegating to ui/DataTable.
const SortableTable = ({ columns, data, actions, rowsPerPage = 10 }) => (
  <DataTable
    columns={columns}
    data={data}
    actions={actions}
    rowsPerPage={rowsPerPage}
  />
);

export default SortableTable;
