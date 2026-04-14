// Drops a single sponsor affiliation. Callers pass `sponsorOrgId` for drivers
// with more than one sponsor so the server knows which one to drop; sponsors
// (single-org) can omit it.
import { reconcileActiveSponsor } from '../activeSponsor';

async function removeFromOrganization(userId, sponsorOrgId = null) {
    const storedUser = localStorage.getItem('user') || sessionStorage.getItem('user');
    const userType = storedUser ? JSON.parse(storedUser)?.user_type : null;

    try {
        const response = await fetch('/api/user/leave-organization', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId, user_type: userType, sponsor_org_id: sponsorOrgId }),
        });
        if (!response.ok) throw new Error('Failed to leave organization');
    } catch (error) {
        console.error('Error leaving organization:', error);
        throw error;
    }

    // Re-fetch the user so sponsors[] and sponsor_org_id in local storage
    // reflect the remaining affiliations, then reconcile the navbar's active
    // sponsor in case the one they just left was selected.
    try {
        const fresh = await fetchUserData(userId);
        const storage = localStorage.getItem('user') ? localStorage : sessionStorage;
        const existing = JSON.parse(storage.getItem('user') || '{}');
        storage.setItem('user', JSON.stringify({ ...existing, ...fresh }));
        reconcileActiveSponsor();
    } catch (err) {
        console.error('Failed to refresh user after leaving org:', err);
    }
}

async function updateField(userId, field, value) {
    try {
        const response = await fetch('/api/user', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId, field, value }),
        });
        if (response.ok) {
            console.log('Field updated successfully');
        } else {
            console.error('Failed to update field');
        }
        
        if (localStorage.getItem('user')) {
            const updatedUser = { ...JSON.parse(localStorage.getItem('user')), [field]: value };
            localStorage.setItem('user', JSON.stringify(updatedUser));
        }
        else {
            const updatedUser = { ...JSON.parse(sessionStorage.getItem('user')), [field]: value };
            sessionStorage.setItem('user', JSON.stringify(updatedUser));
        }
    } catch (error) {
        console.error('Error updating field:', error);
        throw error;
    }
}
async function dropDriver(driverId, dropReason) {
    try {
        const response = await fetch('/api/driver/drop', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({driverId, drop_reason: dropReason || null}),
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error dropping driver:', error);
        throw error;
    }
}

async function archiveDriver(driverId, orgId) {
    try {
        const response = await fetch(`/api/driver/${driverId}/archive`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orgId }),
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error archiving driver:', error);
        throw error;
    }
}

async function signUpUser(userData, userRole) {
    console.log(userData);
    try {
        const response = await fetch('/api/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({...userData, userRole}),
        });
        if (!response.ok) {
            throw new Error(`Failed to sign up user: ${response.status}`);
        }
        return "success"
    } catch (error) {
        console.error('Error signing up user:', error);
        throw error;
    }
}

// Fetches the latest user data from the DB, including current sponsor_org_id
async function fetchUserData(user_id) {
    try {
        const response = await fetch(`/api/user/${user_id}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.user;
    } catch (error) {
        console.error('Error fetching user data:', error);
        throw error;
    }
}

async function importOrganizationUsersFromCsv(orgId, requestingUserId, userRole, csvText) {
    try {
        // The backend validates both the acting user and the target org before importing.
        const response = await fetch(`/api/organization/${orgId}/users/import`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ requestingUserId, userRole, csvText }),
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to import users');
        }

        return data;
    } catch (error) {
        console.error('Error importing organization users from CSV:', error);
        throw error;
    }
}

async function importUsersFromPipeFile(orgId, requestingUserId, fileText) {
    try {
        const url = orgId
            ? `/api/organization/${orgId}/users/bulk-import`
            : '/api/admin/users/bulk-import';
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestingUserId, fileText }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to import users');
        return data;
    } catch (error) {
        console.error('Error in bulk upload:', error);
        throw error;
    }
}

export { removeFromOrganization, updateField, signUpUser, dropDriver, archiveDriver, fetchUserData, importOrganizationUsersFromCsv, importUsersFromPipeFile };
