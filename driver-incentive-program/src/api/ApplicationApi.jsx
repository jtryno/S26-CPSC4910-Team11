async function createApplication(user_id, org_id) {
    try {
        const response = await fetch('/api/driver/application', {
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

async function checkApplicationStatus(user_id) {
    try {
        const response = await fetch(`/api/driver/application?user_id=${user_id}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.status;
    } catch (error) {
        console.error('Error checking existing application:', error);
        throw error;
    }
}

export { createApplication, checkApplicationStatus };