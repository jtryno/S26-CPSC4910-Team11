import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ImpersonationBanner from '../../src/components/ImpersonationBanner';

// Mock the API module
vi.mock('../../src/api/ImpersonationApi', () => ({
    exitImpersonation: vi.fn(),
}));

import { exitImpersonation } from '../../src/api/ImpersonationApi';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual('react-router-dom');
    return { ...actual, useNavigate: () => mockNavigate };
});

const adminUser = { user_id: 1, username: 'admin1', user_type: 'admin' };
const driverUser = { user_id: 3, username: 'driver1', user_type: 'driver' };
const sponsorUser = { user_id: 2, username: 'sponsor1', user_type: 'sponsor' };

const renderBanner = () => render(
    <MemoryRouter>
        <ImpersonationBanner />
    </MemoryRouter>
);

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
});

afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    document.body.classList.remove('impersonating');
});

describe('ImpersonationBanner visibility', () => {
    it('does not render when not impersonating', () => {
        localStorage.setItem('user', JSON.stringify(adminUser));
        renderBanner();
        expect(screen.queryByText(/Viewing as/i)).not.toBeInTheDocument();
    });

    it('renders when impersonation is active', () => {
        localStorage.setItem('impersonation_original_user', JSON.stringify(adminUser));
        localStorage.setItem('user', JSON.stringify(driverUser));
        renderBanner();
        expect(screen.getByText(/Viewing as/i)).toBeInTheDocument();
        expect(screen.getByText('driver1')).toBeInTheDocument();
        // The role text is split across text nodes, so check the container
        expect(screen.getByText(/Viewing as/i).textContent).toContain('driver');
    });

    it('shows target username and role', () => {
        localStorage.setItem('impersonation_original_user', JSON.stringify(adminUser));
        localStorage.setItem('user', JSON.stringify(sponsorUser));
        renderBanner();
        expect(screen.getByText('sponsor1')).toBeInTheDocument();
    });
});

describe('ImpersonationBanner body class', () => {
    it('adds "impersonating" class to body when active', () => {
        localStorage.setItem('impersonation_original_user', JSON.stringify(adminUser));
        localStorage.setItem('user', JSON.stringify(driverUser));
        renderBanner();
        expect(document.body.classList.contains('impersonating')).toBe(true);
    });

    it('does not add class when not impersonating', () => {
        localStorage.setItem('user', JSON.stringify(adminUser));
        renderBanner();
        expect(document.body.classList.contains('impersonating')).toBe(false);
    });
});

describe('Exit impersonation', () => {
    it('calls exitImpersonation and navigates on click', async () => {
        exitImpersonation.mockResolvedValue({ user: adminUser });
        localStorage.setItem('impersonation_original_user', JSON.stringify(adminUser));
        localStorage.setItem('user', JSON.stringify(driverUser));

        renderBanner();
        fireEvent.click(screen.getByRole('button', { name: /Exit Impersonation/i }));

        expect(screen.getByText(/Exiting/i)).toBeInTheDocument();

        await waitFor(() => {
            expect(exitImpersonation).toHaveBeenCalledTimes(1);
            expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
        });
    });

    it('re-enables the button if exit fails', async () => {
        exitImpersonation.mockRejectedValue(new Error('Network error'));
        localStorage.setItem('impersonation_original_user', JSON.stringify(adminUser));
        localStorage.setItem('user', JSON.stringify(driverUser));

        renderBanner();
        fireEvent.click(screen.getByRole('button', { name: /Exit Impersonation/i }));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Exit Impersonation/i })).not.toBeDisabled();
        });
    });
});

describe('ImpersonationBanner reacts to authStateChanged', () => {
    it('updates when impersonation starts via event', async () => {
        localStorage.setItem('user', JSON.stringify(adminUser));
        renderBanner();
        expect(screen.queryByText(/Viewing as/i)).not.toBeInTheDocument();

        // Simulate impersonation starting
        localStorage.setItem('impersonation_original_user', JSON.stringify(adminUser));
        localStorage.setItem('user', JSON.stringify(driverUser));
        window.dispatchEvent(new Event('authStateChanged'));

        await waitFor(() => {
            expect(screen.getByText(/Viewing as/i)).toBeInTheDocument();
            expect(screen.getByText('driver1')).toBeInTheDocument();
        });
    });

    it('resets exiting state when impersonation changes', async () => {
        exitImpersonation.mockImplementation(() => new Promise(() => {})); // never resolves
        localStorage.setItem('impersonation_original_user', JSON.stringify(adminUser));
        localStorage.setItem('user', JSON.stringify(driverUser));

        renderBanner();
        fireEvent.click(screen.getByRole('button', { name: /Exit Impersonation/i }));
        expect(screen.getByText(/Exiting/i)).toBeInTheDocument();

        // Simulate a new impersonation starting (e.g. chained)
        localStorage.setItem('user', JSON.stringify(sponsorUser));
        window.dispatchEvent(new Event('authStateChanged'));

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Exit Impersonation/i })).not.toBeDisabled();
        });
    });
});
