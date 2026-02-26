import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import OrganizationHeader from './OrganizationHeader';
import OrganizationMembersTab from './OrganizationMembersTab';
import { fetchOrgData, fetchOrgUsers } from '../../../api/OrganizationApi';
import { featchApplicationsUser } from '../../../api/ApplicationApi';
import TabGroup from '../../../components/TabGroup';
import OrganizationApplicationsTab from './OrganizationApplicationsTab';
import OrganizationContestsTab from './OrganizationContestsTab';
import OrganizationCatalogTab from './OrganizationCatalogTab';
import OrganizationOrdersTab from './OrganizationOrdersTab';

const OrganizationSummary = () => {
    const [userData, setUserData] = useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const { orgId } = useParams();
    const [orgData, setOrgData] = useState(null);
    const [orgUsers, setOrgUsers] = useState(null);
    const [hasPendingApplication, setHasPendingApplication] = useState(true);

    async function fetchOrg() {
        const org = await fetchOrgData(orgId);
        setOrgData(org);
        const users = await fetchOrgUsers(orgId);
        setOrgUsers(users);
        const applications = await featchApplicationsUser(userData.user_id, 'pending');
        setHasPendingApplication(applications.length > 0);
    }

    useEffect(() => {
        if (!orgId) return;
        fetchOrg();
    }, [orgId, userData?.user_id]);

    const isSponsorOrAdmin = userData?.user_type === 'admin' ||
        (userData?.user_type === 'sponsor' && userData?.sponsor_org_id === Number(orgId));
    
    return (
        <div style={{background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e0e0e0'}}>
            <OrganizationHeader userData={userData} numUsers={orgUsers?.length || 0} orgData={orgData} setOrgData={setOrgData} setUserData={setUserData} fetchOrg={fetchOrg} hasPendingApplication={hasPendingApplication}/>
            <div style={{ borderBottom: '1px solid #e0e0e0', marginBottom: '20px'}}/>
            <TabGroup tabs={[
                { label: "Members", content: <OrganizationMembersTab orgUsers={orgUsers} userData={userData} setUserData={setUserData} fetchOrg={fetchOrg} /> },
                ...(isSponsorOrAdmin ? [
                    { label: "Applications", content: <OrganizationApplicationsTab userData={userData} setUserData={setUserData} orgId={orgId} fetchOrg={fetchOrg} /> },
                    { label: "Point Contests", content: <OrganizationContestsTab userData={userData} orgId={orgId} /> },
                    { label: "Catalog", content: <OrganizationCatalogTab orgId={orgId} userData={userData} /> },
                    { label: "Orders", content: <OrganizationOrdersTab orgId={orgId} userData={userData} /> },
                ] : [])
            ]} />
        </div>
    );
}

export default OrganizationSummary;