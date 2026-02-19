import React from 'react';
import { useState, useEffect } from 'react';
import SortableTable from '../../../components/SortableTable';
import { removeFromOrganization } from '../../../api/UserApi';

const OrganizationMembersTab = ({orgUsers, userData, setUserData, fetchOrg}) => {

    return (
        <div style={{ display: 'grid', direction: 'column', margin: '20px'}}>
            <h2 style={{ margin: '0 0 10px 0'}}>Organization Members</h2>
            <SortableTable
                columns={[
                    { key: 'username', label: 'Username', sortable: true },
                    { key: 'user_type', label: 'Role', sortable: true },]}
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
                data={orgUsers || []}
            />
        </div>
    );
}

export default OrganizationMembersTab;