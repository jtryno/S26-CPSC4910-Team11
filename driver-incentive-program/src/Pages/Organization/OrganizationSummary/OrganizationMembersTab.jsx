import React from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SortableTable from '../../../components/SortableTable';
import SignupModal from '../../../components/SignupModal';
import { dropDriver, archiveDriver } from '../../../api/UserApi';
import { startImpersonation } from '../../../api/ImpersonationApi';
import Modal from '../../../components/Modal';
import InputField from '../../../components/InputField';
import SponsorPurchaseModal from './SponsorPurchaseModal';
import DriverCsvImportModal from './DriverCSVImportModal';
import BulkUploadModal from './BulkUploadModal';
import RateDriverModal from './RateDriverModal';

const OrganizationMembersTab = ({orgUsers, userData, setUserData, fetchOrg, orgId}) => {

    const navigate = useNavigate();
    const [signupModalOpen, setSignupModalOpen] = useState(false);
    const [csvImportOpen, setCsvImportOpen] = useState(false);
    const [isRemoveOpen, setRemoveOpen] = useState(false);
    const [selectedMember, setSelectedMember] = useState(null);
    const [dropReason, setDropReason] = useState('');
    const [purchaseDriver, setPurchaseDriver] = useState(null);
    const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
    const [isArchiveOpen, setArchiveOpen] = useState(false);
    const [archiveMember, setArchiveMember] = useState(null);
    const [rateDriver, setRateDriver] = useState(null);

    function handleDropClose() {
        setRemoveOpen(false);
        setSelectedMember(null);
        setDropReason('');
    }

    function handleArchiveClose() {
        setArchiveOpen(false);
        setArchiveMember(null);
    }

    const canManageMembers = userData?.user_type === 'admin' ||
        (userData?.user_type === 'sponsor' && Number(userData?.sponsor_org_id)=== Number(orgId));

    const canRateDrivers = userData?.user_type === 'sponsor';
    let actions = [];
    if (canManageMembers) {
        actions = [
            {
                label: 'View As',
                render: (row) => {
                    const canViewAs = row.user_type === 'driver' || (userData?.user_type === 'admin' && row.user_type === 'sponsor');
                    if (!canViewAs) return null;
                    return (
                        <button
                            onClick={async () => {
                                try {
                                    await startImpersonation(row.user_id);
                                    navigate('/dashboard');
                                } catch (err) {
                                    alert(err.message || 'Failed to assume identity');
                                }
                            }}
                            style={{backgroundColor: '#ff9800', color: '#1a1a1a', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600'}}
                        >
                            View As
                        </button>
                    );
                },
            },
            {
                label: 'Purchase for Driver',
                render: (row) => {
                    if (row.user_type !== 'driver') return null;
                    return (
                        <button
                            onClick={() => setPurchaseDriver(row)}
                            style={{backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer'}}
                        >
                            Purchase
                        </button>
                    );
                },
            },
            {
                label: 'Remove',
                onClick: (row) => {
                    setSelectedMember(row);
                    setRemoveOpen(true);
                },
            },
            {
                label: 'Archive',
                render: (row) => row.user_type === 'driver' ? (
                    <button
                        onClick={() => {
                            setArchiveMember(row);
                            setArchiveOpen(true);
                        }}
                        style={{backgroundColor: '#757575', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer'}}
                    >
                        Archive
                    </button>
                ) : null,
            },
        ];

        if (canRateDrivers) {
            actions.splice(2, 0, {
                label: 'Rate',
                render: (row) => {
                    if (row.user_type !== 'driver') return null;
                    return (
                        <button
                            onClick={() => setRateDriver(row)}
                            style={{backgroundColor: '#f59e0b', color: '#1a1a1a', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontWeight: '600'}}
                        >
                            Rate
                        </button>
                    );
                },
            });
        }
    }

    let pointsColumn = [];
    if (canManageMembers) {
        pointsColumn = [{
            key: 'points',
            label: 'Points',
            sortable: true,
            render: (value) => {
                if (value != null) return value;
                return '';
            }
        }];
    }

    let lastLoginColumn = [];
    if (canManageMembers) {
        lastLoginColumn = [{
            key: 'last_login',
            label: 'Last Login',
            sortable: true,
            render: (value, row) => {
                if (row.user_type !== 'driver') return null;
                if (!value) return 'Never';
                return new Date(value).toLocaleString();
            }
        }];
    }

    let removeModalTitle;
    if (selectedMember?.username) {
        removeModalTitle = `Remove ${selectedMember.username}`;
    } else {
        removeModalTitle = 'Remove Member';
    }

    return (
        <div style={{display: 'grid', direction: 'column', margin: '20px', gap: '20px'}}>
            {canManageMembers && (
                <div style={{display: 'flex', gap: '12px', flexWrap: 'wrap'}}>
                    <button
                        style={{width: '200px'}}
                        onClick={() => setSignupModalOpen(true)}
                    >
                        Create Org User
                    </button>
                    <button
                        style={{width: '200px'}}
                        onClick={() => setCsvImportOpen(true)}
                    >
                        Import Drivers/Sponsors CSV
                    </button>
                    {userData?.user_type === 'sponsor' && (
                        <button
                            style={{width: '200px'}}
                            onClick={() => setBulkUploadOpen(true)}
                        >
                            Bulk Upload Users
                        </button>
                    )}
                </div>
            )}
            <SignupModal
                isOpen={signupModalOpen}
                onClose={() => setSignupModalOpen(false)}
                onSave={() => fetchOrg()}
                possibleRoles={[
                    {label: 'Driver', value: 'driver'},
                    {label: 'Sponsor', value: 'sponsor'},
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
            <BulkUploadModal
                isOpen={bulkUploadOpen}
                onClose={() => setBulkUploadOpen(false)}
                orgId={orgId}
                requestingUserId={userData?.user_id}
                onImported={fetchOrg}
                userType={userData?.user_type}
            />
            <SortableTable
                columns={[
                    {key: 'user_id', label: 'User ID', sortable: true},
                    {key: 'username', label: 'Username', sortable: true},
                    {key: 'user_type', label: 'Role', sortable: true},
                    ...pointsColumn,
                    ...lastLoginColumn,
                ]}
                actions={actions}
                data={(orgUsers || []).map(user => {
                    let points = null;
                    if (user.user_type === 'driver') {
                        if (user.points != null) {
                            points = Number(user.points);
                        } else {
                            points = 0;
                        }
                    }
                    return {...user, points};
                })}
            />
            <Modal
                isOpen={isRemoveOpen}
                onClose={handleDropClose}
                title={removeModalTitle}
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
                <div style={{display: 'grid', gap: '10px'}}>
                    <p style={{margin: 0, color: '#444', fontSize: '14px'}}>
                        You are removing <strong>{selectedMember?.username}</strong> from the organization. You can choose to provide a reason.
                    </p>
                    <InputField
                        label="Reason (optional)"
                        value={dropReason}
                        onChange={(value) => setDropReason(value)}
                    />
                </div>
            </Modal>
            <Modal
                isOpen={isArchiveOpen}
                onClose={handleArchiveClose}
                title={`Archive ${archiveMember?.username || 'Driver'}`}
                onSave={async () => {
                    await archiveDriver(archiveMember.user_id, orgId);
                    fetchOrg();
                    handleArchiveClose();
                }}
            >
                <p style={{margin: 0, color: '#444', fontSize: '14px'}}>
                    Are you sure you want to archive <strong>{archiveMember?.username}</strong>?
                    They will no longer appear in the active members list.
                </p>
            </Modal>
            <SponsorPurchaseModal
                isOpen={!!purchaseDriver}
                onClose={() => setPurchaseDriver(null)}
                driver={purchaseDriver}
                orgId={orgId}
                sponsorUserId={userData?.user_id}
            />
            <RateDriverModal
                isOpen={!!rateDriver}
                onClose={() => setRateDriver(null)}
                driver={rateDriver}
                sponsorUserId={userData?.user_id}
                onReviewSaved={() => setRateDriver(null)}
            />
        </div>
    );
}

export default OrganizationMembersTab;
