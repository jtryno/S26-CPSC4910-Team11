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

export { removeFromOrganization, updateField };