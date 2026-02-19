async function createApplication(user_id, org_id) {
    try {
        const response = await fetch('/api/application', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id, org_id }),
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating organization application:', error);
        throw error;
    }
}

async function featchApplicationsUser(user_id, status) {
    try {
        const response = await fetch(`/api/application/user/${user_id}?status=${status}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.applications;
    } catch (error) {
        console.error('Error checking existing application:', error);
        throw error;
    }
}

async function fetchApplicationsOrg(org_id, status) {
    try {
        const response = await fetch(`/api/application/organization/${org_id}?status=${status}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.applications;
    } catch (error) {
        console.error('Error fetching applications:', error);
        throw error;
    }
}

async function reviewApplication(application_id, status, decision_reason, user_id) {
    try {
        const response = await fetch(`/api/application/${application_id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status, decision_reason, user_id }),
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error reviewing application:', error);
        throw error;
    }
}

export { createApplication, featchApplicationsUser, fetchApplicationsOrg, reviewApplication };