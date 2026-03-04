import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Catalog from '../../src/Pages/Catalog';

// Mock the global fetch API
global.fetch = vi.fn();

// A driver user that belongs to sponsor org 7
const mockUser = { user_id: 42, sponsor_org_id: 7 };

/**
 * A minimal catalog item as returned by GET /api/catalog/org/:orgId.
 */
const makeCatalogItem = (overrides = {}) => ({
    item_id: 1,
    title: 'Test Reward Item',
    description: 'A great reward for drivers',
    last_price_value: '10.00',
    points_price: 1000,
    image_url: 'https://i.ebayimg.com/images/test.jpg',
    item_web_url: 'https://www.ebay.com/itm/123456',
    availability_status: 'in_stock',
    ...overrides,
});

/**
 * Sets up the four sequential fetch calls the component makes on mount:
 *   1. GET /api/catalog/org/:orgId  (parallel in Promise.all)
 *   2. POST /api/cart               (parallel in Promise.all)
 *   3. GET /api/cart/:cartId        (fetchCart after Promise.all)
 *   4. GET /api/driver/points/:id   (fetchBalance after Promise.all)
 */
const mockInitFetch = (catalogItems = []) => {
    fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: catalogItems }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ cart_id: 1 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ total_points: 500 }) });
};

describe('Catalog Page UI Component', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('user', JSON.stringify(mockUser));
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('shows a loading message initially', () => {
        // All fetches stay pending → loading state never clears
        fetch.mockReturnValue(new Promise(() => {}));

        render(<Catalog />);
        expect(screen.getByText(/Loading.../i)).toBeInTheDocument();
    });

    it('renders catalog items when fetch is successful', async () => {
        mockInitFetch([makeCatalogItem()]);

        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText('Test Reward Item')).toBeInTheDocument();
        });

        expect(screen.getByText('A great reward for drivers')).toBeInTheDocument();
        // Points price is shown as "1,000 pts" inside a <strong>
        expect(screen.getByText(/1,000 pts/)).toBeInTheDocument();
        // Image is proxied through /api/proxy-image
        expect(screen.getByAltText('Test Reward Item'))
            .toHaveAttribute('src', expect.stringContaining('/api/proxy-image'));
    });

    it('displays an error message when the API fetch fails', async () => {
        fetch
            .mockResolvedValueOnce({ ok: false })                                         // catalog fails
            .mockResolvedValueOnce({ ok: true, json: async () => ({ cart_id: 1 }) });    // cart (unused)

        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText(/Error: Failed to load catalog/i)).toBeInTheDocument();
        });
    });

    it('renders all items when multiple products are returned', async () => {
        mockInitFetch([
            makeCatalogItem({ item_id: 1, title: 'Item One' }),
            makeCatalogItem({ item_id: 2, title: 'Item Two' }),
            makeCatalogItem({ item_id: 3, title: 'Item Three' }),
        ]);

        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText('Item One')).toBeInTheDocument();
        });

        expect(screen.getByText('Item Two')).toBeInTheDocument();
        expect(screen.getByText('Item Three')).toBeInTheDocument();
        expect(screen.getAllByRole('listitem')).toHaveLength(3);
    });

    it('renders no list items when the catalog is empty', async () => {
        mockInitFetch([]);

        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText(/No items in the catalog yet/i)).toBeInTheDocument();
        });

        expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
    });

    it('fetches from the org catalog and cart endpoints on mount', () => {
        fetch.mockReturnValue(new Promise(() => {}));

        render(<Catalog />);

        expect(fetch).toHaveBeenCalledWith(`/api/catalog/org/${mockUser.sponsor_org_id}`);
        expect(fetch).toHaveBeenCalledWith('/api/cart', expect.objectContaining({ method: 'POST' }));
    });

    it('shows a message when the user has no sponsor organization', () => {
        localStorage.setItem('user', JSON.stringify({ user_id: 42 })); // no sponsor_org_id

        render(<Catalog />);

        expect(screen.getByText(/Join an organization/i)).toBeInTheDocument();
    });
});

// ---------------------------------------------------------------------------
// Order Review Modal
// ---------------------------------------------------------------------------

const makeCartItem = (overrides = {}) => ({
    item_id: 1,
    title: 'Test Cart Item',
    quantity: 1,
    points_price_at_add: 300,
    image_url: null,
    ...overrides,
});

/**
 * Init mocks where the cart already has items and the driver has enough balance.
 */
const mockInitFetchWithCart = (cartItems = [], balance = 5000) => {
    fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [makeCatalogItem()] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ cart_id: 1 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: cartItems }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ total_points: balance }) });
};

describe('Order Review Modal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('user', JSON.stringify(mockUser));
    });

    afterEach(() => {
        localStorage.clear();
    });

    /** Helper: load catalog+cart, open cart sidebar, click Checkout, wait for review modal */
    const openReviewModal = async () => {
        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());
        screen.getAllByRole('button', { name: /Cart/i })[0].click();
        await waitFor(() => expect(screen.getByRole('button', { name: /Checkout/i })).not.toBeDisabled());
        screen.getByRole('button', { name: /Checkout/i }).click();
        await waitFor(() => expect(screen.getByText(/Review Your Order/i)).toBeInTheDocument());
    };

    it('opens the review modal when Checkout is clicked', async () => {
        mockInitFetchWithCart([makeCartItem()]);
        render(<Catalog />);
        await openReviewModal();
        expect(screen.getByText(/Review Your Order/i)).toBeInTheDocument();
    });

    it('shows cart items in the review modal', async () => {
        mockInitFetchWithCart([makeCartItem({ title: 'Awesome Reward' })]);
        render(<Catalog />);
        await openReviewModal();
        expect(screen.getAllByText('Awesome Reward').length).toBeGreaterThan(0);
    });

    it('shows correct point total and remaining balance in the review modal', async () => {
        mockInitFetchWithCart([makeCartItem({ points_price_at_add: 300 })], 1000);
        render(<Catalog />);
        await openReviewModal();

        // "300 pts" appears in both cart sidebar and review modal total row
        expect(screen.getAllByText('300 pts').length).toBeGreaterThanOrEqual(1);
        // Remaining balance "700 pts" is unique to the review modal
        expect(screen.getByText('700 pts')).toBeInTheDocument();
    });

    it('closes the review modal when Back is clicked', async () => {
        mockInitFetchWithCart([makeCartItem()]);
        render(<Catalog />);
        await openReviewModal();

        screen.getByRole('button', { name: /Back/i }).click();

        await waitFor(() => {
            expect(screen.queryByText(/Review Your Order/i)).not.toBeInTheDocument();
        });
    });

    it('calls the orders API when Confirm Order is clicked', async () => {
        mockInitFetchWithCart([makeCartItem()]);
        render(<Catalog />);
        await openReviewModal();

        fetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({ order_id: 99, points_spent: 300 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ cart_id: 2 }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ total_points: 700 }) });

        screen.getByRole('button', { name: /Confirm Order/i }).click();

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith('/api/orders', expect.objectContaining({ method: 'POST' }));
        });
    });

    it('shows an error message in the review modal when checkout fails', async () => {
        mockInitFetchWithCart([makeCartItem()]);
        render(<Catalog />);
        await openReviewModal();

        fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Insufficient points' }) });
        screen.getByRole('button', { name: /Confirm Order/i }).click();

        await waitFor(() => {
            expect(screen.getAllByText(/Insufficient points/i).length).toBeGreaterThan(0);
        });
    });
});
