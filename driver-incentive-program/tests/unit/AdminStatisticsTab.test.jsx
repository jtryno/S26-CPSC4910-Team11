import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminStatisticsTab from '../../src/Pages/Reports/AdminReport/AdminStatisticsTab';

global.fetch = vi.fn();

const makeStats = (overrides = {}) => ({
    users: {
        total_users: 21,
        total_drivers: 13,
        total_sponsors: 6,
        total_admins: 2,
        active_users: 18,
        inactive_users: 3,
    },
    organizations: { total_orgs: 4 },
    orders: {
        total_orders: 50,
        placed_orders: 11,
        shipped_orders: 15,
        delivered_orders: 17,
        canceled_orders: 7,
        total_points_spent: 5000,
    },
    catalog: { total_catalog_items: 30 },
    tickets: { total_tickets: 8, open_tickets: 9, resolved_tickets: 5 },
    generated_at: '2026-04-16T12:00:00.000Z',
    ...overrides,
});

const mockSuccess = (stats = makeStats()) =>
    fetch.mockResolvedValueOnce({ ok: true, json: async () => stats });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe('AdminStatisticsTab', () => {
    it('shows loading message while fetch is pending', () => {
        fetch.mockReturnValue(new Promise(() => {}));

        render(<AdminStatisticsTab />);

        expect(screen.getByText(/Loading statistics/i)).toBeInTheDocument();
    });

    it('renders the Statistics heading after load', async () => {
        mockSuccess();

        render(<AdminStatisticsTab />);

        await waitFor(() => {
            expect(screen.getByText('System Statistics')).toBeInTheDocument();
        });
    });

    it('displays total users count', async () => {
        mockSuccess();

        render(<AdminStatisticsTab />);

        await waitFor(() => {
            expect(screen.getByText('21')).toBeInTheDocument();
        });
    });

    it('displays total drivers count', async () => {
        mockSuccess();

        render(<AdminStatisticsTab />);

        await waitFor(() => {
            expect(screen.getByText('13')).toBeInTheDocument();
        });
    });

    it('displays total orgs count', async () => {
        mockSuccess();

        render(<AdminStatisticsTab />);

        await waitFor(() => {
            expect(screen.getByText('4')).toBeInTheDocument();
        });
    });

    it('displays total orders count', async () => {
        mockSuccess();

        render(<AdminStatisticsTab />);

        await waitFor(() => {
            expect(screen.getByText('50')).toBeInTheDocument();
        });
    });

    it('displays total catalog items count', async () => {
        mockSuccess();

        render(<AdminStatisticsTab />);

        await waitFor(() => {
            expect(screen.getByText('30')).toBeInTheDocument();
        });
    });

    it('displays open tickets count', async () => {
        mockSuccess();

        render(<AdminStatisticsTab />);

        await waitFor(() => {
            // 9 is unique across all stat card values in the mock
            expect(screen.getByText('9')).toBeInTheDocument();
        });
    });

    it('shows an error message when the API fails', async () => {
        fetch.mockResolvedValueOnce({ ok: false });

        render(<AdminStatisticsTab />);

        await waitFor(() => {
            expect(screen.getByText(/Error:/i)).toBeInTheDocument();
        });
    });

    it('shows the generated_at timestamp', async () => {
        mockSuccess();

        render(<AdminStatisticsTab />);

        await waitFor(() => {
            expect(screen.getByText(/Last updated/i)).toBeInTheDocument();
        });
    });

    it('calls fetch again when Refresh is clicked', async () => {
        mockSuccess();
        mockSuccess(); // second call on refresh

        render(<AdminStatisticsTab />);

        await waitFor(() => screen.getByText('System Statistics'));

        fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledTimes(2);
        });
    });

    it('fetches from /api/admin/statistics', async () => {
        mockSuccess();

        render(<AdminStatisticsTab />);

        await waitFor(() => screen.getByText('System Statistics'));

        expect(fetch).toHaveBeenCalledWith('/api/admin/statistics');
    });
});
