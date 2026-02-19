import React, { useState, useEffect, use } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Field from '../../../components/Field';
import OrganizationHeader from './OrganizationHeader';
import OrganizationMembersTab from './OrganizationMembersTab';
import { fetchOrgData, fetchOrgUsers } from '../../../api/OrganizationApi';

const OrganizationSummary = () => {
    const [userData, setUserData] = useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const { orgId } = useParams();
    const [orgData, setOrgData] = useState(null);
    const [orgUsers, setOrgUsers] = useState(null);

    async function fetchOrg() {
        const org = await fetchOrgData(orgId);
        setOrgData(org);
        const users = await fetchOrgUsers(orgId);
        setOrgUsers(users);
    }

    useEffect(() => {
        if (!orgId) return;
        fetchOrg();
    }, [orgId]);
    
    return (
        <div style={{background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e0e0e0'}}>
            <OrganizationHeader userData={userData} numUsers={orgUsers?.length || 0} orgData={orgData} setOrgData={setOrgData} setUserData={setUserData} fetchOrg={fetchOrg}/>
            <div style={{ borderBottom: '1px solid #e0e0e0', marginBottom: '20px'}}/>
            <OrganizationMembersTab orgUsers={orgUsers} userData={userData} setUserData={setUserData} fetchOrg={fetchOrg}/>
        </div>
    );
}

export default OrganizationSummary;