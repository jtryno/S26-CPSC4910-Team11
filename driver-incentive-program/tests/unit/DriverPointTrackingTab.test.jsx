import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DriverPointTrackingTab from '../../src/Pages/Reports/SponsorReport/DriverPointTrackingTab';

import {
  fetchOrgDrivers,
  fetchOrgPointChanges
} from '../../src/api/OrganizationApi';

vi.mock('../../src/api/OrganizationApi', () => ({
  fetchOrgDrivers: vi.fn(),
  fetchOrgPointChanges: vi.fn(),
}));

const makeDriver = (overrides = {}) => ({
  user_id: 10,
  username: 'driver_1',
  current_points_balance: 150,
  created_at: '2026-04-01T00:00:00Z',
  ...overrides,
});

const makePointChange = (overrides = {}) => ({
  transaction_id: '1',
  point_amount: 50,
  reason: 'Just Cus',
  source: 'manual',
  created_by_user_id: 2,
  ...overrides,
});

describe('DriverPointTrackingTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders drivers table and opens point changes modal', async () => {
    const driver = makeDriver();
    const pointChanges = [makePointChange()];

    fetchOrgDrivers.mockResolvedValue([driver]);
    fetchOrgPointChanges.mockResolvedValue(pointChanges);

    render(<DriverPointTrackingTab orgId={123} />);


    const table = screen.getByRole('table');
    expect(await within(table).findByText('driver_1')).toBeInTheDocument();

    const buttons = screen.getAllByRole('button', { name: /View Point Changes/i });
    expect(buttons.length).toBeGreaterThan(0);

    fireEvent.click(buttons[0]);

    const modal = await screen.findByRole('dialog');

    expect(within(modal).getByText(/driver_1 Point Changes/i)).toBeInTheDocument();

    expect(within(modal).getByText('1')).toBeInTheDocument();

    expect(
      within(modal).getByRole('button', { name: /Generate CSV/i })
    ).toBeInTheDocument();
  });
});