import React from 'react';
import { useState, useEffect } from 'react';
import SortableTable from '../../../components/SortableTable';
import { removeFromOrganization } from '../../../api/UserApi';

const OrganizationMembersTab = ({orgUsers, userData, setUserData, fetchOrg}) => {

    return (
        <div style={{ display: 'grid', direction: 'column', margin: '20px'}}>
            <SortableTable
                columns={[
                    { key: 'user_id', label: 'User ID', sortable: true },
                    { key: 'username', label: 'Username', sortable: true },
                    { key: 'user_type', label: 'Role', sortable: true },
                    { key: 'points', label: 'Points', sortable: true },
                ]}
                actions={userData?.user_type !== 'driver' ? [
                    { label: 'Remove', onClick: async (row) => {
                        if (window.confirm(`Are you sure you want to remove ${row.username} from the organization?`)) {
                            await removeFromOrganization(row.user_id);
                            fetchOrg();
                            if (row.user_id === userData.user_id) {
                                setUserData(prev => ({ ...prev, sponsor_org_id: null }));
                            }
                        }
                    }}
                ] : []}
                data={(orgUsers || []).map(user => ({
                    ...user,
                    points: user.user_type === 'driver'
                        ? (user.points != null ? Number(user.points) : 0)
                        : null,
                }))}
            />
        </div>
    );
}

export default OrganizationMembersTab;