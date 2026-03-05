import React from 'react';
import SortableTable from '../../../components/SortableTable';

const OrganizationDropsTab = ({ dropData }) => {
    return (
        <SortableTable
            columns={[
                { key: 'log_id', label: 'Log ID', sortable: true },
                { key: 'user_id', label: 'User ID', sortable: true },
                { key: 'username', label: 'Username', sortable: true },
                { key: 'user_type', label: 'User Type', sortable: true },
                { key: 'reason', label: 'Drop Reason', sortable: false },
                { key: 'created_at', label: 'Date', sortable: true },
            ]}
            data={dropData}
        />
    );
}

export default OrganizationDropsTab;