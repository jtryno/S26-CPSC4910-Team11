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

/** Empty reviews response used by ReviewsSection for each rendered item. */
const emptyReviews = { ok: true, json: async () => ({ reviews: [], averageRating: null }) };

/**
 * Standard 6-call init mock, no cart items.
 * Also mocks a reviews fetch for each catalog item (ReviewsSection fires
 * GET /api/catalog/reviews/:itemId on mount for every rendered product card).
 */
const mockInit = (catalogItems = []) => {
    fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: catalogItems }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ cart_id: 1 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ total_points: 5000 }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    // One reviews fetch per item card rendered
    catalogItems.forEach(() => fetch.mockResolvedValueOnce(emptyReviews));
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
    fetch.mockResolvedValueOnce(emptyReviews); // one item in catalog
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

        // Wait for items to render
        await waitFor(() => expect(screen.getAllByText('Electronics').length).toBeGreaterThan(0));

        // The category chips are <label> elements inside the filter bar.
        // There should be exactly one "Electronics" chip even though two items share that category.
        const filterLabel = screen.getByText('Categories:');
        const filterBar = filterLabel.closest('div');
        const chips = filterBar.querySelectorAll('label');
        expect(chips).toHaveLength(1);
    });

    it('does not show category filter bar when no items have a category', async () => {
        mockInit([makeCatalogItem({ category: null })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());

        expect(screen.queryByText('Categories:')).not.toBeInTheDocument();
    });
});

// ─── Catalog item customization fields ───────────────────────────────────────

describe('Catalog — sponsor customization fields', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('user', JSON.stringify(mockUser));
    });
    afterEach(() => localStorage.clear());

    it('displays custom_title instead of eBay title when set', async () => {
        mockInit([makeCatalogItem({ title: 'eBay Title', custom_title: 'My Custom Name' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getAllByText('My Custom Name').length).toBeGreaterThan(0));
        expect(screen.queryByText('eBay Title')).not.toBeInTheDocument();
    });

    it('falls back to eBay title when custom_title is null', async () => {
        mockInit([makeCatalogItem({ title: 'eBay Title', custom_title: null })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('eBay Title')).toBeInTheDocument());
    });

    it('displays custom_description when set', async () => {
        mockInit([makeCatalogItem({ description: 'eBay desc', custom_description: 'Sponsor desc' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Sponsor desc')).toBeInTheDocument());
        expect(screen.queryByText('eBay desc')).not.toBeInTheDocument();
    });

    it('hides USD price when hide_price is truthy', async () => {
        mockInit([makeCatalogItem({ hide_price: 1, last_price_value: '99.99' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());
        expect(screen.queryByText(/\$99\.99/)).not.toBeInTheDocument();
    });

    it('shows USD price when hide_price is falsy', async () => {
        mockInit([makeCatalogItem({ hide_price: 0, last_price_value: '25.00' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText(/\$25\.00/)).toBeInTheDocument());
    });

    it('hides eBay link when hide_web_url is truthy', async () => {
        mockInit([makeCatalogItem({ hide_web_url: 1, item_web_url: 'https://www.ebay.com/itm/1' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());
        expect(screen.queryByText(/View on eBay/i)).not.toBeInTheDocument();
    });

    it('shows misc_info on the product card when set', async () => {
        mockInit([makeCatalogItem({ misc_info: 'Handcrafted in USA' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Handcrafted in USA')).toBeInTheDocument());
    });

    it('shows estimated delivery days on the product card when set', async () => {
        mockInit([makeCatalogItem({ estimated_delivery_days: 5 })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText(/Est\. delivery: 5 days/i)).toBeInTheDocument());
    });

    it('does not show estimated delivery when not set', async () => {
        mockInit([makeCatalogItem({ estimated_delivery_days: null })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText('Test Reward Item')).toBeInTheDocument());
        expect(screen.queryByText(/Est\. delivery/i)).not.toBeInTheDocument();
    });
});

// ─── Product Detail Modal (#779, #930) ───────────────────────────────────────

describe('Catalog — product detail modal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.setItem('user', JSON.stringify(mockUser));
    });
    afterEach(() => localStorage.clear());

    it('shows a "View Details" button on each product card', async () => {
        mockInit([makeCatalogItem()]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText(/View Details/i)).toBeInTheDocument());
    });

    it('opens the detail modal when "View Details" is clicked', async () => {
        mockInit([makeCatalogItem({ title: 'Fancy Widget' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText(/View Details/i)).toBeInTheDocument());
        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // recordView
        screen.getByText(/View Details/i).click();

        await waitFor(() => expect(screen.getAllByText('Fancy Widget').length).toBeGreaterThan(0));
    });

    it('shows estimated delivery in the detail modal', async () => {
        mockInit([makeCatalogItem({ estimated_delivery_days: 7 })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText(/View Details/i)).toBeInTheDocument());
        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // recordView
        screen.getByText(/View Details/i).click();

        await waitFor(() => expect(screen.getByText(/7 business days/i)).toBeInTheDocument());
    });

    it('shows misc_info in the detail modal', async () => {
        mockInit([makeCatalogItem({ misc_info: 'Limited stock' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText(/View Details/i)).toBeInTheDocument());
        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // recordView
        screen.getByText(/View Details/i).click();

        await waitFor(() => expect(screen.getAllByText('Limited stock').length).toBeGreaterThan(0));
    });

    it('closes the detail modal when × is clicked', async () => {
        mockInit([makeCatalogItem({ estimated_delivery_days: 5 })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText(/View Details/i)).toBeInTheDocument());
        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // recordView
        screen.getByText(/View Details/i).click();

        await waitFor(() => expect(screen.getByText(/5 business days/i)).toBeInTheDocument());
        // The × button in the detail modal has a unique style — use getAllByRole and filter
        const closeButtons = screen.getAllByRole('button', { name: '×' });
        closeButtons[closeButtons.length - 1].click();

        await waitFor(() => expect(screen.queryByText(/5 business days/i)).not.toBeInTheDocument());
    });

    it('shows similar items in the detail modal when same category exists', async () => {
        mockInit([
            makeCatalogItem({ item_id: 1, title: 'Widget A', category: 'Electronics' }),
            makeCatalogItem({ item_id: 2, title: 'Widget B', category: 'Electronics' }),
        ]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getAllByText(/View Details/i).length).toBeGreaterThan(0));
        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // recordView
        screen.getAllByText(/View Details/i)[0].click();

        await waitFor(() => expect(screen.getByText('Similar Items')).toBeInTheDocument());
        expect(screen.getAllByText('Widget B').length).toBeGreaterThan(0);
    });

    it('does not show "Similar Items" section when no items share the same category', async () => {
        mockInit([makeCatalogItem({ item_id: 1, category: 'Electronics' })]);
        render(<Catalog />);

        await waitFor(() => expect(screen.getByText(/View Details/i)).toBeInTheDocument());
        fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) }); // recordView
        screen.getByText(/View Details/i).click();

        await waitFor(() => expect(screen.getAllByText('Test Reward Item').length).toBeGreaterThan(0));
        expect(screen.queryByText('Similar Items')).not.toBeInTheDocument();
    });
});
