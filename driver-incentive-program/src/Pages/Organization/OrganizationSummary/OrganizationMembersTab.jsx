import React from 'react';
import { useState, useEffect } from 'react';
import SortableTable from '../../../components/SortableTable';
import SignupModal from '../../../components/SignupModal';
import { removeFromOrganization } from '../../../api/UserApi';

const OrganizationMembersTab = ({orgUsers, userData, setUserData, fetchOrg, orgId}) => {
    const [signupModalOpen, setSignupModalOpen] = useState(false);

    const isSponsorOrAdmin = userData?.user_type === 'sponsor' || userData?.user_type === 'admin';

    return (
        <div style={{ display: 'grid', direction: 'column', margin: '20px', gap: '20px'}}>
            { userData.user_type !== 'driver' &&
                <button
                    style={{ width: '200px'}}
                    onClick={() => setSignupModalOpen(true)}
                >
                    Create Org User
                </button>
            }
            <SignupModal
                isOpen={signupModalOpen}
                onClose={() => setSignupModalOpen(false)}
                onSave={() => fetchOrg()}
                possibleRoles={[
                    { label: 'Driver', value: 'driver' },
                    { label : 'Sponsor', value: 'sponsor' },
                ]}
                orgId={orgId}
            />
            <SortableTable
                columns={[
                    { key: 'user_id', label: 'User ID', sortable: true },
                    { key: 'username', label: 'Username', sortable: true },
                    { key: 'user_type', label: 'Role', sortable: true },
                    ...(isSponsorOrAdmin ? [{ key: 'points', label: 'Points', sortable: true }] : []),
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