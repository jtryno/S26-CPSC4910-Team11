import {render, screen, waitFor, fireEvent} from '@testing-library/react';
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import Notifications from '../../src/Pages/Notifications';

vi.mock('../../src/api/NotificationApi', () => ({
    fetchNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    fetchNotificationPreferences: vi.fn(),
    updateNotificationPreferences: vi.fn(),
}));

import {
    fetchNotifications,
    markNotificationRead,
    markAllNotificationsRead,
    fetchNotificationPreferences,
    updateNotificationPreferences,
} from '../../src/api/NotificationApi';


const mockDriverUser = {user_id: 1, user_type: 'driver'};
const mockSponsorUser = {user_id: 2, user_type: 'sponsor'};

const makeNotification = (overrides = {}) => ({
    notification_id: 1,
    category: 'points_changed',
    message: 'You earned 100 points.',
    created_at: '2026-01-01T12:00:00Z',
    read_at: null,
    ...overrides,
});

const defaultPrefs = {points_changed_enabled: 1, order_placed_enabled: 1};

const setUser = (user) => localStorage.setItem('user', JSON.stringify(user));


beforeEach(() => {
    vi.clearAllMocks();
    fetchNotifications.mockResolvedValue([]);
    fetchNotificationPreferences.mockResolvedValue(defaultPrefs);
    markNotificationRead.mockResolvedValue({});
    markAllNotificationsRead.mockResolvedValue({});
    updateNotificationPreferences.mockResolvedValue({});
});

afterEach(() => {
    localStorage.clear();
});


describe('No notifications', () => {
    it('shows "No notifications yet" when list is empty', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.getByText(/No notifications yet/i)).toBeInTheDocument();
        });
    });

    it('shows "Caught Up" when no unread msgs', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([makeNotification({read_at: '2026-03-05T00:00:00Z'})]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.getByText(/Caught Up/i)).toBeInTheDocument();
        });
    });
});


describe('testing notifications', () => {
    it('test notification message', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([makeNotification({message: 'You earned 2500 points.'})]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.getByText('You earned 2500 points.')).toBeInTheDocument();
        });
    });

    it('test several notification messages', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([
            makeNotification({notification_id: 1, message: 'First notification'}),
            makeNotification({notification_id: 2, message: 'Second notification'}),
            makeNotification({notification_id: 3, message: 'Third notification'}),
        ]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.getByText('First notification')).toBeInTheDocument();
            expect(screen.getByText('Second notification')).toBeInTheDocument();
            expect(screen.getByText('Third notification')).toBeInTheDocument();
        });
    });

    it('shows the unread count and mark read option when there are unread notifications', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([
            makeNotification({notification_id: 1}),
            makeNotification({notification_id: 2}),
        ]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.getByText('2 unread')).toBeInTheDocument();
            expect(screen.getAllByText(/Mark read/i).length).toBeGreaterThan(0);

        });
    });


    it('does not show "Mark read" on already-read cards', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([makeNotification({read_at: '2026-03-05T00:00:00Z'})]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.queryByText(/Mark read/i)).not.toBeInTheDocument();
        });
    });
});


describe('Mark read tests', () => {
    it('calls markNotificationRead when an unread card is clicked', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([makeNotification({notification_id: 42, read_at: null})]);

        render(<Notifications/>);
        await waitFor(() => screen.getByText('You earned 100 points.'));

        fireEvent.click(screen.getByText('You earned 100 points.'));
        expect(markNotificationRead).toHaveBeenCalledWith(42);
    });

    it('does not call markNotificationRead when a read card is clicked', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([makeNotification({read_at: '2026-03-05T00:00:00Z'})]);

        render(<Notifications/>);
        await waitFor(() => screen.getByText('You earned 100 points.'));

        fireEvent.click(screen.getByText('You earned 100 points.'));
        expect(markNotificationRead).not.toHaveBeenCalled();
    });

    it('shows "Mark all read" button only when there are unread notifications', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([makeNotification({read_at: null})]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.getByRole('button', {name: /Mark all read/i})).toBeInTheDocument();
        });
    });

    it('calls markAllNotificationsRead when "Mark all read" is clicked', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([makeNotification({read_at: null})]);

        render(<Notifications/>);
        await waitFor(() => screen.getByRole('button', {name: /Mark all read/i}));

        fireEvent.click(screen.getByRole('button', {name: /Mark all read/i}));
        expect(markAllNotificationsRead).toHaveBeenCalledWith(mockDriverUser.user_id);
    });
});


