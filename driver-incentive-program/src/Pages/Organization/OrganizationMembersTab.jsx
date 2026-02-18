import React from 'react';
import { useState, useEffect } from 'react';

async function fetchOrgMembers(orgId) {
    try {
        const response = await fetch(`/api/organization/${orgId}/users`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.users;
    } catch (error) {
        console.error('Error fetching organization members:', error);
        throw error;
    }
}

const OrganizationMembersTab = ({orgData}) => {
    const [members, setMembers] = useState(null);

    useEffect(() => {
        if (!orgData?.sponsor_org_id) return;
        async function loadMembers() {
            const orgMembers = await fetchOrgMembers(orgData.sponsor_org_id);
            setMembers(orgMembers);
        }  
        loadMembers();
    }, [orgData]);

    return (
        <div style={{ display: 'grid', direction: 'column', margin: '20px'}}>
            {members && members.map((member, index) => (
                <div key={member.user_id} style={{border: '1px solid #e0e0e0', padding: '5px', }}>{index + 1}. {member.username} {member.user_type}</div>
            ))}
        </div>
    );
}

export default OrganizationMembersTab;