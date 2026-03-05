import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SponsorPurchaseModal from '../../src/Pages/Organization/OrganizationSummary/SponsorPurchaseModal';

global.fetch = vi.fn();

const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    driver: { user_id: 10, username: 'testdriver' },
    orgId: 3,
    sponsorUserId: 99,
};

const makeCatalogItem = (overrides = {}) => ({
    item_id: 1,
    title: 'Catalog Reward',
    last_price_value: '20.00',
    points_price: 400,
    image_url: null,
    availability_status: 'in_stock',
    ...overrides,
});

/**
 * Mock the three parallel init calls:
 *   1. GET /api/catalog/org/:orgId
 *   2. POST /api/cart
 *   3. GET /api/cart/:cartId  (fetchCart)
 *   4. GET /api/driver/points/:id  (fetchBalance)
 */
const mockInit = (catalogItems = [], cartItems = [], balance = 2000) => {
    fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: catalogItems }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ cart_id: 7 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: cartItems }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ total_points: balance }) });
};

describe('SponsorPurchaseModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when isOpen is false', () => {
        render(<SponsorPurchaseModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByText(/Purchase for/i)).not.toBeInTheDocument();
    });

    it('shows the driver username in the modal header', async () => {
        mockInit();
        render(<SponsorPurchaseModal {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByText(/Purchase for testdriver/i)).toBeInTheDocument();
        });
    });

    it('displays the driver point balance', async () => {
        mockInit([], [], 1500);
        render(<SponsorPurchaseModal {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByText(/1,500 pts/i)).toBeInTheDocument();
        });
    });

    it('shows a loading indicator while fetching catalog', () => {
        fetch.mockReturnValue(new Promise(() => {}));
        render(<SponsorPurchaseModal {...defaultProps} />);

        expect(screen.getByText(/Loading catalog/i)).toBeInTheDocument();
    });

    it('renders catalog items after loading', async () => {
        mockInit([makeCatalogItem({ title: 'Cool Reward' })]);
        render(<SponsorPurchaseModal {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByText('Cool Reward')).toBeInTheDocument();
        });
        expect(screen.getByText(/400/)).toBeInTheDocument();
    });

    it('shows "No items in the catalog" when the catalog is empty', async () => {
        mockInit([]);
        render(<SponsorPurchaseModal {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByText(/No items in the catalog/i)).toBeInTheDocument();
        });
    });

    it('marks an out-of-stock item with disabled button', async () => {
        mockInit([makeCatalogItem({ availability_status: 'out_of_stock' })]);
        render(<SponsorPurchaseModal {...defaultProps} />);

        await waitFor(() => {
            expect(screen.getByText('Catalog Reward')).toBeInTheDocument();
        });

        expect(screen.getByRole('button', { name: /Out of Stock/i })).toBeDisabled();
    });

    it('calls onClose when the × button is clicked', async () => {
        const onClose = vi.fn();
        mockInit();
        render(<SponsorPurchaseModal {...defaultProps} onClose={onClose} />);

        await waitFor(() => expect(screen.queryByText(/Loading catalog/i)).not.toBeInTheDocument());

        screen.getByRole('button', { name: '×' }).click();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('fetches catalog for the correct org on open', async () => {
        mockInit();
        render(<SponsorPurchaseModal {...defaultProps} orgId={5} />);

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith('/api/catalog/org/5');
        });
    });

    it('creates a cart with the driver and sponsor org on open', async () => {
        mockInit();
        render(<SponsorPurchaseModal {...defaultProps} />);

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                '/api/cart',
                expect.objectContaining({
                    method: 'POST',
                    body: expect.stringContaining('"driverUserId":10'),
                })
            );
        });
    });
});
