async function fetchPasswordChangeLogs(org_id, dateRange) {
    try {
        const response = await fetch(`/api/logs/password-change-logs/${org_id}?dateRange=${JSON.stringify(dateRange)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch password change logs');
        }
        const data = await response.json();
        return data.logs || [];
    } catch (error) {
        console.error('Error fetching password change logs:', error);
        throw error;
    }
}

async function fetchLoginLogs(org_id, dateRange) {
    try {
        const response = await fetch(`/api/logs/login-attempt-logs/${org_id}?dateRange=${JSON.stringify(dateRange)}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error('Failed to fetch login attempt logs');
        }
        const data = await response.json();
        return data.logs || [];
    } catch (error) {
        console.error('Error fetching login attempt logs:', error);
        throw error;
    }
}

export { fetchPasswordChangeLogs, fetchLoginLogs };