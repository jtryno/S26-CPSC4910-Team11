import React from 'react';
import { useState, useEffect } from 'react';
import Field from '../../../components/Field';
import EditableField from '../../../components/EditableField';
import { fetchOrgData } from '../../../api/OrganizationApi';
import { removeFromOrganization } from '../../../api/UserApi';
import { createApplication, featchApplicationsUser } from '../../../api/ApplicationApi';


const SponsorFields = ({orgData, setOrgData, numUsers}) => {
    return (
        <div>
            <EditableField label="Organization Name" value={orgData?.name || "Loading..."} onSave={async (value) => {
                const result = await fetchOrgData(orgData.sponsor_org_id, 'name', value);
                setOrgData({...orgData, name: value});
            }}/>
            <EditableField label="Point Value" value={orgData?.point_value || "Loading..."} onSave={async (value) => {
                const result = await fetchOrgData(orgData.sponsor_org_id, 'point_value', value);
                setOrgData({...orgData, point_value: value});
            }}/>
            <Field label="Members" value={numUsers !== null ? numUsers : "Loading..."} />
        </div>
    );
}

const DriverFields = ({orgData, numUsers}) => {
    return (
        <div >
            <Field label="Organization Name" value={orgData?.name || "Loading..."} />
            <Field label="Point Value" value={orgData?.point_value || "Loading..."} />
            <Field label="Members" value={numUsers !== null ? numUsers : "Loading..."} />
        </div>
    );
}

const OrganizationHeader = ({userData, numUsers, orgData, setOrgData, setUserData, fetchOrg, hasPendingApplication}) => {
    return (
        <div style={{ margin: '20px'}}>
            <h1 style={{ color: '#1a1a1a', marginBottom: '20px'}}>Organization Summary</h1>
            <div style={{ marginLeft: '20px', marginRight: '20px', display: 'grid', gridAutoFlow: 'column', gap: '20px'}}>
                {userData?.user_type === 'driver' || (userData?.sponsor_org_id != orgData?.sponsor_org_id && userData?.user_type !== 'admin') ? (
                    <DriverFields orgData={orgData} numUsers={numUsers} />
                ) : (
                    <SponsorFields orgData={orgData} setOrgData={setOrgData} numUsers={numUsers} />
                )}
                {userData?.sponsor_org_id === orgData?.sponsor_org_id && 
                    <button 
                        onClick={async () => {
                            await removeFromOrganization(userData.user_id);
                            fetchOrg();
                            setUserData(prev => ({ ...prev, sponsor_org_id: null }));
                        }}
                        style={{ height: '50px', width: '200px', marginTop: 'auto', marginLeft: 'auto', backgroundColor: '#e74c3c', color: 'white', borderRadius: '4px', padding: '0 15px' }}
                    >
                        Leave Organization        
                    </button>
                }
                {userData?.user_type !== 'admin' && userData?.sponsor_org_id === null &&
                    <button 
                        disabled={hasPendingApplication}
                        onClick={async () => {
                            if (window.confirm(`Are you sure you want to request to join "${orgData?.name}"?`)) {
                                await createApplication(userData.user_id, orgData.sponsor_org_id);
                                await fetchOrg();
                            }
                        }}
                        style={{ height: '50px', width: '200px', marginTop: 'auto', marginLeft: 'auto', color: 'white', borderRadius: '4px', padding: '0 15px', backgroundColor: hasPendingApplication ? '#95a5a6' : '#3498db', cursor: hasPendingApplication ? 'not-allowed' : 'pointer' }}
                    >
                        {hasPendingApplication ? "Pending Application" : "Request to Join Organization"}
                    </button>
                }
            </div>
        </div>
    );
}

export default OrganizationHeader;