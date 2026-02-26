import React, { useEffect, useState } from 'react';
import SortableTable from '../../../components/SortableTable';
import {fetchApplicationsOrg, reviewApplication} from '../../../api/ApplicationApi';
import Modal from '../../../components/Modal';
import Field from '../../../components/Field';
import InputField from '../../../components/InputField';
import DropdownField from '../../../components/DropdownField';

const OrganizationApplicationsTab = ({userData, setUserData, orgId, fetchOrg}) => {
    const [applications, setApplications] = React.useState([]);

    async function getApplications(orgId) {
        const apps = await fetchApplicationsOrg(orgId, 'pending');
        setApplications(apps);
    }

    useEffect(() => {
        getApplications(orgId);
    }, [orgId]);

    const [selectedApplication, setSelectedApplication] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [status, setStatus] = useState('');
    const [decisionReason, setDecisionReason] = useState('');

    function handleOnClose() {
        setIsModalOpen(false)
        setSelectedApplication(null);
        setDecisionReason('');
        setStatus('');
    }

    return (
        <div>
            <SortableTable
                columns={[
                    { key: 'application_id', label: 'Application ID', sortable: true },
                    { key: 'driver_user_id', label: 'Driver ID', sortable: true },
                    { key: 'status', label: 'Status', sortable: true },
                ]}
                actions={[
                    { 
                        label: 'Review', 
                        onClick: async (row) => {
                            await setSelectedApplication(row);
                            setIsModalOpen(true);
                        }
                    },
                ]}
                data={applications || []}
            />
            <Modal
                isOpen={isModalOpen}
                onClose={handleOnClose}
                title={`Application Details - ID: ${selectedApplication?.application_id || ''}`}
                children={
                    <div style={{ display: 'grid', gap: '10px'}}>
                        <Field label="Application ID" value={selectedApplication?.application_id || ''} />
                        <Field label="Driver User ID" value={selectedApplication?.driver_user_id || ''} />
                        <Field label="Status" value={selectedApplication?.status || ''} />
                        <DropdownField
                            label="Update Status"
                            options={[
                                { label: 'Approve', value: 'approved' },
                                { label: 'Reject', value: 'rejected' },
                            ]}
                            onChange={(value) => setStatus(value)}
                        />
                        <InputField label="Decision Reason" value={decisionReason} onChange={(value) => setDecisionReason(value)} />
                    </div>
                }
                onSave={async () => {
                    if (status != '') {
                        if (window.confirm(`Are you sure you want to this application to be ${status}?`)) {
                            await reviewApplication(selectedApplication.application_id, status, decisionReason, userData.user_id);
                            await getApplications(orgId);
                            await fetchOrg();
                            handleOnClose();
                        }
                    }
                }}
            />
        </div>
    );
}

export default OrganizationApplicationsTab;