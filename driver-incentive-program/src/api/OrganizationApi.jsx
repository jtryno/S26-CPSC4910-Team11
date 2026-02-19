async function fetchOrgUsers(orgId) {
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

async function fetchOrganizations() {
    try {
        const response = await fetch('/api/organization', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.organizations;
    } catch (error) {
        console.error('Error fetching organizations:', error);
        throw error;
    }
}

async function deleteOrganization(orgId) {
    try {
        const response = await fetch(`/api/organization/${orgId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error deleting organization:', error);
        throw error;
    }
}

async function createOrganization(name, pointValue) {
    try {
        const response = await fetch('/api/organization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, point_value: pointValue })
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating organization:', error);
        throw error;
    }
}

export { fetchOrgData, fetchOrgUsers, fetchOrganizations, deleteOrganization, createOrganization };