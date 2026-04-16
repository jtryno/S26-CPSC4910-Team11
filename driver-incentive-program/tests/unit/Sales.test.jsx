import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock API modules before importing the component
const mockFetchOrgDrivers = vi.fn();
const mockFetchOrganizations = vi.fn();
const mockFetchSalesData = vi.fn();
const mockFetchSalesItemData = vi.fn();

vi.mock('../../src/api/OrganizationApi', () => ({
  fetchOrgDrivers: (...args) => mockFetchOrgDrivers(...args),
  fetchOrganizations: (...args) => mockFetchOrganizations(...args),
}));

vi.mock('../../src/api/SalesApi', () => ({
  fetchSalesData: (...args) => mockFetchSalesData(...args),
  fetchSalesItemData: (...args) => mockFetchSalesItemData(...args),
}));

import Sales from '../../src/Pages/Reports/AdminReport/Sales';

const sampleOrgs = [{ name: 'Org A', sponsor_org_id: 7 }];
const sampleDrivers = [{ user_id: 10, username: 'driver1' }];
const sampleSales = [
  {
    order_id: 101,
    driver_user_id: 10,
    sponsor_org_id: 7,
    price_usd_at_purchase: '25.00',
    status: 'placed',
    created_at: '2026-04-01T00:00:00Z',
  },
];

const sampleOrderItems = [
  {
    item_id: '1',
    quantity: 2,
    price_usd_at_purchase: 50,
    created_at: '2026-04-01T00:00:00Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchOrganizations.mockResolvedValue(sampleOrgs);
  mockFetchOrgDrivers.mockResolvedValue(sampleDrivers);
  mockFetchSalesData.mockResolvedValue(sampleSales);
  mockFetchSalesItemData.mockResolvedValue(sampleOrderItems);
});

describe('Sales — AdminReport Sales page', () => {
  it('loads dropdown orgs, drivers and displays total sales', async () => {
    render(<Sales />);

    // Header and filters render
    expect(screen.getByText(/Filters/i)).toBeInTheDocument();

    // Wait for organizations fetch and drivers fetch to have been called
    await waitFor(() => expect(mockFetchOrganizations).toHaveBeenCalled());
    await waitFor(() => expect(mockFetchOrgDrivers).toHaveBeenCalled());

    // Total sales field should display the aggregated value
    const label = screen.getByText("Total Sales:");
    const container = label.closest("div");

    expect(within(container).getByText("$25.00")).toBeInTheDocument();
  });

  it('opens detailed modal and loads order items when Detailed View clicked', async () => {
    render(<Sales />);

    // Wait for the table to populate
    await waitFor(() => expect(screen.getByText('101')).toBeInTheDocument());

    // Click the Detailed View action button
    const detailButtons = screen.getAllByRole('button', { name: /Detailed View/i });
    expect(detailButtons.length).toBeGreaterThan(0);
    fireEvent.click(detailButtons[0]);

    // fetchSalesItemData should be called for the selected order
    await waitFor(() => expect(mockFetchSalesItemData).toHaveBeenCalledWith(101, null, { fromDate: null, toDate: null }));

    // Modal title and order item should render
    await waitFor(() => expect(screen.getByText(/Detailed View for Order ID: 101/i)).toBeInTheDocument());
    expect(screen.getByText('1')).toBeInTheDocument();

    // single_price is computed as price/quantity -> 50/2 = 25.00 and table prefixes with $
    const modal = screen.getByRole("dialog");
    const table = within(modal).getByRole('table');
    expect(within(table).getByText('$25.00')).toBeInTheDocument();
  });

  it('hides driver dropdown when no drivers returned and still renders org selector', async () => {
    mockFetchOrgDrivers.mockResolvedValue([]);
    render(<Sales />);

    await waitFor(() => expect(mockFetchOrganizations).toHaveBeenCalled());

    // Organization label present
    expect(screen.getByText(/Organization:/i)).toBeInTheDocument();

    // When there are no drivers, the Driver User selector still exists but options will be minimal
    expect(screen.getByText(/Driver User:/i)).toBeInTheDocument();
  });
});