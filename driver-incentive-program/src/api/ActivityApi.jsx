async function fetchDriverActivity(orgId, dateRange) {
    try {
        const response = await fetch(`/api/admin/driver-activity?orgId=${orgId}&dateRange=${JSON.stringify(dateRange)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch driver activity');
        }
        const data = await response.json();
        return data.drivers || [];
    } catch (error) {
        console.error('Error fetching driver activity:', error);
        throw error;
    }
}

async function fetchSponsorActivity(dateRange) {
    try {
        const response = await fetch(`/api/admin/sponsor-activity?dateRange=${JSON.stringify(dateRange)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch sponsor activity');
        }
        const data = await response.json();
        return data.orgs || [];
    } catch (error) {
        console.error('Error fetching sponsor activity:', error);
        throw error;
    }
}

export { fetchDriverActivity, fetchSponsorActivity };
