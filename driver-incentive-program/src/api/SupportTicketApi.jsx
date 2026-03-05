// creates new support ticket for driver or sponsor
// sends the user id, their org (if they have one), title, and description to backend
async function createTicket(userId, sponsorOrgId, title, description) {
    try {
        const response = await fetch('/api/support-tickets', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId, sponsorOrgId, title, description }),
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error creating support ticket:', error);
        throw error;
    }
}

// gets all tickets submitted by a specific user
// used in the driver/sponsor view to show their own tickets
async function fetchTicketsForUser(userId) {
    try {
        const response = await fetch(`/api/support-tickets/user/${userId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.tickets;
    } catch (error) {
        console.error('Error fetching user support tickets:', error);
        throw error;
    }
}

// gets every support ticket in the system (admin only)
// returns ticket info plus the submitter name, email, and org from a JOIN
async function fetchAllTickets() {
    try {
        const response = await fetch('/api/support-tickets', {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.tickets;
    } catch (error) {
        console.error('Error fetching all support tickets:', error);
        throw error;
    }
}

// updates the status of a ticket (open, in_progress, or resolved)
// only admins trigger this - called when they click Mark In Progress or Mark Resolved
async function updateTicketStatus(ticketId, status) {
    try {
        const response = await fetch(`/api/support-tickets/${ticketId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status }),
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating support ticket status:', error);
        throw error;
    }
}

// gets all open nonarchived tickets for a sponsor org (used in the sponsor driver tickets)
async function fetchOrgTickets(sponsorOrgId) {
    try {
        const response = await fetch(`/api/support-tickets/org/${sponsorOrgId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.tickets;
    } catch (error) {
        console.error('Error fetching org support tickets:', error);
        throw error;
    }
}

// updates the description of a ticket the user owns (only works when status is open)
async function updateTicketDescription(ticketId, description, userId) {
    try {
        const response = await fetch(`/api/support-tickets/${ticketId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description, userId }),
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error updating support ticket:', error);
        throw error;
    }
}

// archives a ticket so it no longer shows in driver/sponsor views
// drivers and sponsors can only archive their own
async function archiveTicket(ticketId, userId, userType) {
    try {
        const response = await fetch(`/api/support-tickets/${ticketId}/archive`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, userType }),
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error archiving support ticket:', error);
        throw error;
    }
}

// gets all comments for a ticket ordered oldest first
async function fetchTicketComments(ticketId) {
    try {
        const response = await fetch(`/api/ticket-comments/${ticketId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });
        const data = await response.json();
        return data.comments;
    } catch (error) {
        console.error('Error fetching ticket comments:', error);
        throw error;
    }
}

// adds a comment to a ticket and returns the comment with user info
async function addTicketComment(ticketId, userId, body) {
    try {
        const response = await fetch('/api/ticket-comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket_id: ticketId, user_id: userId, body }),
        });
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error adding ticket comment:', error);
        throw error;
    }
}

export {
    createTicket,
    fetchTicketsForUser,
    fetchAllTickets,
    updateTicketStatus,
    fetchOrgTickets,
    updateTicketDescription,
    archiveTicket,
    fetchTicketComments,
    addTicketComment,
};
