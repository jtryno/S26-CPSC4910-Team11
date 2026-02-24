import React, { useEffect, useState, useMemo } from 'react';
import SortableTable from '../../../components/SortableTable';
import Modal from '../../../components/Modal';
import Field from '../../../components/Field';
import DropdownField from '../../../components/DropdownField';
import InputField from '../../../components/InputField';

const OrganizationContestsTab = ({ userData, orgId }) => {
    const [contests, setContests] = useState([]);
    const [selectedContest, setSelectedContest] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [status, setStatus] = useState('approved');
    const [decisionReason, setDecisionReason] = useState('');
    const decisionOptions = useMemo(() => [
        { label: 'Approve (reverse deduction)', value: 'approved' },
        { label: 'Reject', value: 'rejected' },
    ], []);

    async function getContests() {
        const res = await fetch(`/api/point-contest/organization/${orgId}?status=pending`);
        const data = await res.json();
        setContests(data.contests || []);
    }

    useEffect(() => {
        if (orgId) getContests();
    }, [orgId]);

    function handleOnClose() {
        setIsModalOpen(false);
        setSelectedContest(null);
        setDecisionReason('');
        setStatus('approved');
    }

    return (
        <div>
            <SortableTable
                columns={[
                    { key: 'contest_id', label: 'Contest ID', sortable: true },
                    { key: 'driver_username', label: 'Driver', sortable: true },
                    { key: 'transaction_id', label: 'Transaction ID', sortable: true },
                    { key: 'point_amount', label: 'Points', sortable: true },
                    { key: 'status', label: 'Status', sortable: true },
                ]}
                actions={[
                    {
                        label: 'Review',
                        onClick: (row) => {
                            setSelectedContest(row);
                            setIsModalOpen(true);
                        },
                    },
                ]}
                data={contests}
            />
            <Modal
                isOpen={isModalOpen}
                onClose={handleOnClose}
                title={`Contest Details - ID: ${selectedContest?.contest_id || ''}`}
                onSave={async () => {
                    if (!window.confirm(`Are you sure you want to ${status} this contest?`)) return;

                    const res = await fetch(`/api/point-contest/${selectedContest.contest_id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            status,
                            decision_reason: decisionReason,
                            reviewed_by_user_id: userData.user_id,
                        }),
                    });

                    if (res.ok) {
                        await getContests();
                        handleOnClose();
                    } else {
                        alert('Failed to review contest. Please try again.');
                    }
                }}
            >
                <div style={{ display: 'grid', gap: '10px' }}>
                    <Field label="Contest ID" value={selectedContest?.contest_id || ''} />
                    <Field label="Driver" value={selectedContest?.driver_username || ''} />
                    <Field label="Transaction ID" value={selectedContest?.transaction_id || ''} />
                    <Field label="Points" value={selectedContest?.point_amount || ''} />
                    <Field label="Transaction Reason" value={selectedContest?.transaction_reason || ''} />
                    <Field
                        label="Transaction Date"
                        value={selectedContest?.transaction_date
                            ? new Date(selectedContest.transaction_date).toLocaleDateString()
                            : ''}
                    />
                    <Field label="Driver's Reason" value={selectedContest?.reason || ''} />
                    <DropdownField
                        label="Decision"
                        options={decisionOptions}
                        onChange={(value) => setStatus(value)}
                    />
                    <InputField
                        label="Decision Reason"
                        value={decisionReason}
                        onChange={(value) => setDecisionReason(value)}
                    />
                </div>
            </Modal>
        </div>
    );
};

export default OrganizationContestsTab;