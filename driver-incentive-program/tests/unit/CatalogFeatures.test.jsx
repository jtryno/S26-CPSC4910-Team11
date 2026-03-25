import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Catalog from '../../src/Pages/Catalog';

global.fetch = vi.fn();

const mockUser = { user_id: 42, sponsor_org_id: 7 };

const makeCatalogItem = (overrides = {}) => ({
    item_id: 1,
    title: 'Test Reward Item',
    description: 'A great reward',
    last_price_value: '10.00',
    points_price: 1000,
    image_url: null,
    item_web_url: 'https://www.ebay.com/itm/123456',
    availability_status: 'in_stock',
    is_featured: 0,
    sale_price: null,
    category: null,
    driver_purchase_count: 0,
    created_at: '2025-01-01T00:00:00.000Z',
    ...overrides,
});

const makeCartItem = (overrides = {}) => ({
    item_id: 1,
    title: 'Cart Item',
    quantity: 1,
    points_price_at_add: 300,
    image_url: null,
    ...overrides,
});

/**
 * Standard 6-call init mock, no cart items.
 */
const mockInit = (catalogItems = []) => {
    fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: catalogItems }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ cart_id: 1 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ total_points: 5000 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
};

/**
 * Init mock where the cart is pre-populated (simulates returning driver, #6247).
 */
const mockInitWithRestoredCart = (cartItems = []) => {
    fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [makeCatalogItem()] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ cart_id: 1 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: cartItems }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ total_points: 5000 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('user', JSON.stringify(mockUser));
});

afterEach(() => {
    localStorage.clear();
});

// ─── Sort (#6221) ─────────────────────────────────────────────────────────────

describe('Sort by date added (#6221)', () => {
    it('renders the sort dropdown', async () => {
        mockInit([makeCatalogItem()]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());

        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('sort dropdown includes Newest and Oldest options', async () => {
        mockInit([makeCatalogItem()]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

        const select = screen.getByRole('combobox');
        const options = [...select.querySelectorAll('option')].map(o => o.textContent);
        expect(options).toContain('Newest');
        expect(options).toContain('Oldest');
    });

    it('sort dropdown includes price and name options', async () => {
        mockInit([makeCatalogItem()]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

        const select = screen.getByRole('combobox');
        const options = [...select.querySelectorAll('option')].map(o => o.textContent);
        expect(options).toContain('Price: Low to High');
        expect(options).toContain('Price: High to Low');
        expect(options).toContain('Name: A–Z');
        expect(options).toContain('On Sale First');
    });
});

// ─── Driver purchase count (#6222) ───────────────────────────────────────────

describe('Driver purchase count (#6222)', () => {
    it('shows "X drivers bought this" when driver_purchase_count > 0', async () => {
        mockInit([makeCatalogItem({ driver_purchase_count: 5 })]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText(/5 drivers bought this/i)).toBeInTheDocument();
        });
    });

    it('shows singular "1 driver bought this" for a count of 1', async () => {
        mockInit([makeCatalogItem({ driver_purchase_count: 1 })]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText(/1 driver bought this/i)).toBeInTheDocument();
        });
    });

    it('does not show purchase count text when count is 0', async () => {
        mockInit([makeCatalogItem({ driver_purchase_count: 0 })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());

        expect(screen.queryByText(/drivers bought this/i)).not.toBeInTheDocument();
    });
});

// ─── On Sale filter & badge (#6224) ──────────────────────────────────────────

describe('On Sale filter and badge (#6224)', () => {
    it('renders the On Sale filter button', async () => {
        mockInit([]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText(/No items in the catalog/i)).toBeInTheDocument());

        expect(screen.getByRole('button', { name: /on sale/i })).toBeInTheDocument();
    });

    it('shows Sale badge on items where sale_price < last_price_value', async () => {
        mockInit([makeCatalogItem({ last_price_value: '10.00', sale_price: '6.00' })]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText('Sale')).toBeInTheDocument();
        });
    });

    it('shows the original price as strikethrough for on-sale items', async () => {
        mockInit([makeCatalogItem({ last_price_value: '10.00', sale_price: '6.00' })]);
        render(<Catalog />);

        await waitFor(() => {
            const strikethrough = document.querySelector('[style*="line-through"]');
            expect(strikethrough).not.toBeNull();
            expect(strikethrough.textContent).toContain('$10.00');
        });
    });

    it('shows the sale price for on-sale items', async () => {
        mockInit([makeCatalogItem({ last_price_value: '10.00', sale_price: '6.00' })]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText('$6.00')).toBeInTheDocument();
        });
    });

    it('does not show Sale badge when sale_price is null', async () => {
        mockInit([makeCatalogItem({ sale_price: null })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());

        expect(screen.queryByText('Sale')).not.toBeInTheDocument();
    });

    it('does not show Sale badge when sale_price >= last_price_value', async () => {
        mockInit([makeCatalogItem({ last_price_value: '10.00', sale_price: '10.00' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());

        expect(screen.queryByText('Sale')).not.toBeInTheDocument();
    });
});

// ─── Cart item count badge (#6226) ───────────────────────────────────────────

describe('Cart item count badge (#6226)', () => {
    it('shows no badge when cart is empty', async () => {
        mockInit([makeCatalogItem()]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());

        // Badge span should not exist when qty = 0
        expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('shows total quantity badge on Cart button when cart has items', async () => {
        mockInitWithRestoredCart([makeCartItem({ quantity: 3 })]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText('3')).toBeInTheDocument();
        });
    });

    it('sums quantities across multiple cart items', async () => {
        mockInitWithRestoredCart([
            makeCartItem({ item_id: 1, quantity: 2 }),
            makeCartItem({ item_id: 2, quantity: 4 }),
        ]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText('6')).toBeInTheDocument();
        });
    });
});

