import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import OrganizationSummary from '../OrganizationSummary/OrganizationSummary';
import SortableTable from '../../../components/SortableTable';
import InputField from '../../../components/InputField';
import Field from '../../../components/Field';
import { fetchOrganizations, createOrganization, deleteOrganization } from '../../../api/OrganizationApi';
import Modal from '../../../components/Modal';
import { getActiveSponsorOrgId, getDriverSponsors, ACTIVE_SPONSOR_EVENT } from '../../../activeSponsor';

const Organizations = () => {
    const [userData, setUserData] = useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const [organizations, setOrganizations] = useState(null);
    const navigate = useNavigate();
    // Drivers now see a button per sponsor affiliation; sponsors/admins still
    // see a single "My Organization" button pointing at their own org.
    const [driverSponsors, setDriverSponsors] = useState(() => getDriverSponsors());
    const [activeSponsorOrgId, setActiveSponsorOrgId] = useState(() => getActiveSponsorOrgId());
    useEffect(() => {
        const sync = () => {
            setDriverSponsors(getDriverSponsors());
            setActiveSponsorOrgId(getActiveSponsorOrgId());
        };
        window.addEventListener(ACTIVE_SPONSOR_EVENT, sync);
        window.addEventListener('authStateChanged', sync);
        return () => {
            window.removeEventListener(ACTIVE_SPONSOR_EVENT, sync);
            window.removeEventListener('authStateChanged', sync);
        };
    }, []);

    async function loadOrganizations() {
        const orgs = await fetchOrganizations();
        setOrganizations(orgs);
    }

    useEffect(() => {
        loadOrganizations();
    }, []);

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [orgName, setOrgName] = useState('');
    const [pointValue, setPointValue] = useState(0);

    return (
        <div style={{background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e0e0e0', padding: '20px'}}>
            <h1 style={{margin: '10px'}}>Organizations</h1>
            {userData?.user_type === 'driver' && driverSponsors.length > 0 && (
                <div style={{ display: 'inline-flex', gap: '10px', margin: '20px', flexWrap: 'wrap' }}>
                    {driverSponsors.map(s => {
                        // Resolve the label from the already-fetched orgs list
                        // so we don't depend on the shape of user.sponsors —
                        // stale sessions from before the multi-sponsor backend
                        // change can be missing the `name` field.
                        const match = (organizations || []).find(
                            o => Number(o.sponsor_org_id) === Number(s.sponsor_org_id)
                        );
                        const label = match?.name || s.name || `Org #${s.sponsor_org_id}`;
                        return (
                            <button
                                key={s.sponsor_org_id}
                                onClick={() => navigate(`/organization/${s.sponsor_org_id}`)}
                                style={{
                                    padding: '6px 14px',
                                    border: Number(s.sponsor_org_id) === Number(activeSponsorOrgId) ? '2px solid #3498db' : '1px solid #c0c0c0',
                                    borderRadius: '4px',
                                    background: '#fff',
                                    color: '#1a1a1a',
                                    cursor: 'pointer',
                                }}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}
            {userData?.user_type !== 'driver' && userData?.sponsor_org_id &&
                <button
                    onClick={() => {
                        navigate(`/organization/${userData?.sponsor_org_id || ''}`);
                    }}
                    style={{margin: '20px'}}
                >
                    My Organization
                </button>
            }
            {userData?.user_type === 'admin' && 
                <button 
                    onClick={() => {
                        setCreateModalOpen(true);
                    }}
                    style={{margin: '20px'}}
                >
                    Create Organization
                </button>
            }
            <SortableTable
                columns={[
                    { key: 'sponsor_org_id', label: 'ID', sortable: true },
                    { key: 'name', label: 'Organization Name', sortable: true }
                ]}
                actions={[
                    { label: 'View Org', onClick: (row) => navigate(`/organization/${row.sponsor_org_id}`) },
                    ...(userData.user_type === 'admin' 
                        ? [{ 
                            label: 'Delete', 
                            onClick: async (row) => {
                                if (!window.confirm(`Are you sure you want to delete the organization "${row.name}"? This action cannot be undone.`)) {
                                    return;
                                }
                                await deleteOrganization(row.sponsor_org_id);
                                await loadOrganizations();
                            }
                        }]
                        : [])
                ]}
                data={organizations}
            />
            <Modal
                isOpen={createModalOpen}
                onClose={() => {
                    setCreateModalOpen(false);
                    setOrgName('');
                    setPointValue(0);
                }}
                onSave={async () => {
                    await createOrganization(orgName, pointValue);
                    await loadOrganizations();
                    setCreateModalOpen(false);
                    setOrgName('');
                    setPointValue(0);
                }}
                children={
                    <div style={{ display: 'grid', direction: 'column', gap: '20px', paddingRight: '20px' }}>
                        <InputField
                            label="Organization Name"
                            value={orgName}
                            onChange={(value) => setOrgName(value)}
                        />
                        <InputField
                            label="Point Value"
                            value={pointValue}
                            onChange={(value) => setPointValue(value)}
                            type="number"
                        />
                    </div>
                }
                title="Create Organization" />
        </div>
    );
}

export default Organizations;