describe('notification page different portion tests', () => {
    it('shows all notifications on the "all" tab', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([
            makeNotification({notification_id: 1, message: 'Unread notif', read_at: null}),
            makeNotification({notification_id: 2, message: 'Read notif', read_at: '2026-03-05T00:00:00Z'}),
        ]);

        render(<Notifications/>);
        await waitFor(() => screen.getByText('Unread notif'));

        expect(screen.getByText('Unread notif')).toBeInTheDocument();
        expect(screen.getByText('Read notif')).toBeInTheDocument();
    });

    it('shows only unread notifications on the "unread" tab', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([
            makeNotification({notification_id: 1, message: 'Unread notif', read_at: null}),
            makeNotification({notification_id: 2, message: 'Read notif', read_at: '2026-03-05T00:00:00Z'}),
        ]);

        render(<Notifications/>);
        await waitFor(() => screen.getByText('Unread notif'));

        fireEvent.click(screen.getByRole('button', {name: /unread/i}));

        await waitFor(() => {
            expect(screen.getByText('Unread notif')).toBeInTheDocument();
            expect(screen.queryByText('Read notif')).not.toBeInTheDocument();
        });
    });

    it('shows "No unread notifications" message on unread tab when all are read', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([
            makeNotification({read_at: '2026-03-05T00:00:00Z'}),
        ]);

        render(<Notifications/>);
        await waitFor(() => screen.getByText('You earned 100 points.'));
        fireEvent.click(screen.getByRole('button', {name: /unread/i}));

        await waitFor(() => {
            expect(screen.getByText(/No unread notifications/i)).toBeInTheDocument();
        });
    });
});


describe('Notification preferences', () => {
    it('renders the preferences panel for drivers', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.getByText(/Notification Preferences/i)).toBeInTheDocument();
        });
    });

    it('does not render the preferences panel for sponsors', async () => {
        setUser(mockSponsorUser);
        fetchNotifications.mockResolvedValue([]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.queryByText(/Notification Preferences/i)).not.toBeInTheDocument();
        });
    });

    it('calls updateNotificationPreferences when a toggle is clicked', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([]);
        fetchNotificationPreferences.mockResolvedValue({points_changed_enabled: 1, order_placed_enabled: 1});

        render(<Notifications />);
        await waitFor(() => screen.getByText(/Points added or removed/i));

        const toggleBtns = screen.getAllByRole('button', {name: /Enabled|Disabled/i});
        fireEvent.click(toggleBtns[0]);

        expect(updateNotificationPreferences).toHaveBeenCalledWith(mockDriverUser.user_id, expect.objectContaining({points_changed_enabled: 0}));
    });

    it('calls updateNotificationPreferences for all prefs when "Disable All" is clicked', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([]);
        fetchNotificationPreferences.mockResolvedValue({points_changed_enabled: 1, order_placed_enabled: 1});

        render(<Notifications/>);
        await waitFor(() => screen.getByRole('button', {name: /Disable All/i}));

        fireEvent.click(screen.getByRole('button', {name: /Disable All/i}));

        expect(updateNotificationPreferences).toHaveBeenCalledWith(mockDriverUser.user_id, {points_changed_enabled: 0, order_placed_enabled: 0});
    });

    it('shows "Enable All" when all prefs are disabled', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([]);
        fetchNotificationPreferences.mockResolvedValue({points_changed_enabled: 0, order_placed_enabled: 0});

        render(<Notifications/>);
        await waitFor(() => {
            expect(screen.getByRole('button', {name: /Enable All/i})).toBeInTheDocument();
        });
    });

    it('shows mandatory labels for required notification types', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([]);

        render(<Notifications/>);
        await waitFor(() => screen.getByText(/Notification Preferences/i));

        expect(screen.getAllByText('Required').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Always On').length).toBeGreaterThan(0);
    });
});


describe('notifications misc', () => {
    it('fetches notifications user when page opens', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(fetchNotifications).toHaveBeenCalledWith(mockDriverUser.user_id);
        });
    });

    it('gets prefs when page opens', async () => {
        setUser(mockDriverUser);
        fetchNotifications.mockResolvedValue([]);

        render(<Notifications/>);
        await waitFor(() => {
            expect(fetchNotificationPreferences).toHaveBeenCalledWith(mockDriverUser.user_id);
        });
    });

    it('does not get prefs for non-driver users', async () => {
        setUser(mockSponsorUser);
        fetchNotifications.mockResolvedValue([]);

        render(<Notifications/>);
        await waitFor(() => expect(fetchNotifications).toHaveBeenCalled());
        expect(fetchNotificationPreferences).not.toHaveBeenCalled();
    });
});