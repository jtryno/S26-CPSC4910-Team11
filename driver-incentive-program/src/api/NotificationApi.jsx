async function fetchNotifications(userId) {
    try {
        const response = await fetch(`/api/notifications/${userId}`);
        const data = await response.json();
        return data.notifications || [];
    } catch (error) {
        console.error('Error fetching notifications:', error);
        return [];
    }
}

async function markNotificationRead(notificationId) {
    try {
        await fetch(`/api/notifications/${notificationId}/read`, {method: 'PUT'});
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function markAllNotificationsRead(userId) {
    try {
        await fetch(`/api/notifications/user/${userId}/read-all`, {method: 'PUT'});
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
    }
}

async function fetchNotificationPreferences(userId) {
    try {
        const response = await fetch(`/api/notifications/preferences/${userId}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching notification preferences:', error);
        return {points_changed_enabled: 1, order_placed_enabled: 1};
    }
}

async function updateNotificationPreferences(userId, prefs) {
    try {
        const response = await fetch(`/api/notifications/preferences/${userId}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(prefs),
        });
        return response.ok;
    } catch (error) {
        console.error('Error updating notification preferences:', error);
        return false;
    }
}

export {fetchNotifications, markNotificationRead, markAllNotificationsRead, fetchNotificationPreferences, updateNotificationPreferences};