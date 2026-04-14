import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import OrganizationHeader from './OrganizationHeader';
import OrganizationMembersTab from './OrganizationMembersTab';
import { fetchOrgData, fetchOrgUsers, fetchDropLogs } from '../../../api/OrganizationApi';
import { featchApplicationsUser } from '../../../api/ApplicationApi';
import { fetchUserData } from '../../../api/UserApi';
import { reconcileActiveSponsor } from '../../../activeSponsor';
import TabGroup from '../../../components/TabGroup';
import OrganizationApplicationsTab from './OrganizationApplicationsTab';
import OrganizationContestsTab from './OrganizationContestsTab';
import OrganizationCatalogTab from './OrganizationCatalogTab';
import OrganizationOrdersTab from './OrganizationOrdersTab';
import OrganizationDropsTab from './OrganizationDropsTab';
import OrganizationDriverStatusTab from './OrganizationDriverStatusTab';
import OrganizationArchivedDriversTab from './OrganizationArchivedDriversTab';

const OrganizationSummary = () => {
    const [userData, setUserData] = useState(() => {
        const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
        return storedUser ? JSON.parse(storedUser) : null;
    });
    const { orgId } = useParams();
    const [orgData, setOrgData] = useState(null);
    const [orgUsers, setOrgUsers] = useState(null);
    const [pendingApplication, setPendingApplication] = useState(null);
    const [dropData, setDropData] = useState([]);

    async function fetchOrg() {
        const org = await fetchOrgData(orgId);
        setOrgData(org);
        const users = await fetchOrgUsers(orgId);
        setOrgUsers(users);

        // Refresh the driver's data from the DB so sponsors[] and sponsor_org_id
        // reflect any approval/leave/drop without requiring a logout/login.
        const freshUser = await fetchUserData(userData.user_id);
        if (freshUser) {
            const storage = localStorage.getItem('user') ? localStorage : sessionStorage;
            const stored = JSON.parse(storage.getItem('user'));
            storage.setItem('user', JSON.stringify({ ...stored, ...freshUser }));
            setUserData(prev => ({ ...prev, ...freshUser }));
            // If this fetch ran because an application was just approved,
            // make sure the navbar picks up a valid active sponsor.
            reconcileActiveSponsor();
        }

        const applications = await featchApplicationsUser(userData.user_id, 'pending');
        // Find the pending application specifically for this org so the driver can withdraw it
        const appForThisOrg = applications.find(a => a.sponsor_org_id === Number(orgId)) || null;
        setPendingApplication(appForThisOrg);
        const drops = await fetchDropLogs(orgId);
        setDropData(drops);
    }

    useEffect(() => {
        if (!orgId) return;
        fetchOrg();
    }, [orgId, userData?.user_id]);

    const isSponsorOrAdmin = userData?.user_type === 'admin' ||
        (userData?.user_type === 'sponsor' && userData?.sponsor_org_id === Number(orgId));
    
    return (
        <div style={{background: '#f9f9f9', borderRadius: '8px', border: '1px solid #e0e0e0'}}>
            <OrganizationHeader userData={userData} numUsers={orgUsers?.length || 0} orgData={orgData} setOrgData={setOrgData} setUserData={setUserData} fetchOrg={fetchOrg} pendingApplication={pendingApplication}/>
            <div style={{ borderBottom: '1px solid #e0e0e0', marginBottom: '20px'}}/>
            <TabGroup tabs={[
                { label: "Members", content: <OrganizationMembersTab orgUsers={orgUsers} userData={userData} setUserData={setUserData} fetchOrg={fetchOrg} orgId={orgId}/> },
                ...(isSponsorOrAdmin ? [
                    { label: "Applications", content: <OrganizationApplicationsTab userData={userData} setUserData={setUserData} orgId={orgId} fetchOrg={fetchOrg}/> },
                    { label: "Drop Logs", content: <OrganizationDropsTab dropData={dropData} /> },
                    { label: "Point Contests", content: <OrganizationContestsTab userData={userData} orgId={orgId} /> },
                    { label: "Catalog", content: <OrganizationCatalogTab orgId={orgId} userData={userData} /> },
                    { label: "Orders", content: <OrganizationOrdersTab orgId={orgId} userData={userData} /> },
                    { label: "Driver Status", content: <OrganizationDriverStatusTab orgId={orgId} /> },
                    { label: "Archived Drivers", content: <OrganizationArchivedDriversTab orgId={orgId} /> },
                ] : [])
            ]} />
        </div>
    );
}

export default OrganizationSummary;