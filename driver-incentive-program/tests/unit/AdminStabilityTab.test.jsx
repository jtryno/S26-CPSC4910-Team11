import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import AdminStabilityTab from '../../src/Pages/Reports/AdminReport/AdminStabilityTab';

global.fetch = vi.fn();

const makeError = (overrides = {}) => ({
    error_id: 1,
    route: '/api/catalog/org/1',
    method: 'GET',
    status_code: 500,
    message: 'DB connection lost',
    stack_trace: 'Error: DB connection lost\n    at Object.<anonymous>',
    occurred_at: '2026-04-01T10:00:00.000Z',
    ...overrides,
});

const mockSuccess = (errors = [], total = errors.length) =>
    fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ errors, total, limit: 25, offset: 0 }),
    });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.clearAllMocks());

describe('AdminStabilityTab', () => {
    it('shows loading message while fetch is pending', () => {
        fetch.mockReturnValue(new Promise(() => {}));

        render(<AdminStabilityTab />);

        expect(screen.getByText(/Loading error log/i)).toBeInTheDocument();
    });

    it('renders the page heading after load', async () => {
        mockSuccess();

        render(<AdminStabilityTab />);

        await waitFor(() => {
            expect(screen.getByText(/System Stability/i)).toBeInTheDocument();
        });
    });

    it('shows "No errors recorded" when the log is empty', async () => {
        mockSuccess([], 0);

        render(<AdminStabilityTab />);

        await waitFor(() => {
            expect(screen.getByText(/No errors recorded/i)).toBeInTheDocument();
        });
    });

    it('renders a row for each error returned', async () => {
        mockSuccess([
            makeError({ error_id: 1 }),
            makeError({ error_id: 2, route: '/api/orders' }),
        ], 2);

        render(<AdminStabilityTab />);

        await waitFor(() => {
            // Both route cells should be visible
            expect(screen.getAllByText('/api/catalog/org/1').length).toBeGreaterThan(0);
            expect(screen.getByText('/api/orders')).toBeInTheDocument();
        });
    });

    it('displays the HTTP method for each error', async () => {
        mockSuccess([makeError({ method: 'POST' })]);

        render(<AdminStabilityTab />);

        await waitFor(() => {
            expect(screen.getByText('POST')).toBeInTheDocument();
        });
    });

    it('displays the status code for each error', async () => {
        mockSuccess([makeError({ status_code: 404 })]);

        render(<AdminStabilityTab />);

        await waitFor(() => {
            expect(screen.getByText('404')).toBeInTheDocument();
        });
    });

    it('displays the error message for each row', async () => {
        mockSuccess([makeError({ message: 'Something broke' })]);

        render(<AdminStabilityTab />);

        await waitFor(() => {
            expect(screen.getByText('Something broke')).toBeInTheDocument();
        });
    });

    it('shows a View button when a stack trace exists', async () => {
        mockSuccess([makeError()]);

        render(<AdminStabilityTab />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /View/i })).toBeInTheDocument();
        });
    });

    it('toggles stack trace visibility when View/Hide is clicked', async () => {
        mockSuccess([makeError()]);

        render(<AdminStabilityTab />);

        await waitFor(() => screen.getByRole('button', { name: /View/i }));

        // Before expanding, the stack trace pre block should not be present
        expect(screen.queryByRole('code')).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /View/i }));

        await waitFor(() => {
            // After expanding, the stack trace text unique to the <pre> block is visible
            expect(screen.getByText(/at Object\.<anonymous>/)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Hide/i })).toBeInTheDocument();
        });

        fireEvent.click(screen.getByRole('button', { name: /Hide/i }));

        await waitFor(() => {
            expect(screen.queryByText(/at Object\.<anonymous>/)).not.toBeInTheDocument();
            expect(screen.getByRole('button', { name: /View/i })).toBeInTheDocument();
        });
    });

    it('shows an error message when the API call fails', async () => {
        fetch.mockResolvedValueOnce({ ok: false });

        render(<AdminStabilityTab />);

        await waitFor(() => {
            expect(screen.getByText(/Failed to load error log/i)).toBeInTheDocument();
        });
    });

    it('calls fetch again when Refresh is clicked', async () => {
        mockSuccess();
        mockSuccess(); // second call

        render(<AdminStabilityTab />);

        await waitFor(() => screen.getByText(/System Stability/i));

        fireEvent.click(screen.getByRole('button', { name: /Refresh/i }));

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledTimes(2);
        });
    });

    it('fetches from /api/admin/errors', async () => {
        mockSuccess();

        render(<AdminStabilityTab />);

        await waitFor(() => screen.getByText(/System Stability/i));

        expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/admin/errors'));
    });

    it('shows pagination controls when there are multiple pages', async () => {
        // total=30 with page size 25 → 2 pages
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                errors: Array.from({ length: 25 }, (_, i) => makeError({ error_id: i + 1 })),
                total: 30,
                limit: 25,
                offset: 0,
            }),
        });

        render(<AdminStabilityTab />);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Next/i })).toBeInTheDocument();
            expect(screen.getByRole('button', { name: /Previous/i })).toBeInTheDocument();
        });
    });

    it('Previous button is disabled on first page', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ errors: [makeError()], total: 30, limit: 25, offset: 0 }),
        });

        render(<AdminStabilityTab />);

        await waitFor(() => screen.getByRole('button', { name: /Previous/i }));

        expect(screen.getByRole('button', { name: /Previous/i })).toBeDisabled();
    });
});
