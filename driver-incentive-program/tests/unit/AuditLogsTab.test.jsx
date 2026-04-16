import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock API modules before importing the component
const mockFetchOrganizations = vi.fn();
const mockFetchPasswordChangeLogs = vi.fn();
const mockFetchLoginLogs = vi.fn();
const mockFetchApplicationsOrg = vi.fn();
const mockFetchOrgPointChanges = vi.fn();

vi.mock('../../src/api/OrganizationApi', () => ({
  fetchOrganizations: (...args) => mockFetchOrganizations(...args),
  fetchOrgPointChanges: (...args) => mockFetchOrgPointChanges(...args),
}));

vi.mock('../../src/api/ApplicationApi', () => ({
  fetchApplicationsOrg: (...args) => mockFetchApplicationsOrg(...args),
}));

vi.mock('../../src/api/AuditLogApi', () => ({
  fetchPasswordChangeLogs: (...args) => mockFetchPasswordChangeLogs(...args),
  fetchLoginLogs: (...args) => mockFetchLoginLogs(...args),
}));

import AuditLogsTab from '../../src/Pages/Reports/AuditLogsTab';

const samplePasswordLogs = [
  { log_id: 1, user_id: 2, username: 'alice', change_type: 'reset', created_at: '2026-04-01T00:00:00Z' },
];

const sampleLoginLogs = [
  { log_id: 10, user_id: 3, username: 'bob', result: 'success', login_date: '2026-04-02T00:00:00Z' },
];

const sampleApplications = [
  { application_id: 5, driver_user_id: 11, sponsor_org_id: 7, status: 'approved', applied_at: '2026-03-01T00:00:00Z' },
];

const samplePointChanges = [
  { transaction_id: '1', driver_user_id: 11, sponsor_org_id: 7, point_amount: 50, reason: 'Referral bonus', source: 'manual', created_at: '2026-03-15T00:00:00Z', created_by_user_id: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchOrganizations.mockResolvedValue([{ name: 'Org A', sponsor_org_id: 7 }]);
  mockFetchPasswordChangeLogs.mockResolvedValue(samplePasswordLogs);
  mockFetchLoginLogs.mockResolvedValue(sampleLoginLogs);
  mockFetchApplicationsOrg.mockResolvedValue(sampleApplications);
  mockFetchOrgPointChanges.mockResolvedValue(samplePointChanges);
});

describe('AuditLogsTab', () => {
  it('renders default Password Change Logs and calls fetch functions', async () => {
    render(<AuditLogsTab />);

    await waitFor(() => expect(screen.getByText(/Password Change Logs/i)).toBeInTheDocument());

    expect(mockFetchPasswordChangeLogs).toHaveBeenCalled();
    expect(mockFetchOrganizations).toHaveBeenCalled();

    // Column header from password_change columns
    expect(screen.getByText(/Change Type/i)).toBeInTheDocument();
  });

  it('changes log type to login_attempt and calls corresponding fetch', async () => {
    render(<AuditLogsTab />);

    // two selects exist: Log Type and Organization (when no orgId prop)
    const selects = screen.getAllByRole('combobox');
    const logTypeSelect = selects[0];

    fireEvent.change(logTypeSelect, { target: { value: 'login_attempt' } });

    await waitFor(() => expect(screen.getByText(/Login Attempt Logs/i)).toBeInTheDocument());

    expect(mockFetchLoginLogs).toHaveBeenCalled();

    // Confirm column header for login attempts exists
    expect(screen.getByText(/Result/i)).toBeInTheDocument();
  });

  it('changes log type to driver_application and calls fetchApplicationsOrg', async () => {
    render(<AuditLogsTab />);

    const selects = screen.getAllByRole('combobox');
    const logTypeSelect = selects[0];

    fireEvent.change(logTypeSelect, { target: { value: 'driver_application' } });

    await waitFor(() => expect(screen.getByText(/Driver Application Logs/i)).toBeInTheDocument());

    expect(mockFetchApplicationsOrg).toHaveBeenCalled();

    // Confirm column header for applications exists
    expect(screen.getByText(/Status/i)).toBeInTheDocument();
  });

  it('changes log type to point_change and calls fetchOrgPointChanges', async () => {
    render(<AuditLogsTab />);

    const selects = screen.getAllByRole('combobox');
    const logTypeSelect = selects[0];

    fireEvent.change(logTypeSelect, { target: { value: 'point_change' } });

    await waitFor(() => expect(screen.getByText(/Point Change Logs/i)).toBeInTheDocument());

    expect(mockFetchOrgPointChanges).toHaveBeenCalled();

    // Confirm column header for point changes exists
    expect(screen.getByText(/Point Amount/i)).toBeInTheDocument();
  });

  it('does not show Organization dropdown when orgId prop is provided', async () => {
    render(<AuditLogsTab orgId={42} />);

    // There should be no "Organization:" label when orgId is provided
    expect(screen.queryByText(/Organization:/i)).not.toBeInTheDocument();
  });

  it('shows Organization dropdown when orgId prop is not provided', async () => {
    render(<AuditLogsTab />);

    // Wait for the Organization dropdown to be rendered
    await waitFor(() => expect(screen.getByText(/Organization:/i)).toBeInTheDocument());
  });

});