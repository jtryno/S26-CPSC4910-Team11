import React, { useState, useEffect } from 'react';
import SortableTable from '../../../components/SortableTable';
import DropdownField from '../../../components/DropdownField';
import { fetchOrgDrivers } from '../../../api/OrganizationApi';

const OrganizationDriverStatusTab = ({ orgId }) => {
    const [drivers, setDrivers] = useState([]);
    const [statusFilter, setStatusFilter] = useState('all');

    async function loadDrivers() {
        const data = await fetchOrgDrivers(orgId, null, { fromDate: null, toDate: null });
        setDrivers(data || []);
    }

    useEffect(() => {
        if (!orgId) return;
        loadDrivers();
    }, [orgId]);

    const filteredDrivers = statusFilter === 'all'
        ? drivers
        : drivers.filter(d => d.driver_status === statusFilter);

    return (
        <div style={{ display: 'grid', gap: '20px', margin: '20px' }}>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '20px',
                    padding: '15px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    background: '#f9f9f9',
                }}
            >
                <DropdownField
                    label="Status"
                    options={[
                        { label: 'All', value: 'all' },
                        { label: 'Active', value: 'active' },
                        { label: 'Pending', value: 'pending' },
                        { label: 'Dropped', value: 'dropped' },
                    ]}
                    value={statusFilter}
                    onChange={setStatusFilter}
                />
            </div>
            <h2>Driver Status</h2>
            <SortableTable
                columns={[
                    { key: 'user_id', label: 'User ID', sortable: true },
                    { key: 'username', label: 'Username', sortable: true },
                    { key: 'driver_status', label: 'Status', sortable: true },
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
                data={filteredDrivers}
            />
        </div>
    );
};

export default OrganizationDriverStatusTab;
