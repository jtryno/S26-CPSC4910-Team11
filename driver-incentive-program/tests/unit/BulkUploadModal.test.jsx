import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/api/UserApi', () => ({
    importUsersFromPipeFile: vi.fn(),
}));

import BulkUploadModal from '../../src/Pages/Organization/OrganizationSummary/BulkUploadModal';
import { importUsersFromPipeFile } from '../../src/api/UserApi';

const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    orgId: 7,
    requestingUserId: 55,
    onImported: vi.fn(),
    userType: 'sponsor',
};

const makeResult = (overrides = {}) => ({
    lineNumber: 1,
    status: 'imported',
    type: 'D',
    orgName: 'My Org',
    firstName: 'Joe',
    lastName: 'Driver',
    email: 'joe@test.com',
    username: 'joe_driver',
    pointsAdded: null,
    onboardingPath: '/password-reset?token=abc123&mode=onboarding',
    message: 'User created.',
    warnings: [],
    error: null,
    ...overrides,
});

/** Simulate selecting a file by firing a change event with a mock file. */
function selectFile(fileInput, content = 'D||Joe|Driver|joe@test.com', name = 'test.txt') {
    const file = new File([content], name, { type: 'text/plain' });
    // jsdom File doesn't always support .text(), so add it
    file.text = () => Promise.resolve(content);
    fireEvent.change(fileInput, { target: { files: [file] } });
}

describe('BulkUploadModal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when isOpen is false', () => {
        render(<BulkUploadModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByText(/Bulk Upload Users/i)).not.toBeInTheDocument();
    });

    it('renders the modal title when open', () => {
        render(<BulkUploadModal {...defaultProps} />);
        expect(screen.getByText('Bulk Upload Users')).toBeInTheDocument();
    });

    it('shows the pipe-delimited format instructions', () => {
        render(<BulkUploadModal {...defaultProps} />);
        expect(screen.getByText(/pipe-delimited/i)).toBeInTheDocument();
    });

    it('does not show O type instructions for sponsors', () => {
        render(<BulkUploadModal {...defaultProps} userType="sponsor" />);
        expect(screen.queryByText(/Create Organization/)).not.toBeInTheDocument();
    });

    it('shows O type instructions for admins', () => {
        render(<BulkUploadModal {...defaultProps} userType="admin" />);
        expect(screen.getByText(/Create Organization/)).toBeInTheDocument();
    });

    it('shows sponsor-specific instructions about org name', () => {
        render(<BulkUploadModal {...defaultProps} userType="sponsor" />);
        expect(screen.getByText(/left empty/i)).toBeInTheDocument();
    });

    it('disables Upload button when no file is selected', () => {
        render(<BulkUploadModal {...defaultProps} />);
        const uploadBtn = screen.getByRole('button', { name: /Upload/i });
        expect(uploadBtn).toBeDisabled();
    });

    it('has a Download Template button', () => {
        render(<BulkUploadModal {...defaultProps} />);
        expect(screen.getByRole('button', { name: /Download Template/i })).toBeInTheDocument();
    });

    it('shows "No file selected" by default', () => {
        render(<BulkUploadModal {...defaultProps} />);
        expect(screen.getByText('No file selected')).toBeInTheDocument();
    });

    it('calls onClose when the modal is closed', () => {
        const onClose = vi.fn();
        render(<BulkUploadModal {...defaultProps} onClose={onClose} />);
        screen.getByRole('button', { name: '×' }).click();
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('enables Upload after a file is selected', async () => {
        render(<BulkUploadModal {...defaultProps} />);
        const fileInput = document.querySelector('input[type="file"]');
        selectFile(fileInput);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Upload/i })).not.toBeDisabled();
        });
    });

    it('calls importUsersFromPipeFile and displays results', async () => {
        const mockResponse = {
            message: 'Processed 2 line(s) successfully.',
            importedCount: 1,
            failedCount: 1,
            skippedCount: 0,
            results: [
                makeResult(),
                makeResult({
                    lineNumber: 2,
                    status: 'failed',
                    firstName: 'Bad',
                    lastName: 'Type',
                    email: 'bad@test.com',
                    error: 'Invalid type "X".',
                    onboardingPath: null,
                }),
            ],
        };
        importUsersFromPipeFile.mockResolvedValueOnce(mockResponse);

        render(<BulkUploadModal {...defaultProps} />);

        const fileInput = document.querySelector('input[type="file"]');
        selectFile(fileInput, 'D||Joe|Driver|joe@test.com\nX||Bad|Type|bad@test.com');

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Upload/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Upload/i }));

        await waitFor(() => {
            expect(importUsersFromPipeFile).toHaveBeenCalledWith(7, 55, expect.any(String));
        });

        await waitFor(() => {
            expect(screen.getByText(/Processed 2 line/i)).toBeInTheDocument();
        });
        expect(screen.getByText('1 imported, 1 failed.')).toBeInTheDocument();
    });

    it('calls importUsersFromPipeFile with null orgId for admin', async () => {
        importUsersFromPipeFile.mockResolvedValueOnce({
            message: 'Processed 1 line(s) successfully.',
            importedCount: 1,
            failedCount: 0,
            skippedCount: 0,
            results: [makeResult({ type: 'O', orgName: 'New Org', message: 'Organization created.' })],
        });

        render(<BulkUploadModal {...defaultProps} orgId={null} userType="admin" />);

        const fileInput = document.querySelector('input[type="file"]');
        selectFile(fileInput, 'O|New Org');

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Upload/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Upload/i }));

        await waitFor(() => {
            expect(importUsersFromPipeFile).toHaveBeenCalledWith(null, 55, expect.any(String));
        });
    });

    it('displays error message when import fails', async () => {
        importUsersFromPipeFile.mockRejectedValueOnce(new Error('Server error'));

        render(<BulkUploadModal {...defaultProps} />);

        const fileInput = document.querySelector('input[type="file"]');
        selectFile(fileInput);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Upload/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Upload/i }));

        await waitFor(() => {
            expect(screen.getByText('Server error')).toBeInTheDocument();
        });
    });

    it('calls onImported when import succeeds', async () => {
        const onImported = vi.fn();
        importUsersFromPipeFile.mockResolvedValueOnce({
            message: 'Processed 1 line(s) successfully.',
            importedCount: 1,
            failedCount: 0,
            skippedCount: 0,
            results: [makeResult()],
        });

        render(<BulkUploadModal {...defaultProps} onImported={onImported} />);

        const fileInput = document.querySelector('input[type="file"]');
        selectFile(fileInput);

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Upload/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Upload/i }));

        await waitFor(() => {
            expect(onImported).toHaveBeenCalledTimes(1);
        });
    });

    it('shows warning text in results when warnings exist', async () => {
        importUsersFromPipeFile.mockResolvedValueOnce({
            message: 'Processed 1 line(s) successfully.',
            importedCount: 1,
            failedCount: 0,
            skippedCount: 0,
            results: [makeResult({ warnings: ['Organization name ignored for sponsor upload.'] })],
        });

        render(<BulkUploadModal {...defaultProps} />);

        const fileInput = document.querySelector('input[type="file"]');
        selectFile(fileInput, 'D|SomeOrg|Joe|Driver|joe@test.com');

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Upload/i })).not.toBeDisabled();
        });

        fireEvent.click(screen.getByRole('button', { name: /Upload/i }));

        await waitFor(() => {
            expect(screen.getByText(/Organization name ignored/i)).toBeInTheDocument();
        });
    });
});
