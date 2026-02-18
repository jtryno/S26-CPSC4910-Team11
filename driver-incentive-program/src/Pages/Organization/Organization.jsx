import React, { useState, useEffect, use } from 'react';
import { useNavigate } from 'react-router-dom';
import Field from '../../components/Field';
import OrganizationSummary from './OrganizationSummary';
import OrganizationMembersTab from './OrganizationMembersTab';

async function fetchOrgData(orgId) {
    try {
        const response = await fetch(`/api/organization/${orgId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.organization;
    } catch (error) {
        console.error('Error fetching organization data:', error);
        throw error;
    }
}

const Organization = () => {
    const [userData, setUserData] = useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const [orgData, setOrgData] = useState(null);
    useEffect(() => {
        if (!userData?.sponsor_org_id) return;
            async function loadOrg() {
            const org = await fetchOrgData(userData.sponsor_org_id);
            setOrgData(org);
        }
        loadOrg();
    }, [userData]);
    
    return (
        <div style={{background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e0e0e0'}}>
            <OrganizationSummary userData={userData} orgData={orgData} setOrgData={setOrgData}/>
            <div style={{ borderBottom: '1px solid #e0e0e0', marginBottom: '20px'}}/>
            <OrganizationMembersTab orgData={orgData}/>
        </div>
    );
}

export default Organization;