async function startImpersonation(targetUserId) {
    const alreadyImpersonating = localStorage.getItem('impersonation_original_user');
    const currentUser = localStorage.getItem('user') || sessionStorage.getItem('user');

    // Only stash if not already impersonating — preserve the REAL original user
    if (!alreadyImpersonating && currentUser) {
        localStorage.setItem('impersonation_original_user', currentUser);
    }

    // Always send the real original user's ID, not the impersonated user's
    const originalData = alreadyImpersonating || currentUser;
    const actorUserId = originalData ? JSON.parse(originalData).user_id : null;
    const response = await fetch('/api/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, actorUserId }),
    });

    if (!response.ok) {
        // Only remove stash if we just created it (not if it already existed)
        if (!alreadyImpersonating) {
            localStorage.removeItem('impersonation_original_user');
        }
        const data = await response.json();
        throw new Error(data.error || 'Failed to start impersonation');
    }

    const data = await response.json();
    // Swap localStorage user to the impersonated user
    localStorage.setItem('user', JSON.stringify(data.user));
    // Trigger re-render across the app
    window.dispatchEvent(new Event('authStateChanged'));
    return data;
}

async function exitImpersonation() {
    // Send the original (real) user's ID so the server knows who is exiting
    const originalUser = localStorage.getItem('impersonation_original_user');
    const actorUserId = originalUser ? JSON.parse(originalUser).user_id : null;
    const response = await fetch('/api/impersonate/exit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorUserId }),
    });
    if (!response.ok) {
        throw new Error('Failed to exit impersonation');
    }

    const data = await response.json();

    // Restore original user
    const original = localStorage.getItem('impersonation_original_user');
    if (original) {
        localStorage.setItem('user', original);
        localStorage.removeItem('impersonation_original_user');
    } else if (data.user) {
        localStorage.setItem('user', JSON.stringify(data.user));
    }

    window.dispatchEvent(new Event('authStateChanged'));
    return data;
}

export { startImpersonation, exitImpersonation };