// ─── Cart persists / restored (#6247) ────────────────────────────────────────

describe('Cart saved and restored (#6247)', () => {
    it('shows a cart restored banner when cart has pre-existing items', async () => {
        mockInitWithRestoredCart([makeCartItem({ quantity: 2 })]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText(/your cart was restored/i)).toBeInTheDocument();
        });
    });

    it('restored banner mentions the correct item count', async () => {
        mockInitWithRestoredCart([
            makeCartItem({ item_id: 1, quantity: 1 }),
            makeCartItem({ item_id: 2, quantity: 2 }),
        ]);
        render(<Catalog />);

        await waitFor(() => {
            // total qty = 3
            expect(screen.getByText(/3 items/i)).toBeInTheDocument();
        });
    });

    it('does not show restored banner when cart is empty on load', async () => {
        mockInit([makeCatalogItem()]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());

        expect(screen.queryByText(/your cart was restored/i)).not.toBeInTheDocument();
    });
});

// ─── Featured products (#6249) ───────────────────────────────────────────────

describe('Featured products (#6249)', () => {
    it('shows Featured badge on items where is_featured is truthy', async () => {
        mockInit([makeCatalogItem({ is_featured: 1 })]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText('Featured')).toBeInTheDocument();
        });
    });

    it('does not show Featured badge on non-featured items', async () => {
        mockInit([makeCatalogItem({ is_featured: 0 })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());

        expect(screen.queryByText('Featured')).not.toBeInTheDocument();
    });

    it('Featured First is the default sort option', async () => {
        mockInit([makeCatalogItem()]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByRole('combobox')).toBeInTheDocument());

        expect(screen.getByRole('combobox')).toHaveValue('featured');
    });
});

// ─── Multi-category filter (#6282) ───────────────────────────────────────────

describe('Multi-category filter (#6282)', () => {
    it('shows category chip when items have a category', async () => {
        mockInit([makeCatalogItem({ category: 'Electronics' })]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText('Electronics')).toBeInTheDocument();
        });
    });

    it('shows multiple category chips for multiple distinct categories', async () => {
        mockInit([
            makeCatalogItem({ item_id: 1, category: 'Electronics' }),
            makeCatalogItem({ item_id: 2, category: 'Clothing' }),
        ]);
        render(<Catalog />);

        await waitFor(() => {
            expect(screen.getByText('Electronics')).toBeInTheDocument();
            expect(screen.getByText('Clothing')).toBeInTheDocument();
        });
    });

    it('does not show duplicate chips for repeated categories', async () => {
        mockInit([
            makeCatalogItem({ item_id: 1, category: 'Electronics' }),
            makeCatalogItem({ item_id: 2, category: 'Electronics' }),
        ]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Electronics')).toBeInTheDocument());

        expect(screen.getAllByText('Electronics')).toHaveLength(1);
    });

    it('does not show category filter bar when no items have a category', async () => {
        mockInit([makeCatalogItem({ category: null })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());

        expect(screen.queryByText('Categories:')).not.toBeInTheDocument();
    });
});
