import React, { useState, useEffect } from 'react';
import SortableTable from '../../../components/SortableTable';
import { fetchArchivedDrivers } from '../../../api/OrganizationApi';

const OrganizationArchivedDriversTab = ({ orgId }) => {
    const [drivers, setDrivers] = useState([]);

    async function loadDrivers() {
        const data = await fetchArchivedDrivers(orgId);
        setDrivers(data || []);
    }

    useEffect(() => {
        if (!orgId) return;
        loadDrivers();
    }, [orgId]);

    return (
        <div style={{ display: 'grid', gap: '20px', margin: '20px' }}>
            <h2>Archived Drivers</h2>
            <SortableTable
                columns={[
                    { key: 'user_id', label: 'User ID', sortable: true },
                    { key: 'username', label: 'Username', sortable: true },
                    { key: 'driver_status', label: 'Status at Archive', sortable: true },
                    { key: 'current_points_balance', label: 'Points Balance', sortable: true },
                    {
                        key: 'affilated_at',
                        label: 'Joined',
                        sortable: true,
                        render: (value) => value ? new Date(value).toLocaleDateString() : '—',
                    },
                    {
                        key: 'dropped_at',
                        label: 'Dropped At',
                        sortable: true,
                        render: (value) => value ? new Date(value).toLocaleDateString() : '—',
                    },
                    {
                        key: 'drop_reason',
                        label: 'Drop Reason',
                        sortable: false,
                        render: (value) => value || '—',
                    },
                ]}
                data={drivers}
            />
        </div>
    );
};

export default OrganizationArchivedDriversTab;
