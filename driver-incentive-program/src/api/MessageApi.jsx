async function sendMessage({sender_id, recipient_id, sponsor_org_id, message_type, message_subject, body}) {
    try {
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ sender_id, recipient_id, sponsor_org_id, message_type, message_subject, body }),
        });
        const data = await response.json();
        if(!response.ok) throw new Error(data.error || 'Failed to send message');
        return data;
    } catch (error) {
        console.error('Error sending message:', error);
        throw error;
    }
}

async function fetchAnnouncements(userId) {
    try {
        const response = await fetch(`/api/messages/announcements/${userId}`);
        const data = await response.json();
        return data.messages || [];
    } catch (error) {
        console.error('Error fetching announcements:', error);
        return [];
    }
}

async function fetchOrgChat(sponsorOrgId) {
    try {
        const response = await fetch(`/api/messages/org/chat/${sponsorOrgId}`);
        const data = await response.json();
        return data.messages || [];
    } catch (error) {
        console.error('Error fetching org chat:', error);
        return [];
    }
}

async function fetchThread(userId, otherUserId) {
    try {
        const response = await fetch(`/api/messages/thread/${userId}/${otherUserId}`);
        const data = await response.json();
        return data.messages || [];
    } catch (error) {
        console.error('Error fetching thread:', error);
        return [];
    }
}

async function markMessageRead(messageId) {
    try {
        await fetch(`/api/messages/${messageId}/read`, {method: 'PUT'});
    } catch (error) {
        console.error('Error marking message read:', error);
    }
}

async function fetchOrgDrivers(sponsorUserId) {
    try {
        const response = await fetch(`/api/messages/org/drivers/${sponsorUserId}`);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching org drivers:', error);
        return { drivers: [], sponsor_org_id: null };
    }
}

async function fetchMySponsorUsers(driverUserId) {
    try {
        const response = await fetch(`/api/messages/sponsor/${driverUserId}`);
        const data = await response.json();
        return data.sponsors || [];
    } catch (error) {
        console.error('Error fetching sponsor users:', error);
        return [];
    }
}

export {sendMessage, fetchAnnouncements, fetchOrgChat, fetchThread, markMessageRead, fetchOrgDrivers, fetchMySponsorUsers};