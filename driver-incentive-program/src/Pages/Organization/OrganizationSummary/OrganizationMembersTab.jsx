import React from 'react';
import { useState, useEffect } from 'react';
import SortableTable from '../../../components/SortableTable';
import { dropDriver } from '../../../api/UserApi';
import Modal from '../../../components/Modal';
import InputField from '../../../components/InputField';

const OrganizationMembersTab = ({orgUsers, userData, setUserData, fetchOrg}) => {
    const [isRemoveOpen, setRemoveOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState(null);
    const [dropReason, setDropReason] = useState('');

    function handleDropClose() {
        setRemoveOpen(false);
        setSelectedMember(null);
        setDropReason('');
    }

    return (
        <div style={{ display: 'grid', direction: 'column', margin: '20px'}}>
            <SortableTable
                columns={[
                    { key: 'user_id', label: 'User ID', sortable: true },
                    { key: 'username', label: 'Username', sortable: true },
                    { key: 'user_type', label: 'Role', sortable: true },
                ]}
                actions={(() => {
                    if(userData?.user_type !== 'driver') {
                        return [{ label: 'Remove', onClick: (row) => {
                            setSelectedMember(row);
                            setRemoveOpen(true);
                        }}];
                    }
                    return [];
                })()}
                data={orgUsers || []}
            />
            <Modal
                isOpen={isRemoveOpen}
                onClose={handleDropClose}
                title={`Remove ${selectedMember?.username || 'Member'}`}
                onSave={async () => {
                    if (window.confirm(`Are you sure you want to remove ${selectedMember?.username} from the organization?`)) {
                        await dropDriver(selectedMember.user_id, dropReason);
                        fetchOrg();
                        if (selectedMember.user_id === userData.user_id) {
                            setUserData(prev => ({...prev, sponsor_org_id: null}));
                        }
                        handleDropClose();
                    }
                }}
            >
                <div style={{ display: 'grid', gap: '10px' }}>
                    <p style={{ margin: 0, color: '#444', fontSize: '14px' }}>
                        You are removing <strong>{selectedMember?.username}</strong> from the organization. You can choose to provide a reason.
                    </p>
                    <InputField
                        label="Reason (optional)"
                        value={dropReason}
                        onChange={(value) => setDropReason(value)}
                    />
                </div>
            </Modal>
        </div>
    );
}

export default OrganizationMembersTab;