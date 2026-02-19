async function removeFromOrganization(userId) {
    try {
        const response = await fetch('/api/user', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ user_id: userId, field: 'sponsor_org_id', value: null }),
        });
    } catch (error) {
        console.error('Error leaving organization:', error);
        throw error;
    }

    if (localStorage.getItem('user')) {
        const updatedUser = { ...JSON.parse(localStorage.getItem('user')), sponsor_org_id: null };
        localStorage.setItem('user', JSON.stringify(updatedUser));
    }
    else {
        const updatedUser = { ...JSON.parse(sessionStorage.getItem('user')), sponsor_org_id: null };
        sessionStorage.setItem('user', JSON.stringify(updatedUser));
    }
}

export { removeFromOrganization };