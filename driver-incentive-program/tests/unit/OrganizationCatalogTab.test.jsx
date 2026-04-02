import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import OrganizationCatalogTab from '../../src/Pages/Organization/OrganizationSummary/OrganizationCatalogTab';

global.fetch = vi.fn();

const makeCatalogItem = (overrides = {}) => ({
    item_id: 1,
    title: 'eBay Title',
    description: 'eBay description',
    last_price_value: '20.00',
    points_price: 400,
    image_url: null,
    availability_status: 'in_stock',
    is_featured: 0,
    sale_price: null,
    category: 'Electronics',
    custom_title: null,
    custom_description: null,
    custom_image_url: null,
    custom_points_price: null,
    hide_price: 0,
    hide_web_url: 0,
    misc_info: null,
    estimated_delivery_days: null,
    ...overrides,
});

const mockFetchCatalog = (items = []) => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items }) });
};

describe('OrganizationCatalogTab — Edit Item Modal', () => {
    beforeEach(() => vi.clearAllMocks());

    it('renders an Edit button for each catalog item', async () => {
        mockFetchCatalog([makeCatalogItem()]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByText('eBay Title')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument();
    });

    it('opens the Edit modal when the Edit button is clicked', async () => {
        mockFetchCatalog([makeCatalogItem()]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument());
        screen.getByRole('button', { name: /Edit/i }).click();

        await waitFor(() => expect(screen.getByText(/Edit Item/i)).toBeInTheDocument());
    });

    it('pre-fills custom_title input with existing value', async () => {
        mockFetchCatalog([makeCatalogItem({ custom_title: 'My Override Name' })]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument());
        screen.getByRole('button', { name: /Edit/i }).click();

        await waitFor(() => {
            const input = screen.getByPlaceholderText('eBay Title');
            expect(input.value).toBe('My Override Name');
        });
    });

    it('pre-fills estimated_delivery_days input with existing value', async () => {
        mockFetchCatalog([makeCatalogItem({ estimated_delivery_days: 10 })]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument());
        screen.getByRole('button', { name: /Edit/i }).click();

        await waitFor(() => {
            const input = screen.getByPlaceholderText('e.g. 7');
            expect(input.value).toBe('10');
        });
    });

    it('pre-checks hide_price checkbox when already set', async () => {
        mockFetchCatalog([makeCatalogItem({ hide_price: 1 })]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument());
        screen.getByRole('button', { name: /Edit/i }).click();

        await waitFor(() => {
            const checkbox = screen.getByLabelText(/Hide price from drivers/i);
            expect(checkbox.checked).toBe(true);
        });
    });

    it('pre-checks hide_web_url checkbox when already set', async () => {
        mockFetchCatalog([makeCatalogItem({ hide_web_url: 1 })]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument());
        screen.getByRole('button', { name: /Edit/i }).click();

        await waitFor(() => {
            const checkbox = screen.getByLabelText(/Hide eBay link from drivers/i);
            expect(checkbox.checked).toBe(true);
        });
    });

    it('closes the modal when Cancel is clicked', async () => {
        mockFetchCatalog([makeCatalogItem()]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument());
        screen.getByRole('button', { name: /Edit/i }).click();

        await waitFor(() => expect(screen.getByText(/Edit Item/i)).toBeInTheDocument());
        screen.getByRole('button', { name: /Cancel/i }).click();

        await waitFor(() => expect(screen.queryByText(/Edit Item/i)).not.toBeInTheDocument());
    });

    it('calls the customize API when Save Changes is clicked', async () => {
        mockFetchCatalog([makeCatalogItem()]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument());
        screen.getByRole('button', { name: /Edit/i }).click();

        await waitFor(() => expect(screen.getByText(/Edit Item/i)).toBeInTheDocument());

        // mock save + catalog reload
        fetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Item updated' }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [makeCatalogItem()] }) });

        screen.getByRole('button', { name: /Save Changes/i }).click();

        await waitFor(() => {
            expect(fetch).toHaveBeenCalledWith(
                '/api/catalog/items/1/customize',
                expect.objectContaining({ method: 'PUT' })
            );
        });
    });

    it('shows a success message after saving', async () => {
        mockFetchCatalog([makeCatalogItem()]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument());
        screen.getByRole('button', { name: /Edit/i }).click();

        await waitFor(() => expect(screen.getByText(/Edit Item/i)).toBeInTheDocument());

        fetch
            .mockResolvedValueOnce({ ok: true, json: async () => ({ message: 'Item updated' }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [makeCatalogItem()] }) });

        screen.getByRole('button', { name: /Save Changes/i }).click();

        await waitFor(() => expect(screen.getByText('Item updated.')).toBeInTheDocument());
    });

    it('shows an error message when the API returns an error', async () => {
        mockFetchCatalog([makeCatalogItem()]);
        render(<OrganizationCatalogTab orgId={1} />);

        await waitFor(() => expect(screen.getByRole('button', { name: /Edit/i })).toBeInTheDocument());
        screen.getByRole('button', { name: /Edit/i }).click();

        await waitFor(() => expect(screen.getByText(/Edit Item/i)).toBeInTheDocument());

        fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unauthorized' }) });

        screen.getByRole('button', { name: /Save Changes/i }).click();

        await waitFor(() => expect(screen.getByText('Unauthorized')).toBeInTheDocument());
    });
});
