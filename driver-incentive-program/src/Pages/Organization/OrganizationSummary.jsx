import React from 'react';
import { useState, useEffect } from 'react';
import Field from '../../components/Field';
import EditableField from '../../components/EditableField';

async function fetchNumOrgUsers(orgId) {
    try {
        const response = await fetch(`/api/organization/${orgId}/count`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.count;
    } catch (error) {
        console.error('Error fetching organization user count:', error);
        throw error;
    }
}

async function fetchOrgData(orgId, field, value) {
    try {
        const response = await fetch(`/api/organization/${orgId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ field, value })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating organization data:', error);
        throw error;
    }
}

const SponsorFields = ({orgData, setOrgData, numUsers}) => {
    return (
        <div style={{ marginLeft: '20px'}}>
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
        <div style={{ marginLeft: '20px'}}>
            <Field label="Organization Name" value={orgData?.name || "Loading..."} />
            <Field label="Point Value" value={orgData?.point_value || "Loading..."} />
            <Field label="Members" value={numUsers !== null ? numUsers : "Loading..."} />
        </div>
    );
}

const OrganizationSummary = ({userData, orgData, setOrgData}) => {
    const [numUsers, setNumUsers] = useState(null);
    useEffect(() => {
        if (!userData?.sponsor_org_id) return;
        async function loadNumUsers() {
            const count = await fetchNumOrgUsers(userData.sponsor_org_id);
            setNumUsers(count);
        }
        loadNumUsers();
    }, [userData]);

    return (
        <div style={{ margin: '20px'}}>
            <h1 style={{ color: '#1a1a1a', marginBottom: '20px'}}>Organization Summary</h1>
            {userData?.user_type === 'driver' ? (
                <DriverFields orgData={orgData} numUsers={numUsers} />
            ) : (
                <SponsorFields orgData={orgData} setOrgData={setOrgData} numUsers={numUsers} />
            )}
        </div>
    );
}

export default OrganizationSummary;