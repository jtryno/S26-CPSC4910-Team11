import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DriverPointTrackingTab from '../../src/Pages/Reports/SponsorReport/DriverPointTrackingTab';

global.fetch = vi.fn();

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

    // First two fetch calls: fetchDrivers and fetchDropdownDrivers
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ drivers: [driver] }) });
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ drivers: [driver] }) });

    render(<DriverPointTrackingTab orgId={123} />);

    // Wait for driver username to appear in table
    const table = screen.getByRole('table');
    await waitFor(() => expect(within(table).getByText('driver_1')).toBeInTheDocument());

    // Prepare point changes fetch (triggered when modal opens)
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ changes: pointChanges }) });

    // Click the first "View Point Changes" button
    const buttons = screen.getAllByRole('button', { name: /View Point Changes/i });
    expect(buttons.length).toBeGreaterThan(0);
    fireEvent.click(buttons[0]);

    // Modal title should show username
    await waitFor(() => expect(screen.getByText('driver_1 Point Changes')).toBeInTheDocument());

    // Point change row should be visible
    expect(screen.getByText('1')).toBeInTheDocument();

    // CSV generation button exists
    expect(screen.getByRole('button', { name: /Generate CSV/i })).toBeInTheDocument();
  });
});
