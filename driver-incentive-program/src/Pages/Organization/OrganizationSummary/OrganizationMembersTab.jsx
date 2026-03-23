import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SortableTable from '../../../components/SortableTable';
import SignupModal from '../../../components/SignupModal';
import { dropDriver } from '../../../api/UserApi';
import { startImpersonation } from '../../../api/ImpersonationApi';
import Modal from '../../../components/Modal';
import InputField from '../../../components/InputField';
import SponsorPurchaseModal from './SponsorPurchaseModal';
import DriverCsvImportModal from './DriverCSVImportModal';

const OrganizationMembersTab = ({orgUsers, userData, setUserData, fetchOrg, orgId}) => {
    const navigate = useNavigate();
    const [signupModalOpen, setSignupModalOpen] = useState(false);
    const [csvImportOpen, setCsvImportOpen] = useState(false);
    const [isRemoveOpen, setRemoveOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState(null);
    const [dropReason, setDropReason] = useState('');
    const [purchaseDriver, setPurchaseDriver] = useState(null);

    function handleDropClose() {
        setRemoveOpen(false);
        setSelectedMember(null);
        setDropReason('');
    }

    // Sponsors only get member-management actions inside their own organization; admins always can.
    const canManageMembers = userData?.user_type === 'admin' ||
        (userData?.user_type === 'sponsor' && Number(userData?.sponsor_org_id) === Number(orgId));

    return (
        <div style={{ display: 'grid', direction: 'column', margin: '20px', gap: '20px'}}>
            { canManageMembers &&
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <button
                        style={{ width: '200px'}}
                        onClick={() => setSignupModalOpen(true)}
                    >
                        Create Org User
                    </button>
                    <button
                        style={{ width: '200px'}}
                        onClick={() => setCsvImportOpen(true)}
                    >
                        Import Drivers/Sponsors CSV
                    </button>
                </div>
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
                createdByUserId={userData?.user_id}
            />
            <DriverCsvImportModal
                isOpen={csvImportOpen}
                onClose={() => setCsvImportOpen(false)}
                orgId={orgId}
                requestingUserId={userData?.user_id}
                onImported={fetchOrg}
            />
            <SortableTable
                columns={[
                    { key: 'user_id', label: 'User ID', sortable: true },
                    { key: 'username', label: 'Username', sortable: true },
                    { key: 'user_type', label: 'Role', sortable: true },
                    ...(canManageMembers ? [{ key: 'points', label: 'Points', sortable: true }] : []),
                    ...(canManageMembers ? [{
                        key: 'last_login',
                        label: 'Last Login',
                        sortable: true,
                        render: (value, row) => {
                            if (row.user_type !== 'driver') return null;
                            if (!value) return 'Never';
                            return new Date(value).toLocaleString();
                        }
                    }] : []),
                ]}
                actions={(() => {
                    if (canManageMembers) {
                        return [
                            {
                                label: 'View As',
                                render: (row) => (row.user_type === 'driver' || (userData?.user_type === 'admin' && row.user_type === 'sponsor')) ? (
                                    <button
                                        onClick={async () => {
                                            try {
                                                await startImpersonation(row.user_id);
                                                navigate('/dashboard');
                                            } catch (err) {
                                                alert(err.message || 'Failed to assume identity');
                                            }
                                        }}
                                        style={{ backgroundColor: '#ff9800', color: '#1a1a1a', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                                    >
                                        View As
                                    </button>
                                ) : null,
                            },
                            {
                                label: 'Purchase for Driver',
                                render: (row) => row.user_type === 'driver' ? (
                                    <button
                                        onClick={() => setPurchaseDriver(row)}
                                        style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                                    >
                                        Purchase
                                    </button>
                                ) : null,
                            },
                            {
                                label: 'Remove',
                                onClick: (row) => {
                                    setSelectedMember(row);
                                    setRemoveOpen(true);
                                },
                            },
                        ];
                    }
                    return [];
                })()}
                data={(orgUsers || []).map(user => ({
                    ...user,
                    points: user.user_type === 'driver'
                        ? (user.points != null ? Number(user.points) : 0)
                        : null,
                }))}
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
            <SponsorPurchaseModal
                isOpen={!!purchaseDriver}
                onClose={() => setPurchaseDriver(null)}
                driver={purchaseDriver}
                orgId={orgId}
                sponsorUserId={userData?.user_id}
            />
        </div>
    );
}

export default OrganizationMembersTab;
